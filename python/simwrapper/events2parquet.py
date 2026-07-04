"""Flatten a MATSim events XML into a single Parquet.

One row per <event>, with a column for every attribute name that appears on
any event (absent attributes are null). Streams the input and merges per-chunk
parquets so multi-GB files stay bounded in memory.
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
import pyarrow.parquet as pq
import pyproj
from lxml import etree

COMPRESSION_BY_SUFFIX = {".gz": "gzip", ".zst": "zstd", ".zstd": "zstd"}


def open_xml(path: Path):
    codec = COMPRESSION_BY_SUFFIX.get(path.suffix.lower())
    if codec is not None:
        return pa.input_stream(str(path), compression=codec)
    return open(path, "rb")


# Event attributes that are numeric. Everything else stays a string -- several
# id fields look numeric but must not be coerced (facility="10014.3",
# reference="3971", person="3971").
NUMERIC_EVENT_ATTRS = {"time", "x", "y", "distance", "delay", "relativePosition", "amount"}

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
        # col_name -> "numeric"; persists across chunks.
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


def emit_event(event, builder: ColumnBuilder) -> None:
    """Push one row for an <event>, one column per XML attribute."""
    row = dict(event.attrib)
    col_kinds = builder.col_kinds
    for k in row:
        if k in NUMERIC_EVENT_ATTRS:
            col_kinds[k] = "numeric"
    builder.fill_row(row)


def _build_array(values: list, kind: str | None) -> pa.Array:
    """Convert a column's Python list to a typed Arrow array."""
    if kind == "numeric":
        # pandas' string->float parser is the fastest vectorized option we have.
        nums = pd.to_numeric(pd.Series(values, dtype="object"), errors="coerce")
        return pa.array(nums.to_numpy(dtype=np.float64), from_pandas=True)
    # Default: let pyarrow infer (string, etc.).
    arr = pa.array(values)
    if arr.type == pa.large_string():
        arr = arr.cast(pa.string())
    return arr


