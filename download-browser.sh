#!/bin/bash
set -e

# Define directories
BIN_DIR="bin"
ARCHIVE_NAME="firefox-150.0.1-stealth-linux-x86_64.tar.gz"
URL="https://github.com/feder-cr/invisible_playwright/releases/download/firefox-13/$ARCHIVE_NAME"

echo "Creating bin directory..."
mkdir -p "$BIN_DIR"

if [ -f "$BIN_DIR/firefox" ]; then
    echo "Invisible Firefox binary is already downloaded and unpacked."
    exit 0
fi

echo "Downloading Invisible Firefox binary from GitHub releases..."
curl -L "$URL" -o "$BIN_DIR/$ARCHIVE_NAME"

echo "Extracting archive..."
tar -xzf "$BIN_DIR/$ARCHIVE_NAME" -C "$BIN_DIR"

echo "Cleaning up archive..."
rm "$BIN_DIR/$ARCHIVE_NAME"

echo "Invisible Firefox successfully downloaded to $BIN_DIR/firefox"
