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


def _unsorted_population(n_persons=30, seed=7):
    """Synthesize a population whose person ids are in no particular order
    (mixing numeric-looking and textual ids, so string order differs from
    numeric order), with 1-3 plans of varying length per person. Returns the
    XML and, per person id, the expected rows in XML order as
    (plan_num, seq, element, activity_type-or-leg_mode)."""
    import random

    rnd = random.Random(seed)
    ids = [str(v) for v in rnd.sample(range(1, 2000), n_persons // 2)]
    ids += [f"agent_{v}" for v in rnd.sample(range(1, 2000), n_persons - len(ids))]
    rnd.shuffle(ids)

    xml = [
        '<?xml version="1.0" encoding="utf-8"?>',
        "<population>",
    ]
    expected: dict[str, list] = {}
    for pid in ids:
        rows = expected[pid] = []
        xml.append(f'  <person id="{pid}">')
        for plan in range(1, rnd.randint(1, 3) + 1):
            xml.append(f'    <plan selected="{"yes" if plan == 1 else "no"}">')
            seq = 0
            n_acts = rnd.randint(1, 4)
            for a in range(n_acts):
                seq += 1
                act = f"act{pid}-{plan}-{a}"
                xml.append(f'      <activity type="{act}" x="1.0" y="2.0"/>')
                rows.append((plan, seq, "activity", act))
                if a < n_acts - 1:
                    seq += 1
                    mode = f"mode{pid}-{plan}-{a}"
                    xml.append(f'      <leg mode="{mode}"/>')
                    rows.append((plan, seq, "leg", mode))
            xml.append("    </plan>")
        xml.append("  </person>")
    xml.append("</population>")
    return "\n".join(xml) + "\n", ids, expected


def test_output_sorted_by_person_id_keeping_row_order(tmp_path, monkeypatch):
    xml, ids, expected = _unsorted_population()
    assert ids != sorted(ids)  # the input really is unsorted
    src = tmp_path / "unsorted.xml"
    src.write_text(xml)
    n_rows = sum(len(r) for r in expected.values())

    # Tiny merge read batches (so persons straddle batch boundaries) and a fan-in
    # of 2 (so several merge passes run) exercise the external sort fully.
    monkeypatch.setattr(p2p, "SORT_RUN_ROWS", 3)
    monkeypatch.setattr(p2p, "MERGE_FAN_IN", 2)

    seq_out = tmp_path / "seq.parquet"
    par_out = tmp_path / "par.parquet"
    p2p.convert(src, seq_out, None, row_group_size=7, chunk_persons=4)
    p2p.convert_parallel(src, par_out, None, jobs=2, row_group_size=7, chunk_persons=4)

    for out in (seq_out, par_out):
        d = pq.read_table(out).to_pydict()
        assert len(d["person_id"]) == n_rows

        # globally sorted, each person's rows contiguous
        assert d["person_id"] == sorted(d["person_id"])

        # each person's rows exactly as in the XML
        got: dict[str, list] = {}
        for pid, plan, seq, el, act, mode in zip(
            d["person_id"], d["plan_num"], d["seq"], d["element"],
            d["activity_type"], d["leg_mode"],
        ):
            got.setdefault(pid, []).append((plan, seq, el, act if el == "activity" else mode))
        assert got == expected

        # row groups are exactly row_group_size, except a shorter last one
        pf = pq.ParquetFile(out)
        sizes = [pf.metadata.row_group(i).num_rows for i in range(pf.metadata.num_row_groups)]
        assert all(s == 7 for s in sizes[:-1]) and 0 < sizes[-1] <= 7

        # min/max stats on person_id don't overlap between row groups
        ci = pf.schema_arrow.names.index("person_id")
        ranges = [
            (pf.metadata.row_group(i).column(ci).statistics.min,
             pf.metadata.row_group(i).column(ci).statistics.max)
            for i in range(pf.metadata.num_row_groups)
        ]
        assert all(ranges[i][1] <= ranges[i + 1][0] for i in range(len(ranges) - 1))

    from pandas.testing import assert_frame_equal
    assert_frame_equal(pq.read_table(par_out).to_pandas(), pq.read_table(seq_out).to_pandas())


# Synthesized plans exercising every time-window inference rule. Expected
# (time_start, time_end) per row are in TIMES_EXPECTED; None = open-ended.
TIMES_XML = """<?xml version="1.0" encoding="utf-8"?>
<population>
  <person id="t1">
    <plan selected="yes">
      <activity type="home" x="0" y="0" end_time="07:00:00"/>
      <leg mode="car" dep_time="07:00:00">
        <route type="links" trav_time="00:30:00">a b</route>
      </leg>
      <activity type="pt interaction" x="1" y="1" max_dur="00:00:00"/>
      <leg mode="walk" dep_time="07:30:00"/>
      <activity type="work" x="2" y="2" start_time="08:00:00" end_time="26:30:00"/>
      <leg mode="bike" dep_time="26:30:00" trav_time="00:15:00"/>
      <activity type="shop" x="3" y="3" max_dur="01:00:00"/>
      <leg mode="walk"/>
      <activity type="leisure" x="4" y="4" end_time="28:00:00"/>
      <leg mode="car" dep_time="28:00:00">
        <route type="generic" trav_time="00:10:00"/>
      </leg>
      <activity type="home" x="0" y="0"/>
    </plan>
  </person>
  <person id="t3">
    <plan selected="yes">
      <activity type="home" x="0" y="0" end_time="08:00:00"/>
      <leg mode="walk" dep_time="08:00:00"><route type="generic" trav_time="00:00:30"/></leg>
      <activity type="car interaction" x="0" y="0" max_dur="00:00:00"/>
      <leg mode="car" dep_time="08:00:00"><route type="links" trav_time="00:02:00">a b</route></leg>
      <activity type="car interaction" x="1" y="1" max_dur="00:00:00"/>
      <leg mode="walk" dep_time="08:00:00"><route type="generic" trav_time="00:00:10"/></leg>
      <activity type="work" x="1" y="1"/>
    </plan>
  </person>
  <person id="t2">
    <plan selected="yes">
      <activity type="home" x="0" y="0" end_time="07:50:00.5"/>
      <leg mode="car" dep_time="07:50:00">
        <route type="generic" trav_time="00:30:00"/>
      </leg>
      <activity type="work" x="1" y="1" end_time="08:10:00"/>
    </plan>
  </person>
</population>
"""

H = 3600
TIMES_EXPECTED = {
    "t1": [
        (0, 7 * H),  # first activity starts at 0
        (7 * H, 7 * H + 1800),  # leg: dep_time + route trav_time
        (7 * H + 1800, 7 * H + 1800),  # max_dur-only activity, starts at leg arrival
        (7 * H + 1800, 8 * H),  # no travel time: next activity's start_time
        (8 * H, 26 * H + 1800),  # start_time given; end past 24h
        (26 * H + 1800, 26 * H + 2700),  # leg trav_time on the <leg> itself
        (26 * H + 2700, 27 * H + 2700),  # start + max_dur
        (27 * H + 2700, 28 * H),  # no dep_time, no travel time: next activity's end_time
        (28 * H, 28 * H),  # activity whose end_time equals its inferred start
        (28 * H, 28 * H + 600),  # leg with a generic route trav_time
        (28 * H + 600, None),  # last activity: open-ended
    ],
    # MATSim output plans give every leg of a trip the trip's dep_time: the legs
    # must still run one after another
    "t3": [
        (0, 8 * H),
        (8 * H, 8 * H + 30),
        (8 * H + 30, 8 * H + 30),
        (8 * H + 30, 8 * H + 150),  # car starts after the access walk
        (8 * H + 150, 8 * H + 150),
        (8 * H + 150, 8 * H + 160),  # egress walk after the car
        (8 * H + 160, None),
    ],
    "t2": [
        (0, 7 * H + 3000),  # fractional seconds floored
        (7 * H + 3000, 8 * H + 1200),
        (8 * H + 1200, 8 * H + 1200),  # arrived after its end_time: clamped to start
    ],
}


@pytest.fixture
def times_file(tmp_path):
    p = tmp_path / "times.xml"
    p.write_text(TIMES_XML)
    return p


def test_parse_hms():
    assert p2p.parse_hms("07:44:00") == 7 * H + 44 * 60
    assert p2p.parse_hms("165:00:58") == 165 * H + 58
    assert p2p.parse_hms("00:00:01.9") == 1
    assert p2p.parse_hms("08:30") == 8 * H + 1800
    assert p2p.parse_hms("90") == 90
    for bad in (None, "", "undefined", "1:2:3:4", "-Infinity"):
        assert p2p.parse_hms(bad) is None


def test_time_windows_inferred(times_file, tmp_path):
    for jobs in (1, 2):
        out = tmp_path / f"times-{jobs}.parquet"
        if jobs == 1:
            p2p.run(times_file, out, jobs=1)
        else:
            p2p.convert_parallel(times_file, out, None, jobs=2, chunk_persons=1)
        table = pq.read_table(out)
        assert str(table.schema.field("time_start").type) == "int32"
        assert str(table.schema.field("time_end").type) == "int32"
        got: dict = {}
        for r in _rows(table):
            got.setdefault(r["person_id"], []).append((r["time_start"], r["time_end"]))
        assert got == TIMES_EXPECTED, f"jobs={jobs}"


def test_max_end_time_metadata(times_file, tmp_path):
    # Latest activity_end_time given in the XML (28:00:00), not any inferred time.
    # With only 6 end times, the 99.5th percentile is the max too.
    for jobs in (1, 2):
        out = tmp_path / f"meta-{jobs}.parquet"
        p2p.run(times_file, out, jobs=jobs)
        meta = pq.read_metadata(out).metadata
        assert meta[b"plans_max_end_time"] == str(28 * H).encode()
        assert meta[b"plans_end_time_p995"] == str(28 * H).encode()


def test_p995_end_time_ignores_outliers(tmp_path):
    # 400 persons ending work at 17:00, 2 outliers at 100h and 200h: the max is the
    # outlier, the 99.5th percentile (rank 400 of 402) is 17:00. Same in parallel.
    persons = [("p%03d" % i, "17:00:00") for i in range(400)]
    persons += [("x1", "100:00:00"), ("x2", "200:00:00")]
    xml = "<population>" + "".join(
        f'<person id="{pid}"><plan selected="yes">'
        f'<activity type="work" x="0" y="0" end_time="{end}"/></plan></person>'
        for pid, end in persons
    ) + "</population>"
    src = tmp_path / "outliers.xml"
    src.write_text(xml)
    for jobs in (1, 2):
        out = tmp_path / f"outliers-{jobs}.parquet"
        if jobs == 1:
            p2p.run(src, out, jobs=1)
        else:
            p2p.convert_parallel(src, out, None, jobs=2, chunk_persons=50)
        meta = pq.read_metadata(out).metadata
        assert meta[b"plans_max_end_time"] == str(200 * H).encode()
        assert meta[b"plans_end_time_p995"] == str(17 * H).encode()


def test_count_percentile():
    from collections import Counter

    counts = Counter(range(1, 1001))  # 1..1000, once each
    assert p2p.count_percentile(counts, 0.995) == 995
    assert p2p.count_percentile(counts, 1.0) == 1000
    assert p2p.count_percentile(Counter({5: 3}), 0.995) == 5
    assert p2p.count_percentile(Counter(), 0.995) is None


def test_no_end_times_means_no_max_end_time_metadata(tmp_path):
    src = tmp_path / "no-end.xml"
    src.write_text(
        '<population><person id="1"><plan selected="yes">'
        '<activity type="home" x="0" y="0"/></plan></person></population>'
    )
    out = tmp_path / "no-end.parquet"
    p2p.run(src, out)
    meta = pq.read_metadata(out).metadata or {}
    assert b"plans_max_end_time" not in meta
    assert b"plans_end_time_p995" not in meta


def test_choose_dictionary_columns(tmp_path):
    # Repetitive text compresses best with a dictionary; near-unique numbers
    # (times, coordinates) are smaller plain. An all-null column keeps the default.
    # (The choice is measured, not guessed: e.g. sequential ids repeated in runs
    # can go either way, so they aren't asserted here.)
    import numpy as np
    import pyarrow as pa

    rng = np.random.default_rng(0)
    n = 50_000
    table = pa.table(
        {
            "leg_mode": pa.array(rng.choice(["car", "walk", "bike", "pt"], n)),
            "time_start": pa.array(rng.integers(0, 100_000, n), type=pa.int32()),
            "activity_x": pa.array(rng.uniform(700_000, 750_000, n)),
            "empty": pa.nulls(n, type=pa.string()),
        }
    )
    chunk = tmp_path / "chunk.parquet"
    pq.write_table(table, chunk)
    chosen = p2p.choose_dictionary_columns([chunk], table.schema, 65536)
    assert set(chosen) == {"leg_mode", "empty"}

