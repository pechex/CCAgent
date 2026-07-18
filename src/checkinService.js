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
  // Wait for the page to be somewhat loaded/settled
  await page.waitForTimeout(3000);

  const url = typeof page.url === 'function' ? page.url() : '';
  const title = typeof page.title === 'function' ? await page.title().catch(() => '') : '';
  
  if (url || title) {
    console.log(`[Diagnostic] Current URL: ${url}`);
    console.log(`[Diagnostic] Current Title: "${title}"`);
  }

  // Detect Cloudflare / Bot detection pages
  if (title.includes('Cloudflare') || title.includes('Just a moment') || url.includes('cloudflare') || url.includes('datadome')) {
    console.log('⚠️ [Diagnostic] Bot detection page detected (Cloudflare/DataDome)! The browser is being blocked.');
  }

  // Check if a login indicator or button is visible
  const loginButton = page.locator('span:has-text("Log In"), button:has-text("Log In"), a:has-text("Log In")');
  
  try {
    const visible = await loginButton.first().isVisible();
    if (visible) {
      return false;
    }
  } catch (error) {
    console.log('[Diagnostic] Error checking login button:', error.message);
  }

  // Double check: if we are logged in, we should see some user element,
  // or at least not be on an empty/error page.
  let loggedInVisible = false;
  try {
    const loggedInIndicator = page.locator('img[src*="avatar"], .avatar, .user-avatar, .user-info, text=Workbench, text=Daily Check-in').first();
    loggedInVisible = await loggedInIndicator.isVisible();
  } catch (err) {}

  if (loggedInVisible) {
    return true;
  }

  // Fallback: If we are on the check-in page and neither is explicitly visible,
  // let's assume logged in so we can try to look for the check-in button.
  if (title.includes('Check-in') || title.includes('Daily') || url.includes('check-in')) {
    return true;
  }

  return false;
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
        const screenshotPath = path.join(USER_SESSION_DIR, 'checkin-success.png');
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
        const screenshotPath = path.join(USER_SESSION_DIR, 'checkin-success.png');
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
    const screenshotPath = path.join(USER_SESSION_DIR, 'checkin-success.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved to ${screenshotPath}`);

    return {
      success: true,
      message: 'Already checked in today! (Found "Checked" status on the page)'
    };
  }

  // Save screenshot of current state for troubleshooting
  const screenshotPath = path.join(USER_SESSION_DIR, 'checkin-failed.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Troubleshooting screenshot saved to ${screenshotPath}`);

  return {
    success: false,
    message: 'Could not find any visible check-in button or "Checked" status on the page. Screenshot saved for review.',
    screenshotPath: screenshotPath
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

  const errorScreenshots = [];

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
    const screenshotPath = path.join(USER_SESSION_DIR, 'raffle-load-failed.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Saved screenshot to ${screenshotPath}`);
    errorScreenshots.push(screenshotPath);

    if (bodyText.includes('Select Account') || bodyText.includes('Continue share.crealitycloud.com')) {
      return {
        success: false,
        message: 'Could not bypass the authorization screen.',
        prizes: [],
        errorScreenshots
      };
    }
    return {
      success: false,
      message: 'Could not load the raffle page grid (draw counter not found).',
      prizes: [],
      errorScreenshots
    };
  }

  let drawsLeftText = await numLocator.innerText();
  let drawsLeft = parseInt(drawsLeftText.trim(), 10) || 0;
  console.log(`Raffle tickets left: ${drawsLeft}`);

  if (drawsLeft <= 0) {
    return {
      success: true,
      message: 'No raffle tickets available to draw today.',
      prizes: [],
      errorScreenshots
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

    const prevCount = drawsLeft;

    // Click Start button
    await startBtn.click();

    // Wait for the confirmation "Got it" button or modal to become visible
    console.log('Waiting for the prize modal to appear...');
    
    // Locate the active visible dialog wrapper (Element UI modal uses .el-dialog__wrapper or role="dialog")
    const activeDialog = page.locator('.boost-win_dialog, .el-dialog__wrapper, [role="dialog"]').filter({ visible: true }).first();
    
    let dialogAppeared = true;
    try {
      // Wait for the dialog itself to become visible (5 seconds is plenty for the spin animation to complete)
      await activeDialog.waitFor({ state: 'visible', timeout: 5000 });
    } catch (err) {
      dialogAppeared = false;
      console.log('No prize modal appeared within 5 seconds.');
    }

    if (dialogAppeared) {
      // Extract the dialog text to find out what prize we won
      let prizeWon = 'Unknown Prize';
      if (await activeDialog.count() > 0) {
        // 1. Try to find specific prize selectors within the active dialog
        const prizeNameSelectors = ['.win-content', '.info-content', '.win-prize-name', '.prize-name', '.prize-title'];
        let prizeText = '';
        for (const selector of prizeNameSelectors) {
          const el = activeDialog.locator(selector);
          if (await el.count() > 0 && await el.isVisible()) {
            prizeText = (await el.innerText()).trim();
            if (prizeText) break;
          }
        }

        // 2. Fallback to using regex matching on the overall dialog text
        if (!prizeText) {
          const rawText = await activeDialog.innerText();
          const cleanText = rawText.replace(/\s+/g, ' ').trim();
          const match = cleanText.match(/(?:Congratulations|Felicidades)!\s*(.*?)\s*(?:has|have|is|are|been|added|se\s+ha|se\s+han)/i);
          if (match && match[1]) {
            prizeText = match[1].trim();
          } else {
            prizeText = cleanText;
          }
        }

        if (prizeText) {
          prizeWon = prizeText;
        }
      }
      console.log(`🎉 Draw #${attempts} Result: Won "${prizeWon}"`);
      prizes.push(prizeWon);

      // Save screenshot of the win
      const winScreenshotPath = path.join(USER_SESSION_DIR, `raffle-win-${attempts}.png`);
      await page.screenshot({ path: winScreenshotPath });
      console.log(`Win screenshot saved to ${winScreenshotPath}`);

      // Dismiss the prize dialog
      console.log('Dismissing the prize dialog...');
      let clickedClose = false;

      // Try finding the button with Got it / Entendido / Close text first
      // Use strict/exact text boundary matches first to avoid parent element matching
      let gotItBtn = activeDialog.locator('button, [role="button"], .cus-button, .el-button, span, div, a')
        .filter({ hasText: /^\s*(Got\s*it|Entendido|Aceptar|Close|Confirm|OK|Ok)\s*$/i })
        .first();

      if (await gotItBtn.count() === 0) {
        // Fallback 1a: search for elements with partial text match, selecting the last (deepest) match
        gotItBtn = activeDialog.locator('button, [role="button"], .cus-button, .el-button, span, div, a')
          .filter({ hasText: /Got\s*it|Entendido|Aceptar|Close|Confirm/i })
          .last();
      }

      if (await gotItBtn.count() === 0) {
        // Fallback 1b: search globally on the page for exact text
        gotItBtn = page.locator('button, [role="button"], .cus-button, .el-button, span, div, a')
          .filter({ hasText: /^\s*(Got\s*it|Entendido|Aceptar|Close|Confirm|OK|Ok)\s*$/i })
          .first();
      }

      if (await gotItBtn.count() > 0) {
        try {
          console.log('Found dismissal button. Attempting to click...');
          await gotItBtn.click({ timeout: 5000 });
          clickedClose = true;
        } catch (clickErr) {
          console.log(`Failed to click dismissal button: ${clickErr.message}`);
        }
      }

      // Fallback 2: Try alternative close selectors (like cross icon/header close button)
      if (!clickedClose) {
        const alternativeCloseSelectors = [
          '.el-dialog__headerbtn',
          '.el-dialog__close',
          '.close-btn',
          '.close-icon',
          '[aria-label="Close"]',
          'button, [role="button"]'
        ];
        for (const sel of alternativeCloseSelectors) {
          let closeEl = activeDialog.locator(sel).first();
          if (await closeEl.count() === 0) {
            closeEl = page.locator(sel).first();
          }
          if (await closeEl.count() > 0 && await closeEl.isVisible()) {
            console.log(`Clicking alternative close element: ${sel}...`);
            try {
              await closeEl.click({ timeout: 5000 });
              clickedClose = true;
              break;
            } catch (err) {
              console.log(`Failed to click alternative close element ${sel}: ${err.message}`);
            }
          }
        }
      }

      // Fallback 3: Try to click the backdrop of the dialog (Element UI close-on-click-modal)
      if (!clickedClose) {
        console.log('Trying to click active dialog backdrop...');
        try {
          await activeDialog.click({ position: { x: 10, y: 10 }, timeout: 3000 });
          clickedClose = true;
        } catch (clickErr) {
          console.log('Failed to click dialog backdrop:', clickErr.message);
        }
      }

      // Fallback 4: Press Escape
      if (!clickedClose) {
        console.log('Could not find standard close button inside dialog, pressing Escape...');
        await page.keyboard.press('Escape');
      }

      // Wait for the dialog to be hidden/closed fully
      try {
        await activeDialog.waitFor({ state: 'hidden', timeout: 5000 });
        console.log('Prize dialog dismissed successfully.');
      } catch (err) {
        console.log('Warning: Dialog did not hide after click. Trying escape key as backup...');
        await page.keyboard.press('Escape');
        try {
          await activeDialog.waitFor({ state: 'hidden', timeout: 3000 });
          console.log('Prize dialog dismissed after backup escape key.');
        } catch (escapeErr) {
          console.log('Warning: Dialog is still visible. Proceeding anyway...');
        }
      }

      // Wait an additional 2 seconds for ticket count update
      await page.waitForTimeout(2000);

      // Refresh tickets count
      drawsLeftText = await numLocator.innerText();
      drawsLeft = parseInt(drawsLeftText.trim(), 10) || 0;
    } else {
      // No dialog appeared. Check if ticket count decreased (e.g. "Thanks / Unfortunately, you didn't win")
      await page.waitForTimeout(2000); // Wait for potential count update
      drawsLeftText = await numLocator.innerText();
      const currentDrawsLeft = parseInt(drawsLeftText.trim(), 10) || 0;

      if (currentDrawsLeft < prevCount) {
        console.log(`🎉 Draw #${attempts} Result: No prize ("Thanks" / "Unfortunately, you didn't win")`);
        prizes.push('Thanks / No Prize');
        drawsLeft = currentDrawsLeft;
      } else {
        console.log('Error: Ticket count did not decrease and no prize modal appeared.');
        const errScreenshotPath = path.join(USER_SESSION_DIR, `raffle-draw-error-${attempts}.png`);
        await page.screenshot({ path: errScreenshotPath, fullPage: true });
        console.log(`Saved screenshot to ${errScreenshotPath}`);
        errorScreenshots.push(errScreenshotPath);
        break;
      }
    }
  }

  return {
    success: true,
    message: `Completed ${prizes.length} draw(s) successfully.`,
    prizes,
    errorScreenshots
  };
}

