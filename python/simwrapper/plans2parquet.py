"""Flatten a MATSim population XML (population_v6.dtd) into a single Parquet.

One row per <activity> or <leg> inside each <plan> (numbered from 1 by `seq`
within the plan), carrying person, plan, and element context as columns.
Rows are sorted by person_id (each person's rows keep their XML order) so
person_id lookups can skip row groups via min/max statistics. Streams the
input and sorts externally, so multi-GB files stay bounded in memory.
"""

from __future__ import annotations

import io
import math
from collections import Counter
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

    __slots__ = ("cols", "n", "col_kinds", "end_time_counts")

    def __init__(self) -> None:
        self.cols: dict[str, list] = {}
        self.n = 0
        # col_name -> "numeric" | "bool"; persists across chunks.
        self.col_kinds: dict[str, str] = {}
        # Counts of each activity_end_time given in the XML (seconds -> n);
        # persists across chunks. Its max and 99.5th percentile go into the file
        # metadata, as the time slider's range.
        self.end_time_counts: Counter = Counter()

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
            col_name = f"{prefix}_attr_{name}"
            out[col_name] = a.text
            kind = CLASS_KIND.get(a.get("class"))
            if kind:
                col_kinds[col_name] = kind
        break  # only one <attributes> block per element


def parse_hms(value) -> int | None:
    """MATSim time string ("H:MM:SS", hours may exceed 24, optional fractional
    seconds; or plain seconds) -> whole seconds. None if missing/unparseable."""
    if not value:
        return None
    parts = value.split(":")
    try:
        if len(parts) == 3:
            secs = int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
        elif len(parts) == 2:
            secs = int(parts[0]) * 3600 + int(parts[1]) * 60
        elif len(parts) == 1:
            secs = float(parts[0])
        else:
            return None
    except ValueError:
        return None
    if not math.isfinite(secs):
        return None
    return math.floor(secs)


def later(a: int | None, b: int | None) -> int | None:
    """The later of two optional times (None = unknown)."""
    if a is None:
        return b
    if b is None:
        return a
    return a if a > b else b


def assign_plan_times(rows: list[dict], end_time_counts: Counter | None = None) -> None:
    """Fill time_start/time_end (seconds) on one plan's rows, in plan order, so
    each row is "active" during [time_start, time_end). A null time_end means
    open-ended (the day's last activity). Each activity_end_time given in the
    plan (not inferred) is tallied in `end_time_counts`, if passed.

    activity: start = start_time, else the previous element's end, else 0;
              end = end_time, else start + max_dur, else null.
    leg:      start = dep_time, else the previous element's end;
              end = start + travel time (route trav_time, else leg trav_time),
              else the next activity's start_time, else its end_time, else start.
    Elements are sequential, so nothing starts before the previous element
    ends: MATSim output plans give every leg of a multi-leg trip the trip's
    departure time, and agents can arrive after an activity's planned
    end_time. An end before its start is likewise clamped to the start."""
    prev_end: int | None = 0
    for i, r in enumerate(rows):
        if r["element"] == "activity":
            start = later(parse_hms(r.get("activity_start_time")), prev_end)
            end = parse_hms(r.get("activity_end_time"))
            if end is not None and end_time_counts is not None:
                end_time_counts[end] += 1
            if end is None:
                dur = parse_hms(r.get("activity_max_dur"))
                end = start + dur if dur is not None and start is not None else None
        else:
            start = later(parse_hms(r.get("leg_dep_time")), prev_end)
            trav = parse_hms(r.get("route_trav_time"))
            if trav is None:
                trav = parse_hms(r.get("leg_trav_time"))
            if trav is not None and start is not None:
                end = start + trav
            else:
                end = None
                for nxt in rows[i + 1 :]:
                    if nxt["element"] == "activity":
                        end = parse_hms(nxt.get("activity_start_time"))
                        if end is None:
                            end = parse_hms(nxt.get("activity_end_time"))
                        break
                if end is None:
                    end = start
        if end is not None and start is not None and end < start:
            end = start
        r["time_start"] = start
        r["time_end"] = end
        prev_end = end


