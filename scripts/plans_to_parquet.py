"""Flatten a MATSim population XML (population_v6.dtd) into a single Parquet.

One row per <activity> or <leg> inside each <plan>, carrying person, plan,
and element context as columns. Streams the input so multi-GB files stay
bounded in memory.
"""

import argparse
import shutil
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq
import pyproj
from lxml import etree

COMPRESSION_BY_SUFFIX = {".gz": "gzip", ".zst": "zstd", ".zstd": "zstd"}


def open_xml(path: Path):
    codec = COMPRESSION_BY_SUFFIX.get(path.suffix.lower())
    if codec is not None:
        return pa.input_stream(str(path), compression=codec)
    return open(path, "rb")


# Per the DTD comments, these XML attributes are numeric even though declared
# as CDATA. Link/facility ids are also CDATA but are alphanumeric in practice
# (e.g. "-137387674#0"), so they stay strings.
NUMERIC_XML_ATTRS = {
    ("plan", "score"),
    ("activity", "x"),
    ("activity", "y"),
    ("activity", "z"),
    ("route", "distance"),
}

# <attribute class="..."> children carry their Java type explicitly.
CLASS_KIND = {
    "java.lang.Integer": "numeric",
    "java.lang.Long": "numeric",
    "java.lang.Short": "numeric",
    "java.lang.Byte": "numeric",
    "java.lang.Double": "numeric",
    "java.lang.Float": "numeric",
    "java.lang.Boolean": "bool",
}

_TRANSFORMER_CACHE: dict[str, pyproj.Transformer] = {}


def get_transformer(crs: str) -> pyproj.Transformer:
    t = _TRANSFORMER_CACHE.get(crs)
    if t is None:
        t = pyproj.Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
        _TRANSFORMER_CACHE[crs] = t
    return t


class ColumnBuilder:
    """Column-oriented row accumulator. Building a pa.Table from per-column
    lists is much faster than wrapping a list-of-dicts in a DataFrame and
    converting that to Arrow."""

    __slots__ = ("cols", "n", "col_kinds")

    def __init__(self) -> None:
        self.cols: dict[str, list] = {}
        self.n = 0
        # col_name -> "numeric" | "bool"; persists across chunks.
        self.col_kinds: dict[str, str] = {}

    def fill_row(self, fill: dict) -> None:
        n = self.n
        cols = self.cols
        for k, v in fill.items():
            col = cols.get(k)
            if col is None:
                col = [None] * n
                cols[k] = col
            col.append(v)
        n += 1
        for col in cols.values():
            if len(col) < n:
                col.append(None)
        self.n = n

    def __len__(self) -> int:
        return self.n

    def reset(self) -> None:
        self.cols = {}
        self.n = 0


def emit_attrs(elem, prefix: str, out: dict, col_kinds: dict) -> None:
    """Populate `out` with raw string values for elem's XML attributes and any
    <attribute name="…"> children. Numeric/bool coercion is deferred to chunk
    finalize; we just record the column kind here when we learn it."""
    for k, v in elem.attrib.items():
        col_name = f"{prefix}_{k}"
        out[col_name] = v
        if (prefix, k) in NUMERIC_XML_ATTRS:
            col_kinds[col_name] = "numeric"
    # Find the direct <attributes> child by iteration (faster than find()).
    for c in elem:
        if c.tag != "attributes":
            continue
        for a in c:
            if a.tag != "attribute":
                continue
            name = a.get("name")
            if not name:
                continue
            col_name = f"{prefix}_{name}"
            out[col_name] = a.text
            kind = CLASS_KIND.get(a.get("class"))
            if kind:
                col_kinds[col_name] = kind
        break  # only one <attributes> block per element


