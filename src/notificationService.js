import { spawn } from 'child_process';

/**
 * Send a notification using the Apprise CLI
 * @param {string} title The title of the notification
 * @param {string} body The body content of the notification
 * @returns {Promise<boolean>} Resolves to true if successful, false otherwise
 */
export function sendNotification(title, body) {
  return new Promise((resolve) => {
    const appriseUrl = process.env.APPRISE_URL;
    if (!appriseUrl) {
      console.log('\n[Notification] APPRISE_URL environment variable is not configured. Skipping notification.');
      return resolve(false);
    }

    // Support comma-separated URLs
    const urls = appriseUrl
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean);

    if (urls.length === 0) {
      console.log('\n[Notification] No valid Apprise URLs found in APPRISE_URL. Skipping notification.');
      return resolve(false);
    }

    console.log(`\n[Notification] Sending notification via Apprise to ${urls.length} target(s)...`);

    const args = ['-t', title, '-b', body, ...urls];
    const child = spawn('apprise', args);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log('[Notification] Sent successfully.');
        resolve(true);
      } else {
        console.error(`[Notification] Failed with exit code ${code}.`);
        if (stdout) console.log(`[Notification] stdout: ${stdout.trim()}`);
        if (stderr) console.error(`[Notification] stderr: ${stderr.trim()}`);
        resolve(false);
      }
    });
  });
}
