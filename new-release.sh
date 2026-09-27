#!/usr/bin/env bash
#
# new-release [minor|major]
#
# Bumps the version in manifest.json, records it in versions.json (if
# present), commits everything currently pending, tags the new version, and
# pushes both — the release flow Obsidian's GitHub Actions release workflow
# expects:
# https://docs.obsidian.md/Plugins/Releasing/Release+your+plugin+with+GitHub+Actions
#
# Versioning here is deliberately NOT semver's minor/patch — it's whatever
# was asked for:
#   new-release          x.y.z -> x.(y+1).0   (default bump)
#   new-release minor    x.y.z -> x.y.(z+1)   (small bump)
#   new-release major    x.y.z -> (x+1).0.0   (big bump)
#
# Self-contained: copy this file into the root of any Obsidian plugin repo
# that has a manifest.json there. Needs bash, git, and node (already required
# to build the plugin) — nothing else.

set -euo pipefail

if [[ ! -f manifest.json ]]; then
	echo "error: no manifest.json in $(pwd) — run this from an Obsidian plugin repo root" >&2
	exit 1
fi
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
	echo "error: not inside a git repository" >&2
	exit 1
fi

kind="${1:-}"
case "$kind" in
	"" | minor | major) ;;
	*)
		echo "usage: new-release [minor|major]" >&2
		exit 1
		;;
esac

current_version="$(node -p "require('./manifest.json').version")"
min_app_version="$(node -p "require('./manifest.json').minAppVersion")"

IFS='.' read -r x y z <<<"$current_version"
if [[ -z "${x:-}" || -z "${y:-}" || -z "${z:-}" ]]; then
	echo "error: manifest.json version \"$current_version\" isn't x.y.z" >&2
	exit 1
fi

case "$kind" in
	"") y=$((y + 1)); z=0 ;;
	minor) z=$((z + 1)) ;;
	major) x=$((x + 1)); y=0; z=0 ;;
esac
new_version="$x.$y.$z"

branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" == "HEAD" ]]; then
	echo "error: in detached HEAD state, not on a branch" >&2
	exit 1
fi

echo "Releasing $current_version -> $new_version (branch: $branch)"
read -r -p "Continue? [y/N] " confirm
[[ "$confirm" == "y" || "$confirm" == "Y" ]] || { echo "Aborted."; exit 1; }

node -e '
	const fs = require("fs");
	const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
	manifest.version = process.argv[1];
	fs.writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t") + "\n");
' "$new_version"

if [[ -f versions.json ]]; then
	node -e '
		const fs = require("fs");
		const versions = JSON.parse(fs.readFileSync("versions.json", "utf8"));
		versions[process.argv[1]] = process.argv[2];
		fs.writeFileSync("versions.json", JSON.stringify(versions, null, "\t") + "\n");
	' "$new_version" "$min_app_version"
fi

git add -A
git commit -m "Release $new_version"
git tag -a "$new_version" -m "$new_version"
git push origin "$branch"
git push origin "$new_version"

echo "Released $new_version."
