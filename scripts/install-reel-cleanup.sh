#!/bin/zsh
# Runs the local video cleanup on this Mac daily 10:00 and 21:00. A copy is installed because
# macOS blocks background jobs from reading ~/Desktop. Remove: scripts/install-reel-cleanup.sh remove
set -e
D="$HOME/Library/Application Support/VAgent"; P="$HOME/Library/LaunchAgents/online.vagent.reel-cleanup.plist"; L=online.vagent.reel-cleanup
launchctl bootout gui/$(id -u)/$L 2>/dev/null || true
if [[ "$1" == remove ]]; then rm -f "$P" "$D/reel.mjs"; echo removed; exit; fi
mkdir -p "$D" "$HOME/Library/LaunchAgents" "$HOME/Movies/VAgent"
cp "$(dirname "$0")/../.claude/skills/reel-render-and-cleanup/reel.mjs" "$D/reel.mjs"
T=""; for h in 10 21; do T+="<dict><key>Hour</key><integer>$h</integer><key>Minute</key><integer>0</integer></dict>"; done
cat > "$P" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>$L</string>
<key>ProgramArguments</key><array><string>$(command -v node)</string><string>$D/reel.mjs</string><string>clean</string></array>
<key>StartCalendarInterval</key><array>$T</array>
<key>StandardOutPath</key><string>$D/cleanup.log</string>
<key>StandardErrorPath</key><string>$D/cleanup.log</string>
</dict></plist>
PLIST
launchctl bootstrap gui/$(id -u) "$P"; echo installed
