#!/usr/bin/env python3

# ApiApp.py #######################################################
# This is the SimWrapper API app / OMX Microservice (FastAPI)
#
# It does two things:
# (1) Serves up a local copy of the SimWrapper web app
# (2) Provides a REST API application that accepts file requests for
#     OMX files that are stored on cloud services such as AWS/Azure

# HDF5 has unfortunate file locking that causes problems on Windows and NFS shares
# see https://portal.hdfgroup.org/documentation/hdf5/latest/_file_lock.html
# so let's disable it immediately:
import os
os.environ["HDF5_USE_FILE_LOCKING"] = "FALSE"

import sys, pprint, json
import yaml
import logging
from os.path import exists

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse, Response, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware

import blosc
from tables import CArray
import openmatrix as omx

from .SimpleH5File import SimpleH5File

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('simwrapper')

import mimetypes
mimetypes.add_type('application/wasm', '.wasm')

STATIC_DIR = os.path.join(os.path.dirname(__file__), 'static')

# STORAGE LOCATIONS -------------------------------------------------
# Default is to just share the content of the starting folder.
STORAGE = {
    "Server": "./",
}
STORAGE_ROOTS = {
    "Server": { "path": "./", "description": os.getcwd()},
}
CONFIG = {"storage": STORAGE_ROOTS}

ZONES = {}

# The @nocache decorator in the old Flask app set these headers on every
# API response. We apply them explicitly on the API responses below.
NOCACHE_HEADERS = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '-1',
}

# ------------------------------------------------
def safe_join(base, prefix):
    """Join a user-supplied `prefix` onto a configured storage `base`, refusing
    any result that escapes `base` (e.g. via '../'). Returns the resolved
    filesystem path, or None if the request tries to escape the storage root.
    """
    if not base.endswith('/'):
        base += '/'

    # prefix is relative to base; strip leading separators so an absolute-looking
    # prefix can't reset the join to the filesystem root.
    clean_prefix = prefix.lstrip('/\\')

    base_real = os.path.realpath(base)
    candidate = os.path.realpath(os.path.join(base_real, clean_prefix))

    if candidate != base_real and not candidate.startswith(base_real + os.sep):
        return None

    return candidate

## SET UP FASTAPI =============================

app = FastAPI()

# flask-compress equivalent. GZipMiddleware passes through responses that
# already set Content-Encoding (our pre-gzipped .js.gz), so those are safe.
app.add_middleware(GZipMiddleware, minimum_size=500)

# flask-cors equivalent: allow everything. The SimWrapper website is served
# over https and reaches this server on localhost, which triggers the Private
# Network Access preflight; allow_private_network answers it (200 + the
# Access-Control-Allow-Private-Network header) so those https sites can connect.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_private_network=True,
)

# ------------------------------------------------
@app.get("/list/{server_id}")
def files_list(server_id: str, request: Request):
    if not server_id: return PlainTextResponse("Missing server", status_code=400)
    if "prefix" not in request.query_params:
        return PlainTextResponse("Missing prefix", status_code=400)

    logger.debug(f'DIR {server_id} {request.query_params["prefix"]}')

    prefix = request.query_params['prefix']
    # prefix must end with a slash
    if not prefix.endswith('/'): prefix += '/'

    base = STORAGE[server_id]
    path = safe_join(base, prefix)
    if path is None:
        return PlainTextResponse("Request failed: invalid path", status_code=400)

    content = {"files": [], "dirs": [], "handles": {}}

    try:
        entries = os.scandir(path)
        for entry in entries:
            if entry.is_dir():
                content["dirs"].append(entry.name)
            else:
                content["files"].append(entry.name)

    except Exception as e:
        return PlainTextResponse(f"Request failed: {e}", status_code=400)

    return JSONResponse(content, headers=NOCACHE_HEADERS)

# ------------------------------------------------
@app.get("/file/{server_id}")
def get_file(server_id: str, request: Request):
    ## this proxies the azure response to the client
    if not server_id: return PlainTextResponse("Missing server", status_code=403)
    if "prefix" not in request.query_params:
        return PlainTextResponse("Missing prefix", status_code=400)

    logger.debug(f'GET {server_id} {request.query_params["prefix"]}')

    base = STORAGE[server_id]
    prefix = request.query_params['prefix']
    path = safe_join(base, prefix)
    if path is None:
        return PlainTextResponse("Invalid path", status_code=400)

    try:
        if not os.path.isfile(path):
            return PlainTextResponse(f"File not found: {path}", status_code=400)
        # all otherwise
        with open(path, 'rb') as file:
            content = file.read()

        return Response(
            content,
            status_code=200,
            media_type='application/octet-stream',
            headers=NOCACHE_HEADERS,
        )
    except Exception as e:
        print(str(e))
        return PlainTextResponse(f"Error accessing file: {str(e)}", status_code=400)

