import { launchBrowser, executeCheckin, executeRaffle } from './src/checkinService.js';
import { sendNotification } from './src/notificationService.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

async function main() {
  console.log('=====================================================');
  console.log('      Creality Cloud Daily Check-in Automation       ');
  console.log('=====================================================');
  
  const headless = process.env.HEADLESS !== 'false';
  
  let notificationTitle = 'Creality Cloud Check-in Status: ❌ FAILED';
  let notificationBody = '';
  let exitCode = 0;
  const attachments = [];
  
  let browserInfo;
  try {
    browserInfo = await launchBrowser(headless);
    const { page } = browserInfo;

    const checkinResult = await executeCheckin(page);
    
    console.log('\nResult of Check-in:');
    if (checkinResult.success) {
      console.log(`✅ SUCCESS: ${checkinResult.message}`);
      
      // Run the check-in raffle draw automation
      const raffleResult = await executeRaffle(page);
      console.log('\nResult of Raffle Draws:');
      if (raffleResult.success) {
        console.log(`✅ SUCCESS: ${raffleResult.message}`);
        if (raffleResult.prizes.length > 0) {
          console.log('Prizes won:');
          raffleResult.prizes.forEach((prize, idx) => console.log(`  - Draw #${idx + 1}: ${prize}`));
        }
        notificationTitle = 'Creality Cloud Check-in Status: ✅ SUCCESS';
      } else {
        console.log(`❌ FAILED: ${raffleResult.message}`);
        exitCode = 1;
        notificationTitle = 'Creality Cloud Check-in Status: ⚠️ WARNING (Raffle Failed)';
      }

      // Collect error screenshots from raffle if any
      if (raffleResult.errorScreenshots && raffleResult.errorScreenshots.length > 0) {
        attachments.push(...raffleResult.errorScreenshots);
      }

      // Format notification
      notificationBody = `Check-in: ${checkinResult.message}\n`;
      notificationBody += `\nRaffle: ${raffleResult.message}`;
      if (raffleResult.prizes.length > 0) {
        notificationBody += `\n\nPrizes won:\n` + raffleResult.prizes.map((prize, idx) => `  - Draw #${idx + 1}: ${prize}`).join('\n');
      }
    } else {
      console.log(`❌ FAILED: ${checkinResult.message}`);
      exitCode = 1;
      notificationTitle = 'Creality Cloud Check-in Status: ❌ FAILED';
      notificationBody = `Check-in Failed: ${checkinResult.message}`;
      
      if (checkinResult.screenshotPath) {
        attachments.push(checkinResult.screenshotPath);
      }
    }

  } catch (error) {
    console.error('\n💥 Unexpected error during check-in script execution:', error);
    exitCode = 1;
    notificationTitle = 'Creality Cloud Check-in Status: 💥 ERROR';
    notificationBody = `An unexpected error occurred during execution:\n${error.message || error}`;

    // Try to capture screen on unexpected crash
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
    if (notificationBody) {
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
