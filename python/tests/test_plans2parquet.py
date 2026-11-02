"""Tests for the `simwrapper plans2parquet` command and its conversion logic."""

from pathlib import Path

import pyarrow.parquet as pq
import pytest
from click.testing import CliRunner

from simwrapper import plans2parquet as p2p
from simwrapper.cli import cli


POPULATION_XML = """<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE population SYSTEM "http://www.matsim.org/files/dtd/population_v6.dtd">
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
    assert 42.0 in d["person_attr_age"]  # java.lang.Integer attribute -> numeric


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


def test_leg_rows_have_null_lon_lat(population_file, tmp_path):
    # Legs have no coordinates: lon/lat must be real nulls (not NaN), like x/y,
    # on both the sequential and parallel paths.
    for jobs in (1, 2):
        out = tmp_path / f"plans-{jobs}.parquet"
        p2p.run(population_file, out, jobs=jobs)
        d = pq.read_table(out).to_pydict()
        for col in ("activity_x", "activity_y", "activity_lon", "activity_lat"):
            legs = [v for v, e in zip(d[col], d["element"]) if e == "leg"]
            assert legs and all(v is None for v in legs), (col, jobs, legs)


def test_crs_override_beats_file_attribute(population_file, tmp_path):
    # A bogus override CRS must still be honored (proves the override path runs);
    # WGS84->WGS84 leaves the raw x/y in place as lon/lat.
    out = tmp_path / "plans.parquet"
    p2p.run(population_file, out, crs="EPSG:4326")
    d = pq.read_table(out).to_pydict()
    lons = [v for v, e in zip(d["activity_lon"], d["element"]) if e == "activity"]
    assert any(v == 600000.0 for v in lons)


def test_parallel_matches_sequential(population_file, tmp_path):
    seq = tmp_path / "seq.parquet"
    par = tmp_path / "par.parquet"
    p2p.run(population_file, seq, crs="EPSG:25832", jobs=1)
    # chunk_persons=1 with jobs=2 forces each <person> into its own block, split
    # across worker processes.
    p2p.convert_parallel(population_file, par, "EPSG:25832", jobs=2, chunk_persons=1)

    ds = pq.read_table(seq)
    dp = pq.read_table(par)

    assert dp.num_rows == ds.num_rows == 6
    assert dp.column_names == ds.column_names
    # exact person order must be preserved across the parallel split/merge, and
    # each <person> must survive whole (all its activity/leg rows present).
    from pandas.testing import assert_frame_equal
    assert_frame_equal(dp.to_pandas(), ds.to_pandas())


def test_chunk_size_sets_output_row_groups(population_file, tmp_path):
    # chunk_size is rows per row group in the final file: 6 rows split 4+2.
    for jobs in (1, 2):
        out = tmp_path / f"rowgroups-{jobs}.parquet"
        p2p.run(population_file, out, chunk_size=4, jobs=jobs)
        pf = pq.ParquetFile(out)
        assert pf.metadata.num_row_groups == 2
        assert [pf.metadata.row_group(i).num_rows for i in range(2)] == [4, 2]


def test_final_output_reports_row_groups(population_file, tmp_path, capsys):
    # 6 rows at 4 per group -> 2 groups, the last one shorter.
    p2p.run(population_file, tmp_path / "a.parquet", chunk_size=4, jobs=1)
    assert capsys.readouterr().out.rstrip().endswith("2 row groups of 4 rows (last has 2)")
    # 6 rows at 3 per group -> 2 full groups, no "last" note.
    p2p.run(population_file, tmp_path / "b.parquet", chunk_size=3, jobs=1)
    assert capsys.readouterr().out.rstrip().endswith("2 row groups of 3 rows")
    p2p.run(population_file, tmp_path / "c.parquet", jobs=1)
    assert capsys.readouterr().out.rstrip().endswith("1 row group of 6 rows")


def test_dtd_metadata_written(population_file, tmp_path):
    # The prolog <!DOCTYPE ... SYSTEM "..."> must be recorded as parquet
    # key/value metadata on both the sequential and parallel paths.
    for jobs in (1, 2):
        out = tmp_path / f"plans-{jobs}.parquet"
        p2p.run(population_file, out, jobs=jobs)
        meta = pq.read_metadata(out).metadata
        assert meta is not None, f"no metadata (jobs={jobs})"
        assert (
            meta[b"xml_doctype"]
            == b'<!DOCTYPE population SYSTEM "http://www.matsim.org/files/dtd/population_v6.dtd">'
        )
        assert meta[b"xml_doctype_system"] == b"http://www.matsim.org/files/dtd/population_v6.dtd"


def test_no_doctype_yields_no_dtd_metadata(tmp_path):
    src = tmp_path / "no-doctype.xml"
    src.write_text(
        POPULATION_XML.replace(
            '<!DOCTYPE population SYSTEM "http://www.matsim.org/files/dtd/population_v6.dtd">\n', ""
        )
    )
    out = tmp_path / "no-doctype.parquet"
    p2p.run(src, out)
    meta = pq.read_metadata(out).metadata or {}
    assert b"xml_doctype" not in meta
    assert b"xml_doctype_system" not in meta


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


# Synthesized population with multiple plans per person, varying plan lengths,
# and plan-level <attributes> (which become plan_attr_* columns).
PLAN_ATTRS_XML = """<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE population SYSTEM "http://www.matsim.org/files/dtd/population_v6.dtd">
<population>
  <attributes>
    <attribute name="coordinateReferenceSystem" class="java.lang.String">EPSG:25832</attribute>
  </attributes>
  <person id="1">
    <plan selected="yes" score="10.0" type="car_plan">
      <attributes>
        <attribute name="iteration" class="java.lang.Integer">7</attribute>
        <attribute name="planMutator" class="java.lang.String">ChangeTripMode</attribute>
        <attribute name="isFeasible" class="java.lang.Boolean">true</attribute>
      </attributes>
      <activity type="home_1" x="600000.0" y="5800000.0" link="a1" end_time="08:00:00"/>
      <leg mode="car"/>
      <activity type="work_2" x="601000.0" y="5801000.0" link="a3" end_time="17:00:00"/>
      <leg mode="car"/>
      <activity type="home_1" x="600000.0" y="5800000.0" link="a1"/>
    </plan>
    <plan selected="no" score="5.0">
      <activity type="home_1" x="600000.0" y="5800000.0" link="a1" end_time="08:00:00"/>
      <leg mode="bike"/>
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
  <person id="3">
    <plan selected="yes" score="20.0">
      <attributes>
        <attribute name="note" class="java.lang.String">say "hi"</attribute>
      </attributes>
      <activity type="home_1" x="600000.0" y="5800000.0" link="c1"/>
    </plan>
  </person>
