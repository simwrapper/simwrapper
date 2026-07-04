"""Tests for the FastAPI SimWrapper API app (simwrapper.ApiApp).

These exercise the REST/OMX endpoints, the path-traversal guard, static
serving, and the CORS/Private-Network preflight against a temporary data
directory, using FastAPI's TestClient.
"""

import numpy as np
import openmatrix as omx
import pytest
from fastapi.testclient import TestClient

from simwrapper import ApiApp


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
