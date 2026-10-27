#!/bin/sh
set -eu

deck_address="$1"
window_size="$2"
operating_system=$(uname -s)

case "$operating_system" in
  Darwin)
    open -na "Google Chrome" --args "--app=$deck_address" "--window-size=$window_size"
    ;;
  Linux)
    for chrome_command in google-chrome google-chrome-stable chromium chromium-browser; do
      if command -v "$chrome_command" >/dev/null 2>&1; then
        "$chrome_command" "--app=$deck_address" "--window-size=$window_size" &
        exit 0
      fi
    done
    echo "Google Chrome or Chromium was not found on PATH." >&2
    exit 1
    ;;
  *)
    echo "Opening the deck is not supported on operating system '$operating_system'." >&2
    exit 1
    ;;
esac