def emit_person(person, builder: ColumnBuilder) -> None:
    """Push one row per <activity>/<leg> child of each <plan> into builder."""
    person_d: dict = {}
    emit_attrs(person, "person", person_d, builder.col_kinds)
    col_kinds = builder.col_kinds
    plan_num = 0
    for plan in person:
        if plan.tag != "plan":
            continue
        plan_num += 1
        plan_d: dict = {}
        emit_attrs(plan, "plan", plan_d, col_kinds)
        for child in plan:
            tag = child.tag
            if tag != "activity" and tag != "leg":
                continue
            row = {**person_d, **plan_d, "plan_num": plan_num, "element": tag}
            emit_attrs(child, tag, row, col_kinds)
            if tag == "leg":
                for sub in child:
                    if sub.tag == "route":
                        emit_attrs(sub, "route", row, col_kinds)
                        if sub.text and sub.text.strip():
                            row["route_text"] = sub.text.strip()
                        break
            builder.fill_row(row)


def population_crs(root) -> str | None:
    block = root.find("attributes")
    if block is None:
        return None
    for a in block.findall("attribute"):
        if a.get("name") == "coordinateReferenceSystem":
            return a.text
    return None


def _build_array(values: list, kind: str | None) -> pa.Array:
    """Convert a column's Python list to a typed Arrow array."""
    if kind == "numeric":
        # pandas' string→float parser is the fastest vectorized option we have.
        nums = pd.to_numeric(pd.Series(values, dtype="object"), errors="coerce")
        return pa.array(nums.to_numpy(dtype=np.float64), from_pandas=True)
    if kind == "bool":
        bools = [True if v == "true" else False if v == "false" else None for v in values]
        return pa.array(bools, type=pa.bool_())
    # Default: let pyarrow infer (string, int64 for "step", etc.).
    arr = pa.array(values)
    if arr.type == pa.large_string():
        arr = arr.cast(pa.string())
    return arr


def finalize_chunk(builder: ColumnBuilder, crs: str | None) -> pa.Table:
    """Convert the columnar buffer to a pa.Table, applying numeric/bool
    coercion, the activity_type_simple derivation, and lon/lat projection
    without going through pandas for the bulk data."""
    arrays: dict[str, pa.Array] = {}
    for name, values in builder.cols.items():
        arrays[name] = _build_array(values, builder.col_kinds.get(name))

    # Build the final column dict in the desired order, inserting
    # activity_type_simple after activity_type and activity_lon/lat after
    # activity_y.
    if crs and "activity_x" in arrays and "activity_y" in arrays:
        xs = arrays["activity_x"].to_numpy(zero_copy_only=False).astype(np.float64, copy=False)
        ys = arrays["activity_y"].to_numpy(zero_copy_only=False).astype(np.float64, copy=False)
        mask = np.isfinite(xs) & np.isfinite(ys)
        lons = np.full(len(xs), np.nan)
        lats = np.full(len(ys), np.nan)
        if mask.any():
            lon_v, lat_v = get_transformer(crs).transform(xs[mask], ys[mask])
            lons[mask] = lon_v
            lats[mask] = lat_v
        lon_arr = pa.array(lons)
        lat_arr = pa.array(lats)
    else:
        lon_arr = lat_arr = None

    if "activity_type" in arrays:
        # Strip everything from the final underscore onwards. Strings without
        # an underscore are returned unchanged.
        simple_arr = pc.replace_substring_regex(
            arrays["activity_type"], pattern=r"_[^_]*$", replacement=""
        )
    else:
        simple_arr = None

    ordered: dict[str, pa.Array] = {}
    for name, arr in arrays.items():
        ordered[name] = arr
        if name == "activity_type" and simple_arr is not None:
            ordered["activity_type_simple"] = simple_arr
        elif name == "activity_y" and lon_arr is not None:
            ordered["activity_lon"] = lon_arr
            ordered["activity_lat"] = lat_arr
    return pa.table(ordered)


