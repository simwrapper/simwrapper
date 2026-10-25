# AGENTS.md

Guidance for AI agents working in this repository.

## Always use `uv`

Run all Python commands through `uv` (e.g. `uv run python ...`, `uv run pytest`,
`uv sync`). Do not invoke `python`, `pip`, or a bare virtualenv directly — the
project's dependencies are managed by `uv` and are not otherwise on PATH.

Note: `pyproject.toml` and `uv.lock` live in `src/`, so run `uv` commands from
there (or point `uv` at that project).

## Never scan `src/simwrapper/static/`

`src/simwrapper/static/` contains built JavaScript artifacts (minified bundles,
worker chunks, etc.). Do **not** read, grep, or search it — the files are
machine-generated, multi-megabyte, and not source. Exclude it from all
code searches and edits.
