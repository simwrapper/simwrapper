#!/usr/bin/env python3

# FlaskApp.py #######################################################
# This is the SimWrapper FlaskApp / OMX Microservice
#
# It does two things:
# (1) Serves up a local copy of the SimWrapper web app
# (2) Provides a REST API application that accepts file requests for
#     OMX files that are stored on cloud services such as AWS/Azure

import os,sys
import blosc
from os.path import exists

from flask import Flask, request, send_from_directory, make_response, Response
from flask_cors import CORS
from flask_restful import Resource, Api, reqparse
from functools import wraps
import openmatrix as omx
import yaml

from waitress import serve

import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('simwrapper')

# STORAGE LOCATIONS -------------------------------------------------
# Default is to just share the content of the starting folder.
STORAGE = {
    "Server": "./",
}
STORAGE_ROOTS = {
    "Server": { "path": "./", "description": os.getcwd()}
}
CONFIG = {"storage": STORAGE_ROOTS}

# ------------------------------------------------
def nocache(view):
    @wraps(view)
    def no_cache(*args, **kwargs):
        response = make_response(view(*args, **kwargs))
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '-1'
        return response
    return no_cache

# ------------------------------------------------
class FilesList(Resource):
    @nocache
    def get(self, server_id):
        if not server_id: return "Missing server", 400
        if not "prefix" in request.args: return "Missing prefix", 400

        logger.debug(f'DIR {server_id} {request.args["prefix"]}')

        prefix = request.args['prefix']
        # prefix must end with a slash
        if not prefix.endswith('/'): prefix += '/'

        path = f"{STORAGE[server_id]}/{prefix}"
        if sys.platform.startswith("win"): path = path.replace("/", "\\")

        content = {"files": [], "dirs": [], "handles": {}}

        try:
            entries = os.scandir(path)
            for entry in entries:
                if entry.is_dir():
                    content["dirs"].append(entry.name)
                else:
                    content["files"].append(entry.name)

        except Exception as e:
            return f"Request failed: {e}", 400

        return content, 200

# ------------------------------------------------
class File(Resource):
    ## this proxies the azure response to the client
    @nocache
    def get(self, server_id):
        if not server_id: return "Missing server", 403
        if not "prefix" in request.args: return "Missing prefix", 400

        logger.debug(f'GET {server_id} {request.args["prefix"]}')

        prefix = request.args['prefix']
        path = f"{STORAGE[server_id]}/{prefix}"
        if sys.platform.startswith("win"): path = path.replace("/", "\\")
        try:
            if not os.path.isfile(path):
                return f"File not found: {str(e)}", 400

            with open(path, 'rb') as file:
                content = file.read()

            response = Response(
                content,
                status=200,
                mimetype='application/octet-stream'
            )
            return response, 200
        except Exception as e:
            print(str(e))
            return f"Error accessing file: {str(e)}", 400

# ------------------------------------------------
class Storage(Resource):
    @nocache
    def get(self):
        return CONFIG

# ------------------------------------------------
class Omx(Resource):
    @nocache
    def get(self, server_id):
        if not server_id: return "Missing server", 403
        if not "prefix" in request.args: return "Missing prefix", 400
        print('--- OMX',server_id, request.args["prefix"])

        # We need the prefix # and the personal-access-token
        prefix =  request.args["prefix"]
        server = STORAGE[server_id]
        path = f"{server}/{prefix}"
        if sys.platform.startswith("win"): path = path.replace("/", "\\")

        # 1. Open the OMX file
        try:
            omx_file = omx.open_file(path, 'r')
        except Exception as e:
            return f"Error opening OMX file {path}", 400

        # 5. If user merely asked for the file, send the catalog (not the file itself)
        if 'table' not in request.args:
            catalog  = omx_file.list_matrices()
            shape = omx_file.shape()
            omx_file.close()
            return {'catalog': catalog, 'shape': [int(shape[0]), int(shape[1])]}, 200

        # 6. send the table user requested
        try:
            table_name = request.args['table']
            print('---sending matrix data', table_name)
            table = omx_file[table_name]
            nparray = table.read()
            tbytes = nparray.tobytes()
            compressed = blosc.compress(tbytes)
            response = make_response(compressed)
            response.headers['Content-Type'] = 'application/octet-stream'
            response.headers['Content-Disposition'] = f'attachment; filename={table_name}.bin'
            return response
        except Exception as e:
            return f"File found but error retrieving table {request.args['table']}", 416
        finally:
            omx_file.close()

## SET UP FLASK =============================

app = Flask(__name__, static_folder='static')
CORS(app)
api = Api(app)

api.add_resource(FilesList, '/list/<server_id>')
api.add_resource(File, '/file/<server_id>')
api.add_resource(Omx, '/omx/<server_id>')
api.add_resource(Storage, '/_storage_')

# Serve static files directly (for JS, CSS, images)
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_static_files(path):

    if path.startswith('api/'): return "Not Found", 404
    if path.startswith('omx/'): return "Not Found", 404

    # List of file extensions that should be served as static files
    static_extensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.gz', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.yaml', '.zip']

    # Check if the requested file has a static file extension
    if any(path.endswith(ext) for ext in static_extensions):

        # check if .gzipped js version exists (and send if it does)
        if path.endswith('.js'):
            file_path = os.path.join('static', path)
            gzip_path = file_path + '.gz'
            if os.path.exists(gzip_path):
                with open(gzip_path, 'rb') as f:
                    response = make_response(f.read())
                    response.headers['Content-Encoding'] = 'gzip'
                    response.headers['Content-Type'] = 'application/javascript'
                    return response
        return send_from_directory('static', path)

    return send_from_directory('static', 'index.html')


def setupStorageRoots(config, port):
    """
    If a config file was passed in, read the config from file and set things up
    accordingly.
    Config may have these keys: storage, readme, tagline
    """
    global CONFIG, STORAGE, STORAGE_ROOTS

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
                STORAGE[root] = '' + STORAGE_ROOTS[root]["path"]
            # putting this here, but the website will replace the path given
            # with the window href location. That way, whatever URL/ipaddr the
            # user entered to reach the flask server will be used.
            for root in STORAGE_ROOTS:
                STORAGE_ROOTS[root]["path"] = f"http://localhost:{port}"

            CONFIG = {
                "storage": STORAGE_ROOTS,
                "tagline": tagline,
                "readme": readme
            }

            print('HELLO', CONFIG)

def startGunicorn(port, debug):
    from .GunicornServer import GunicornServer

    gunicorn_options = {
        'bind': f'0.0.0.0:{port}',
        'workers': 4,
        'threads': 2,
        'reload': debug,
        'loglevel': debug and 'debug' or 'info',
        'access_log': '-',  # Log to stdout
        'error_log': '-',   # Log to stderr
    }
    GunicornServer(app, **gunicorn_options).run()

# ----------------------------------------
def startFlask(config=None, port=4999, debug=False):
    print('\n--- SET UP: storage roots')
    setupStorageRoots(config,port)

    print('\n--- START-FLASK', config, port)
    print(f'--- If link below does not work, try server name or localhost: http://localhost:{port}\n\n')

    if os.name == 'nt':
        # Windows: use waitress
        logger.setLevel(debug and logging.DEBUG or logging.INFO)
        serve(app, listen=f"*:{port}", threads=16)

    else:
        # Use Gunicorn
        startGunicorn(port,debug)

# ----------------------------------------
if __name__ == "__main__":
    app.run(port=4999, debug=True)
