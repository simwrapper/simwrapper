"""Tests for the `simwrapper events2parquet` command and its conversion logic."""

import datetime
import math
from pathlib import Path

import pyarrow.parquet as pq
import pytest
from click.testing import CliRunner

from simwrapper import events2parquet as e2p
from simwrapper.cli import cli


# MATSim writes exactly one <event/> per line; the parallel reader relies on
# that, so keep one event per line here.
EVENTS_XML = """<?xml version="1.0" encoding="utf-8"?>
<events version="1.0">
<event time="0.0" type="actend" person="1" link="a1" x="600000.0" y="5800000.0" actType="home"/>
<event time="60.0" type="departure" person="1" link="a1" legMode="car"/>
<event time="3661.0" type="arrival" person="1" link="a3" legMode="car"/>
<event time="3661.0" type="actstart" person="1" link="a3" x="601000.0" y="5801000.0" actType="work"/>
<event time="7200.0" type="actend" person="2" link="b1" x="600500.0" y="5800500.0" actType="home"/>
<event time="7260.0" type="departure" person="2" link="b1" legMode="walk"/>
</events>
"""


@pytest.fixture
def events_file(tmp_path):
    p = tmp_path / "events.xml"
    p.write_text(EVENTS_XML)
    return p


def test_convert_rows_columns_and_types(events_file, tmp_path):
    out = tmp_path / "events.parquet"
    e2p.run(events_file, out, crs="EPSG:25832", jobs=1)

    table = pq.read_table(out)
    d = table.to_pydict()

    assert table.num_rows == 6
    assert d["type"] == ["actend", "departure", "arrival", "actstart", "actend", "departure"]

    # `time` is coerced to float; `person` stays a string (never coerced).
    assert str(table.schema.field("time").type) == "double"
    assert str(table.schema.field("person").type) == "string"
    assert d["person"] == ["1", "1", "1", "1", "2", "2"]


def test_clock_time_is_duration(events_file, tmp_path):
    out = tmp_path / "events.parquet"
    e2p.run(events_file, out, jobs=1)
    table = pq.read_table(out)

    assert str(table.schema.field("clock_time").type) == "duration[s]"
    # time=3661s -> 1h01m01s duration (durations, not wrapping time-of-day)
    assert datetime.timedelta(seconds=3661) in table.to_pydict()["clock_time"]


def test_crs_projection_adds_lon_lat(events_file, tmp_path):
    out = tmp_path / "events.parquet"
    e2p.run(events_file, out, crs="EPSG:25832", jobs=1)
    d = pq.read_table(out).to_pydict()

    assert "lon" in d and "lat" in d
    # events carrying x/y (actend/actstart) project into central Europe;
    # events without x/y (departure/arrival) are NaN.
    lons = [v for v, t in zip(d["lon"], d["type"]) if t in ("actend", "actstart")]
    assert all(5.0 < v < 15.0 for v in lons)
    assert all(math.isnan(v) for v, t in zip(d["lon"], d["type"]) if t == "departure")


def test_no_crs_means_no_lon_lat(events_file, tmp_path):
    out = tmp_path / "events.parquet"
    e2p.run(events_file, out, jobs=1)
    names = pq.read_table(out).schema.names
    assert "lon" not in names and "lat" not in names
    assert "x" in names and "y" in names  # raw coords still present


def test_parallel_matches_sequential(events_file, tmp_path):
    seq = tmp_path / "seq.parquet"
    par = tmp_path / "par.parquet"
    e2p.run(events_file, seq, crs="EPSG:25832", chunk_size=2, jobs=1)
    # chunk_size=2 with jobs=2 forces multiple blocks across worker processes
    e2p.run(events_file, par, crs="EPSG:25832", chunk_size=2, jobs=2)

    ds = pq.read_table(seq).to_pydict()
    dp = pq.read_table(par).to_pydict()

    # exact event order must be preserved across the parallel split/merge
    assert dp["type"] == ds["type"]
    assert dp["person"] == ds["person"]
    assert dp["time"] == ds["time"]
    assert pq.read_table(par).num_rows == 6


def test_cli_command_writes_parquet(events_file, tmp_path):
    out = tmp_path / "explicit.parquet"
    runner = CliRunner()
    result = runner.invoke(
        cli, ["events2parquet", str(events_file), "-o", str(out),
              "--crs", "EPSG:25832", "-j", "1"]
    )
    assert result.exit_code == 0, result.output
    assert out.exists()
    assert pq.read_table(out).num_rows == 6


def test_cli_missing_input_errors(tmp_path):
    runner = CliRunner()
    result = runner.invoke(cli, ["events2parquet", str(tmp_path / "nope.xml")])
    assert result.exit_code != 0


def test_default_output_path():
    assert e2p.default_output_path(Path("/d/events.xml")).name == "events.parquet"
    assert e2p.default_output_path(Path("/d/events.xml.gz")).name == "events.parquet"
    assert e2p.default_output_path(Path("/d/events.xml.zst")).name == "events.parquet"
