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

  // Clean up any stale lock files if browser crashed or was terminated
  try {
    const parentLock = path.join(USER_SESSION_DIR, '.parentlock');
    const lock = path.join(USER_SESSION_DIR, 'lock');
    if (fs.existsSync(parentLock)) fs.unlinkSync(parentLock);
    if (fs.existsSync(lock)) fs.unlinkSync(lock);
  } catch (e) {}

  console.log(`Launching Invisible Firefox (headless: ${headless})...`);
  
  const targetTz = process.env.STEALTH_TIMEZONE || process.env.TZ || 'America/Argentina/Buenos_Aires';
  if (!process.env.TZ) {
    process.env.TZ = targetTz;
  }

  const isHeadless = process.env.HEADLESS !== undefined ? process.env.HEADLESS === 'true' : headless;

  const context = await firefox.launchPersistentContext(USER_SESSION_DIR, {
    executablePath: binaryPath,
    headless: isHeadless,
    viewport: null,
    timezoneId: targetTz,
    // Env vars required by invisible_playwright
    env: {
      ...process.env,
      TZ: targetTz,
      STEALTHFOX_SEED: process.env.STEALTH_SEED || '42',
      STEALTHFOX_TIMEZONE: targetTz,
      MOZ_DISABLE_CONTENT_SANDBOX: '1'
    }
  });

  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  return { context, page };
}

/**
 * Check if the page is currently on the Account Selection authorization screen ("Seleccionar cuenta" / "Select Account").
 * @param {import('playwright-core').Page | import('playwright-core').Frame} page 
 * @returns {Promise<boolean>}
 */
export async function isAccountSelectionScreen(page) {
  try {
    const titleLocator = page.locator('text=/Seleccionar cuenta|Select Account/i');
    if (await titleLocator.count().catch(() => 0) > 0) {
      return true;
    }
    const continueDomainLocator = page.locator('text=/Continu(?:ar|e)\\s+(?:share\\.)?crealitycloud\\.com/i');
    if (await continueDomainLocator.count().catch(() => 0) > 0) {
      return true;
    }
    if (await page.locator('text=Select Account').count().catch(() => 0) > 0) {
      return true;
    }
  } catch (err) {}
  return false;
}

/**
 * Helper to click the "Continuar" / "Continue" button on an authorization container.
 * @param {import('playwright-core').Page | import('playwright-core').Frame} container 
 * @returns {Promise<boolean>}
 */
async function clickContinueOnContainer(container) {
  console.log('Account authorization screen detected ("Seleccionar cuenta" / "Select Account"). Clicking "Continue"...');

  // If an account row is visible, ensure it is clicked/selected if needed
  try {
    const accountItem = container.locator('.account-item, [class*="account-item"], [class*="account-list"] > div').first();
    if (await accountItem.count() > 0 && await accountItem.isVisible()) {
      await accountItem.click({ timeout: 1000 }).catch(() => {});
    }
  } catch (e) {}

  const continueSelectors = [
    'button.cus-button.primary.success',
    'button.cus-button',
    'button:has-text("Continuar")',
    'button:has-text("Continue")',
    '[role="button"]:has-text("Continuar")',
    '[role="button"]:has-text("Continue")',
    '.el-button--primary:has-text("Continuar")',
    '.el-button--primary:has-text("Continue")'
  ];

  let clicked = false;
  for (const sel of continueSelectors) {
    const btn = container.locator(sel);
    const count = typeof btn.count === 'function' ? await btn.count().catch(() => 0) : 0;
    if (count > 0) {
      const firstBtn = typeof btn.first === 'function' ? btn.first() : btn;
      const isVis = typeof firstBtn.isVisible === 'function' ? await firstBtn.isVisible().catch(() => true) : true;
      if (isVis) {
        console.log(`Clicking authorization continue button (${sel})...`);
        try {
          if (typeof firstBtn.click === 'function') {
            await firstBtn.click({ timeout: 5000 });
            clicked = true;
            break;
          }
        } catch (clickErr) {
          console.log(`Standard click failed for ${sel}: ${clickErr.message}. Trying evaluate click...`);
          if (typeof firstBtn.evaluate === 'function') {
            await firstBtn.evaluate(node => node.click()).catch(() => {});
            clicked = true;
            break;
          }
        }
      }
    }
  }

  if (!clicked) {
    const genericBtn = container.locator('button, [role="button"], a, div').filter({
      hasText: /^\s*(Continuar|Continue)\s*$/i
    });
    const gFirst = typeof genericBtn.first === 'function' ? genericBtn.first() : genericBtn;
    const gCount = typeof genericBtn.count === 'function' ? await genericBtn.count().catch(() => 0) : 0;
    if (gCount > 0) {
      console.log('Clicking fallback generic continue button...');
      try {
        await gFirst.click({ timeout: 5000 });
        clicked = true;
      } catch (err) {
        if (typeof gFirst.evaluate === 'function') {
          await gFirst.evaluate(node => node.click()).catch(() => {});
          clicked = true;
        }
      }
    }
  }

  if (clicked) {
    console.log('Waiting for redirect after authorization...');
    if (typeof container.waitForTimeout === 'function') {
      await container.waitForTimeout(8000);
    }
    return true;
  }

  return false;
}

