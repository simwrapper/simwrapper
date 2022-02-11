#!/usr/bin/env python3
import argparse
import os
import re
import sys
import socket
import ssl
import urllib
from pathlib import Path

try:
    # Python3
    import http.server as SimpleHTTPServer
    from http.server import HTTPServer, SimpleHTTPRequestHandler, test

except ImportError:
    # Python 2
    from BaseHTTPServer import HTTPServer, test
    from SimpleHTTPServer import SimpleHTTPRequestHandler


current_dir = os.getcwd()
package_dir = os.path.dirname(__file__)

pattern = re.compile('.png|.jpg|.jpeg|.js|.css|.ico|.gif|.svg|.woff|.ttf|.woff2|.eot', re.IGNORECASE)

SPA_MODE = False

def copy_byte_range(infile, outfile, start=None, stop=None, bufsize=16*1024):
    '''Like shutil.copyfileobj, but only copy a range of the streams.

    Both start and stop are inclusive.
    '''
    if start is not None: infile.seek(start)
    while 1:
        to_read = min(bufsize, stop + 1 - infile.tell() if stop else bufsize)
        buf = infile.read(to_read)
        if not buf:
            break
        outfile.write(buf)

BYTE_RANGE_RE = re.compile(r'bytes=(\d+)-(\d+)?$')
def parse_byte_range(byte_range):
    '''Returns the two numbers in 'bytes=123-456' or throws ValueError.

    The last number or both numbers may be None.
    '''
    if byte_range.strip() == '':
        return None, None

    m = BYTE_RANGE_RE.match(byte_range)
    if not m:
        raise ValueError('Invalid byte range %s' % byte_range)

    first, last = [x and int(x) for x in m.groups()]
    if last and last < first:
        raise ValueError('Invalid byte range %s' % byte_range)
    return first, last

class RangeRequestHandler(SimpleHTTPRequestHandler):
    """Adds support for HTTP 'Range' requests to SimpleHTTPRequestHandler

    The approach is to:
    - Override send_head to look for 'Range' and respond appropriately.
    - Override copyfile to only transmit a range when requested.
    """
    def send_head(self):
        if 'Range' not in self.headers:
            self.range = None
            return SimpleHTTPRequestHandler.send_head(self)
        try:
            self.range = parse_byte_range(self.headers['Range'])
        except ValueError as e:
            self.send_error(400, 'Invalid byte range')
            return None
        first, last = self.range

        # Mirroring SimpleHTTPServer.py here
        path = self.translate_path(self.path)
        f = None
        ctype = self.guess_type(path)
        try:
            f = open(path, 'rb')
        except IOError:
            self.send_error(404, 'File not found')
            return None

        fs = os.fstat(f.fileno())
        file_len = fs[6]
        if first >= file_len:
            self.send_error(416, 'Requested Range Not Satisfiable')
            return None

        self.send_response(206)
        self.send_header('Content-type', ctype)

        if last is None or last >= file_len:
            last = file_len - 1
        response_length = last - first + 1

        self.send_header('Content-Range', 'bytes %s-%s/%s' % (first, last, file_len))
        self.send_header('Content-Length', str(response_length))
        self.send_header('Last-Modified', self.date_time_string(fs.st_mtime))
        self.end_headers()
        return f

    def copyfile(self, source, outputfile):
        if not self.range:
            return SimpleHTTPRequestHandler.copyfile(self, source, outputfile)

        # SimpleHTTPRequestHandler uses shutil.copyfileobj, which doesn't let
        # you stop the copying before the end of the file.
        start, stop = self.range  # set in send_head()
        copy_byte_range(source, outputfile, start, stop)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Accept-Ranges,Range,*")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Max-Age", "86400")
        self.send_header("Access-Control-Allow-Methods", "GET,OPTIONS,HEAD")
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Mini-File-Server-Root', current_dir)
        self.send_header("Cache-Control", "no-cache, max-age=86400, must-revalidate")
        SimpleHTTPRequestHandler.end_headers(self)

        # experimenting with no-cache but must-revalidate: which means
        # the browser MUST ping us to see if there is a new copy of every
        # file, but if it has the latest file then it can use a cached version
        # instead of transferring it again.
        # Former settings no caching EVER: "no-cache, max-age=0, must-revalidate, no-store"

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()
        return None

    def do_GET(self):

        # If we are not in SPA_MODE the just serve up the files
        if not SPA_MODE:
            return super().do_GET()

        # -------------------------------------------------------
        # SPA_MODE: We are -both- a file server and an app server

        # File server
        if self.path.startswith('/_f_/'):
            self.path = self.path[4:]
            return super().do_GET()

        # Single Page App - path shenanigans
        url_parts = urllib.parse.urlparse(self.path)
        request_file_path = Path(url_parts.path.strip("/"))
        ext = request_file_path.suffix
        if not request_file_path.is_file() and not pattern.match(ext):
            self.path = 'index.html'

        self.directory = package_dir + '/static'

        return super().do_GET()

def find_free_port(port):
    for i in range(port,port+256):
        s = socket.socket()

        try:
            s.bind(('', i))
            s.close()
            return i

        except:
            pass
        finally:
            s.close()

def run_mini_file_server(maybe_port, cert, key):
    port = find_free_port(maybe_port)

    print("\n-----------------------------------------------------------------")
    print("SimWrapper file server: port", port)
    if cert and key: print("Using HTTPS with PEM cert/key")
    print(current_dir)


    print("-----------------------------------------------------------------\n")
    httpd = HTTPServer(('', port), RangeRequestHandler)

    if cert and key: httpd.socket = ssl.wrap_socket(
        httpd.socket,
        certfile=cert,
        keyfile=key,
        server_side=True
    )

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    httpd.server_close()


def serve_entire_website(port):
    print("\n-----------------------------------------------------------------")
    print("Start SimWrapper website on PORT:", port)

    # Build the full URL for this site, including the free port number
    if port == 9039:
        print("\nBrowse: http://localhost:" + str(port) + "/live")
        print("    Or: " + "http://" + socket.gethostname() + ":" + str(port) + "/live")
    else:
        print("\nTry: http://localhost:" + str(port) + "/" + str(port))
        print("And: " + "http://" + socket.gethostname() + ":" + str(port) + "/" + str(port))

    print("-----------------------------------------------------------------")
    print("Serving files and folders in:")
    print(current_dir)

    print("-----------------------------------------------------------------\n")
    httpd = HTTPServer(('', port), RangeRequestHandler)

    # SPA_MODE handles the case where we are serving
    # website internals -and- file contents from one URL.
    global SPA_MODE
    SPA_MODE = True

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    httpd.server_close()


if __name__ == '__main__':
    run_mini_file_server(8000)