# ------------------------------------------------
@app.get("/_storage_")
def get_storage():
    return JSONResponse(CONFIG, headers=NOCACHE_HEADERS)

# ------------------------------------------------
@app.get("/_zones_/{zone_key}")
def get_zones(zone_key: str):
    if zone_key not in ZONES:
        return PlainTextResponse(f"No such zone configuration: {zone_key}", status_code=400)

    path = ZONES[zone_key]["file"]
    if sys.platform.startswith("win"): path = path.replace("/", "\\")
    try:
        if not os.path.isfile(path):
            return PlainTextResponse(f"File not found: {path}", status_code=404)
        with open(path, 'rb') as file:
            content = file.read()

        return Response(
            content,
            status_code=200,
            media_type='application/octet-stream',
            headers=NOCACHE_HEADERS,
        )
    except Exception as e:
        print(str(e))
        return PlainTextResponse(f"Error accessing zonal file: {str(e)}", status_code=400)

# ------------------------------------------------
@app.get("/omx/{server_id}")
def get_omx(server_id: str, request: Request):
    if not server_id: return PlainTextResponse("Missing server", status_code=403)
    if "prefix" not in request.query_params:
        return PlainTextResponse("Missing prefix", status_code=400)
    print('--- OMX', server_id, request.query_params["prefix"])

    # We need the prefix # and the personal-access-token
    prefix = request.query_params["prefix"]
    server = STORAGE[server_id]
    path = safe_join(server, prefix)
    if path is None:
        return PlainTextResponse("Invalid path", status_code=400)

    # 1. Open the OMX file
    try:
        omx_file = omx.open_file(path, 'r')
    except Exception as e:
        return PlainTextResponse(
            f"OMX could not open file. Is it there? Is it OMX? {path}", status_code=415)

    # 2. Is it Real OMX or is it Fake OMX?
    if 'OMX_VERSION' not in omx_file.root._v_attrs:
        omx_file.close()
        omx_file = SimpleH5File.open_file(path, 'r')

    # 3. If user wants the lookup mappings, oblige
    if 'lookup' in request.query_params:
        key = request.query_params['lookup']
        entries = []
        entries = omx_file.map_entries(key)
        json_array = [int(x) for x in entries]
        # except:
        #     return f"Error retrieving zone mapping: {key}", 416
        # finally:
        omx_file.close()
        return JSONResponse(json_array, headers=NOCACHE_HEADERS)

    # 5. If user merely asked for the file, send the catalog (not the file itself)
    if 'table' not in request.query_params:
        try:
            catalog = omx_file.list_matrices()
            lookups = omx_file.list_mappings()
            shape = omx_file.shape()
        except:
            return PlainTextResponse(
                "File found but error retrieving catalog/shape", status_code=416)
        finally:
            omx_file.close()
        return JSONResponse({
            'catalog': catalog,
            'shape': [int(shape[0]), int(shape[1])],
            'lookups': lookups}, headers=NOCACHE_HEADERS)

    # 6. send the table user requested
    try:
        table_name = request.query_params['table']
        print('---sending matrix data', table_name)
        table = omx_file[table_name]
        nparray = table.read()
        tbytes = nparray.tobytes()
        compressed = blosc.compress(tbytes)
        response = Response(compressed)
        response.headers['Content-Type'] = 'application/octet-stream'
        response.headers['Content-Disposition'] = f'attachment; filename={table_name}.bin'
        for k, v in NOCACHE_HEADERS.items():
            response.headers[k] = v
        return response
    except Exception:
        return PlainTextResponse(
            f"File found but error retrieving table {request.query_params['table']}",
            status_code=416)
    finally:
        omx_file.close()

