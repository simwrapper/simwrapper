from setuptools import setup,find_packages

# Read the text files
with open('README.md', 'r') as f:
    README = f.read()
with open('VERSION', 'r') as f:
    VERSION = f.read()
#with open("CHANGELOG.md", 'r') as f:
#   CHANGELOG = f.read()

# This call to setup() does all the work
setup(
    name="simwrapper",
    version=VERSION,
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
    long_description=README
)

