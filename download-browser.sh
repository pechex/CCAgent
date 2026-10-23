#!/bin/bash
set -e

# Define directories
BIN_DIR="bin"
ARCHIVE_NAME="firefox-stealth-linux-x86_64.tar.gz"

echo "Creating bin directory..."
mkdir -p "$BIN_DIR"

if [ -f "$BIN_DIR/firefox" ]; then
    echo "Invisible Firefox binary is already downloaded and unpacked."
    exit 0
fi

echo "Resolving latest Invisible Firefox release from GitHub..."
TAG=$(curl -sI "https://github.com/feder-cr/firefox_antidetect_patch/releases/latest" | tr -d '\r' | awk -F'/tag/' '/location:/ {print $2}')
if [ -z "$TAG" ]; then
    TAG="firefox-51"
fi
echo "Target release tag: $TAG"

ASSET_PATH=$(curl -sL "https://github.com/feder-cr/firefox_antidetect_patch/releases/expanded_assets/${TAG}" | grep -o "/feder-cr/firefox_antidetect_patch/releases/download/${TAG}/[^\"]*stealth-linux-x86_64\.tar\.gz" | head -n 1)

if [ -n "$ASSET_PATH" ]; then
    URL="https://github.com${ASSET_PATH}"
else
    URL="https://github.com/feder-cr/firefox_antidetect_patch/releases/download/${TAG}/firefox-151.0-stealth-linux-x86_64.tar.gz"
fi

echo "Downloading Invisible Firefox binary from: $URL..."
curl -fL "$URL" -o "$BIN_DIR/$ARCHIVE_NAME"

echo "Extracting archive..."
tar -xzf "$BIN_DIR/$ARCHIVE_NAME" -C "$BIN_DIR"

echo "Cleaning up archive..."
rm "$BIN_DIR/$ARCHIVE_NAME"

chmod +x "$BIN_DIR/firefox"

echo "Invisible Firefox successfully downloaded to $BIN_DIR/firefox"

