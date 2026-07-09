import path from 'path';
import fs from 'fs';
import { firefox } from 'playwright-core';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Resolved paths relative to project root
const USER_SESSION_DIR = path.join(PROJECT_ROOT, 'user_session');
const FIREFOX_BIN_PATH = path.join(PROJECT_ROOT, 'bin/firefox');

/**
 * Get the path to the custom Firefox binary
 * @returns {string}
 */
export function getBrowserPath() {
  return FIREFOX_BIN_PATH;
}

/**
 * Launch the custom Firefox browser with a persistent context.
 * @param {boolean} headless Whether to run in headless mode.
 * @returns {Promise<{context: import('playwright-core').BrowserContext, page: import('playwright-core').Page}>}
 */
export async function launchBrowser(headless = true) {
  const binaryPath = getBrowserPath();
  
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`Custom Firefox binary not found at: ${binaryPath}. Please run download-browser.sh first.`);
  }

  const headlessValue = headless ? 'true' : false;

  console.log(`Launching Invisible Firefox (headless: ${headless})...`);
  
  const context = await firefox.launchPersistentContext(USER_SESSION_DIR, {
    executablePath: binaryPath,
    headless: headlessValue === 'true',
    viewport: null,
    // Env vars required by invisible_playwright
    env: {
      ...process.env,
      STEALTHFOX_SEED: process.env.STEALTH_SEED || '42',
      STEALTHFOX_TIMEZONE: process.env.STEALTH_TIMEZONE || 'America/New_York',
      MOZ_DISABLE_CONTENT_SANDBOX: '1'
    }
  });

  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  return { context, page };
}

/**
 * Check if the user is currently logged in on the page.
 * @param {import('playwright-core').Page} page 
 * @returns {Promise<boolean>}
 */
export async function isLoggedIn(page) {
  // Check if a login indicator or button is visible
  const loginButton = page.locator('span:has-text("Log In"), button:has-text("Log In"), a:has-text("Log In")');
  
  try {
    // Wait briefly to see if login button is visible
    const visible = await loginButton.first().isVisible({ timeout: 5000 });
    return !visible;
  } catch (error) {
    // If we timeout or fail to find it, assume we might be logged in
    return true;
  }
}

