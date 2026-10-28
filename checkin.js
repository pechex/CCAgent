import {
  launchBrowser,
  executeCheckin,
  executeRaffle,
  executeDailyModelTasks,
  getLoggedInUserId
} from './src/checkinService.js';
import { sendNotification } from './src/notificationService.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

/**
 * Helper to check command line flags.
 * @param {string} flag
 * @returns {boolean}
 */
function hasArg(flag) {
  return process.argv.slice(2).some(arg => arg.toLowerCase() === flag.toLowerCase());
}

/**
 * Parse a boolean environment variable, defaulting to true if not set or empty.
 * Returns false ONLY if explicitly set to 'false' or '0'.
 * @param {string | undefined} val
 * @param {boolean} [defaultVal=true]
 * @returns {boolean}
 */
export function envBool(val, defaultVal = true) {
  if (val === undefined || val === null || String(val).trim() === '') {
    return defaultVal;
  }
  const lower = String(val).trim().toLowerCase();
  return lower !== 'false' && lower !== '0';
}

async function main() {
  console.log('=====================================================');
  console.log('    Creality Cloud Daily Automation & Points Tasks   ');
  console.log('=====================================================');

  const headless = process.env.HEADLESS !== 'false';

  // Check if any specific "--only-*" flag is passed
  const onlyDownloads = hasArg('--only-downloads');
  const onlyComments = hasArg('--only-comments');
  const onlyBoost = hasArg('--only-boost');
  const onlyCheckin = hasArg('--only-checkin');
  const onlyCollect = hasArg('--only-collection') || hasArg('--only-collect');
  const isExclusiveMode = onlyDownloads || onlyComments || onlyBoost || onlyCheckin || onlyCollect;

  // Configure tasks: missing environment variables ALWAYS default to true
  const enableCheckin = isExclusiveMode
    ? onlyCheckin
    : envBool(process.env.ENABLE_CHECKIN, true) && !hasArg('--skip-checkin');

  const enableRaffle = isExclusiveMode
    ? onlyCheckin
    : envBool(process.env.ENABLE_RAFFLE, true) && !hasArg('--skip-raffle');

  const enableDownloads = isExclusiveMode
    ? onlyDownloads
    : envBool(process.env.ENABLE_DOWNLOADS, true) && !hasArg('--skip-downloads');
  const downloadsCount = parseInt(process.env.DOWNLOADS_COUNT, 10) || 10;

  const enableImageComments = isExclusiveMode
    ? onlyComments
    : envBool(process.env.ENABLE_IMAGE_COMMENTS, true) && !hasArg('--skip-image-comments') && !hasArg('--skip-comments');
  const imageCommentsCount = parseInt(process.env.IMAGE_COMMENTS_COUNT, 10) || 5;

  const enableTextComment = isExclusiveMode
    ? onlyComments
    : envBool(process.env.ENABLE_TEXT_COMMENT, true) && !hasArg('--skip-text-comment') && !hasArg('--skip-comments');

  const enableBoost = isExclusiveMode
    ? onlyBoost
    : envBool(process.env.ENABLE_BOOST, true) && !hasArg('--skip-boost');

  const enableCollection = isExclusiveMode
    ? onlyCollect
    : envBool(process.env.ENABLE_COLLECTION, true) && !hasArg('--skip-collection');
  const collectionsCount = parseInt(process.env.COLLECTIONS_COUNT, 10) || 1;

  const configuredUserId = process.env.CREALITY_USER_ID;
  const configuredBoostUrl = process.env.CREALITY_BOOST_URL;

  console.log('Task Configuration:');
  console.log(`  - Check-in:          ${enableCheckin ? 'ENABLED' : 'DISABLED'}`);
  console.log(`  - Raffle Draws:      ${enableRaffle ? 'ENABLED' : 'DISABLED'}`);
  console.log(`  - Model Downloads:   ${enableDownloads ? `ENABLED (${downloadsCount} models)` : 'DISABLED'}`);
  console.log(`  - Image Comments:    ${enableImageComments ? `ENABLED (${imageCommentsCount} comments with 👍)` : 'DISABLED'}`);
  console.log(`  - Text Comment:      ${enableTextComment ? 'ENABLED (1 model)' : 'DISABLED'}`);
  console.log(`  - Auto Boost:        ${enableBoost ? `ENABLED (${configuredUserId ? `User: ${configuredUserId}` : 'Auto-detecting user ID'})` : 'DISABLED'}`);
  console.log(`  - Collection Models: ${enableCollection ? `ENABLED (${collectionsCount} models)` : 'DISABLED'}`);
  console.log('=====================================================');

  let notificationTitle = 'Creality Cloud Status: ❌ FAILED';
  const notificationSections = [];
  let exitCode = 0;
  let hasWarnings = false;
  let hasErrors = false;
  const attachments = [];

  let browserInfo;
  try {
    browserInfo = await launchBrowser(headless);
    const { page } = browserInfo;

    // 1. Daily Check-in
    if (enableCheckin) {
      console.log('\n--- Task 1: Daily Check-in ---');
      const checkinResult = await executeCheckin(page);
      console.log('\nResult of Check-in:');
      if (checkinResult.success) {
        console.log(`✅ SUCCESS: ${checkinResult.message}`);
        notificationSections.push(`📅 Check-in: ${checkinResult.message}`);
      } else {
        console.log(`❌ FAILED: ${checkinResult.message}`);
        hasErrors = true;
        notificationSections.push(`📅 Check-in: ❌ Failed (${checkinResult.message})`);
        if (checkinResult.screenshotPath) {
          attachments.push(checkinResult.screenshotPath);
        }
      }
    }

    // 2. Raffle Draws
    if (enableRaffle) {
      console.log('\n--- Task 2: Raffle Draws ---');
      const raffleResult = await executeRaffle(page);
      console.log('\nResult of Raffle Draws:');
      if (raffleResult.success) {
        console.log(`✅ SUCCESS: ${raffleResult.message}`);
        if (raffleResult.prizes.length > 0) {
          console.log('Prizes won:');
          raffleResult.prizes.forEach((prize, idx) => console.log(`  - Draw #${idx + 1}: ${prize}`));
        }
        let raffleMsg = `🎟️ Raffle: ${raffleResult.message}`;
        if (raffleResult.prizes.length > 0) {
          raffleMsg += `\n` + raffleResult.prizes.map((p, i) => `    • Draw #${i + 1}: ${p}`).join('\n');
        }
        notificationSections.push(raffleMsg);
      } else {
        console.log(`❌ FAILED: ${raffleResult.message}`);
        hasWarnings = true;
        notificationSections.push(`🎟️ Raffle: ⚠️ Failed (${raffleResult.message})`);
      }

      if (raffleResult.errorScreenshots && raffleResult.errorScreenshots.length > 0) {
        attachments.push(...raffleResult.errorScreenshots);
      }
    }

    // 3. Single-Pass Model Tasks: Downloads, Likes, Comments, Boost, and Collection
    const anyModelTaskEnabled = enableDownloads || enableImageComments || enableTextComment || enableBoost || enableCollection;
    if (anyModelTaskEnabled) {
      console.log('\n--- Task 3: Unified Model Processing (Downloads, Likes, Comments, Boost & Collection) ---');
      const detectedUserId = configuredUserId || (await getLoggedInUserId(page));
      const targetBoostUrl = configuredBoostUrl || (detectedUserId ? `https://www.crealitycloud.com/es/user/${detectedUserId}/boost` : undefined);

      const modelTasksResult = await executeDailyModelTasks(page, {
        enableDownloads,
        downloadsCount,
        enableImageComments,
        imageCommentsCount,
        enableTextComment,
        textCommentsCount: 1,
        enableBoost,
        enableCollection,
        collectionsCount,
        userId: detectedUserId,
        boostUrl: targetBoostUrl
      });

      console.log('\nResult of Daily Model Tasks:');
      if (modelTasksResult.success) {
        console.log(`✅ SUCCESS: ${modelTasksResult.message}`);
      } else {
        console.log(`⚠️ WARNING: ${modelTasksResult.message}`);
        hasWarnings = true;
      }

      const q = modelTasksResult.quotas;
      if (enableDownloads) {
        notificationSections.push(`📥 Downloads & Likes: ${q.downloads.completed}/${q.downloads.target} models`);
      }
      if (enableImageComments) {
        notificationSections.push(`💬 Comments with Image: ${q.imageComments.completed}/${q.imageComments.target} comments (👍)`);
      }
      if (enableTextComment) {
        notificationSections.push(`✍️ Text Comment: ${q.textComments.completed}/${q.textComments.target} comment`);
      }
      if (enableBoost) {
        notificationSections.push(`🚀 Boost: ${q.boosts.completed}/${q.boosts.target} boosts granted`);
      }
      if (enableCollection && q.collections) {
        notificationSections.push(`⭐ Collection: ${q.collections.completed}/${q.collections.target} models`);
      }
    }

    // Determine final notification title and exit code
    if (hasErrors) {
      notificationTitle = 'Creality Cloud Status: ❌ FAILED';
      exitCode = 1;
    } else if (hasWarnings) {
      notificationTitle = 'Creality Cloud Status: ⚠️ WARNING (Some tasks had warnings)';
      exitCode = 0;
    } else {
      notificationTitle = 'Creality Cloud Status: ✅ SUCCESS';
      exitCode = 0;
    }

  } catch (error) {
    console.error('\n💥 Unexpected error during execution:', error);
    exitCode = 1;
    notificationTitle = 'Creality Cloud Status: 💥 ERROR';
    notificationSections.push(`An unexpected error occurred during execution:\n${error.message || error}`);

    if (browserInfo && browserInfo.page) {
      try {
        const unexpectedErrorPath = path.resolve('user_session', 'unexpected-error.png');
        await browserInfo.page.screenshot({ path: unexpectedErrorPath, fullPage: true });
        console.log(`Unexpected error screenshot saved to ${unexpectedErrorPath}`);
        attachments.push(unexpectedErrorPath);
      } catch (screenshotErr) {
        console.error('Failed to take screenshot on unexpected error:', screenshotErr.message);
      }
    }
  } finally {
    if (browserInfo && browserInfo.context) {
      console.log('\nClosing browser...');
      await browserInfo.context.close();
    }

    // Send notification before exiting
    if (notificationSections.length > 0) {
      const notificationBody = notificationSections.join('\n\n');
      try {
        await sendNotification(notificationTitle, notificationBody, attachments);
      } catch (notifyErr) {
        console.error('Error sending Apprise notification:', notifyErr);
      }
    }

    process.exit(exitCode);
  }
}

main();
