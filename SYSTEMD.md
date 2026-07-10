# Systemd Automation Setup

This document explains how to configure the Creality Cloud Agent (`CCAgent`) to run automatically every day at a randomized time within a specific time window using **systemd** on Linux.

This is recommended to avoid fixed execution patterns that might trigger bot detection mechanisms.

---

## Systemd Components

You need to create two files under `/etc/systemd/system/` on your Linux server.

### 1. The Service File (`cc-checkin.service`)

This file defines the task to be executed and the working directory of the project. Choose one of the following options based on your setup:

#### Option A: Using Docker Compose (Recommended)
Create `/etc/systemd/system/cc-checkin.service`:

```ini
[Unit]
Description=Creality Cloud Agent Daily Check-in (Docker Compose)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
# Replace /path/to/your/CCAgent with the actual absolute path of the cloned repository
WorkingDirectory=/path/to/your/CCAgent
ExecStart=/usr/bin/docker compose run --rm cc-checkin
StandardOutput=journal
StandardError=journal
```

#### Option B: Using Native Node.js (Manual Setup)
Create `/etc/systemd/system/cc-checkin.service`:

```ini
[Unit]
Description=Creality Cloud Agent Daily Check-in (Node.js)
After=network.target

[Service]
Type=oneshot
# Replace /path/to/your/CCAgent with the actual absolute path of the cloned repository
WorkingDirectory=/path/to/your/CCAgent
ExecStart=/usr/bin/npm run checkin
StandardOutput=journal
StandardError=journal
```

---

### 2. The Timer File (`cc-checkin.timer`)

This file manages the daily trigger of the service with a randomized delay.

Create `/etc/systemd/system/cc-checkin.timer`:

```ini
[Unit]
Description=Daily Timer for Creality Cloud Agent with Randomized Schedule

[Timer]
# The start of the time window (e.g., every day at 9:00:00 AM)
OnCalendar=*-*-* 09:00:00

# The size of the randomized delay window. 
# With OnCalendar at 09:00:00 and a 6-hour (6h) delay, 
# the bot will run at a random time between 09:00:00 and 15:00:00.
RandomizedDelaySec=6h

# Run the task immediately if the system was powered off during the scheduled time
Persistent=true

# Link this timer to the service defined above
Unit=cc-checkin.service

[Install]
WantedBy=timers.target
```

---

## Installation and Commands

Once you have created both files in `/etc/systemd/system/`, run the following commands in your server's terminal:

1. **Reload systemd** to apply the new configuration:
   ```bash
   sudo systemctl daemon-reload
   ```

2. **Enable and start** the timer:
   ```bash
   sudo systemctl enable --now cc-checkin.timer
   ```

3. **Verify the status** and check the next scheduled run time:
   ```bash
   systemctl status cc-checkin.timer
   ```

4. **View logs** for past service executions:
   ```bash
   journalctl -u cc-checkin.service
   ```
