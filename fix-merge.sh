#!/bin/bash
set -e
cd /home/runner/workspace
git push origin HEAD:Main
git branch --set-upstream-to=origin/Main replit-agent
echo "Done — pushed to Main and tracking updated"
