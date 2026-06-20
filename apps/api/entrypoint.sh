#!/bin/sh
set -e
yt-dlp --update-to stable || echo "yt-dlp update failed, continuing with existing version"
exec node --experimental-sqlite dist/index.js
