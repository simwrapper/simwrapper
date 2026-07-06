"""Tests for the local file server (simwrapper.MiniFileServer).

These cover HTTP Range request handling: the byte-range parser plus an
end-to-end drive of RangeRequestHandler over a real background HTTPServer,
exercising bounded, open-ended, suffix, single-byte, and unsatisfiable ranges.
"""

import http.client
import threading
from http.server import HTTPServer

import pytest

from simwrapper.MiniFileServer import RangeRequestHandler, parse_byte_range

CONTENT = b"0123456789ABCDEF"  # 16 bytes


# --- parse_byte_range unit --------------------------------------------------

@pytest.mark.parametrize(
    "header, expected",
    [
        ("bytes=0-0", (0, 0)),           # single first byte (the regression)
        ("bytes=123-456", (123, 456)),   # bounded
        ("bytes=123-", (123, None)),     # open-ended
        ("bytes=-500", (None, 500)),     # suffix: last N bytes
        ("  bytes=4-7  ", (4, 7)),       # surrounding whitespace tolerated
    ],
)
def test_parse_byte_range_valid(header, expected):
    assert parse_byte_range(header) == expected


@pytest.mark.parametrize(
    "header",
    [
        "bytes=-",        # neither endpoint given
        "bytes=5-2",      # last < first
        "bytes=abc",      # not a range
        "garbage",        # no bytes= prefix
        "bytes=0-1,5-9",  # multi-range unsupported
    ],
)
def test_parse_byte_range_invalid(header):
    with pytest.raises(ValueError):
        parse_byte_range(header)


# --- end-to-end over a real server ------------------------------------------

@pytest.fixture
def server(tmp_path):
    """A background HTTPServer serving a 16-byte file from a temp dir.

    Yields the bound port. The handler is bound to tmp_path via `directory`
    so serving does not depend on the process working directory.
    """
    (tmp_path / "data.txt").write_bytes(CONTENT)

    def handler(*args, **kwargs):
        return RangeRequestHandler(*args, directory=str(tmp_path), **kwargs)

    httpd = HTTPServer(("127.0.0.1", 0), handler)
    port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield port
    finally:
        httpd.shutdown()
        httpd.server_close()


def _get(port, headers=None):
    conn = http.client.HTTPConnection("127.0.0.1", port)
    try:
        conn.request("GET", "/data.txt", headers=headers or {})
        resp = conn.getresponse()
        body = resp.read()
        return resp, body
    finally:
        conn.close()


def test_full_file_no_range(server):
    resp, body = _get(server)
    assert resp.status == 200
    assert body == CONTENT
    assert resp.getheader("Accept-Ranges") == "bytes"


def test_single_byte_range(server):
    # Regression: bytes=0-0 must return exactly one byte, not the whole file.
    resp, body = _get(server, {"Range": "bytes=0-0"})
    assert resp.status == 206
    assert resp.getheader("Content-Range") == "bytes 0-0/16"
    assert resp.getheader("Content-Length") == "1"
    assert body == b"0"


def test_bounded_range(server):
    resp, body = _get(server, {"Range": "bytes=4-7"})
    assert resp.status == 206
    assert resp.getheader("Content-Range") == "bytes 4-7/16"
    assert body == b"4567"


def test_open_ended_range(server):
    resp, body = _get(server, {"Range": "bytes=10-"})
    assert resp.status == 206
    assert resp.getheader("Content-Range") == "bytes 10-15/16"
    assert body == b"ABCDEF"


def test_suffix_range(server):
    resp, body = _get(server, {"Range": "bytes=-3"})
    assert resp.status == 206
    assert resp.getheader("Content-Range") == "bytes 13-15/16"
    assert body == b"DEF"


def test_suffix_larger_than_file_clamps(server):
    # Asking for more than the file has returns the whole file.
    resp, body = _get(server, {"Range": "bytes=-100"})
    assert resp.status == 206
    assert resp.getheader("Content-Range") == "bytes 0-15/16"
    assert body == CONTENT


def test_last_beyond_eof_clamps(server):
    resp, body = _get(server, {"Range": "bytes=12-999"})
    assert resp.status == 206
    assert resp.getheader("Content-Range") == "bytes 12-15/16"
    assert body == b"CDEF"


def test_unsatisfiable_range(server):
    resp, body = _get(server, {"Range": "bytes=100-200"})
    assert resp.status == 416
    assert resp.getheader("Content-Range") == "bytes */16"
    assert body == b""


def test_invalid_range_is_bad_request(server):
    resp, _ = _get(server, {"Range": "bytes=5-2"})
    assert resp.status == 400
