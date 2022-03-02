import pathlib

from setuptools import setup,find_packages

# The directory containing this file
# HERE = pathlib.Path(__file__).parent

# The text of the README file
#README = (HERE / "README.md").read_text()
#VERSION = (HERE / "VERSION").read_text()
#CHANGELOG = (HERE / "CHANGELOG.md").read_text()

# This call to setup() does all the work
setup(
    name="simwrapper",
    version="1.7.5",
    description="Python support library for SimWrapper data visualization tool",
    url="https://github.com/simwrapper/simwrapper-python-tools",
    author="Billy Charlton",
    author_email="billy@okbecause.com",
    license="GPLv3",
    classifiers=[
        "License :: OSI Approved :: GNU General Public License (GPL)",
        "Programming Language :: Python :: 3",
    ],
    packages=find_packages(),
    install_requires=[
        "Click",
    ],
    include_package_data=True,
    extras_require = {
    },
    tests_require=["assertpy", "pytest"],
    entry_points={
        'console_scripts': [
            'simwrapper = simwrapper.cli:cli'
        ]
    },
    long_description_content_type="text/markdown",
    long_description="""
# SimWrapper Python Tools

Official python library for working with SimWrapper.

[SimWrapper](https://simwrapper.github.io) is a data visualization tool for exploring large transport simulation results.

Web browsers all block access to your local filesystem from external websites, for obvious security reasons. The SimWrapper website needs access to model run outputs on your filesystem. This program bridges that gap: it is a command-line tool that starts a local file server in a specific folder, so that you can access the files in that folder using SimWrapper.

## About this library

This library contains the "simwrapper" command-line tool, which allows browsing of local files on your PC/laptop using the SimWrapper website.

We are at the very early stages of building this tool. The API will change, things will break, and there are certainly bugs.

- Our primary goal is to make it easy to get local simulation results viewable using the SimWrapper website.
- We have only tested this using Anaconda Python. Only Python 3.x is supported.

## Installation

Installation requires the `pip` package manager.

- Install using `pip install simwrapper`
- To upgrade to the latest version, `pip install --upgrade simwrapper`

## Usage

`simwrapper` knows three commands.

**simwrapper serve**

starts a local file server in the current directory. Run this command, then browse to either <https://vsp.berlin/simwrapper> or <https://activitysim.github.io/dashboard> to view your local folder outputs.

**simwrapper here**

starts a _local copy of the SimWrapper website_ listening on port 9039. Run this command instead of `simwrapper serve` if you have a machine on your local network which contains outputs you'd like to view (such as a modeling server), and that machine has not been set up with any other file sharing software such as NGINX or Apache.

- This command is designed to support the use case where an agency has (1) a local network with files stored on a central "modeling server" or file server, and also (2) desktop machines or laptops on the local network that wish to access those files using SimWrapper.
- Note, it's not a battle-tested multi-threaded web proxy server such as Apache, NGINX, or Gunicorn. Ultimately you may decide that you want to put simwrapper behind a proxy server such as those listed, for improved performance, features, and security.

**simwrapper open [vsp|asim]**

opens a new web browser tab AND a local file server in the current directory. The site will only operate as long as you keep that local server running, so don't close the command window.

- To open on the VSP MATSim site on the web, use `simwrapper open vsp`
- To open on the ActivitySim website, use `simwrapper open asim`
- You can also run `simwrapper open` without specifying an external site. In this case, it will will serve everything from the localhost, including file contents and SimWrapper code itself. This is the same as `simwrapper here` except it also opens a browser tab.

All three simwrapper commands start a small local file server, listening on a local port number. The site will only operate as long as you keep that local server running: quitting the command with CTRL-C or closing the command window will shut down the server.

## Security

When `simwrapper` is running, it listens for connections on your network interface. Your computer's **firewall rules and router settings** determine whether other machines on the network can access the folder, or not.

By default, almost all computers now run firewalls which block external access. If you want the files in your simwrapper folder to be available on your network, you will need to grant firewall permissions, generally meaning you need to authorize incoming network connections for the Python executable, and on the specific port used by SimWrapper.

- SimWrapper usually runs on ports 8000 and 9039. Starting multiple copies will increment the port numbers by one each time.

## Running as HTTPS - required for Safari

Safari blocks HTTPS websites (such as SimWrapper VSP and ASIM) which access localhost resources such as this local simwrapper file server. _We recommend Chromium-based browsers_ such as Google Chrome, Brave, and Microsoft Edge, because they are much faster than Safari. But you can run simwrapper in HTTPS mode by following these extra instructions.

Simwrapper commands accept `--key` and `--cert` options to specify the two pieces of a PEM certicate. You can create a PEM certificate for "localhost" and install it in your browser's certificate database with the following commands.

This requires Homebrew, which supplies the `brew` command.

```bash
brew install mkcert nss   # installs mkcert command
mkcert localhost          # Create PEM key/cert files for "localhost"
mkcert -install           # Installs certificates in browser
```

This creates two files: `localhost.pem` and `localhost-key.pem`. Move them somewhere where you cn find them.

Now you can run simwrapper as follows:

- `simwrapper serve --cert localhost.pem --key localhost-key.pem`
- `simwrapper open asim --cert localhost.pem --key localhost-key.pem`
- The `simwrapper here` command does not use or support certificates.

## For help or support

SimWrapper is open source software with no guarantees, and is provided under the GNU GPL v3 license. You can post questions, bugs, or updates on the SimWrapper Github issue list, here: <http://github.com/simwrapper/simwrapper/issues>.
"""
)

