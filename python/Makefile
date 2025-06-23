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

build: .build-sentinel

clean:
> rm -rf build
> rm -rf dist
> rm -rf  simwrapper.egg-info
> rm -f  .build-sentinel
.PHONY: clean

test:
> pytest tests/
.PHONY: test

docker:
> rm -r .venv dist
> cd ..
> docker build -t simwrapper/app .
.PHONY: docker

#push: test build
push: build
> twine check dist/*
> twine upload dist/*
.PHONY: push

.build-sentinel: $(shell find simwrapper/*.py) pyproject.toml README.md
> rm -rf dist
> python3 -m build
> twine check dist/*
> touch $@

