import { spawn } from 'child_process';

/**
 * Send a notification using the Apprise CLI
 * @param {string} title The title of the notification
 * @param {string} body The body content of the notification
 * @param {string|string[]} [attachments] Optional path(s) to files to attach
 * @returns {Promise<boolean>} Resolves to true if successful, false otherwise
 */
export function sendNotification(title, body, attachments = []) {
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

    let hasResolved = false;
    const safeResolve = (value) => {
      if (!hasResolved) {
        hasResolved = true;
        resolve(value);
      }
    };

    const args = ['-t', title, '-b', body];

    // Support single attachment string or array of attachment strings
    const attachmentList = Array.isArray(attachments) ? attachments : [attachments];
    for (const attachment of attachmentList) {
      if (attachment) {
        args.push('-a', attachment);
      }
    }

    args.push(...urls);
    const child = spawn('apprise', args);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      console.error('[Notification] Failed to spawn Apprise process:', err.message || err);
      safeResolve(false);
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log('[Notification] Sent successfully.');
        safeResolve(true);
      } else {
        console.error(`[Notification] Failed with exit code ${code}.`);
        if (stdout) console.log(`[Notification] stdout: ${stdout.trim()}`);
        if (stderr) console.error(`[Notification] stderr: ${stderr.trim()}`);
        safeResolve(false);
      }
    });
  });
}
