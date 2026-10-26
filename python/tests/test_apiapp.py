"""Tests for the FastAPI SimWrapper API app (simwrapper.ApiApp).

These exercise the REST/OMX endpoints, the path-traversal guard, static
serving, and the CORS/Private-Network preflight against a temporary data
directory, using FastAPI's TestClient.
"""

import h5py
import numpy as np
import openmatrix as omx
import pytest
from fastapi.testclient import TestClient

from simwrapper import ApiApp
from simwrapper.SimpleH5File import SimpleH5File


def make_fake_omx(path):
    """Build a plain HDF5 "fake OMX" file: matrices as datasets directly under
    root (each with a 'name' attribute), mappings under '/lookup', and crucially
    NO OMX_VERSION or SHAPE root attrs -- so openmatrix rejects it and ApiApp
    falls back to the h5py-backed SimpleH5File reader.
    """
    with h5py.File(str(path), "w") as f:
        d = f.create_dataset("FAKE1", data=np.arange(9, dtype="float64").reshape(3, 3))
        d.attrs["name"] = b"FAKE1"
        lookup = f.create_group("lookup")
        lookup.create_dataset("zone", data=np.array([201, 202, 203]))


@pytest.fixture
def data_dir(tmp_path):
    """A temp storage root with a text file, a subfolder, and an OMX file."""
    (tmp_path / "hello.txt").write_text("hello simwrapper")
    sub = tmp_path / "sub"
    sub.mkdir()
    (sub / "table.csv").write_text("col1,col2\n")

    f = omx.open_file(str(tmp_path / "test.omx"), "w")
    matrix = np.arange(9, dtype="float64").reshape(3, 3)
    f["MAT1"] = matrix
    f.create_mapping("taz", [101, 102, 103])
    f.close()

    return tmp_path


@pytest.fixture
def client(data_dir, monkeypatch):
    """TestClient with module globals pointed at the temp data dir.

    Endpoints read the module-level STORAGE/CONFIG/ZONES at call time, so
    monkeypatching them here (auto-restored after the test) is enough.
    """
    storage_roots = {
        "data": {"path": "http://localhost:4999", "description": "test data"}
    }
    config = {
        "storage": storage_roots,
        "tagline": "Test run",
        "readme": "",
        "zones": {},
    }
    monkeypatch.setattr(ApiApp, "STORAGE", {"data": str(data_dir)})
    monkeypatch.setattr(ApiApp, "STORAGE_ROOTS", storage_roots)
    monkeypatch.setattr(ApiApp, "CONFIG", config)
    monkeypatch.setattr(ApiApp, "ZONES", {})
    return TestClient(ApiApp.app)


# --- storage ----------------------------------------------------------------

def test_storage_returns_config(client):
    r = client.get("/_storage_")
    assert r.status_code == 200
    body = r.json()
    assert body["tagline"] == "Test run"
    # website replaces the path with the request URL; we serve the placeholder
    assert body["storage"]["data"]["path"] == "http://localhost:4999"


def test_nocache_headers(client):
    r = client.get("/_storage_")
    assert "no-store" in r.headers["cache-control"]


# --- list -------------------------------------------------------------------

def test_list_directory(client):
    r = client.get("/list/data", params={"prefix": "/"})
    assert r.status_code == 200
    body = r.json()
    assert set(body["files"]) == {"hello.txt", "test.omx"}
    assert body["dirs"] == ["sub"]


def test_list_missing_prefix(client):
    r = client.get("/list/data")
    assert r.status_code == 400


# --- file -------------------------------------------------------------------

def test_get_file(client):
    r = client.get("/file/data", params={"prefix": "hello.txt"})
    assert r.status_code == 200
    assert r.content == b"hello simwrapper"
    assert r.headers["content-type"].startswith("application/octet-stream")


def test_get_file_not_found(client):
    r = client.get("/file/data", params={"prefix": "nope.txt"})
    assert r.status_code == 400


def test_file_within_root_is_allowed(client):
    # resolves back inside the storage root, so it must be permitted
    r = client.get("/file/data", params={"prefix": "sub/../hello.txt"})
    assert r.status_code == 200
    assert r.content == b"hello simwrapper"


# --- path traversal ---------------------------------------------------------

@pytest.mark.parametrize("prefix", ["../../../", "../../../../etc/"])
def test_list_path_traversal_blocked(client, prefix):
    r = client.get("/list/data", params={"prefix": prefix})
    assert r.status_code == 400


@pytest.mark.parametrize("prefix", ["../../../../../etc/hosts", "../hello.txt"])
def test_file_path_traversal_blocked(client, prefix):
    r = client.get("/file/data", params={"prefix": prefix})
    assert r.status_code == 400


# --- OMX --------------------------------------------------------------------

def test_omx_catalog(client):
    r = client.get("/omx/data", params={"prefix": "test.omx"})
    assert r.status_code == 200
    body = r.json()
    assert body["catalog"] == ["MAT1"]
    assert body["shape"] == [3, 3]
    assert body["lookups"] == ["taz"]


def test_omx_lookup(client):
    r = client.get("/omx/data", params={"prefix": "test.omx", "lookup": "taz"})
    assert r.status_code == 200
    assert r.json() == [101, 102, 103]


def test_omx_table_blosc_roundtrip(client):
    import blosc

    r = client.get("/omx/data", params={"prefix": "test.omx", "table": "MAT1"})
    assert r.status_code == 200
    assert r.headers["content-disposition"] == "attachment; filename=MAT1.bin"
    decoded = np.frombuffer(blosc.decompress(r.content), dtype="float64")
    assert decoded.tolist() == list(range(9))


