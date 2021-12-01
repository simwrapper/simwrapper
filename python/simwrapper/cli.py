#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import click       # cmdline generator! https://click.palletsprojects.com/en/8.0.x
import webbrowser
import os

from . import sites
from . import MiniFileServer

default_port = 8000

@click.group()
def cli():
    pass

@cli.command(help="Start a local file server in this folder")
@click.argument('port', default=default_port)
def serve(port):
    MiniFileServer.run_mini_file_server(port)

@cli.command(help="Open your browser and view this folder using SimWrapper")
@click.argument('site', default='vsp')
def open(site):
    port = MiniFileServer.find_free_port(default_port)
    # Build the full URL for this site, including the free port number
    url = ''
    if site in sites.sites:
      url = os.path.join(sites.sites[site],str(port))
    else:
      url = os.path.join(site,str(port))

    # Open web browser first, because this command returns immediately
    print("Opening:", url)
    webbrowser.open(url, new=2, autoraise=True)  # in a new tab

    # Then start local fileserver
    MiniFileServer.run_mini_file_server(port)