def finalize_chunk(builder: ColumnBuilder, crs: str | None) -> pa.Table:
    """Convert the columnar buffer to a pa.Table, applying numeric coercion
    and, when a CRS is given, projecting x/y to lon/lat columns (inserted
    right after the y column)."""
    arrays: dict[str, pa.Array] = {}
    for name, values in builder.cols.items():
        arrays[name] = _build_array(values, builder.col_kinds.get(name))

    # Every event has a numeric `time` (seconds); expose it as an HH:MM:ss
    # duration. MATSim times routinely exceed 24h, so a duration (not a
    # wrapping time-of-day) is correct.
    if "time" in arrays:
        secs = arrays["time"].to_numpy(zero_copy_only=False).astype(np.float64, copy=False)
        finite = np.isfinite(secs)
        ints = np.zeros(len(secs), dtype=np.int64)
        ints[finite] = secs[finite].astype(np.int64)
        clock_arr = pa.array(ints, type=pa.duration("s"), mask=~finite)
    else:
        clock_arr = None

    if crs and "x" in arrays and "y" in arrays:
        xs = arrays["x"].to_numpy(zero_copy_only=False).astype(np.float64, copy=False)
        ys = arrays["y"].to_numpy(zero_copy_only=False).astype(np.float64, copy=False)
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

    ordered: dict[str, pa.Array] = {}
    for name, arr in arrays.items():
        ordered[name] = arr
        if name == "time" and clock_arr is not None:
            ordered["clock_time"] = clock_arr
        if name == "y" and lon_arr is not None:
            ordered["lon"] = lon_arr
            ordered["lat"] = lat_arr
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
            crs: str | None = None, chunk_events: int = 500000) -> int:
    """Stream the input XML, flush every `chunk_events` events to a per-chunk
    parquet file in a temp dir, then merge the chunks into the final parquet.
    Peak memory ~ one chunk."""
    tmp_dir = Path(tempfile.mkdtemp(prefix="events_chunks_", dir=parquet_path.parent))
    chunk_paths: list[Path] = []
    builder = ColumnBuilder()
    n_events = 0
    log_every = 500000

    def flush():
        if len(builder) == 0:
            return
        table = finalize_chunk(builder, crs)
        chunk_path = tmp_dir / f"chunk_{len(chunk_paths):06d}.parquet"
        pq.write_table(table, chunk_path, compression="zstd")
        chunk_paths.append(chunk_path)
        print(f"  flushed chunk {len(chunk_paths)}: {table.num_rows} rows ({n_events} events so far)", flush=True)
        builder.reset()

    try:
        with open_xml(input_path) as fh:
            context = etree.iterparse(fh, events=("end",), tag="event")
            root = None
            for _, event in context:
                if root is None:
                    root = event.getparent()
                emit_event(event, builder)
                n_events += 1
                if n_events % log_every == 0:
                    print(f"  parsed {n_events} events", flush=True)
                # lxml fast-iter: drop the event plus any preceding siblings
                # (comments, whitespace) so the parsed tree stays bounded.
                event.clear()
                while event.getprevious() is not None:
                    del root[0]
                if n_events % chunk_events == 0:
                    flush()
            flush()

        print(f"parsed {n_events} events total; merging {len(chunk_paths)} chunk(s)...", flush=True)

        if not chunk_paths:
            pq.write_table(pa.table({}), parquet_path, compression="zstd")
            return 0

        return merge_chunks(chunk_paths, parquet_path)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def iter_event_blocks(stream, chunk_events: int, read_size: int = 8 << 20):
    """Yield (index, raw_bytes) ordered blocks of complete <event> lines.

    Splits the decompressed stream on newline boundaries (MATSim writes exactly
    one <event/> per line), strips the XML prolog and <events> root open/close,
    and groups ~chunk_events events per block. Does no XML parsing -- only
    C-level bytes scanning -- so this sequential stage stays cheap."""
    index = 0
    carry = b""        # partial trailing line from the previous read
    buf = b""          # complete event lines pending in the current block
    count = 0          # events accumulated in buf
    started = False    # have we passed the prolog / <events ...> open tag?

    while True:
        data = stream.read(read_size)
        if not data:
            break
        data = carry + data
        nl = data.rfind(b"\n")
        if nl == -1:
            carry = data
            continue
        complete, carry = data[: nl + 1], data[nl + 1 :]
        if not started:
            i = complete.find(b"<event ")  # trailing space excludes "<events "
            if i == -1:
                continue  # still inside the prolog
            complete = complete[i:]
            started = True
        # The </events> footer (appears once, at EOF) may land in a block that
        # crosses the threshold and gets yielded below, so strip it here too.
        end = complete.find(b"</events>")
        if end != -1:
            complete = complete[:end]
        buf += complete
        count += complete.count(b"<event ")
        if count >= chunk_events:
            yield index, buf
            index += 1
            buf = b""
            count = 0

    # EOF: fold in any carry, drop a trailing </events> still in it, emit rest.
    buf += carry
    end = buf.rfind(b"</events>")
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
    """Worker: parse one raw event block into a per-block parquet chunk."""
    builder = ColumnBuilder()
    doc = b"<events>\n" + raw + b"</events>"
    try:
        context = etree.iterparse(io.BytesIO(doc), events=("end",), tag="event")
        root = None
        for _, event in context:
            if root is None:
                root = event.getparent()
            emit_event(event, builder)
            event.clear()
            while event.getprevious() is not None:
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
                     crs: str | None, chunk_events: int, jobs: int) -> int:
    """Parallel variant of convert(): a single sequential reader slices the
    stream into ordered event blocks dispatched to `jobs` worker processes,
    then the chunks are merged in block order. Exact event order preserved."""
    tmp_dir = Path(tempfile.mkdtemp(prefix="events_chunks_", dir=parquet_path.parent))
    results: list[tuple[int, str, int]] = []
    max_inflight = jobs * 2

    try:
        with ProcessPoolExecutor(max_workers=jobs, initializer=_init_worker,
                                 initargs=(crs, str(tmp_dir))) as ex:
            with open_xml(input_path) as fh:
                pending: set = set()
                for index, raw in iter_event_blocks(fh, chunk_events):
                    pending.add(ex.submit(_convert_block, index, raw))
                    if len(pending) >= max_inflight:
                        done, pending = wait(pending, return_when=FIRST_COMPLETED)
                        for fut in done:
                            results.append(fut.result())
                for fut in pending:
                    results.append(fut.result())

        n_events = sum(n for _, _, n in results)
        print(f"parsed {n_events} events total; merging {len(results)} chunk(s)...", flush=True)

        if not results:
            pq.write_table(pa.table({}), parquet_path, compression="zstd")
            return 0

        results.sort(key=lambda r: r[0])  # restore exact file order
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


def run(input_path: Path, parquet_path: Path | None = None, crs: str | None = None,
        chunk_size: int = 500000, jobs: int = 4) -> Path:
    """Convert one MATSim events XML to parquet, defaulting the output path when
    not given. Uses the parallel path unless jobs <= 1. Returns the path written."""
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