def emit_person(person, builder: ColumnBuilder) -> None:
    """Push one row per <activity>/<leg> child of each <plan> into builder."""
    person_d: dict = {}
    emit_attrs(person, "person", person_d, builder.col_kinds)
    col_kinds = builder.col_kinds
    # int32 so JavaScript consumers read it as a normal number, not a BigInt.
    col_kinds["plan_num"] = "int32"
    col_kinds["seq"] = "int32"
    col_kinds["time_start"] = "int32"
    col_kinds["time_end"] = "int32"
    plan_num = 0
    for plan in person:
        if plan.tag != "plan":
            continue
        plan_num += 1
        plan_d: dict = {}
        emit_attrs(plan, "plan", plan_d, col_kinds)
        seq = 0
        plan_rows: list[dict] = []
        for child in plan:
            tag = child.tag
            if tag != "activity" and tag != "leg":
                continue
            seq += 1
            row = {
                **person_d,
                **plan_d,
                "plan_num": plan_num,
                "seq": seq,
                "element": tag,
                # filled by assign_plan_times(); placed here for column order
                "time_start": None,
                "time_end": None,
            }
            emit_attrs(child, tag, row, col_kinds)
            if tag == "leg":
                for sub in child:
                    if sub.tag == "route":
                        emit_attrs(sub, "route", row, col_kinds)
                        if sub.text and sub.text.strip():
                            row["route_text"] = sub.text.strip()
                        break
            plan_rows.append(row)
        assign_plan_times(plan_rows, builder.end_time_counts)
        for row in plan_rows:
            builder.fill_row(row)


def population_crs(root) -> str | None:
    block = root.find("attributes")
    if block is None:
        return None
    for a in block.findall("attribute"):
        if a.get("name") == "coordinateReferenceSystem":
            return a.text
    return None


def dtd_metadata(docinfo) -> dict[bytes, bytes] | None:
    """Parquet key/value metadata describing the DTD declared in the XML prolog
    (e.g. <!DOCTYPE population SYSTEM "...population_v6.dtd">). Returns None
    when the document carries no DOCTYPE declaration."""
    meta: dict[bytes, bytes] = {}
    if docinfo.doctype:
        meta[b"xml_doctype"] = docinfo.doctype.encode("utf-8")
    if docinfo.system_url:
        meta[b"xml_doctype_system"] = docinfo.system_url.encode("utf-8")
    if docinfo.public_id:
        meta[b"xml_doctype_public"] = docinfo.public_id.encode("utf-8")
    return meta or None


MAX_END_TIME_KEY = b"plans_max_end_time"
P995_END_TIME_KEY = b"plans_end_time_p995"


def count_percentile(counts: Counter, q: float) -> int | None:
    """Nearest-rank q-quantile (0 < q <= 1) of values tallied in `counts`."""
    n = sum(counts.values())
    if n == 0:
        return None
    rank = max(1, math.ceil(q * n))
    seen = 0
    for value in sorted(counts):
        seen += counts[value]
        if seen >= rank:
            return value
    return max(counts)


def file_metadata(
    dtd_meta: dict[bytes, bytes] | None, end_time_counts: Counter
) -> dict[bytes, bytes] | None:
    """File-level key/value metadata: the DTD info plus the latest and the
    99.5th-percentile activity_end_time (seconds, decimal strings). Viewers
    use them as the time slider's range without scanning the file; the
    percentile keeps a few outlier agents from stretching the slider."""
    meta = dict(dtd_meta or {})
    if end_time_counts:
        meta[MAX_END_TIME_KEY] = str(max(end_time_counts)).encode("ascii")
        p995 = count_percentile(end_time_counts, 0.995)
        meta[P995_END_TIME_KEY] = str(p995).encode("ascii")
    return meta or None


