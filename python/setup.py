import pathlib

from setuptools import setup,find_packages

# The directory containing this file
HERE = pathlib.Path(__file__).parent

# The text of the README file
README = (HERE / "README.md").read_text()
VERSION = (HERE / "VERSION").read_text()
CHANGELOG = (HERE / "CHANGELOG.md").read_text()

# This call to setup() does all the work
setup(
    name="simwrapper",
    version=VERSION,
    description="Python support library for SimWrapper data visualization tool",
    long_description_content_type="text/markdown",
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
    long_description=README + "\n---\n" + CHANGELOG,
)
