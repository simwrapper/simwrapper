#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import click       # cmdline generator! https://click.palletsprojects.com/en/8.0.x
import webbrowser
import os

from . import sites
from . import MiniFileServer

default_port = 8000

SINGLE_PAGE_APP_PORT = 9039

@click.group()
def cli():
    pass

@cli.command(help="Start a local file server in this folder")
@click.argument('port', default=default_port)
@click.option('--cert', default=None, help="PEM Certificate filename. Provide both a certificate and key to serve HTTPS")
@click.option('--key', default=None, help="PEM Key filename. Provide both a certificate and key to serve HTTPS")
def serve(port, cert, key):
    if (cert and not key) or (not cert and key):
      raise click.BadParameter("need both a cert and a key to enable HTTPS")

    MiniFileServer.run_mini_file_server(port, cert, key)

@cli.command(help="Open your browser and view this folder using SimWrapper")
@click.argument('site', default='live')
@click.option('--cert', default=None, help="PEM Certificate filename. Provide both a certificate and key to serve HTTPS")
@click.option('--key', default=None, help="PEM Key filename. Provide both a certificate and key to serve HTTPS")
def open(site, cert, key):
    if (cert and not key) or (not cert and key):
      raise click.BadParameter("need both a cert and a key to enable HTTPS")

    if site == "live":
      port = MiniFileServer.find_free_port(SINGLE_PAGE_APP_PORT)
      url = os.path.join("http://localhost:" + str(port), "live")
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

@cli.command(help="Run a live SimWrapper Website locally")
def here():
    port = MiniFileServer.find_free_port(SINGLE_PAGE_APP_PORT)
    MiniFileServer.serve_entire_website(port)