def _build_array(values: list, kind: str | None) -> pa.Array:
    """Convert a column's Python list to a typed Arrow array."""
    if kind == "numeric":
        # pandas' string→float parser is the fastest vectorized option we have.
        nums = pd.to_numeric(pd.Series(values, dtype="object"), errors="coerce")
        return pa.array(nums.to_numpy(dtype=np.float64), from_pandas=True)
    if kind == "int32":
        return pa.array(values, type=pa.int32())
    if kind == "bool":
        bools = [
            True if v == "true" else False if v == "false" else None for v in values
        ]
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
        xs = (
            arrays["activity_x"]
            .to_numpy(zero_copy_only=False)
            .astype(np.float64, copy=False)
        )
        ys = (
            arrays["activity_y"]
            .to_numpy(zero_copy_only=False)
            .astype(np.float64, copy=False)
        )
        mask = np.isfinite(xs) & np.isfinite(ys)
        lons = np.full(len(xs), np.nan)
        lats = np.full(len(ys), np.nan)
        if mask.any():
            lon_v, lat_v = get_transformer(crs).transform(xs[mask], ys[mask])
            lons[mask] = lon_v
            lats[mask] = lat_v
        # Rows without coordinates (legs, or activities lacking x/y) are null,
        # not NaN, matching activity_x/activity_y.
        lon_arr = pa.array(lons, mask=~mask)
        lat_arr = pa.array(lats, mask=~mask)
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
    return sort_by_person(pa.table(ordered))


# The output is sorted by person_id so readers (DuckDB-WASM over HTTP) can
# prune row groups for a person_id lookup using the min/max statistics alone.
SORT_KEY = "person_id"
# Rows per row group in the temporary sorted chunk files, and per read batch
# while merging them: bounds merge memory to ~MERGE_FAN_IN of these.
SORT_RUN_ROWS = 8192
# Max chunk files merged (open) at once; more chunks are merged in passes.
MERGE_FAN_IN = 64


def sort_by_person(table: pa.Table) -> pa.Table:
    """Sort rows by person_id. Arrow's sort_indices is stable, so the rows of
    each person keep their original (XML) order."""
    if SORT_KEY not in table.column_names or table.num_rows == 0:
        return table
    return table.take(pc.sort_indices(table, sort_keys=[(SORT_KEY, "ascending")]))


def write_chunk(table: pa.Table, chunk_path: Path) -> None:
    """Write a sorted temporary chunk, in small row groups so the merge holds
    only a little of each chunk in memory at a time."""
    pq.write_table(table, chunk_path, compression="zstd", row_group_size=SORT_RUN_ROWS)


def _unified_schema(paths: list[Path], metadata=None) -> pa.Schema:
    """Union of all chunk columns, in first-seen order. A column that is all
    null in one chunk takes its type from the others; int widens to float."""
    fields: dict[str, pa.Field] = {}
    for p in paths:
        for f in pq.read_schema(p):
            prev = fields.get(f.name)
            if prev is None or (prev.type == pa.null() and f.type != pa.null()):
                fields[f.name] = f
            elif pa.types.is_integer(prev.type) and pa.types.is_floating(f.type):
                fields[f.name] = f
    return pa.schema(list(fields.values()), metadata=metadata)


def _conformed_batches(path: Path, schema: pa.Schema):
    """Yield path's rows as tables conforming to `schema` (cast, missing
    columns filled with nulls), SORT_RUN_ROWS at a time."""
    pf = pq.ParquetFile(path)
    for batch in pf.iter_batches(batch_size=SORT_RUN_ROWS):
        arrays = []
        for field in schema:
            if field.name in batch.schema.names:
                col = batch.column(field.name)
                if col.type != field.type:
                    col = col.cast(field.type, safe=False)
                arrays.append(col)
            else:
                arrays.append(pa.nulls(batch.num_rows, type=field.type))
        yield pa.Table.from_arrays(arrays, schema=schema)


