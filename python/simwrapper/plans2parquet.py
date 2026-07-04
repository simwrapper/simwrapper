"""Flatten a MATSim population XML (population_v6.dtd) into a single Parquet.

One row per <activity> or <leg> inside each <plan>, carrying person, plan,
and element context as columns. Streams the input so multi-GB files stay
bounded in memory.
"""

from __future__ import annotations

import io
import shutil
import tempfile
from concurrent.futures import FIRST_COMPLETED, ProcessPoolExecutor, wait
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
    # int32 so JavaScript consumers read it as a normal number, not a BigInt.
    col_kinds["plan_num"] = "int32"
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
    if kind == "int32":
        return pa.array(values, type=pa.int32())
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


def _read_header(stream, read_size: int = 1 << 20) -> bytes:
    """Read decompressed bytes up to (not including) the first <person element.

    This spans the XML prolog, the <population> open tag, and the population-level
    <attributes> block that carries the coordinateReferenceSystem, so it is all we
    need to detect the CRS without parsing a single <person>."""
    data = b""
    while True:
        chunk = stream.read(read_size)
        if not chunk:
            return data
        data += chunk
        i = data.find(b"<person")
        if i != -1:
            return data[:i]


def population_crs_from_header(header: bytes) -> str | None:
    """Extract the population CRS from the header bytes returned by _read_header.
    Closes the dangling <population> so the fragment parses, then reuses
    population_crs()."""
    try:
        parser = etree.XMLParser(recover=True)
        root = etree.fromstring(header + b"</population>", parser=parser)
    except etree.XMLSyntaxError:
        return None
    if root is None:
        return None
    return population_crs(root)


def iter_person_blocks(stream, chunk_persons: int, read_size: int = 8 << 20):
    """Yield (index, raw_bytes) ordered blocks of complete <person>...</person>
    elements.

    Splits the decompressed stream only at </person> boundaries so a <person>
    element is never divided across blocks. Does no XML parsing -- only C-level
    bytes scanning -- so this sequential stage stays cheap."""
    MARKER = b"</person>"
    index = 0
    carry = b""        # bytes past the last </person> (a partial trailing person)
    buf = b""          # complete persons pending in the current block
    count = 0          # persons accumulated in buf
    started = False    # have we passed the prolog / <population> header?

    while True:
        data = stream.read(read_size)
        if not data:
            break
        data = carry + data
        if not started:
            i = data.find(b"<person")
            if i == -1:
                # Still inside the header; keep only a tail that could hold a
                # <person marker split across this read boundary.
                carry = data[-(len(b"<person") - 1):]
                continue
            data = data[i:]
            started = True
        end = data.rfind(MARKER)
        if end == -1:
            carry = data
            continue
        split = end + len(MARKER)
        complete, carry = data[:split], data[split:]
        buf += complete
        count += complete.count(MARKER)
        if count >= chunk_persons:
            yield index, buf
            index += 1
            buf = b""
            count = 0

    # EOF: carry holds only trailing whitespace / </population> (no whole person).
    buf += carry
    end = buf.rfind(b"</population>")
    if end != -1:
        buf = buf[:end]
    if started and buf.strip():
        yield index, buf


# Per-worker globals, set once by the pool initializer so only (index, raw)
# needs to cross the process boundary.
_W_CRS: str | None = None
_W_TMP: Path | None = None


def _init_worker(crs: str | None, tmp_dir: str) -> None:
    global _W_CRS, _W_TMP
    _W_CRS = crs
    _W_TMP = Path(tmp_dir)


