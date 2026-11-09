# --------------------------------------------------
# standard Makefile preamble
# see https://tech.davis-hansson.com/p/make/
SHELL := bash
.ONESHELL:
.SHELLFLAGS := -eu -o pipefail -c
.DELETE_ON_ERROR:
MAKEFLAGS += --warn-undefined-variables
MAKEFLAGS += --no-builtin-rules
# Gnu Make 4.0+ only
ifeq ($(origin .RECIPEPREFIX), undefined)
  $(error Your Make does not support .RECIPEPREFIX. Please use GNU Make 4.0 or later)
endif
.RECIPEPREFIX = >
# --------------------------------------------------

# builds the JS app at the repo root, copies it into simwrapper/static, then builds the wheel.
# Publishing to PyPI is done by the python-release GitHub Actions workflow on each v* tag.
build:
> bash ../scripts/build-python.sh
.PHONY: build

clean:
> rm -rf build
> rm -rf dist
> rm -rf simwrapper.egg-info
> rm -rf simwrapper/static
.PHONY: clean

test:
> uv run pytest
.PHONY: test

docker: build
> rm -rf .venv dist
> docker build -t simwrapper/app .
.PHONY: docker