def _merge_sorted(paths: list[Path], schema: pa.Schema):
    """K-way merge of chunk files that are each sorted by person_id, yielding
    sorted tables. Vectorized: each round takes, from every buffer, all rows
    whose id is below the smallest "last buffered id" among the chunks still
    being read. No chunk can hold further rows below that cutoff, so every
    person taken is complete and its rows stay in their original order."""
    readers = [_conformed_batches(p, schema) for p in paths]
    k = len(readers)
    bufs: list[pa.Table | None] = [None] * k
    done = [False] * k

    def refill(i: int) -> None:
        nxt = next(readers[i], None)
        if nxt is None:
            done[i] = True
        elif bufs[i] is None or bufs[i].num_rows == 0:
            bufs[i] = nxt
        else:
            bufs[i] = pa.concat_tables([bufs[i], nxt])

    def ids(i: int):
        return bufs[i].column(SORT_KEY)

    for i in range(k):
        refill(i)

    while True:
        # A still-open chunk needs more rows when its buffer is empty or holds
        # only one id (which may continue into its next batch).
        for i in range(k):
            while not done[i] and (
                bufs[i] is None
                or bufs[i].num_rows == 0
                or ids(i)[0].as_py() == ids(i)[-1].as_py()
            ):
                refill(i)

        live = [i for i in range(k) if bufs[i] is not None and bufs[i].num_rows]
        if not live:
            return
        open_lasts = [ids(i)[-1].as_py() for i in live if not done[i]]
        cutoff = min(open_lasts) if open_lasts else None

        pieces = []
        for i in live:
            b = bufs[i]
            if cutoff is None:
                n = b.num_rows
            else:
                n = pc.sum(pc.less(b.column(SORT_KEY), cutoff)).as_py() or 0
            if n:
                pieces.append(b.slice(0, n))
                bufs[i] = b.slice(n)
        if not pieces:
            # Impossible for sorted inputs (the chunk setting the cutoff holds a
            # smaller id); fail loudly rather than spin forever.
            raise RuntimeError("merge made no progress: a chunk is not sorted by person_id")
        yield sort_by_person(pa.concat_tables(pieces).combine_chunks())


def _merge_to_run(paths: list[Path], schema: pa.Schema, out_path: Path) -> None:
    """Merge sorted chunk files into one larger sorted chunk file."""
    writer = pq.ParquetWriter(out_path, schema, compression="zstd")
    try:
        for t in _merge_sorted(paths, schema):
            writer.write_table(t, row_group_size=SORT_RUN_ROWS)
    finally:
        writer.close()