/**
 * Execute the check-in process.
 * @param {import('playwright-core').Page} page 
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function executeCheckin(page) {
  const url = 'https://www.crealitycloud.com/check-in';
  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // Verify login status
  const loggedIn = await isLoggedIn(page);
  if (!loggedIn) {
    return {
      success: false,
      message: 'User is not logged in. Please run npm run login first to log in manually.'
    };
  }

  console.log('User is logged in. Searching for check-in elements...');

  // Wait for the iframe container if it exists (Creality Cloud renders content inside an iframe-box)
  const iframeLocator = page.locator('iframe.iframe-box');
  const iframeExists = await iframeLocator.count() > 0;
  
  const container = iframeExists ? page.frameLocator('iframe.iframe-box') : page;
  
  // Wait briefly for elements to load inside the container
  await page.waitForTimeout(3000);

  // Look for elements that contain "check", "fichar", or "registrar" inside the container
  const checkinLocator = container.locator('.sign-in-btn, button, [role="button"], a').filter({
    hasText: /check|fichar|registrar/i
  });

  const count = await checkinLocator.count();

  for (let i = 0; i < count; i++) {
    const element = checkinLocator.nth(i);
    const text = (await element.textContent() || '').trim();
    const isVisible = await element.isVisible();
    
    // Ignore massive texts from container elements
    if (isVisible && text && text.length < 100) {
      // If we are already checked in
      if (/Checked/i.test(text)) {
        // Take a screenshot of the checked-in state for confirmation
        const screenshotPath = path.join(PROJECT_ROOT, 'checkin-success.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`Screenshot saved to ${screenshotPath}`);

        return {
          success: true,
          message: `Already checked in today! (Found: "${text}")`
        };
      }
      
      // If we need to check in (match "check in", "check-in", "checkin", "fichar")
      if (/Check[ -]*in/i.test(text) || /Fichar/i.test(text)) {
        console.log(`Clicking check-in button: "${text}"...`);
        
        // Ensure element is scrolled into view (particularly inside scrollable iframes)
        await element.scrollIntoViewIfNeeded().catch(() => {});
        
        try {
          await element.click({ force: true, timeout: 5000 });
        } catch (clickErr) {
          const cleanErr = (clickErr.message || '').split('\n')[0];
          console.log(`Playwright click failed: ${cleanErr}. Retrying via DOM click...`);
          await element.evaluate(node => node.click());
        }
        
        // Wait for potential modal or confirmation to show up
        await page.waitForTimeout(5000);
        
        // Look for point indicators or popups (e.g. "Congratulations! x100 Done")
        let rewardText = '';
        try {
          // 1. Look for Congratulations modal text
          const modalLocator = container.locator('div, span, p').filter({
            hasText: /congratulations/i
          });
          const mCount = await modalLocator.count();
          for (let j = 0; j < mCount; j++) {
            const mEl = modalLocator.nth(j);
            const mText = (await mEl.textContent() || '').trim();
            const mVisible = await mEl.isVisible();
            if (mVisible && mText && mText.length < 200) {
              // Clean up extra whitespaces/newlines for a readable single line
              rewardText = mText.replace(/\s+/g, ' ');
              break;
            }
          }
          
          // 2. Fallback: Search for point badges like "x100"
          if (!rewardText) {
            const pointsLocator = container.locator('div, span, p').filter({
              hasText: /x\s*\d+/i
            });
            const pCount = await pointsLocator.count();
            for (let j = 0; j < pCount; j++) {
              const pEl = pointsLocator.nth(j);
              const pText = (await pEl.textContent() || '').trim();
              const pVisible = await pEl.isVisible();
              if (pVisible && pText && pText.length < 15 && /^x\s*\d+$/i.test(pText)) {
                rewardText = pText;
                break;
              }
            }
          }
        } catch (err) {
          console.log('Error scanning for reward details:', err.message);
        }
        
        // Take a screenshot after clicking
        const screenshotPath = path.join(PROJECT_ROOT, 'checkin-success.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`Screenshot saved to ${screenshotPath}`);

        const rewardMsg = rewardText ? ` (Obtained: "${rewardText}")` : '';
        return {
          success: true,
          message: `Successfully clicked check-in button: "${text}"${rewardMsg}`
        };
      }
    }
  }

  // Fallback: Check if the text "Checked" is present inside the container
  let containerText = '';
  try {
    containerText = await (iframeExists ? page.frameLocator('iframe.iframe-box').locator('body').innerText() : page.innerText('body'));
  } catch (err) {}

  if (/Checked/i.test(containerText)) {
    const screenshotPath = path.join(PROJECT_ROOT, 'checkin-success.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved to ${screenshotPath}`);

    return {
      success: true,
      message: 'Already checked in today! (Found "Checked" status on the page)'
    };
  }

  // Save screenshot of current state for troubleshooting
  const screenshotPath = path.join(PROJECT_ROOT, 'checkin-failed.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Troubleshooting screenshot saved to ${screenshotPath}`);

  return {
    success: false,
    message: 'Could not find any visible check-in button or "Checked" status on the page. Screenshot saved for review.'
  };
}

/**
 * Execute the check-in raffle draws if any tickets are available.
 * @param {import('playwright-core').Page} page 
 * @returns {Promise<{success: boolean, message: string, prizes: string[]}>}
 */
