---
id: running-locally
title: Running locally/offline
---

Most users can use simwrapper directly from the website https://simwrapper.app. But many are interested in running a local copy of the site on their own machine, perhaps inside an agency network firewall or in "offline mode" without requiring network access.

If you want to run SimWrapper locally on your own server or laptop, there are a few ways to do so. Once it is installed, it will be available "offline" as well.

### Install from uv/pip

This is the easiest solution for most situations. SimWrapper has been packaged as a self-contained command line tool on the PyPi software repository. You don't need to know or use Python to use this package.

**Shortest path to a running local installation:**

Use the [uv software manager](https://docs.astral.sh/uv/). uv is the modern replacement for all previous python software management tools like pip, poetry, virtualenv, etc. It eliminates the problems with virtual environments, messy multiple Python versions, etc. It is far, far faster and more error-proof than using pip or other methods!
- (1) Install uv first if you don't already have it:
  https://docs.astral.sh/uv/getting-started/installation
  - Read the output from the install command; you might need to edit your PATH to include the program.
  - uv will use your local install of Python. If you don't have Python or have a very old Python < 3.6, let uv install a recent python for you (no, this won't mess up any of your existing python installations!):
    - `uv python install 3.11`
- (2) Install the simwrapper command-line tool using uv:
  - `uv tool install simwrapper`
- (3) Go to the folder containing your data and run:
  - `simwrapper run`

That's it! Your site is running at http://127.0.0.1:4999

Read the [uv docs](https://docs.astral.sh/uv/) for many other uv capabilities such as `uv tool install simwrapper` and managing your pip dependencies and python versions!

**pip**

You can also use pip directly, with `pip install simwrapper`. If you go this route, you should
probably create a virtualenv (venv) and make sure you have a recent version of Python. These extra
steps can be a real pain, especially because SimWrapper has many data science dependencies which are
difficult to install. Please use `uv` instead, as above :-)


### Use Docker

SimWrapper is available as a built Docker image at https://hub.docker.com/r/simwrapper/app

Let's assume you already know how to use Docker if you are reading this!

- `docker pull simwrapper/app`
- `docker run -p 4999:4999 -v /my/data/folder:/data simwrapper/app`

The `-p` tells docker to listen on port 4999; `-v` links your local folder of files to `/data` in
the container image, where simwrapper will then be able to access them.


### Build the site yourself

Please read the [developer's guide](dev-guide) for full instructions on how to build and run the
site locally.

This should only be necessary if you want to file/fix bugs or add special features for your own
instance. PR's gladly accepted!