# ------------------------------------------------
# Serve static files directly (for JS, CSS, images). Registered LAST so the
# REST routes above take precedence over this catch-all.
@app.get("/")
@app.get("/{path:path}")
def serve_static_files(path: str = ''):

    if path.startswith('api/'): return PlainTextResponse("Not Found", status_code=404)
    if path.startswith('omx/'): return PlainTextResponse("Not Found", status_code=404)

    # List of file extensions that should be served as static files
    static_extensions = ['.css', '.csv', '.dbf', '.png', '.geojson', '.jpg', '.jpeg', '.js', '.json', '.gif', '.gz', '.md', '.svg', '.ico', '.wasm', '.woff', '.woff2', '.ttf', '.eot', '.yaml', '.zip']

    # Check if the requested file has a static file extension
    if any(path.endswith(ext) for ext in static_extensions):

        # check if .gzipped js version exists (and send if it does)
        if path.endswith('.js'):
            file_path = os.path.join(STATIC_DIR, path)
            gzip_path = file_path + '.gz'
            if os.path.exists(gzip_path):
                with open(gzip_path, 'rb') as f:
                    return Response(
                        f.read(),
                        media_type='application/javascript',
                        headers={'Content-Encoding': 'gzip'},
                    )

        full_path = os.path.join(STATIC_DIR, path)
        if not os.path.isfile(full_path):
            return PlainTextResponse("Not Found", status_code=404)
        return FileResponse(full_path)

    return FileResponse(os.path.join(STATIC_DIR, 'index.html'))


def setupConfiguration(config, port):
    """
    If a config file was passed in, read the config from file and set things up
    accordingly.
    Config may have these keys: storage, readme, tagline, zones
    """
    global CONFIG, STORAGE, STORAGE_ROOTS, ZONES

    if config:
        with open(config, 'r') as f:

            YAML = yaml.safe_load(f.read())

            # front page text
            tagline = "tagline" in YAML and YAML["tagline"] or ""
            readme = "readme" in YAML and YAML["readme"] or ""
            if readme and not '\n' in readme:
                with open(readme, 'r') as r:
                    readme = r.read()

            # storage locations
            STORAGE = {}
            if "storage" in YAML:
                STORAGE_ROOTS = YAML["storage"]

            for root in STORAGE_ROOTS:
                # make sure we can open the path
                if not exists(STORAGE_ROOTS[root]["path"]):
                    raise Exception(f"\n\n** ABORT: CANNOT READ PATH FOR {root}: {STORAGE_ROOTS[root]['path']}")

                STORAGE[root] = '' + STORAGE_ROOTS[root]["path"]

            # putting this here, but the website will replace the path given
            # with the window href location. That way, whatever URL/ipaddr the
            # user entered to reach the flask server will be used.
            for root in STORAGE_ROOTS:
                STORAGE_ROOTS[root]["path"] = f"http://localhost:{port}"

            # ZONAL systems
            if "zones" in YAML:
                ZONES = YAML["zones"]

            CONFIG = {
                "storage": STORAGE_ROOTS,
                "tagline": tagline,
                "readme": readme,
                "zones": ZONES
            }

            print('--- STARTING WITH CONFIG:')
            pprint.pprint(CONFIG, sort_dicts=False, indent=2)


# When Uvicorn spawns worker subprocesses it re-imports this module via the
# "simwrapper.ApiApp:app" import string. Worker processes don't inherit the
# parent's in-memory globals, so the config + port are passed via environment
# variables (set in startServer, inherited by the workers) and re-applied here.
_config = os.environ.get("SIMWRAPPER_CONFIG") or None
_port = int(os.environ.get("SIMWRAPPER_PORT", "4999"))
setupConfiguration(_config, _port)


# ----------------------------------------
def startServer(config=None, port=4999, debug=False):
    print('\n--- SET UP: storage roots')

    # Pass config to the (re-imported) worker processes via the environment.
    if config:
        os.environ["SIMWRAPPER_CONFIG"] = config
    os.environ["SIMWRAPPER_PORT"] = str(port)

    # Apply config in this process too (for logging/validation before workers start).
    setupConfiguration(config, port)

    print('\n--- START SERVER', config, port)
    print(f'--- If link below does not work, try server name or localhost: http://localhost:{port}\n\n')

    logger.setLevel(debug and logging.DEBUG or logging.INFO)

    uvicorn.run(
        "simwrapper.ApiApp:app",
        host="0.0.0.0",
        port=port,
        workers=(1 if debug else 4),
        reload=debug,
        log_level="debug" if debug else "info",
    )

# ----------------------------------------
if __name__ == "__main__":
    startServer(port=4999, debug=True)
