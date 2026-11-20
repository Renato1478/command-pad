#!/usr/bin/env bash
# Bump the app version everywhere it is declared.
#
# Usage:
#   scripts/bump-version.sh patch          # 0.2.0 -> 0.2.1
#   scripts/bump-version.sh minor          # 0.2.0 -> 0.3.0
#   scripts/bump-version.sh major          # 0.2.0 -> 1.0.0
#   scripts/bump-version.sh 1.4.2          # explicit version
#   scripts/bump-version.sh minor --dry-run
#
# It updates package.json, package-lock.json, src-tauri/Cargo.toml,
# src-tauri/Cargo.lock, and src-tauri/tauri.conf.json.

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

[[ $# -ge 1 ]] || usage
target="$1"
dry_run=false
[[ "${2:-}" == "--dry-run" ]] && dry_run=true

current="$(python3 -c 'import json; print(json.load(open("package.json"))["version"])')"

next="$(python3 - "$current" "$target" <<'PY'
import re
import sys

current, target = sys.argv[1], sys.argv[2]
match = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)", current)
if not match:
    sys.exit(f"Current version is not simple semver: {current}")
major, minor, patch = map(int, match.groups())

if target == "major":
    major, minor, patch = major + 1, 0, 0
elif target == "minor":
    minor, patch = minor + 1, 0
elif target == "patch":
    patch += 1
elif re.fullmatch(r"\d+\.\d+\.\d+", target):
    major, minor, patch = map(int, target.split("."))
else:
    sys.exit(f"Invalid version or bump: {target}")

print(f"{major}.{minor}.{patch}")
PY
)"

if [[ "$next" == "$current" ]]; then
  echo "Version is already $current." >&2
  exit 1
fi

echo "Bumping $current -> $next"
if $dry_run; then
  echo "Dry run: no files changed."
  exit 0
fi

python3 - "$next" <<'PY'
import json
import sys

version = sys.argv[1]
for name in ("package.json", "package-lock.json"):
    with open(name) as file:
        data = json.load(file)
    data["version"] = version
    if name == "package-lock.json" and "" in data.get("packages", {}):
        data["packages"][""]["version"] = version
    with open(name, "w") as file:
        json.dump(data, file, indent=2)
        file.write("\n")
PY

python3 - "$next" <<'PY'
import re
import sys

version = sys.argv[1]
for name in ("src-tauri/Cargo.toml", "src-tauri/Cargo.lock", "src-tauri/tauri.conf.json"):
    with open(name) as file:
        text = file.read()
    if name.endswith("Cargo.toml"):
        text, count = re.subn(r'(?m)^version = "[^"]+"$', f'version = "{version}"', text, count=1)
    elif name.endswith("Cargo.lock"):
        text, count = re.subn(
            r'(?m)^(name = "cmd-pad"\n)version = "[^"]+"$',
            rf'\g<1>version = "{version}"',
            text,
            count=1,
        )
    else:
        text, count = re.subn(r'("version":\s*)"[^"]+"', rf'\g<1>"{version}"', text, count=1)
    if count != 1:
        sys.exit(f"Could not update {name}")
    with open(name, "w") as file:
        file.write(text)
PY

echo
echo "Updated files:"
git diff --stat -- package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
cat <<EOF

Next steps:
  npm run check && npm test
  git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
  git commit -m "chore: bump version to $next"
  git push
  git tag -a v$next -m "Command Pad v$next"
  git push origin v$next

Pushing the tag starts the release workflow.
EOF