def merge_chunks(
    chunk_paths: list[Path],
    parquet_path: Path,
    batch_size: int = 65536,
    metadata: dict[bytes, bytes] | None = None,
) -> int:
    """Merge the per-chunk parquets (each already sorted by person_id) into the
    final parquet, sorted by person_id with each person's rows in their
    original order. Uses a unified schema (union of all chunk columns, in
    first-seen order) and writes row groups of exactly `batch_size` rows (the
    last may be shorter). Bounded memory; more than MERGE_FAN_IN chunks are
    first merged in passes into larger temporary runs next to the chunks.
    `metadata` (if given) is written as file-level key/value metadata."""
    unified = _unified_schema(chunk_paths, metadata=metadata)

    paths = list(chunk_paths)
    n_pass = 0
    while len(paths) > MERGE_FAN_IN:
        n_pass += 1
        runs = []
        for j in range(0, len(paths), MERGE_FAN_IN):
            group = paths[j : j + MERGE_FAN_IN]
            run_path = paths[0].parent / f"run_{n_pass:02d}_{len(runs):06d}.parquet"
            _merge_to_run(group, unified, run_path)
            runs.append(run_path)
        print(f"  merge pass {n_pass}: {len(paths)} -> {len(runs)} sorted runs", flush=True)
        paths = runs

    n_total = 0
    writer = pq.ParquetWriter(parquet_path, unified, compression="zstd")
    try:
        # Re-batch the merged stream so every row group but the last is full.
        pending: list[pa.Table] = []
        n_pending = 0
        for t in _merge_sorted(paths, unified):
            pending.append(t)
            n_pending += t.num_rows
            if n_pending >= batch_size:
                buf = pa.concat_tables(pending)
                n_full = (n_pending // batch_size) * batch_size
                writer.write_table(buf.slice(0, n_full), row_group_size=batch_size)
                rest = buf.slice(n_full)
                pending = [rest] if rest.num_rows else []
                n_pending = rest.num_rows
                n_total += n_full
        if n_pending:
            writer.write_table(pa.concat_tables(pending), row_group_size=batch_size)
            n_total += n_pending
    finally:
        writer.close()
    return n_total


def convert(
    input_path: Path,
    parquet_path: Path,
    crs_override: str | None,
    row_group_size: int = 65536,
    chunk_persons: int = 20000,
) -> int:
    """Stream the input XML, flush every `chunk_persons` persons to a
    per-chunk parquet file (sorted by person_id) in a temp dir (an internal
    sizing detail), then merge-sort the chunks into the final parquet with
    `row_group_size` rows per row group. Peak memory ≈ one chunk."""
    tmp_dir = Path(tempfile.mkdtemp(prefix="plans_chunks_", dir=parquet_path.parent))
    chunk_paths: list[Path] = []
    builder = ColumnBuilder()
    crs: str | None = None
    dtd_meta: dict[bytes, bytes] | None = None
    n_persons = 0
    log_every = 10000

    def flush():
        if len(builder) == 0:
            return
        table = finalize_chunk(builder, crs)
        chunk_path = tmp_dir / f"chunk_{len(chunk_paths):06d}.parquet"
        write_chunk(table, chunk_path)
        chunk_paths.append(chunk_path)
        print(
            f"  flushed chunk {len(chunk_paths)}: {table.num_rows} rows ({n_persons} persons so far)",
            flush=True,
        )
        builder.reset()

    try:
        with open_xml(input_path) as fh:
            context = etree.iterparse(fh, events=("end",), tag="person")
            root = None
            for _, person in context:
                if root is None:
                    root = person.getparent()
                    # Any prolog DOCTYPE/DTD declaration has been parsed by the
                    # time the first <person> event fires.
                    dtd_meta = dtd_metadata(root.getroottree().docinfo)
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

        print(
            f"parsed {n_persons} persons total; merging {len(chunk_paths)} chunk(s)...",
            flush=True,
        )
        end_time_counts = builder.end_time_counts

        if not chunk_paths:
            pq.write_table(
                _empty_table(file_metadata(dtd_meta, end_time_counts)),
                parquet_path,
                compression="zstd",
            )
            return 0

        return merge_chunks(
            chunk_paths,
            parquet_path,
            batch_size=row_group_size,
            metadata=file_metadata(dtd_meta, end_time_counts),
        )
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _empty_table(metadata: dict[bytes, bytes] | None = None) -> pa.Table:
    """Zero-row table, optionally carrying file key/value metadata."""
    return pa.Table.from_batches([], schema=pa.schema([], metadata=metadata))


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


def population_crs_from_header(
    header: bytes,
) -> tuple[str | None, dict[bytes, bytes] | None]:
    """Extract (population CRS, DTD metadata) from the header bytes returned by
    _read_header. Closes the dangling <population> so the fragment parses, then
    reuses population_crs(); the DTD info comes from the prolog's DOCTYPE
    declaration (docinfo), which lxml records without fetching the DTD."""
    try:
        parser = etree.XMLParser(recover=True)
        root = etree.fromstring(header + b"</population>", parser=parser)
    except etree.XMLSyntaxError:
        return None, None
    if root is None:
        return None, None
    return population_crs(root), dtd_metadata(root.getroottree().docinfo)


def iter_person_blocks(stream, chunk_persons: int, read_size: int = 8 << 20):
    """Yield (index, raw_bytes) ordered blocks of complete <person>...</person>
    elements.

    Splits the decompressed stream only at </person> boundaries so a <person>
    element is never divided across blocks. Does no XML parsing -- only C-level
    bytes scanning -- so this sequential stage stays cheap."""
    MARKER = b"</person>"
    index = 0
    carry = b""  # bytes past the last </person> (a partial trailing person)
    buf = b""  # complete persons pending in the current block
    count = 0  # persons accumulated in buf
    started = False  # have we passed the prolog / <population> header?

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
                carry = data[-(len(b"<person") - 1) :]
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


def _convert_block(index: int, raw: bytes) -> tuple[int, str, int, int, Counter]:
    """Worker: parse one raw block of whole <person> elements into a per-block
    parquet chunk. Returns (index, path, num_rows, num_persons, end_time_counts)."""
    builder = ColumnBuilder()
    doc = b"<population>\n" + raw + b"</population>"
    n_persons = 0
    try:
        context = etree.iterparse(io.BytesIO(doc), events=("end",), tag="person")
        root = None
        for _, person in context:
            if root is None:
                root = person.getparent()
            emit_person(person, builder)
            n_persons += 1
            person.clear()
            while person.getprevious() is not None:
                del root[0]
    except etree.XMLSyntaxError as e:
        # lxml's exception carries an unpicklable error log; re-raise plainly
        # so the real message survives the process boundary.
        raise RuntimeError(f"block {index} parse failed: {e}") from None
    table = finalize_chunk(builder, _W_CRS)
    chunk_path = _W_TMP / f"chunk_{index:06d}.parquet"
    write_chunk(table, chunk_path)
    return index, str(chunk_path), table.num_rows, n_persons, builder.end_time_counts


def convert_parallel(
    input_path: Path,
    parquet_path: Path,
    crs_override: str | None,
    jobs: int,
    row_group_size: int = 65536,
    chunk_persons: int = 20000,
) -> int:
    """Parallel variant of convert(): a single sequential reader slices the
    stream into ordered blocks of whole <person> elements dispatched to `jobs`
    worker processes, then the sorted chunks are merge-sorted by person_id into
    row groups of `row_group_size` rows. No <person> is ever split across a
    block boundary, and each person's rows keep their XML order; the output is
    identical to convert()'s."""
    tmp_dir = Path(tempfile.mkdtemp(prefix="plans_chunks_", dir=parquet_path.parent))
    results: list[tuple[int, str, int, int, Counter]] = []
    max_inflight = jobs * 2

    try:
        # The CRS and the prolog DOCTYPE live in the header, ahead of every
        # <person>, so read it once up front: hand the CRS to the workers and
        # the DTD metadata to the final merge.
        with open_xml(input_path) as fh:
            file_crs, dtd_meta = population_crs_from_header(_read_header(fh))
        crs = crs_override or file_crs
        if crs:
            print(f"  detected CRS: {crs}", flush=True)

        n_rows = 0

        def collect(fut) -> None:
            # Each worker writes its own chunk parquet; log a status line here in
            # the parent as the result lands (completion order, not index order)
            # to keep output from interleaving across worker processes.
            nonlocal n_rows
            index, path, rows, persons, block_counts = fut.result()
            results.append((index, path, rows, persons, block_counts))
            n_rows += rows
            print(
                f"  wrote chunk {len(results)}: {rows} rows ({n_rows} rows so far)",
                flush=True,
            )

        with ProcessPoolExecutor(
            max_workers=jobs, initializer=_init_worker, initargs=(crs, str(tmp_dir))
        ) as ex, open_xml(input_path) as fh:
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
        end_time_counts: Counter = Counter()
        for r in results:
            end_time_counts.update(r[4])

        if not results:
            pq.write_table(
                _empty_table(file_metadata(dtd_meta, end_time_counts)),
                parquet_path,
                compression="zstd",
            )
            return 0

        # Block order, so ties (duplicate person ids) resolve as in convert().
        results.sort(key=lambda r: r[0])
        chunk_paths = [Path(r[1]) for r in results]
        return merge_chunks(
            chunk_paths,
            parquet_path,
            batch_size=row_group_size,
            metadata=file_metadata(dtd_meta, end_time_counts),
        )
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


def row_group_summary(parquet_path: Path) -> str:
    """One-line description of the file's row groups: how many there are and
    the rows in each, with the (possibly shorter) last group noted separately."""
    md = pq.read_metadata(parquet_path)
    n = md.num_row_groups
    if n == 0:
        return "  0 row groups"
    if n == 1:
        return f"  1 row group of {md.row_group(0).num_rows} rows"
    first = md.row_group(0).num_rows
    last = md.row_group(n - 1).num_rows
    line = f"  {n} row groups of {first} rows"
    if last != first:
        line += f" (last has {last})"
    return line


def run(
    input_path: Path,
    parquet_path: Path | None = None,
    crs: str | None = None,
    chunk_size: int = 65536,
    jobs: int = 4,
) -> Path:
    """Convert one MATSim population XML to parquet, defaulting the output path
    when not given. `chunk_size` is the number of rows per row group in the
    output file. Uses the parallel path unless jobs <= 1. Returns the path
    written."""
    input_path = Path(input_path)
    if parquet_path is None:
        parquet_path = default_output_path(input_path)
    parquet_path = Path(parquet_path)

    if jobs <= 1:
        n = convert(input_path, parquet_path, crs, row_group_size=chunk_size)
    else:
        n = convert_parallel(
            input_path, parquet_path, crs, jobs, row_group_size=chunk_size
        )
    print(f"Wrote {n} rows to {parquet_path}")
    print(row_group_summary(parquet_path))
    return parquet_path