def merge_chunks(chunk_paths: list[Path], parquet_path: Path,
                 batch_size: int = 50000) -> int:
    """Stream chunk parquets into the final parquet with a unified schema
    (union of all chunk columns, in first-seen order). Bounded memory."""
    fields: dict[str, pa.Field] = {}
    for p in chunk_paths:
        for f in pq.read_schema(p):
            prev = fields.get(f.name)
            if prev is None or (prev.type == pa.null() and f.type != pa.null()):
                fields[f.name] = f
            elif pa.types.is_integer(prev.type) and pa.types.is_floating(f.type):
                fields[f.name] = f
    unified = pa.schema(list(fields.values()))

    n_total = 0
    writer = pq.ParquetWriter(parquet_path, unified, compression="zstd")
    try:
        for p in chunk_paths:
            pf = pq.ParquetFile(p)
            for batch in pf.iter_batches(batch_size=batch_size):
                arrays = []
                for field in unified:
                    if field.name in batch.schema.names:
                        col = batch.column(field.name)
                        if col.type != field.type:
                            col = col.cast(field.type, safe=False)
                        arrays.append(col)
                    else:
                        arrays.append(pa.nulls(batch.num_rows, type=field.type))
                writer.write_batch(pa.RecordBatch.from_arrays(arrays, schema=unified))
                n_total += batch.num_rows
    finally:
        writer.close()
    return n_total


def convert(input_path: Path, parquet_path: Path,
            crs_override: str | None, chunk_persons: int = 20000) -> int:
    """Stream the input XML, flush every `chunk_persons` persons to a
    per-chunk parquet file in a temp dir, then merge the chunks into the
    final parquet. Peak memory ≈ one chunk."""
    tmp_dir = Path(tempfile.mkdtemp(prefix="plans_chunks_", dir=parquet_path.parent))
    chunk_paths: list[Path] = []
    builder = ColumnBuilder()
    crs: str | None = None
    n_persons = 0
    log_every = 10000

    def flush():
        if len(builder) == 0:
            return
        table = finalize_chunk(builder, crs)
        chunk_path = tmp_dir / f"chunk_{len(chunk_paths):06d}.parquet"
        pq.write_table(table, chunk_path, compression="zstd")
        chunk_paths.append(chunk_path)
        print(f"  flushed chunk {len(chunk_paths)}: {table.num_rows} rows ({n_persons} persons so far)", flush=True)
        builder.reset()

    try:
        with open_xml(input_path) as fh:
            context = etree.iterparse(fh, events=("end",), tag="person")
            root = None
            for _, person in context:
                if root is None:
                    root = person.getparent()
                if crs is None:
                    # population <attributes> precedes any <person>, so it's
                    # fully parsed by the time we land here.
                    crs = crs_override or population_crs(root)
                    if crs:
                        print(f"  detected CRS: {crs}", flush=True)
                emit_person(person, builder)
                n_persons += 1
                if n_persons % log_every == 0:
                    print(f"  parsed {n_persons} persons", flush=True)
                # lxml fast-iter: drop the person plus any preceding siblings
                # (comments, whitespace) so the parsed tree stays bounded.
                person.clear()
                while person.getprevious() is not None:
                    del root[0]
                if n_persons % chunk_persons == 0:
                    flush()
            flush()

        print(f"parsed {n_persons} persons total; merging {len(chunk_paths)} chunk(s)...", flush=True)

        if not chunk_paths:
            pq.write_table(pa.table({}), parquet_path, compression="zstd")
            return 0

        return merge_chunks(chunk_paths, parquet_path)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("input", type=Path, help="MATSim population XML (.xml, .xml.gz, .xml.zst)")
    p.add_argument("-o", "--output", type=Path, help="Output parquet path (default: <input stem>.parquet)")
    p.add_argument("-crs", "--crs", help="Source CRS for activity_x/y (e.g. EPSG:25832). Overrides the population's coordinateReferenceSystem attribute.")
    p.add_argument("--chunk-size", type=int, default=20000, help="Persons per intermediate parquet chunk (default 20000).")
    args = p.parse_args()

    parquet_path = args.output
    if parquet_path is None:
        stem = args.input.name
        for ext in (".gz", ".zst", ".zstd", ".xml"):
            if stem.lower().endswith(ext):
                stem = stem[: -len(ext)]
        parquet_path = args.input.with_name(stem + ".parquet")

    n = convert(args.input, parquet_path, args.crs, args.chunk_size)
    print(f"Wrote {n} rows to {parquet_path}")


if __name__ == "__main__":
    main()
