#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# click makes building cmdline tools easy, see docs at
# https://click.palletsprojects.com/en/8.0.x

import click

@click.group()
def cli():
  pass

@cli.command(help="Start a local file server in this folder")
@click.option('--port', default=8000, help="Port number to use, default is 8000")
def serve(port):
  click.echo("SERVE! " + str(port))

# @cli.command(help="Open your browser and view files in this folder")
# def browse():
#   click.echo("OPEN!!")
