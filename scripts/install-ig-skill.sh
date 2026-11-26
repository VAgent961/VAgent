#!/bin/sh
# Installs https://github.com/Jakeschincariol/instagram-agent-skill (MIT), pinned to a reviewed commit,
# into this project's .claude/skills, plus our voice profile at ~/.claude/instagram/voice.md.
# The skills only draft text. Publishing stays with our approval queue (tools/marketing-render).
set -eu
REPO=https://github.com/Jakeschincariol/instagram-agent-skill
PIN=d03c56bb598be770c60b201f94237e5d1a4268a6
ROOT=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
git clone -q "$REPO" "$T/repo"
git -C "$T/repo" checkout -q "$PIN"
mkdir -p "$ROOT/.claude/skills" "$HOME/.claude/instagram"
cp -R "$T"/repo/skills/ig-* "$ROOT/.claude/skills/"
cp "$T/repo/LICENSE" "$ROOT/.claude/skills/ig-reel/LICENSE"
V="$HOME/.claude/instagram/voice.md"
if [ -e "$V" ] && ! cmp -s "$V" "$ROOT/marketing/voice.md"; then
  echo "kept existing $V (differs from marketing/voice.md)"
else cp "$ROOT/marketing/voice.md" "$V"; fi
echo "installed $(ls -d "$ROOT"/.claude/skills/ig-* | wc -l | tr -d ' ') skills at $PIN"
