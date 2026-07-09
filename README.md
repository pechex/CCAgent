# Creality Cloud Daily Check-in Bot

This is a Node.js automation script designed to automatically perform the daily check-in on Creality Cloud to accumulate reward points.

To bypass anti-bot and fingerprinting systems (like Cloudflare/DataDome), it utilizes a patched version of Firefox from the [invisible_playwright](https://github.com/feder-cr/invisible_playwright) project.

---

## 🚀 Recommended Setup: Docker (Zero manual dependencies)

This method packages all system dependencies and the custom browser automatically. It is ideal for running in the background, VPS, NAS, or personal servers.

### Prerequisites
- **Docker** and **Docker Desktop** installed (if on Windows, with WSL integration enabled).

### Run Options

You can run the Docker container in two ways:

#### Option A: Cloning the Repository (For development or local building)
If you clone this repository, the [docker-compose.yml](file:///c:/Users/Andres/Repo/CCAgent/docker-compose.yml) file uses the `build: .` directive to compile the container locally with your code.

#### Option B: Using the Published Image (Without cloning the repository)
If you want to spin it up on a remote server or NAS in 10 seconds without downloading the code, you only need to create a `docker-compose.yml` file with this content and run the same commands:
```yaml
version: '3.8'
services:
  cc-checkin:
    image: pechex/cc-checkin:latest
    container_name: cc-checkin
    ports:
      - "8080:8080"
    environment:
      - HEADLESS=true
      - STEALTH_TIMEZONE=America/Argentina/Buenos_Aires
      - STEALTH_SEED=42
    volumes:
      - ./user_session:/app/user_session
    stdin_open: true
    tty: true
```

---

### Usage Steps (Applies to both options)

#### 1. Initial Login Session Setup (Save Session)
Since manual CAPTCHA solving and initial login are required the first time:

1. Run the container interactively while mapping the ports for noVNC:
   ```bash
   docker compose run --rm -it --service-ports cc-checkin npm run login
   ```
2. Open your web browser on the host machine and go to: **`http://localhost:8080`**
3. Click **Connect** on the noVNC interface. You will see the Firefox browser running inside the container.
4. Log into Creality Cloud manually.
5. Return to your terminal and press **ENTER**. The login session cookies will be saved locally and persistently in the `./user_session` folder.

#### 2. Run Daily Check-in
Once the session is saved, you can run the daily check-in in the background:
```bash
docker compose run --rm cc-checkin
```
*(Optional: For optimal resource usage, make sure `HEADLESS=true` is set in your [docker-compose.yml](file:///c:/Users/Andres/Repo/CCAgent/docker-compose.yml) so the browser runs completely hidden and fast).*

#### 3. Automation with Cron
You can automate the check-in on your server or host system by adding a cron job (`crontab -e`):
```bash
# Example: Run every day at 8:00 AM
0 8 * * * cd /path/to/CCAgent && /usr/bin/docker compose run --rm cc-checkin >> checkin.log 2>&1
```

---

## 🛠️ Alternative Setup: Manual Installation (WSL)

If you prefer to develop locally or not use Docker, you can run the application directly within your WSL environment.

### Prerequisites
1. **Node.js**: Installed in your WSL environment (preferably via NVM).
2. **WSL GUI (WSLg)**: Required to render the interactive browser window on the first login.
3. **System Dependencies**: Run inside your WSL console:
   ```bash
   sudo apt-get update && sudo apt-get install -y libgtk-3-0 libdbus-glib-1-2 libxt6 libx11-xcb1 libxcomposite1 libasound2 libpangocairo-1.0-0 libatk1.0-0 libcaca0
   ```

### Setup & Installation
1. Install Node.js dependencies:
   ```bash
   npm install
   ```
2. Download the custom stealth Firefox browser:
   ```bash
   bash download-browser.sh
   ```
3. Create a `.env` file to configure your timezone and headless mode:
   ```ini
   STEALTH_TIMEZONE=America/Argentina/Buenos_Aires
   STEALTH_SEED=42
   HEADLESS=false # false for login, true for daily check-in
   ```

### Local Usage
- **Manual Login:** `npm run login` (opens the browser window via WSLg, log in, and press ENTER in the terminal).
- **Daily Check-in:** `npm run checkin`.

---

## 🔔 Notifications (Apprise)

The bot supports sending daily status notifications (including check-in points and raffle prizes won) using [Apprise](https://github.com/caronc/apprise).

### 1. Enabling Notifications
To enable notifications, define the `APPRISE_URL` environment variable in your `.env` file (for local runs) or under the `environment` section in your `docker-compose.yml` (for Docker runs):

```ini
# Example for .env
APPRISE_URL=tgram://bottoken/chatid
```

Multiple notification services can be configured by separating their URLs with a comma:
```ini
APPRISE_URL=tgram://bottoken/chatid, whatsapp://token@from_phone_id/to_phone_no
```

---

### 2. Service Configurations

#### ✈️ Telegram Configuration
To send notifications to a Telegram chat, use the following URL format:
```text
tgram://{bot_token}/{chat_id}
```
- **`{bot_token}`**: The token you get from Telegram's BotFather when creating your bot (e.g., `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`).
- **`{chat_id}`**: The numeric chat ID of the user, group, or channel where the bot should send notifications (e.g., `987654321`).

**Steps to set up Telegram:**
1. Chat with `@BotFather` on Telegram and create a new bot using `/newbot` to receive your `{bot_token}`.
2. Start a chat with your newly created bot, or add it to a group.
3. Obtain your `{chat_id}` by sending a message to the bot and checking `https://api.telegram.org/bot{bot_token}/getUpdates` or by using a bot like `@userinfobot`.

---

#### 💬 WhatsApp Configuration
Apprise supports WhatsApp notifications via two main channels:

##### Option A: Meta WhatsApp Business Cloud API (Official)
Use this option if you have a developer/business account set up directly with Meta.
```text
whatsapp://{token}@{from_phone_id}/{to_phone_no}
```
- **`{token}`**: Your Meta WhatsApp Business API access token.
- **`{from_phone_id}`**: The Phone Number ID provided in your Meta Developer App dashboard.
- **`{to_phone_no}`**: The destination phone number (including country code, e.g., `15551234567`).

##### Option B: Twilio Gateway for WhatsApp
Use this option if you want to route messages through your Twilio account.
```text
twilio://{AccountSID}:{AuthToken}@{FromPhoneNo}/w:{ToPhoneNo}
```
- **`AccountSID`**: Your Twilio Account SID.
- **`AuthToken`**: Your Twilio Auth Token.
- **`FromPhoneNo`**: The Twilio phone number configured for WhatsApp.
- **`w:{ToPhoneNo}`**: The destination phone number prefixed with `w:` to specify WhatsApp delivery (e.g., `w:15551234567`).

---

## 🧪 Unit Testing
You can run the integration and unit tests using Vitest either via Docker or locally:

**With Docker:**
```bash
docker compose run --rm cc-checkin npm test
```

**Locally:**
```bash
npm test
```
