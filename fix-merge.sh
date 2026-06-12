#!/bin/bash
cd /home/runner/workspace

echo "=== Cleaning packed-refs of stale local branches ==="
python3 - <<'PYEOF'
path = ".git/packed-refs"
keep_prefixes = (
    "# pack-refs",
    "refs/heads/Main",
    "refs/remotes/origin/Main",
    "refs/remotes/gitsafe-backup/",
    "refs/notes/",
    "refs/replit/",
)
with open(path) as f:
    lines = f.readlines()

kept = [l for l in lines if any(l.strip().startswith(p) or l.strip().endswith(p) for p in keep_prefixes) or l.startswith("^")]
# keep lines where the ref part matches
kept = []
for line in lines:
    if line.startswith("#") or line.startswith("^"):
        kept.append(line)
        continue
    ref = line.split(" ", 1)[1].strip() if " " in line else ""
    if any(ref.startswith(p) or ref == p.rstrip("/") for p in keep_prefixes[1:]):
        kept.append(line)

with open(path, "w") as f:
    f.writelines(kept)

print(f"Kept {len(kept)} lines, removed {len(lines)-len(kept)} stale entries")
PYEOF

echo ""
echo "=== Remaining branches in Replit panel ==="
git --no-optional-locks branch -a | grep -v "gitsafe"