export async function executeRaffle(page) {
  const url = 'https://share.crealitycloud.com/boost-sign-in?activeChannel=6';
  console.log(`\nNavigating to raffle page: ${url}...`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // 1. Wait a moment for page load
  await page.waitForTimeout(5000);

  // 2. Handle the "Select Account" authorization screen if present
  const hasSelectAccount = await page.locator('text=Select Account').count() > 0;
  if (hasSelectAccount) {
    console.log('Authorization screen detected. Clicking "Continue"...');
    const continueBtn = page.locator('button.cus-button.primary.success');
    if (await continueBtn.count() > 0) {
      await continueBtn.click();
      console.log('Waiting for redirect...');
      await page.waitForTimeout(8000);
    }
  }

  // 3. Read the number of remaining draws
  const numLocator = page.locator('.lucky-draw-left .num');
  if (await numLocator.count() === 0) {
    // If we can't find the lucky draw indicator, maybe we didn't redirect successfully
    const bodyText = await page.innerText('body').catch(() => '');
    if (bodyText.includes('Select Account') || bodyText.includes('Continue share.crealitycloud.com')) {
      return {
        success: false,
        message: 'Could not bypass the authorization screen.',
        prizes: []
      };
    }
    return {
      success: false,
      message: 'Could not load the raffle page grid (draw counter not found).',
      prizes: []
    };
  }

  let drawsLeftText = await numLocator.innerText();
  let drawsLeft = parseInt(drawsLeftText.trim(), 10) || 0;
  console.log(`Raffle tickets left: ${drawsLeft}`);

  if (drawsLeft <= 0) {
    return {
      success: true,
      message: 'No raffle tickets available to draw today.',
      prizes: []
    };
  }

  const prizes = [];
  let attempts = 0;
  const maxAttempts = 10; // safety ceiling

  while (drawsLeft > 0 && attempts < maxAttempts) {
    attempts++;
    console.log(`\nStarting draw attempt #${attempts} (tickets remaining: ${drawsLeft})...`);

    const startBtn = page.locator('.start-btn');
    if (await startBtn.count() === 0) {
      console.log('Error: Start button not found on the page.');
      break;
    }

    // Click Start button
    await startBtn.click();

    // Wait for the confirmation "Got it" button or modal to become visible
    console.log('Waiting for the prize modal to appear...');
    const gotItBtn = page.locator('button, div, span').filter({ hasText: /^Got it$/i }).first();
    
    try {
      // Give it up to 10 seconds for animation + network request + modal popup
      await gotItBtn.waitFor({ state: 'visible', timeout: 10000 });
    } catch (err) {
      console.log('Timeout waiting for the prize modal to appear.');
      const errScreenshotPath = path.join(PROJECT_ROOT, `raffle-draw-error-${attempts}.png`);
      await page.screenshot({ path: errScreenshotPath, fullPage: true });
      console.log(`Saved screenshot to ${errScreenshotPath}`);
      break;
    }

    // Extract the dialog text to find out what prize we won
    const dialogLocator = page.locator('.dtc-lottery_container');
    let prizeWon = 'Unknown Prize';
    if (await dialogLocator.count() > 0) {
      const rawText = await dialogLocator.innerText();
      const cleanText = rawText.replace(/\s+/g, ' ').trim();
      const match = cleanText.match(/Congratulations!\s*(.*?)\s*(?:has|have|is|are|been|added)/i);
      if (match && match[1]) {
        prizeWon = match[1].trim();
      } else {
        prizeWon = cleanText;
      }
    }
    console.log(`🎉 Draw #${attempts} Result: Won "${prizeWon}"`);
    prizes.push(prizeWon);

    // Save screenshot of the win
    const winScreenshotPath = path.join(PROJECT_ROOT, `raffle-win-${attempts}.png`);
    await page.screenshot({ path: winScreenshotPath });
    console.log(`Win screenshot saved to ${winScreenshotPath}`);

    // Click the "Got it" button to close the dialog
    console.log('Dismissing the prize dialog...');
    await gotItBtn.click();

    // Wait 2 seconds for modal to fade/close and tickets count to update
    await page.waitForTimeout(2000);

    // Refresh tickets count
    drawsLeftText = await numLocator.innerText();
    drawsLeft = parseInt(drawsLeftText.trim(), 10) || 0;
  }

  return {
    success: true,
    message: `Completed ${prizes.length} draw(s) successfully.`,
    prizes
  };
}

