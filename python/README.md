# SimWrapper Python Tools

Official python library for working with SimWrapper.

[SimWrapper](https://simwrapper.app) is a data visualization tool for exploring large transport simulation results.

Normally, web browsers block access to your local filesystem from external websites, for obvious security reasons. The SimWrapper website needs access to model run outputs on your filesystem.

This python program bridges that gap: it is a command-line tool that starts a local file server in a specific folder of your choosing, so that you can access the files in that folder using SimWrapper!

## About this library

This library contains the "simwrapper" command-line tool, which allows browsing of local files on your PC/laptop using the SimWrapper website.

- Only Python 3.10+ is supported.

## Installation

This package is on the PyPi pip package library. You can use pip or the more modern **uv** tool to install it. Note it has many scientific library dependencies, so it's best to use a virtual environment (via uv)

- Install using `pip install simwrapper`
- To upgrade to the latest version, `pip install --upgrade simwrapper`

## Running Simwrapper locally

This package includes an embedded copy of the Javascript code from the SimWrapper
project, available separately at https://github.com/simwrapper/simwrapper. No monorepo here! Maybe someday.

## Usage

`simwrapper` knows four commands.

### simwrapper run [config.yaml]

starts a _local instance of the SimWrapper website_ running on your machine and usually listening on port 4999. Run this command if you have a machine on your local network which contains outputs you'd like to view (such as a modeling server), and that machine has not been set up with any other file sharing software such as NGINX or Apache.

- This command is designed to support the use case where an agency has (1) a local network with files stored on a central "modeling server" or file server, and also (2) desktop machines or laptops on the local network that wish to access those files using SimWrapper.
- Ultimately you may decide that you want to put simwrapper behind a proxy server such as those listed, for improved performance, features, and security.

This is especially useful if you use cloud-based storage such as AWS or Azure. You can **mount your cloud storage** to a local folder using a tool such as [Rclone mount](https://rclone.org/commands/rclone_mount/), and use this `simwrapper run` to browse your files and results!

**Options:**

`simwrapper run [config-file.yaml]` will read configuration from specified file.

- If not provided, simwrapper will serve the files found in the current working folder. If provided, the YAML file can provide three sections:

  - **storage** - a list of mount points (folders) that simwrapper should share
  - **tagline** - the front page tagline, default "Transport simulation data visualizer"
  - **readme** - Markdown filename or raw markdown text to be shown on front page

**Example: config.yaml:**

```yaml
# --- STORAGE ----------------------
# **Local/network mounts only: no http URLs here**
# Each key defines a starting point in the local filesystem.
# (if no config is found, the current working folder is shared)
storage:
  data:
    path: '/Users/billy/data'
    description: 'Local data on my laptop'
  vsp-public:
    path: '/Users/billy/public-svn'
    description: 'VSP/TU-Berlin public datasets'

# --- FRONT-PAGE TEXT -------------
# Readme can either be a .md markdown filename,
# or you can put markdown text directly in this file with "readme: |"
#
tagline: 'Transport simulation data visualizer'
readme: 'readme.md'
# # or...
# readme: |
# Welcome to My SimWrapper
# ========================
# Markdown text here
# - notes 1
# - notes 2
```

---
### simwrapper serve

starts a local file server in the current directory. Run this command, then browse to either <https://vsp.berlin/simwrapper> or <https://activitysim.github.io/dashboard> to view your local folder outputs.

---
### simwrapper here

_Deprecated - "use simwrapper run" instead_

starts a _local copy of the SimWrapper website_ usually listening on port 8050. Run this command instead of `simwrapper serve` if you have a machine on your local network which contains outputs you'd like to view (such as a modeling server), and that machine has not been set up with any other file sharing software such as NGINX or Apache.

- This command is designed to support the use case where an agency has (1) a local network with files stored on a central "modeling server" or file server, and also (2) desktop machines or laptops on the local network that wish to access those files using SimWrapper.
- Note, it's not a battle-tested multi-threaded web proxy server such as Apache, NGINX, or Gunicorn. Ultimately you may decide that you want to put simwrapper behind a proxy server such as those listed, for improved performance, features, and security.

---
### simwrapper open [vsp|asim]

opens a new web browser tab AND a local file server in the current directory. The site will only operate as long as you keep that local server running, so don't close the command window.

- To open on the VSP MATSim site on the web, use `simwrapper open vsp`
- To open on the ActivitySim website, use `simwrapper open asim`
- You can also run `simwrapper open` without specifying an external site. In this case, it will will serve everything from the localhost, including file contents and SimWrapper code itself. This is the same as `simwrapper here` except it also opens a browser tab.

All three simwrapper commands start a small local file server, listening on a local port number. The site will only operate as long as you keep that local server running: quitting the command with CTRL-C or closing the command window will shut down the server.

---

## Security

When `simwrapper` is running, it listens for connections on your network interface. Your computer's **firewall rules and router settings** determine whether other machines on the network can access the folder, or not.

By default, almost all computers now run firewalls which block external access. If you want the files in your simwrapper folder to be available on your network, you will need to grant firewall permissions, generally meaning you need to authorize incoming network connections for the Python executable, and on the specific port used by SimWrapper.

- SimWrapper usually runs on ports 8000 and 8050. Starting multiple copies will increment the port numbers by one each time.

## Running as HTTPS - required for Safari

_We really just don't recommend using Safari. It is by far the slowest of all the browsers, and doesn't allow many advanced features because Apple wants to hold the open web back and push people to Apps_

Safari blocks HTTPS websites (such as SimWrapper VSP and ASIM) which access localhost resources such as this local simwrapper file server. _We recommend Chromium-based browsers_ such as Google Chrome, Brave, and Microsoft Edge, because they are much faster than Safari. But you can run simwrapper in HTTPS mode by following these extra instructions.

Simwrapper commands accept `--key` and `--cert` options to specify the two pieces of a PEM certicate. You can create a PEM certificate for "localhost" and install it in your browser's certificate database with the following commands.

This requires Homebrew, which supplies the `brew` command.

```bash
brew install mkcert nss   # installs mkcert command
mkcert localhost          # Create PEM key/cert files for "localhost"
mkcert -install           # Installs certificates in browser
````

This creates two files: `localhost.pem` and `localhost-key.pem`. Move them somewhere where you cn find them.

Now you can run simwrapper as follows:

- `simwrapper serve --cert localhost.pem --key localhost-key.pem`
- `simwrapper open asim --cert localhost.pem --key localhost-key.pem`
- The `simwrapper here` command does not use or support certificates.

## For help or support

SimWrapper is open source software with no guarantees, and is provided under the GNU GPL v3 license. You can post questions, bugs, or updates on the SimWrapper Github issue list, here: <http://github.com/simwrapper/simwrapper/issues>.

Have fun!

## Developing the SimWrapper Python tool

The python `simwrapper` tool contains a fully-built static copy of the SimWrapper website in the `simwrapper/static` folder. Whenever you make changes to the SimWrapper website, you'll need to package up the changes, copy them into this Python project, and build the Python package.

Here are the basic steps to do that:

- In the SimWrapper javascript project repo:

  - Make any changes to the [SimWrapper javascript code](https://github.com/simwrapper/simwrapper) as needed, and test vigorously
  - Ensure that both `vite.config.js` and `public/404.html` are both set to have prefix "/" instead of "/simwrapper/" or "/dashboard/". The Python tool will not work if there is a URL prefix in the path.
  - Run `npm run build` to compile everything into the `dist` folder.

- Then in this Python repository:
  - Delete all files in the `simwrapper/static` folder
  - Delete all files in the `build` folder
  - Copy entire contents from the SimWrapper `dist` folder (above) to the `simwrapper/static` folder here
  - Make any needed changes to the Python code in the `simwrapper` folder here
  - Run `make build` to generate the Python code

Now you can test your changes locally by running `pip install .` from the root folder of this project. You probably want to be inside a python environment if you want to isolate your changes during testing.

If everything is running smoothly, then push the project to pip and conda:

### Updating pip

- Commit all your changes: use semantic versioning commit messages ("fix: blah" and "feat: blah")
- Bump the version number with `make version`
- Commit the version bump, and push changes to Github
- Push to PyPi (pip) with `make push`
- Take note of the SHA256 string for the new `version.tar.gz` at https://pypi.org/project/simwrapper
  which can be found on the "Download Files" page

### Updating conda

_Conda is also deprecated. Stop using Anaconda._

- Modify the conda "feedstock" fork at https://github.com/simwrapper/simwrapper-feedstock :
  - Edit `recipe/meta.yaml`: you probably just need to change the version string and the SHA256
  - The SHA256 is found on https://pypi.org/project/simwrapper on the Download Files page
- Push to Github
- Create a pull request on https://github.com/conda-forge/simwrapper-feedstock
  - Make notes in the PR description, checking off the relevant boxes.
  - You don't need to do a "rerender" unless you've changed Python versions (I think)