/**
 * Handle clicking Continue on the "Select Account" / "Seleccionar cuenta" authorization screen.
 * @param {import('playwright-core').Page} page 
 * @returns {Promise<boolean>}
 */
export async function handleAccountSelection(page) {
  const isAuthScreen = await isAccountSelectionScreen(page);
  const continueBtnCheck = page.locator('button.cus-button.primary.success');
  const hasContinueBtn = (typeof continueBtnCheck.count === 'function' ? await continueBtnCheck.count().catch(() => 0) : 0) > 0;

  if (!isAuthScreen && !hasContinueBtn) {
    // Check if it's inside any frame
    if (typeof page.frames === 'function') {
      const frames = page.frames();
      for (const frame of frames) {
        if (await isAccountSelectionScreen(frame)) {
          return await clickContinueOnContainer(frame);
        }
      }
    }
    return false;
  }

  return await clickContinueOnContainer(page);
}

/**
 * Get locator for login buttons in both English and Spanish.
 * Retains 'span:has-text("Log In")' for test compatibility.
 * @param {import('playwright-core').Page} page
 * @returns {import('playwright-core').Locator}
 */
export function getLoginButtonLocator(page) {
  return page.locator(
    'span:has-text("Log In"), button:has-text("Log In"), a:has-text("Log In"), ' +
    'span:has-text("Iniciar sesión"), button:has-text("Iniciar sesión"), a:has-text("Iniciar sesión"), ' +
    'span:has-text("Iniciar sesion"), button:has-text("Iniciar sesion"), a:has-text("Iniciar sesion"), ' +
    'span:has-text("Sign in"), button:has-text("Sign in"), a:has-text("Sign in"), ' +
    'span:has-text("Sign In"), button:has-text("Sign In"), a:has-text("Sign In"), ' +
    'div.login, [class*="header-login"], [class*="login-btn"]'
  );
}

/**
 * Attempt to restore the user's session automatically.
 * When the session expires, Creality Cloud retains the SSO account in the Account Center.
 * Clicking "Iniciar sesión" / "Log In" shows "Seleccionar cuenta" / "Select Account",
 * and clicking "Continuar" / "Continue" restores the session without re-entering credentials.
 * @param {import('playwright-core').Page} page
 * @returns {Promise<boolean>}
 */
