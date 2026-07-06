# Creality Cloud Daily Check-in Bot (WSL + invisible_playwright)

This is a Node.js automation script built to run inside a **WSL (Windows Subsystem for Linux)** environment. It logs into Creality Cloud and completes the daily check-in to accumulate reward points.

To bypass sophisticated anti-scraping and fingerprinting systems (like Cloudflare/DataDome), it utilizes a patched version of Firefox from the [invisible_playwright](https://github.com/feder-cr/invisible_playwright) project.

---

## Prerequisites

1.  **Node.js**: Installed in your WSL environment (preferably via [NVM](https://github.com/nvm-sh/nvm)).
2.  **WSL GUI (WSLg)**: Required for the first-time manual login. This is enabled by default in Windows 11 and recent Windows 10 updates.
3.  **System dependencies**: Running Firefox in WSL requires GTK and other X11/Wayland libraries. If they are not already installed, run the following inside your WSL console:
    ```bash
    sudo apt-get update && sudo apt-get install -y libgtk-3-0 libdbus-glib-1-2 libxt6 libx11-xcb1 libxcomposite1 libasound2 libpangocairo-1.0-0 libatk1.0-0 libcaca0
    ```

---

## Installation & Setup

1.  **Install project dependencies**:
    ```bash
    npm install
    ```

2.  **Download the patched Firefox binary**:
    Run the download script in WSL to fetch and unpack the custom `invisible_firefox` binary for Linux:
    ```bash
    bash download-browser.sh
    ```
    This downloads the browser and places it inside a `./bin/` folder.

3.  **Configure environment variables**:
    Rename or edit `.env` if you wish to change timezone or headless modes:
    ```ini
    STEALTH_TIMEZONE=America/New_York
    STEALTH_SEED=42
    HEADLESS=true
    ```

---

## Usage

### 1. Manual Login (First Time Only)

To store your session cookies and authentication tokens:
```bash
npm run login
```
*   This will launch a visible Firefox window from WSL onto your Windows desktop.
*   Log into Creality Cloud manually (using email, phone, or third-party OAuth).
*   Solve any CAPTCHAs required.
*   Once successfully logged in, return to your terminal and press **Enter** to save the session and close the browser.

Your session is stored locally in the `./user_session` directory.

### 2. Daily Check-in

Run the check-in script:
```bash
npm run checkin
```
*   By default, this runs in **headless mode** (no browser window opens).
*   It navigates to `https://www.crealitycloud.com/check-in`, detects your login state using the saved session, and clicks the check-in button.
*   A confirmation screenshot is saved as `checkin-success.png` (or `checkin-failed.png` if it fails).

You can automate this script to run daily using **Cron** in WSL or **Windows Task Scheduler** calling WSL:
```bash
# Example cron entry to run daily at 8:00 AM (make sure Node/NVM PATH is fully resolved in cron)
0 8 * * * cd /mnt/c/Users/Andres/Repo/CCAgent && ~/.nvm/versions/node/v24.18.0/bin/node checkin.js >> checkin.log 2>&1
```

---

## Testing

You can run the unit and integration tests using Vitest:
```bash
npm test
```