def _convert_block(index: int, raw: bytes) -> tuple[int, str, int]:
    """Worker: parse one raw block of whole <person> elements into a per-block
    parquet chunk."""
    builder = ColumnBuilder()
    doc = b"<population>\n" + raw + b"</population>"
    try:
        context = etree.iterparse(io.BytesIO(doc), events=("end",), tag="person")
        root = None
        for _, person in context:
            if root is None:
                root = person.getparent()
            emit_person(person, builder)
            person.clear()
            while person.getprevious() is not None:
                del root[0]
    except etree.XMLSyntaxError as e:
        # lxml's exception carries an unpicklable error log; re-raise plainly
        # so the real message survives the process boundary.
        raise RuntimeError(f"block {index} parse failed: {e}") from None
    table = finalize_chunk(builder, _W_CRS)
    chunk_path = _W_TMP / f"chunk_{index:06d}.parquet"
    pq.write_table(table, chunk_path, compression="zstd")
    return index, str(chunk_path), table.num_rows


def convert_parallel(input_path: Path, parquet_path: Path,
                     crs_override: str | None, chunk_persons: int, jobs: int) -> int:
    """Parallel variant of convert(): a single sequential reader slices the
    stream into ordered blocks of whole <person> elements dispatched to `jobs`
    worker processes, then the chunks are merged in block order. Exact person
    order is preserved and no <person> is ever split across a block boundary."""
    tmp_dir = Path(tempfile.mkdtemp(prefix="plans_chunks_", dir=parquet_path.parent))
    results: list[tuple[int, str, int]] = []
    max_inflight = jobs * 2

    try:
        # The CRS lives in the population <attributes> header, ahead of every
        # <person>, so detect it once up front (unless overridden) and hand it
        # to the workers.
        crs = crs_override
        if crs is None:
            with open_xml(input_path) as fh:
                crs = population_crs_from_header(_read_header(fh))
        if crs:
            print(f"  detected CRS: {crs}", flush=True)

        n_rows = 0

        def collect(fut) -> None:
            # Each worker writes its own chunk parquet; log a status line here in
            # the parent as the result lands (completion order, not index order)
            # to keep output from interleaving across worker processes.
            nonlocal n_rows
            index, path, rows = fut.result()
            results.append((index, path, rows))
            n_rows += rows
            print(f"  wrote chunk {len(results)}: {rows} rows ({n_rows} rows so far)", flush=True)

        with ProcessPoolExecutor(max_workers=jobs, initializer=_init_worker,
                                 initargs=(crs, str(tmp_dir))) as ex:
            with open_xml(input_path) as fh:
                pending: set = set()
                for index, raw in iter_person_blocks(fh, chunk_persons):
                    pending.add(ex.submit(_convert_block, index, raw))
                    if len(pending) >= max_inflight:
                        done, pending = wait(pending, return_when=FIRST_COMPLETED)
                        for fut in done:
                            collect(fut)
                for fut in pending:
                    collect(fut)

        print(f"parsed {len(results)} block(s); merging...", flush=True)

        if not results:
            pq.write_table(pa.table({}), parquet_path, compression="zstd")
            return 0

        results.sort(key=lambda r: r[0])  # restore exact person order
        chunk_paths = [Path(p) for _, p, _ in results]
        return merge_chunks(chunk_paths, parquet_path)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def default_output_path(input_path: Path) -> Path:
    """Derive the default parquet path from the input: strip a trailing
    compression suffix and .xml, then append .parquet."""
    stem = input_path.name
    for ext in (".gz", ".zst", ".zstd", ".xml"):
        if stem.lower().endswith(ext):
            stem = stem[: -len(ext)]
    return input_path.with_name(stem + ".parquet")


def run(input_path: Path, parquet_path: Path | None = None,
        crs: str | None = None, chunk_size: int = 10000, jobs: int = 4) -> Path:
    """Convert one MATSim population XML to parquet, defaulting the output path
    when not given. Uses the parallel path unless jobs <= 1. Returns the path
    written."""
    input_path = Path(input_path)
    if parquet_path is None:
        parquet_path = default_output_path(input_path)
    parquet_path = Path(parquet_path)

    if jobs <= 1:
        n = convert(input_path, parquet_path, crs, chunk_size)
    else:
        n = convert_parallel(input_path, parquet_path, crs, chunk_size, jobs)
    print(f"Wrote {n} rows to {parquet_path}")
    return parquet_path
