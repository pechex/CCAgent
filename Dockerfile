# Use the official Playwright image as base (contains Node and browser system dependencies)
FROM mcr.microsoft.com/playwright:v1.49.1-noble

# Avoid interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install Xvfb, x11vnc, and noVNC
RUN apt-get update && apt-get install -y \
    xvfb \
    x11vnc \
    novnc \
    websockify \
    && rm -rf /var/lib/apt/lists/*

# Symbolic link from vnc.html to index.html so noVNC loads at root (http://localhost:8080)
RUN ln -s /usr/share/novnc/vnc.html /usr/share/novnc/index.html

WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install project dependencies
RUN npm ci

# Download the custom patched Firefox browser (invisible_playwright)
COPY download-browser.sh ./
RUN bash download-browser.sh

# Copy the rest of the application code
COPY . .

# Make the entrypoint script executable
RUN chmod +x /app/docker/entrypoint.sh

# Configure entrypoint script to run Xvfb + noVNC in the background
ENTRYPOINT ["/app/docker/entrypoint.sh"]

# Default command to run the daily check-in
CMD ["npm", "run", "checkin"]
