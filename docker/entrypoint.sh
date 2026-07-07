#!/bin/bash
set -e

# Start Xvfb (virtual frame buffer display :99)
echo "Starting Xvfb on display :99..."
Xvfb :99 -screen 0 1280x1024x24 > /dev/null 2>&1 &
export DISPLAY=:99

# Wait a moment for Xvfb to start
sleep 1

# Start VNC server (listening on localhost only for safety inside the container)
echo "Starting x11vnc..."
x11vnc -display :99 -forever -shared -nopw -rfbport 5900 -listen 127.0.0.1 > /dev/null 2>&1 &

# Wait a moment for VNC to start
sleep 1

# Start noVNC proxy to map VNC to WebSockets on port 8080
echo "Starting noVNC proxy on port 8080..."
websockify --web /usr/share/novnc 8080 localhost:5900 > /dev/null 2>&1 &

echo "========================================================="
echo " noVNC web interface is running on: http://localhost:8080 "
echo "========================================================="

# Execute the main command passed to docker
exec "$@"
