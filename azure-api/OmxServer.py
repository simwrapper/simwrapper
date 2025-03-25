#!/usr/bin/env python3

# OmxServer.py #######################################################
# This is the SimWrapper OMX Microservice
#
# It does one thing: provides a REST API application which runs in
# the cloud somewhere and accepts file requests for OMX files that
# are stored on Azure.
# It caches these very large files and serves up the matrices within.

import os,sys,tempfile,random,shutil,csv
import xml.etree.ElementTree as ET
from os.path import exists

from hashlib import sha256
import requests
import blosc

from flask import Flask, request, send_from_directory, make_response, Response
from flask_cors import CORS
from flask_restful import Resource, Api, reqparse
from functools import wraps

import openmatrix as omx

# Endpoints
STORAGE = {
    'dev-bronze': 'https://adlsdasadsdevwest.blob.core.windows.net/bronze',
}

# Storage volume expected to be mounted on /data:
blobfolder = 'data/'
cache = {}  # {[path]: {path, contentLength, lastModified}}

# personal access token
TOKEN = ''
if 'TOKEN' in os.environ:
    TOKEN = os.environ['TOKEN']
    print('got TOKEN')

# -----------------------------------------------
def _xml_to_dict(element):
    result = {}
    if element.attrib: result["@attributes"] = element.attrib
    if element.text and element.text.strip(): result["#text"] = element.text.strip()
    for child in element:
        child_dict = _xml_to_dict(child)
        if child.tag in result:
            if not isinstance(result[child.tag], list): result[child.tag] = [result[child.tag]]
            result[child.tag].append(child_dict)
        else:
            result[child.tag] = child_dict
    return result

