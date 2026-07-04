#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import click       # cmdline generator! https://click.palletsprojects.com/en/8.0.x
import webbrowser
import os
from pathlib import Path
from importlib.metadata import version

from . import sites
from . import MiniFileServer
from . import ApiApp

default_port = 8000
SINGLE_PAGE_APP_PORT = 8050

try:
  print('------------------')
  print(' SimWrapper', version("simwrapper"))
  print('------------------')
except:
  pass


@click.group()
def cli():
    pass

# -----------------------
@cli.command(help="Start a local file server in this folder")
@click.argument('port', default=default_port)
@click.option('--cert', default=None, help="PEM Certificate filename. Provide both a certificate and key to serve HTTPS")
@click.option('--key', default=None, help="PEM Key filename. Provide both a certificate and key to serve HTTPS")
def serve(port, cert, key):
    if (cert and not key) or (not cert and key):
      raise click.BadParameter("need both a cert and a key to enable HTTPS")

    MiniFileServer.run_mini_file_server(port, cert, key)

# -----------------------
@cli.command(help="Open your browser and view this folder using SimWrapper")
@click.argument('site', default='live')
@click.option('--cert', default=None, help="PEM Certificate filename. Provide both a certificate and key to serve HTTPS")
@click.option('--key', default=None, help="PEM Key filename. Provide both a certificate and key to serve HTTPS")
def open(site, cert, key):
    if (cert and not key) or (not cert and key):
      raise click.BadParameter("need both a cert and a key to enable HTTPS")

    if site == "live":
      port = MiniFileServer.find_free_port(SINGLE_PAGE_APP_PORT)
      url = f"http://localhost:{str(port)}/live?cwd={os.getcwd()}"
      # Open web browser first, because this command returns immediately
      print("Opening:", url)
      webbrowser.open(url, new=2, autoraise=True)  # in a new tab
      # Then start local fileserver
      MiniFileServer.serve_entire_website(port)

    else:
      port = MiniFileServer.find_free_port(default_port)

      # Build the full URL for this site, including the free port number
      url = ''
      if site in sites.sites:
        url = os.path.join(sites.sites[site],str(port))
      else:
        url = os.path.join(site,str(port))

      print("Opening:", url)
      webbrowser.open(url, new=2, autoraise=True)  # in a new tab

      MiniFileServer.run_mini_file_server(port, cert, key)

# -----------------------
@cli.command(help="Run a live SimWrapper Website locally")
def here():
    port = MiniFileServer.find_free_port(SINGLE_PAGE_APP_PORT)
    MiniFileServer.serve_entire_website(port)

# -----------------------
@cli.command()
@click.argument('config', required=False)
@click.option('--port', default=4999, help="Port number, default 4999")
@click.option('--debug', is_flag=True, default=False, help="Debug mode")
# @click.option('--cert', default=None, help="PEM Certificate filename. Provide both a certificate and key to serve HTTPS")
# @click.option('--key', default=None, help="PEM Key filename. Provide both a certificate and key to serve HTTPS")
def run(config, port, debug):
    """Run the SimWrapper FastAPI app for local or networked files

    CONFIG is the path to the config.py file containing the root paths to be served. Defaults to the current folder if not provided.
    """
    # if (cert and not key) or (not cert and key):
    #   raise click.BadParameter("need both a cert and a key to enable HTTPS")

    ApiApp.startServer(config, port, debug)

# -----------------------
@cli.command(name="plans2parquet", help="Flatten a MATSim population XML into a single Parquet file")
@click.argument('input', type=click.Path(exists=True, dir_okay=False, path_type=Path))
@click.option('-o', '--output', type=click.Path(dir_okay=False, path_type=Path), default=None,
              help="Output parquet path (default: <input stem>.parquet)")
@click.option('--crs', default=None,
              help="Source CRS for activity_x/y (e.g. EPSG:25832). Overrides the population's coordinateReferenceSystem attribute.")
@click.option('--chunk-size', type=int, default=20000,
              help="Persons per intermediate parquet chunk (default 20000).")
def plans2parquet(input, output, crs, chunk_size):
    """Flatten a MATSim population XML (.xml, .xml.gz, .xml.zst) into a single
    Parquet file: one row per activity or leg inside each plan.
    """
    # Imported lazily so the heavy pyarrow/pandas/lxml stack is only loaded
    # when this command actually runs, not on every `simwrapper` invocation.
    from . import plans2parquet as p2p
    p2p.run(input, output, crs, chunk_size)