</population>
"""


@pytest.fixture
def plan_attrs_file(tmp_path):
    p = tmp_path / "plan-attrs.xml"
    p.write_text(PLAN_ATTRS_XML)
    return p


def test_plan_attr_columns(plan_attrs_file, tmp_path):
    out = tmp_path / "plan-attrs.parquet"
    p2p.run(plan_attrs_file, out)
    table = pq.read_table(out)
    by_plan = {
        (r["person_id"], r["plan_num"]): (
            r["plan_attr_iteration"], r["plan_attr_planMutator"],
            r["plan_attr_isFeasible"], r["plan_attr_note"],
        )
        for r in _rows(table)
    }
    # class-typed coercion applies: Integer -> numeric, Boolean -> bool
    assert by_plan[("1", 1)] == (7.0, "ChangeTripMode", True, None)
    assert by_plan[("1", 2)] == (None, None, None, None)
    assert by_plan[("2", 1)] == (None, None, None, None)
    assert by_plan[("3", 1)] == (None, None, None, 'say "hi"')


def _rows(table):
    d = table.to_pydict()
    return [dict(zip(d, vals)) for vals in zip(*d.values())]


def test_seq_numbers_elements_within_each_plan(plan_attrs_file, tmp_path):
    out = tmp_path / "seq.parquet"
    p2p.run(plan_attrs_file, out)
    table = pq.read_table(out)
    assert str(table.schema.field("seq").type) == "int32"

    seqs: dict = {}
    for r in _rows(table):
        seqs.setdefault((r["person_id"], r["plan_num"]), []).append((r["seq"], r["element"]))

    assert seqs[("1", 1)] == [
        (1, "activity"), (2, "leg"), (3, "activity"), (4, "leg"), (5, "activity")
    ]
    # restarts at 1 for the person's second plan
    assert seqs[("1", 2)] == [(1, "activity"), (2, "leg"), (3, "activity")]
    assert seqs[("2", 1)] == [(1, "activity"), (2, "leg"), (3, "activity")]
    assert seqs[("3", 1)] == [(1, "activity")]