# ------------------------------------------------
def build_file_cache():
    filepath = os.path.join(blobfolder, '_cache.csv')
    print(filepath)
    try:
        with open(filepath, 'r', newline='', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                if row['path']: cache[f"{row['server']}:{row['path']}"] = row
            print('got cache')
            print(cache)
    except Exception as e:
        print(e)
        print("No _cache.csv, starting blank")

# ------------------------------------------------
def write_file_cache():
    output_filename = os.path.join(blobfolder, '_cache.csv')
    records = list(cache.values())
    print('RECORDS', records)
    fieldnames = list(records[0].keys() if records else [])
    file_exists = os.path.exists(output_filename)

    with open(output_filename, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            if not file_exists:
                writer.writeheader()  # Write header row only if the file doesn't exist
            for row in records:
                writer.writerow(row)
    print('wrote cache.csv')

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
def getHash(filename):
    sha = sha256()
    sha.update(filename.encode('utf-8'))
    return sha.hexdigest()

# ------------------------------------------------
class FilesList(Resource):
    @nocache
    def get(self, server_id):
        if not server_id: return "Missing server", 400
        if not "prefix" in request.args: return "Missing prefix", 400
        print('--- DIR ',server_id, request.args["prefix"])

        # personal access token is currently required
        # prefix -- must end with /
        # delimiter=/ -- filters out subdirectory contents, and stores subdirectory names as "BlobPrefix" xml items
        # print(TOKEN)

        prefix = request.args['prefix']
        # prefix must end with a slash
        if not prefix.endswith('/'): prefix += '/'

        user_token = TOKEN
        if 'AZURETOKEN' in request.headers: user_token = request.headers['AZURETOKEN']

        args = '&'.join([f"prefix={prefix}", "delimiter=/", user_token])
        url = f"{STORAGE[server_id]}?restype=container&comp=list&{args}"

        content = {"files": [], "dirs": [], "handles": {}}

        try:
            response = requests.get(url, timeout=30)
            response.raise_for_status()  # Raise an exception for bad status codes (4xx or 5xx)
            root = ET.fromstring(response.text)
            result = _xml_to_dict(root)

        except Exception as e:
            return f"Request failed: {e}", 400

        if 'Blobs' not in result: return content, 200

        # print("BLOBS:")
        blobs = result['Blobs']
        if 'Blob' in blobs:
            items = blobs['Blob']
            if not isinstance(items, list): items = [items]
            for blob in items:
                # print(blob)
                name = blob['Name']['#text']
                name = name[name.rfind('/')+1:]   # trim all path stuff
                content["files"].append(name)

        # print("FOLDERS:")
        if 'BlobPrefix' in blobs:
            items = blobs['BlobPrefix']
            if not isinstance(items, list): items = [items]
            for blob in items:
                # print(blob)
                name = blob['Name']['#text'][:-1]   # trim trailing slash
                name = name[name.rfind('/')+1:]    # trim all path stuff
                content["dirs"].append(name)

        return content, 200

# ------------------------------------------------
class File(Resource):
    ## this proxies the azure response to the client
    @nocache
    def get(self, server_id):
        if not server_id: return "Missing server", 403
        if not "prefix" in request.args: return "Missing prefix", 400
        print('--- GET',server_id, request.args["prefix"])

        # personal access token is currently required
        # prefix -- must end with /
        # delimiter=/ -- filters out subdirectory contents, and stores subdirectory names as "BlobPrefix" xml items

        prefix = request.args['prefix']

        user_token = TOKEN
        if 'AZURETOKEN' in request.headers: user_token = request.headers['AZURETOKEN']

        url = f"{STORAGE[server_id]}/{prefix}?{user_token}"

        try:
            azure_response = requests.get(url,
                headers={k:v for k,v in request.headers if k != "Host"},
                stream=True
            )
            response = Response(
                azure_response.iter_content(chunk_size=528288),
                status=azure_response.status_code
            )
            for key, value in azure_response.headers.items():
                if key.lower() not in ('content-length', 'transfer-encoding', 'content-encoding'):
                    response.headers[key] = value
            return response, 200
        except Exception as e:
            return f"Error accessing Azure: {str(e)}", 400

# ------------------------------------------------
class Omx(Resource):
    # Return the OMX catalog (not the file itself)
    def _getListing(self, url):
        response = requests.get(url, timeout=30)
        response.raise_for_status()  # Raise an exception for bad status codes (4xx or 5xx)
        root = ET.fromstring(response.text)
        result = _xml_to_dict(root)

        blob = result['Blobs']['Blob']
        if isinstance(blob, list): return "Filter is not unique", 400
        answer = {
            'path': blob['Name']['#text'],
            'contentLength': blob['Properties']['Content-Length']['#text'],
            'lastModified': blob['Properties']['Last-Modified']['#text']
        }
        return answer

    @nocache
    def get(self, server_id):
        if not server_id: return "Missing server", 403
        if not "prefix" in request.args: return "Missing prefix", 400
        print('--- OMX',server_id, request.args["prefix"], request.headers)

        # We need the prefix and the personal-access-token
        prefix = request.args['prefix']
        user_token = TOKEN
        if 'AZURETOKEN' in request.headers: user_token = request.headers['AZURETOKEN']

        args = '&'.join([f"prefix={prefix}", user_token])
        url = f"{STORAGE[server_id]}?restype=container&comp=list&{args}"

        # # 1. Get the listing
        try:
            details = self._getListing(url)
        except Exception as e:
            return f"Request failed: {e}", 400

        # 2. If good copy in cache, use it
        need_to_refresh = True
        # details = cache[prefix]
        # need_to_refresh = False
        cache_key = f"{server_id}:{details['path']}"
        if cache_key in cache:
            cached_copy = cache[cache_key]
            if cached_copy['lastModified'] == details['lastModified'] and cached_copy['contentLength'] == details['contentLength']:
                need_to_refresh = False

        # 3. Otherwise not cached/stale, fetch the file and cache it
        if need_to_refresh:
            print('--- FETCH', details['path'])
            filename_hash = getHash(details["path"])
            remote_file_url = f"{STORAGE[server_id]}/{details['path']}?{TOKEN}"
            local_file_path = os.path.join(blobfolder, filename_hash) #Build the path where we will save the file

            print('trying', remote_file_url, local_file_path)

            sz = 0
            try:
                response = requests.get(remote_file_url, stream=True)
                response.raise_for_status()  # Raise an exception for bad status codes
                with open(local_file_path, 'wb') as local_file:
                    for chunk in response.iter_content(chunk_size=528288):
                        local_file.write(chunk)
                        sz += len(chunk)
                        print(f"\r{sz}", end="")
                print("\n")

            except Exception as e:
                return f"Error downloading file from {remote_file_url}", 400
            # it worked! cache the info
            details['hash'] = filename_hash
            cache_key = f"{server_id}:{details['path']}"
            cache[cache_key] = details
            write_file_cache()
            print("--- NEW CACHE")
            print(cache)

        # 4. Open the cached file
        try:
            filename_hash = getHash(details["path"])
            local_file_path = os.path.join(blobfolder, filename_hash) #Build the path where we will save the file
            omx_file = omx.open_file(local_file_path, 'r')
        except Exception as e:
            return f"Error opening OMX file {local_file_path}", 400

        print('--- ARGS', request.args)
        # 5. If user merely asked for the file, just send the catalog
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
            print(666)
            return f"Error fetching table {request.args['table']}", 400
        finally:
            omx_file.close()

# ---------- Set up Flask ---------
# ################################################
# ---------- Set up Flask ---------

app = Flask(__name__, static_folder='static')
CORS(app)
api = Api(app)

api.add_resource(FilesList, '/list/<server_id>')
api.add_resource(File, '/file/<server_id>')
api.add_resource(Omx, '/omx/<server_id>')

# ----------------------------------------------------
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

# # Catch all routes and redirect to index.html for the SPA to handle
# # (for GitHub Pages)
# @app.route('/', defaults={'path': ''})
# @app.route('/<path:path>')
# def catch_all(path):
#     # Exclude API routes from the catch-all
#     if path.startswith('api/'): return "Not Found", 404
#     if path.startswith('omx/'): return "Not Found", 404
#     return send_from_directory('static', 'index.html')

# ----------------------------------------
if __name__ == "__main__":
    build_file_cache()
    app.run(port=4999, debug=True)
