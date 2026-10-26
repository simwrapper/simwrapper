// standard-version updater for python/pyproject.toml and python/uv.lock, so that
// `pnpm release` bumps the Python package version together with package.json.

// uv.lock: the version line that follows the simwrapper package's name line
const UV_LOCK_VERSION = /(^name = "simwrapper"\nversion = ")([^"]+)(")/m
// pyproject.toml: the [project] version line
const PYPROJECT_VERSION = /(^version = ")([^"]+)(")/m

function pattern(contents) {
  return UV_LOCK_VERSION.test(contents) ? UV_LOCK_VERSION : PYPROJECT_VERSION
}

module.exports.readVersion = function (contents) {
  return contents.match(pattern(contents))[2]
}

module.exports.writeVersion = function (contents, version) {
  return contents.replace(pattern(contents), `$1${version}$3`)
}