export async function restoreSession(page) {
  console.log('Attempting automatic session restoration...');

  // 1. Check if the page is already on the account selection screen
  if (await isAccountSelectionScreen(page)) {
    console.log('Account selection screen is already visible.');
    const handled = await handleAccountSelection(page);
    if (handled) {
      if (typeof page.waitForTimeout === 'function') {
        await page.waitForTimeout(3000);
      }
      return await isLoggedIn(page);
    }
  }

  // 2. Look for the login button ("Iniciar sesión", "Log In", "Sign in")
  const loginLocator = getLoginButtonLocator(page);
  let loginButton = null;

  try {
    if (typeof loginLocator.count === 'function') {
      const count = await loginLocator.count();
      for (let i = 0; i < count; i++) {
        const el = loginLocator.nth(i);
        const isVis = await el.isVisible().catch(() => false);
        if (isVis) {
          loginButton = el;
          break;
        }
      }
    } else if (typeof loginLocator.first === 'function') {
      const first = loginLocator.first();
      if (await first.isVisible().catch(() => false)) {
        loginButton = first;
      }
    }
  } catch (err) {
    console.log('[Diagnostic] Error scanning for login button:', err.message);
  }

  if (!loginButton) {
    console.log('No visible login button found to restore session.');
    return false;
  }

  console.log('Login button found. Clicking to trigger account authorization...');

  // Prepare popup listener in case login opens in a new tab/window
  let popupPromise = null;
  if (page.context && typeof page.context === 'function') {
    const ctx = page.context();
    if (ctx && typeof ctx.waitForEvent === 'function') {
      popupPromise = ctx.waitForEvent('page', { timeout: 4000 }).catch(() => null);
    }
  }

  try {
    await loginButton.click({ timeout: 5000 });
  } catch (clickErr) {
    console.log(`Standard click on login button failed: ${clickErr.message}. Trying evaluate click...`);
    if (typeof loginButton.evaluate === 'function') {
      await loginButton.evaluate(node => node.click()).catch(() => {});
    }
  }

  // Check if a popup was opened
  let popupPage = null;
  if (popupPromise) {
    popupPage = await popupPromise;
  }

  if (popupPage) {
    console.log('Login opened in a popup window. Handling authorization in popup...');
    if (typeof popupPage.waitForLoadState === 'function') {
      await popupPage.waitForLoadState('domcontentloaded').catch(() => {});
    }
    await popupPage.waitForTimeout(2000);
    await handleAccountSelection(popupPage);
    if (typeof popupPage.waitForEvent === 'function') {
      await popupPage.waitForEvent('close', { timeout: 10000 }).catch(() => {});
    }
    await page.waitForTimeout(3000);
  } else {
    // Handled in same page or modal
    console.log('Waiting for authorization modal or redirect...');
    await page.waitForTimeout(4000);
    await handleAccountSelection(page);
    await page.waitForTimeout(3000);
  }

  const loggedIn = await isLoggedIn(page);
  if (loggedIn) {
    console.log('✅ Session successfully restored via SSO account selection!');
  } else {
    console.log('❌ Could not restore session automatically.');
  }

  return loggedIn;
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

  // Check if account selection screen is visible (if so, user is in authorization flow, not logged in yet)
  const authScreenVisible = await isAccountSelectionScreen(page);
  if (authScreenVisible) {
    console.log('[Diagnostic] Account selection authorization screen is currently displayed.');
    return false;
  }

  // Check if a login indicator or button is visible
  const loginButton = getLoginButtonLocator(page);
  
  try {
    const visible = await loginButton.first().isVisible();
    if (visible) {
      console.log('[Diagnostic] Login button is visible on page.');
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
 * @returns {Promise<{success: boolean, message: string, screenshotPath?: string}>}
 */
export async function executeCheckin(page, options = {}) {
  const maxRetries = options.maxRetries || 3;
  const url = 'https://www.crealitycloud.com/check-in';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`\n[Check-in] Attempt ${attempt}/${maxRetries}: Navigating to ${url}...`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(4000);

      // Verify login status, attempting automatic restoration if session is lost
      let loggedIn = await isLoggedIn(page);
      if (!loggedIn) {
        console.log('[Check-in] User is not logged in. Attempting automatic session restoration...');
        loggedIn = await restoreSession(page);

        if (loggedIn) {
          const currentUrl = typeof page.url === 'function' ? page.url() : '';
          if (!currentUrl.includes('check-in')) {
            console.log(`[Check-in] Navigating back to check-in page from ${currentUrl}...`);
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
            if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(3000);
          }
        }
      }

      if (!loggedIn) {
        const screenshotPath = path.join(USER_SESSION_DIR, 'checkin-failed.png');
        if (typeof page.screenshot === 'function') {
          await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
        }
        return {
          success: false,
          message: 'User is not logged in and session could not be restored automatically. Please run npm run login first to log in manually.',
          screenshotPath
        };
      }

      console.log('[Check-in] User is logged in. Searching for check-in elements...');

      // Helper for safe screenshot handling that works with mock pages and real Playwright
      const takeSafeScreenshot = async (filePath) => {
        if (typeof page.screenshot === 'function') {
          try {
            const res = page.screenshot({ path: filePath, fullPage: true });
            if (res && typeof res.catch === 'function') await res.catch(() => {});
            else if (res && typeof res.then === 'function') await res;
          } catch (e) {}
        }
      };

      // Creality Cloud often renders content inside an iframe-box
      let iframeLocator = page.locator('iframe.iframe-box');
      let iframeExists = await iframeLocator.count().catch(() => 0) > 0;
      if (!iframeExists) {
        iframeLocator = page.locator('iframe[class*="iframe"]');
        iframeExists = await iframeLocator.count().catch(() => 0) > 0;
      }
      const containers = [];
      if (iframeExists && typeof page.frameLocator === 'function') {
        const fl = page.frameLocator('iframe.iframe-box');
        containers.push(typeof fl.first === 'function' ? fl.first() : fl);
      }
      containers.push(page);

      // Wait briefly for elements to load
      if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(3000);

      for (const container of containers) {
        // Look for buttons or interactive elements containing check-in keywords
        let checkinLocator = container.locator('.sign-in-btn, button, [role="button"], a').filter({
          hasText: /check|fichar|registrar/i
        });

        let count = await checkinLocator.count().catch(() => 0);
        if (count === 0) {
          checkinLocator = container.locator('div[class*="btn"], div[class*="button"]').filter({
            hasText: /check|fichar|registrar/i
          });
          count = await checkinLocator.count().catch(() => 0);
        }

        for (let i = 0; i < count; i++) {
          const element = checkinLocator.nth(i);
          const text = (await element.textContent().catch(() => '') || '').trim();
          const isVisible = await element.isVisible().catch(() => false);

          if (isVisible && text && text.length < 100) {
            // Check if already checked in today (English or Spanish)
            if (/Checked|Registrado|Fichado|Ya registrado/i.test(text)) {
              const screenshotPath = path.join(USER_SESSION_DIR, 'checkin-success.png');
              await takeSafeScreenshot(screenshotPath);
              console.log(`[Check-in] Already checked in today! (Found: "${text}")`);
              return {
                success: true,
                message: `Already checked in today! (Found: "${text}")`
              };
            }

            // Check if button can be clicked to check in
            if (/Check[ -]*in|Fichar|Registrarse|Registrar/i.test(text) && !/Iniciar sesi[oó]n/i.test(text)) {
              console.log(`[Check-in] Clicking check-in button: "${text}"...`);

              await element.scrollIntoViewIfNeeded().catch(() => {});
              try {
                await element.click({ force: true, timeout: 5000 });
              } catch (clickErr) {
                const cleanErr = (clickErr.message || '').split('\n')[0];
                console.log(`Playwright click failed: ${cleanErr}. Retrying via DOM click...`);
                await element.evaluate(node => node.click()).catch(() => {});
              }

              if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(5000);

              // Look for reward details
              let rewardText = '';
              try {
                const modalLocator = container.locator('div, span, p').filter({
                  hasText: /congratulations|felicidades|enhorabuena/i
                });
                const mCount = await modalLocator.count().catch(() => 0);
                for (let j = 0; j < mCount; j++) {
                  const mEl = modalLocator.nth(j);
                  const mText = (await mEl.textContent().catch(() => '') || '').trim();
                  if (await mEl.isVisible().catch(() => false) && mText && mText.length < 200) {
                    rewardText = mText.replace(/\s+/g, ' ');
                    break;
                  }
                }

                if (!rewardText) {
                  const pointsLocator = container.locator('div, span, p').filter({
                    hasText: /x\s*\d+/i
                  });
                  const pCount = await pointsLocator.count().catch(() => 0);
                  for (let j = 0; j < pCount; j++) {
                    const pEl = pointsLocator.nth(j);
                    const pText = (await pEl.textContent().catch(() => '') || '').trim();
                    if (await pEl.isVisible().catch(() => false) && /^x\s*\d+$/i.test(pText)) {
                      rewardText = pText;
                      break;
                    }
                  }
                }
              } catch (err) {}

              const screenshotPath = path.join(USER_SESSION_DIR, 'checkin-success.png');
              await takeSafeScreenshot(screenshotPath);
              console.log(`Screenshot saved to ${screenshotPath}`);

              const rewardMsg = rewardText ? ` (Obtained: "${rewardText}")` : '';
              return {
                success: true,
                message: `Successfully clicked check-in button: "${text}"${rewardMsg}`
              };
            }
          }
        }

        // Fallback inside container: check for "Checked", "Registrado", or streak text
        let containerText = '';
        try {
          containerText = await (typeof container.locator === 'function' ? container.locator('body').innerText().catch(() => '') : '');
        } catch (err) {}

        if (/Checked|Registrado|Fichado|Ya registrado|Racha de \d+ d/i.test(containerText)) {
          const screenshotPath = path.join(USER_SESSION_DIR, 'checkin-success.png');
          await takeSafeScreenshot(screenshotPath);
          console.log(`[Check-in] Already checked in today! (Found status text on page)`);
          return {
            success: true,
            message: 'Already checked in today! (Found "Checked" / "Registrado" status on the page)'
          };
        }
      }

      console.log(`[Check-in] Attempt ${attempt}/${maxRetries} did not detect check-in button or status.`);
      if (attempt < maxRetries && typeof page.waitForTimeout === 'function') {
        await page.waitForTimeout(3000);
      }
    } catch (err) {
      console.error(`[Check-in] Error on attempt ${attempt}/${maxRetries}:`, err.message);
      if (attempt < maxRetries && typeof page.waitForTimeout === 'function') {
        await page.waitForTimeout(3000);
      }
    }
  }

  // Save screenshot of final failed state for troubleshooting
  const screenshotPath = path.join(USER_SESSION_DIR, 'checkin-failed.png');
  if (typeof page.screenshot === 'function') {
    try {
      const res = page.screenshot({ path: screenshotPath, fullPage: true });
      if (res && typeof res.catch === 'function') await res.catch(() => {});
      else if (res && typeof res.then === 'function') await res;
    } catch (e) {}
  }
  console.log(`Troubleshooting screenshot saved to ${screenshotPath}`);

  return {
    success: false,
    message: 'Could not find any visible check-in button or "Checked" status on the page after retries. Screenshot saved for review.',
    screenshotPath
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

  // 2. Handle the "Select Account" / "Seleccionar cuenta" authorization screen if present
  await handleAccountSelection(page);

  // 3. Read the number of remaining draws
  const numLocator = page.locator('.lucky-draw-left .num');
  if (await numLocator.count() === 0) {
    // If we can't find the lucky draw indicator, maybe we didn't redirect successfully
    const bodyText = await page.innerText('body').catch(() => '');
    const screenshotPath = path.join(USER_SESSION_DIR, 'raffle-load-failed.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Saved screenshot to ${screenshotPath}`);
    errorScreenshots.push(screenshotPath);

    if (
      /Select Account|Seleccionar cuenta/i.test(bodyText) ||
      /Continu(?:e|ar)\s+(?:share\.)?crealitycloud\.com/i.test(bodyText)
    ) {
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
          const match = prizeText.replace(/\s+/g, ' ').match(/(?:Congratulations|Felicidades)!\s*(.*?)\s*(?:has|have|is|are|been|added|se\s+ha|se\s+han)/i);
          if (match && match[1]) {
            prizeText = match[1].trim();
          }
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

// Re-export task service methods for backward compatibility
export * from './taskService.js';

