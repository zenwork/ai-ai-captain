#!/bin/sh
# Start the hub without the Stream Deck and open the virtual deck in a small Chrome app window.
set -eu

# Use a port that differs from the default hub port, so this hub does not conflict with the Stream Deck hub.
port="${AI_AI_CAPTAIN_DECK_PORT:-43682}"
deck_address="http://127.0.0.1:${port}/deck.html"
window_size="${AI_AI_CAPTAIN_DECK_WINDOW_SIZE:-420,140}"
startup_attempts=50

npm run build:web

AI_AI_CAPTAIN_PORT="$port" npx tsx src/server/main.ts &
hub_process_identifier=$!
trap 'kill "$hub_process_identifier" 2>/dev/null || true' EXIT INT TERM

attempt=0
until curl --silent --fail --output /dev/null "$deck_address"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge "$startup_attempts" ]; then
    echo "The hub did not start in time." >&2
    exit 1
  fi
  sleep 0.2
done

# Start the Chrome binary directly. A running Chrome gets the app window and no second Chrome starts.
chrome_binary="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$chrome_binary" --app="$deck_address" --window-size="$window_size" >/dev/null 2>&1 &
echo "The hub runs at ${deck_address}. Press Ctrl+C to stop it."
wait "$hub_process_identifier"
