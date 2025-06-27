---
id: running-locally
title: Running it locally
---

If you want to run SimWrapper on your own server or laptop, there are a few ways to do so.

### Install from uv/pip

This is the easiest solution for most of you. SimWrapper is a website, but for ease of of local installation we've also packaged it up as a super simple 'simwrapper' command-line package on the PyPi software repository. You don't need to know Python to use this package.

**Shortest path to a running local installation:**

- Install the [uv software manager](https://docs.astral.sh/uv/getting-started/installation/) which is the most modern Python packaging ecosystem out there.
  It is far, far faster and more error-proof than using pip or other methods.
- Run `uv tool install simwrapper` to install simwrapper as a command-line program on your system.
  Read the output from the install command; you might need to edit your PATH to include the program.
- Now go to the folder containing the data you want to explore, and run `uv tool run simwrapper`
- That's it! Your site is running at http://localhost:4999

You can upgrade with `uv tool upgrade simwrapper`

**pip**

You can also use pip directly, with `pip install simwrapper`. If you go this route, you should
probably create a virtualenv (venv) and make sure you have a recent version of Python. These extra
steps can be a real pain, especially because the tool has many datascience dependencies which are
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

