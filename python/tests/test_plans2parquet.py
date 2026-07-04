"""Tests for the `simwrapper plans2parquet` command and its conversion logic."""

from pathlib import Path

import pyarrow.parquet as pq
import pytest
from click.testing import CliRunner

from simwrapper import plans2parquet as p2p
from simwrapper.cli import cli


POPULATION_XML = """<?xml version="1.0" encoding="utf-8"?>
<population>
  <attributes>
    <attribute name="coordinateReferenceSystem" class="java.lang.String">EPSG:25832</attribute>
  </attributes>
  <person id="1">
    <attributes>
      <attribute name="age" class="java.lang.Integer">42</attribute>
    </attributes>
    <plan selected="yes" score="123.4">
      <activity type="home_1" x="600000.0" y="5800000.0" link="a1"/>
      <leg mode="car">
        <route type="links" distance="1234.5">a1 a2 a3</route>
      </leg>
      <activity type="work_2" x="601000.0" y="5801000.0" link="a3"/>
    </plan>
  </person>
  <person id="2">
    <plan selected="yes" score="50.0">
      <activity type="home_1" x="600000.0" y="5800000.0" link="b1"/>
      <leg mode="walk"/>
      <activity type="shop" x="600500.0" y="5800500.0" link="b2"/>
    </plan>
  </person>
</population>
"""


@pytest.fixture
def population_file(tmp_path):
    p = tmp_path / "plans.xml"
    p.write_text(POPULATION_XML)
    return p


def test_convert_produces_expected_rows_and_columns(population_file, tmp_path):
    out = tmp_path / "plans.parquet"
    p2p.run(population_file, out)

    table = pq.read_table(out)
    d = table.to_pydict()

    # 3 elements (2 activities + 1 leg) per person, 2 persons -> 6 rows
    assert table.num_rows == 6
    assert set(d["element"]) == {"activity", "leg"}
    assert d["element"].count("activity") == 4
    assert d["element"].count("leg") == 2

    # activity_type_simple strips the trailing _<suffix>
    simple = [s for s, e in zip(d["activity_type_simple"], d["element"]) if e == "activity"]
    assert set(simple) == {"home", "work", "shop"}

    # plan_num is int32 and 1 everywhere (each person has one plan)
    assert str(table.schema.field("plan_num").type) == "int32"
    assert set(d["plan_num"]) == {1}

    # person/plan context carried onto element rows; numeric coercion applied
    assert set(d["person_id"]) == {"1", "2"}
    assert 123.4 in d["plan_score"]
    assert 42.0 in d["person_age"]  # java.lang.Integer attribute -> numeric


def test_crs_projection_adds_lon_lat(population_file, tmp_path):
    out = tmp_path / "plans.parquet"
    p2p.run(population_file, out)
    d = pq.read_table(out).to_pydict()

    assert "activity_lon" in d and "activity_lat" in d
    lons = [v for v, e in zip(d["activity_lon"], d["element"]) if e == "activity"]
    lats = [v for v, e in zip(d["activity_lat"], d["element"]) if e == "activity"]
    # EPSG:25832 easting ~600k / northing ~5.8M lands in central Europe
    assert all(5.0 < v < 15.0 for v in lons)
    assert all(50.0 < v < 55.0 for v in lats)


def test_crs_override_beats_file_attribute(population_file, tmp_path):
    # A bogus override CRS must still be honored (proves the override path runs);
    # WGS84->WGS84 leaves the raw x/y in place as lon/lat.
    out = tmp_path / "plans.parquet"
    p2p.run(population_file, out, crs="EPSG:4326")
    d = pq.read_table(out).to_pydict()
    lons = [v for v, e in zip(d["activity_lon"], d["element"]) if e == "activity"]
    assert any(v == 600000.0 for v in lons)


def test_cli_command_writes_parquet(population_file, tmp_path):
    out = tmp_path / "explicit.parquet"
    runner = CliRunner()
    result = runner.invoke(
        cli, ["plans2parquet", str(population_file), "-o", str(out), "--crs", "EPSG:25832"]
    )
    assert result.exit_code == 0, result.output
    assert out.exists()
    assert pq.read_table(out).num_rows == 6


def test_cli_missing_input_errors(tmp_path):
    runner = CliRunner()
    result = runner.invoke(cli, ["plans2parquet", str(tmp_path / "nope.xml")])
    assert result.exit_code != 0  # click.Path(exists=True) rejects it


def test_default_output_path():
    assert p2p.default_output_path(Path("/data/plans.xml")).name == "plans.parquet"
    assert p2p.default_output_path(Path("/data/plans.xml.gz")).name == "plans.parquet"
    assert p2p.default_output_path(Path("/data/plans.xml.zst")).name == "plans.parquet"