def test_omx_missing_file(client):
    r = client.get("/omx/data", params={"prefix": "not-real.omx"})
    assert r.status_code == 415


def test_omx_bad_table(client):
    r = client.get("/omx/data", params={"prefix": "test.omx", "table": "NOPE"})
    assert r.status_code == 416


def test_omx_path_traversal_blocked(client):
    r = client.get("/omx/data", params={"prefix": "../../../etc/passwd"})
    assert r.status_code == 400


# --- zones ------------------------------------------------------------------

def test_zones_unknown_key(client):
    r = client.get("/_zones_/nope")
    assert r.status_code == 400


# --- static + SPA -----------------------------------------------------------

def test_root_serves_index_html(client):
    r = client.get("/")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/html")


def test_unknown_route_falls_back_to_index(client):
    # no static extension -> SPA fallback to index.html
    r = client.get("/some/app/route")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/html")


def test_missing_static_asset_404(client):
    r = client.get("/does-not-exist.css")
    assert r.status_code == 404


def test_api_prefix_guarded_on_catchall(client):
    r = client.get("/api/whatever")
    assert r.status_code == 404


# --- CORS / Private Network -------------------------------------------------

def test_cors_private_network_preflight(client):
    r = client.options(
        "/list/data",
        headers={
            "Origin": "https://vsp.berlin",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Private-Network": "true",
        },
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == "*"
    assert r.headers["access-control-allow-private-network"] == "true"


# --- safe_join unit ---------------------------------------------------------

def test_safe_join_confines_to_base(tmp_path):
    base = str(tmp_path)
    assert ApiApp.safe_join(base, "file.txt") is not None
    assert ApiApp.safe_join(base, "a/b/c.txt") is not None
    assert ApiApp.safe_join(base, "../../../etc/passwd") is None
    # an absolute-looking prefix is treated as relative, kept inside base
    assert ApiApp.safe_join(base, "/etc/passwd") is not None


# --- fake OMX (h5py-backed SimpleH5File) ------------------------------------

@pytest.fixture
def fake_client(tmp_path, monkeypatch):
    """TestClient whose storage holds a plain-HDF5 fake-OMX file, forcing the
    SimpleH5File (h5py) read path in the /omx endpoint."""
    make_fake_omx(tmp_path / "fake.omx")
    monkeypatch.setattr(ApiApp, "STORAGE", {"data": str(tmp_path)})
    monkeypatch.setattr(ApiApp, "CONFIG", {"storage": {}})
    monkeypatch.setattr(ApiApp, "ZONES", {})
    return TestClient(ApiApp.app)


def test_fake_omx_catalog(fake_client):
    r = fake_client.get("/omx/data", params={"prefix": "fake.omx"})
    assert r.status_code == 200
    body = r.json()
    assert body["catalog"] == ["FAKE1"]
    assert body["shape"] == [3, 3]        # derived from the first matrix (no SHAPE attr)
    assert body["lookups"] == ["zone"]


def test_fake_omx_lookup(fake_client):
    r = fake_client.get("/omx/data", params={"prefix": "fake.omx", "lookup": "zone"})
    assert r.status_code == 200
    assert r.json() == [201, 202, 203]


def test_fake_omx_table_blosc_roundtrip(fake_client):
    import blosc

    r = fake_client.get("/omx/data", params={"prefix": "fake.omx", "table": "FAKE1"})
    assert r.status_code == 200
    decoded = np.frombuffer(blosc.decompress(r.content), dtype="float64")
    assert decoded.tolist() == list(range(9))


# --- SimpleH5File unit ------------------------------------------------------

def test_simpleh5file_public_api(tmp_path):
    make_fake_omx(tmp_path / "fake.omx")
    f = SimpleH5File.open_file(str(tmp_path / "fake.omx"), "r")
    try:
        assert f.version() is None            # no OMX_VERSION attr
        assert f.list_matrices() == ["FAKE1"]
        assert f.shape() == (3, 3)
        assert f.list_mappings() == ["zone"]
        assert [int(x) for x in f.map_entries("zone")] == [201, 202, 203]
        assert len(f) == 1
        assert "FAKE1" in f
        assert f["FAKE1"].read().tolist() == [[0, 1, 2], [3, 4, 5], [6, 7, 8]]
    finally:
        f.close()


def test_simpleh5file_write_is_rejected(tmp_path):
    make_fake_omx(tmp_path / "fake.omx")
    with pytest.raises(Exception):
        SimpleH5File.open_file(str(tmp_path / "fake.omx"), "w")


def test_simpleh5file_name_attr_vs_key(tmp_path):
    # a dataset whose HDF5 key differs from its stored 'name' attribute
    p = tmp_path / "named.omx"
    with h5py.File(str(p), "w") as h:
        d = h.create_dataset("ds0", data=np.ones((2, 2)))
        d.attrs["name"] = b"DISPLAY"

    f = SimpleH5File.open_file(str(p), "r")
    try:
        assert f.list_matrices() == ["DISPLAY"]       # catalog uses the name attr
        assert f["DISPLAY"].read().shape == (2, 2)     # resolvable by name attr
        assert f["ds0"].read().shape == (2, 2)         # and by raw key
    finally:
        f.close()


def test_simpleh5file_missing_mapping_raises(tmp_path):
    make_fake_omx(tmp_path / "fake.omx")
    f = SimpleH5File.open_file(str(tmp_path / "fake.omx"), "r")
    try:
        with pytest.raises(LookupError):
            f.map_entries("nope")
    finally:
        f.close()
