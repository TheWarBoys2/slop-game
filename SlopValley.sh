#!/usr/bin/env bash
# Slop Valley server for Linux. Put this in its own folder and run it: ./SlopValley.sh
# It downloads the game the first time and updates itself on every launch after that.
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-7777}"
REPO=TheWarBoys2/slop-game
BIN=SlopValley-linux

fetch() { # fetch URL [OUTFILE]: curl if there is one, wget if not
  if command -v curl >/dev/null 2>&1; then
    if [ -n "$2" ]; then curl -fL --progress-bar -o "$2" "$1"; else curl -fsSL "$1"; fi
  elif command -v wget >/dev/null 2>&1; then
    if [ -n "$2" ]; then wget -q --show-progress -O "$2" "$1"; else wget -qO- "$1"; fi
  else
    return 1
  fi
}

echo "Checking for updates..."
TAG=$(fetch "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null | grep -m1 '"tag_name"' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')
HAVE=$(cat version.txt 2>/dev/null | tr -d '[:space:]')
if [ -z "$TAG" ]; then
  echo "Could not check for updates, using the copy you already have."
elif [ "$HAVE" != "$TAG" ] || [ ! -x "$BIN" ]; then
  echo "Downloading $TAG (about 100 MB, first time only)..."
  if fetch "https://github.com/$REPO/releases/download/$TAG/$BIN" "$BIN.new"; then
    chmod +x "$BIN.new" && mv -f "$BIN.new" "$BIN" && echo "$TAG" > version.txt && echo "Updated."
  else
    rm -f "$BIN.new"
    echo "The download failed, using the copy you already have."
  fi
else
  echo "Already up to date ($HAVE)."
fi

if [ ! -x "$BIN" ]; then
  echo
  echo "Could not download the game. Check your internet connection (and that curl or wget is installed) and try again."
  exit 1
fi

# an older copy still running holds the port; offer to stop it rather than crash
OLD=$(pgrep -f "SlopValley-linux" 2>/dev/null | tr '\n' ' ' | sed 's/ *$//')
if [ -n "$OLD" ]; then
  echo
  echo "Slop Valley is already running (process $OLD), probably in another window or left in the background."
  if [ -t 0 ]; then
    printf "Stop it and start a fresh server? [Y/n] "
    read -r ANS
    case "$ANS" in
      [nN]*) echo "Leaving it running. To run a second one, use another port: PORT=$((PORT + 1)) ./SlopValley.sh"; exit 0 ;;
    esac
    kill $OLD 2>/dev/null
    for _ in 1 2 3 4 5 6 7 8 9 10; do pgrep -f "SlopValley-linux" >/dev/null 2>&1 || break; sleep 0.5; done
    pgrep -f "SlopValley-linux" >/dev/null 2>&1 && kill -9 $OLD 2>/dev/null && sleep 0.5
    echo "Stopped the old one."
  else
    echo "Stop it first (pkill -f SlopValley-linux), or use another port: PORT=$((PORT + 1)) ./SlopValley.sh"
    exit 1
  fi
fi

echo
echo "If you run a firewall, open TCP port $PORT (for example: sudo ufw allow $PORT/tcp)."
echo
exec "./$BIN" "$PORT"
