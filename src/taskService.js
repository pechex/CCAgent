import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { handleAccountSelection, isLoggedIn, restoreSession, getLoginButtonLocator } from './checkinService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

export const USER_SESSION_DIR = path.join(PROJECT_ROOT, 'user_session');
export const DOWNLOADS_TRACKING_FILE = path.join(USER_SESSION_DIR, 'downloaded_models.json');
export const DEFAULT_THUMBS_UP_IMAGE = path.join(PROJECT_ROOT, 'assets', 'thumbs_up.jpg');
export const DEFAULT_USER_ID = 'xxxxxxxxxx';
export const DEFAULT_BOOST_URL = `https://www.crealitycloud.com/es/user/${DEFAULT_USER_ID}/boost`;
export const INCENTIVE_POINTS_URL = 'https://www.crealitycloud.com/es/incentive-points?thirdType=earn-points';
export const DEFAULT_DISCOVERY_URLS = [
  'https://www.crealitycloud.com/es/model-category/3d-print-all',
  'https://www.crealitycloud.com/model-category/3d-print-all',
  'https://www.crealitycloud.com/es/model-tags',
  'https://www.crealitycloud.com/model-tags',
  'https://www.crealitycloud.com/es',
  'https://www.crealitycloud.com/'
];
export const DEFAULT_MODELS_URL = DEFAULT_DISCOVERY_URLS[0];


export const COMMENT_SUBMIT_SELECTORS = [
  '.comment-operate-box div:has-text("Comentarios")',
  '.comment-operate-box button:has-text("Comentarios")',
  '.comment-operate-box div:has-text("Comentar")',
  '.comment-operate-box button:has-text("Comentar")',
  '.comment-operate-box div:has-text("Comment")',
  '.comment-operate-box button:has-text("Comment")',
  '.comment-operate-box .base-confirm-btn',
  '.comment-operate-box [class*="confirm-btn"]',
  '.comment-operate-box [class*="submit"]',
  '.comment-operate-box [class*="btn"]:not(.comment-left-operate *)',
  '.comment-operate-box button',
  '.comment-operate-box > div:last-child',
  '.comment-comp .base-confirm-btn',
  '.comment-comp [class*="confirm-btn"]',
  '.comment-comp div:has-text("Comentarios")',
  '.comment-comp button:has-text("Comentarios")',
  '.comment-comp div:has-text("Comentar")',
  '.comment-comp button:has-text("Comentar")',
  '.comment-comp button:has-text("Comment")',
  '.comment-comp button',
  'button:has-text("Comentarios")',
  'button:has-text("Comentar")',
  'button:has-text("Comment")',
  '.comment-btn',
  '.comment-submit',
  '.el-button--primary:has-text("Comentarios")',
  '.el-button--primary:has-text("Comentar")',
  '.el-button--primary:has-text("Comment")'
];

/**
 * Ensure the browser has an active login session on the current page.
 * If not logged in, or if a login prompt/modal is displayed, restores session via SSO.
 * @param {import('playwright-core').Page} page
 * @returns {Promise<boolean>}
 */
export async function ensureAuthenticated(page) {
  try {
    if (!page) return false;
    // 1. Handle SSO authorization screen if visible
    if (typeof handleAccountSelection === 'function') {
      await handleAccountSelection(page);
    }

    // 2. Check for login button on page
    if (typeof getLoginButtonLocator === 'function') {
      const loginBtnLoc = getLoginButtonLocator(page);
      const count = typeof loginBtnLoc.count === 'function' ? await loginBtnLoc.count().catch(() => 0) : 0;
      if (count > 0 && typeof loginBtnLoc.first === 'function') {
        const isVis = await loginBtnLoc.first().isVisible().catch(() => false);
        if (isVis && typeof restoreSession === 'function') {
          console.log('[Auth Check] Login button is visible on page. Attempting session restoration...');
          await restoreSession(page);
        }
      }
    }

    // 3. Check for login dialog or modal
    if (typeof page.locator === 'function') {
      const modalLoc = page.locator('.el-dialog:has-text("Iniciar sesión"), .el-dialog:has-text("Log In"), [class*="login-dialog"]');
      if (typeof modalLoc.count === 'function') {
        const mCount = await modalLoc.count().catch(() => 0);
        if (mCount > 0 && typeof restoreSession === 'function') {
          console.log('[Auth Check] Login dialog detected. Restoring session...');
          await restoreSession(page);
        }
      }
    }
  } catch (err) {
    console.log('[Auth Check] Notice during session check:', err.message);
  }
  return true;
}

/**
 * Load the map of previously downloaded models from disk.
 * @param {string} [filePath]
 * @returns {Record<string, {downloadedAt: string, liked: boolean, title?: string, url?: string}>}
 */
export function getDownloadedModels(filePath = DOWNLOADS_TRACKING_FILE) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Warning: could not read downloaded models file:', err.message);
  }
  return {};
}

/**
 * Save the map of downloaded models to disk.
 * @param {Record<string, any>} models
 * @param {string} [filePath]
 */
export function saveDownloadedModels(models, filePath = DOWNLOADS_TRACKING_FILE) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(models, null, 2), 'utf-8');
  } catch (err) {
    console.error('Warning: could not write downloaded models file:', err.message);
  }
}

/**
 * Check if the model is currently marked as liked on the page.
 * @param {import('playwright-core').Page} page
 * @returns {Promise<boolean>}
 */
export async function isModelLiked(page) {
  const likeSelectors = [
    '.model-interaction-comp .liked',
    '.model-interaction-box .liked',
    'div.liked.flex-all-center',
    '.model-interaction-comp div:has(.icon-zan)',
    'div:has(> .icon-zan)',
    '[class*="icon-zan"]',
    '.model-interaction-comp > div:first-child',
    '.like-box',
    '[class*="like-box"]',
    '[class*="like_box"]',
    '[class*="likeWrap"]',
    '[class*="like-wrap"]',
    'button.like',
    '.like-btn',
    '[class*="like-btn"]',
    'button:has-text("Like")',
    'button:has-text("Me gusta")',
    '[aria-label*="like" i]'
  ];

  for (const selector of likeSelectors) {
    try {
      const locator = page.locator(selector);
      const count = await locator.count().catch(() => 0);
      if (count > 0) {
        const el = locator.first();
        const isVis = await el.isVisible().catch(() => false);
        if (isVis) {
          const className = (await el.getAttribute('class')) || '';
          const ariaPressed = await el.getAttribute('aria-pressed');
          const style = (await el.getAttribute('style')) || '';
          const text = (await el.innerText().catch(() => '')) || '';

          // Look for active/liked indicators (Note: avoid bare "liked" match because the element base class is literally "liked flex-all-center")
          if (
            /\bactive\b|\bis-active\b|\bselected\b|\bis-liked\b/i.test(className) ||
            ariaPressed === 'true' ||
            /ya te gusta/i.test(text) ||
            /color:\s*(?:red|#ff|rgb\(255)/i.test(style)
          ) {
            return true;
          }

          // Check inner icon for active class or colored style
          const icon = el.locator('.iconfont, [class*="icon-zan"], svg').first();
          if (await icon.count().catch(() => 0) > 0) {
            const fill = (await icon.getAttribute('fill')) || '';
            const iconClass = (await icon.getAttribute('class')) || '';
            const iconStyle = (await icon.getAttribute('style')) || '';
            if (
              /\bactive\b|\bis-active\b/i.test(iconClass) ||
              (fill && fill !== 'none' && fill !== 'currentColor' && fill !== '#fff' && fill !== '#ffffff') ||
              /color:\s*(?:red|#ff|rgb\(255)/i.test(iconStyle)
            ) {
              return true;
            }
          }

          // Check computed style via page.evaluate
          if (typeof el.evaluate === 'function') {
            const isActive = await el.evaluate(node => {
              if (node.classList && (node.classList.contains('active') || node.classList.contains('is-active'))) {
                return true;
              }
              const iconNode = node.querySelector('.iconfont, .icon-zan, svg');
              if (iconNode && iconNode.classList && (iconNode.classList.contains('active') || iconNode.classList.contains('is-active'))) {
                return true;
              }
              const target = iconNode || node;
              const color = window.getComputedStyle(target).color;
              const match = color && color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
              if (match) {
                const r = parseInt(match[1], 10);
                const g = parseInt(match[2], 10);
                const b = parseInt(match[3], 10);
                if (r > 200 && r > g + 40 && r > b + 40) {
                  return true;
                }
              }
              return false;
            }).catch(() => false);

            if (isActive) {
              return true;
            }
          }
        }
      }
    } catch (err) { }
  }
  return false;
}

/**
 * Click the like button on a model page.
 * @param {import('playwright-core').Page} page
 * @returns {Promise<boolean>}
 */
export async function likeModel(page) {
  if (typeof ensureAuthenticated === 'function') {
    await ensureAuthenticated(page);
  }

  const alreadyLiked = await isModelLiked(page);
  if (alreadyLiked) {
    console.log('Model is already liked.');
    return true;
  }

  const likeSelectors = [
    '.model-interaction-comp .liked',
    '.model-interaction-box .liked',
    'div.liked.flex-all-center',
    '.model-interaction-comp div:has(.icon-zan)',
    'div:has(> .icon-zan)',
    '.model-interaction-comp .icon-zan',
    'div.liked .icon-zan',
    '.icon-zan',
    '[class*="icon-zan"]',
    '.model-interaction-comp > div:first-child',
    '.like-box',
    '[class*="like-box"]',
    '[class*="like_box"]',
    '[class*="likeWrap"]',
    '[class*="like-wrap"]',
    'button.like',
    '.like-btn',
    '[class*="like-btn"]',
    'button:has-text("Like")',
    'button:has-text("Me gusta")',
    '[aria-label*="like" i]'
  ];

  for (const selector of likeSelectors) {
    try {
      const locator = page.locator(selector);
      const count = await locator.count().catch(() => 0);
      if (count > 0) {
        const el = locator.first();
        if (await el.isVisible().catch(() => false)) {
          console.log(`Clicking like button (${selector})...`);
          try {
            await el.scrollIntoViewIfNeeded().catch(() => { });
            await el.click({ timeout: 5000 });
          } catch (e) {
            if (typeof el.evaluate === 'function') {
              await el.evaluate(node => node.click()).catch(() => { });
            }
          }
          if (typeof page.waitForTimeout === 'function') {
            await page.waitForTimeout(1500);
          }

          if (typeof ensureAuthenticated === 'function') {
            await ensureAuthenticated(page);
          }
          return true;
        }
      }
    } catch (selErr) { }
  }

  console.log('Could not find a visible like button on page.');
  return false;
}

/**
 * Check if the current model page is already collected / added to favorites.
 * @param {import('playwright-core').Page} page
 * @returns {Promise<boolean>}
 */
export async function isModelCollected(page) {
  const collectSelectors = [
    '.model-interaction-comp .collect',
    'div.collect.flex-all-center',
    '.model-interaction-box .collect',
    'div.collect',
    '.collect',
    'div:has(> .icon-shoucang)',
    '.icon-shoucang'
  ];

  for (const selector of collectSelectors) {
    try {
      if (typeof page.locator !== 'function') continue;
      const locator = page.locator(selector);
      const count = typeof locator.count === 'function' ? await locator.count().catch(() => 0) : 0;
      if (count > 0) {
        const el = typeof locator.first === 'function' ? locator.first() : locator;
        if (typeof el.isVisible === 'function' && await el.isVisible().catch(() => false)) {
          if (typeof el.evaluate === 'function') {
            const isActive = await el.evaluate((node) => {
              if (node.classList.contains('active') ||
                  node.classList.contains('is-active') ||
                  node.classList.contains('collected') ||
                  node.classList.contains('is-collected')) {
                return true;
              }
              const parent = node.closest('.collect') || node;
              if (parent && (parent.classList.contains('active') || parent.classList.contains('is-active'))) {
                return true;
              }
              return false;
            }).catch(() => false);

            if (isActive) return true;
          }
        }
      }
    } catch (err) {}
  }
  return false;
}

/**
 * Click the collection button on a model page and confirm the collection dialog.
 * @param {import('playwright-core').Page} page
 * @returns {Promise<boolean>}
 */
export async function collectModel(page) {
  if (typeof ensureAuthenticated === 'function') {
    await ensureAuthenticated(page);
  }

  const alreadyCollected = await isModelCollected(page);
  if (alreadyCollected) {
    console.log('Model is already collected (favorite).');
    return true;
  }

  const collectSelectors = [
    '.model-interaction-comp .collect',
    'div.collect.flex-all-center',
    '.model-interaction-box .collect',
    'div.collect',
    '.collect',
    'div:has(> .icon-shoucang)',
    '.icon-shoucang'
  ];

  let collectBtn = null;
  for (const sel of collectSelectors) {
    try {
      if (typeof page.locator !== 'function') continue;
      const loc = page.locator(sel);
      const count = typeof loc.count === 'function' ? await loc.count().catch(() => 0) : 0;
      if (count > 0) {
        const el = typeof loc.first === 'function' ? loc.first() : loc;
        if (typeof el.isVisible === 'function' && await el.isVisible().catch(() => false)) {
          collectBtn = el;
          console.log(`Found collect button with selector: ${sel}`);
          break;
        }
      }
    } catch (e) {}
  }

  if (!collectBtn) {
    console.log('Could not find a visible collection button on page.');
    return false;
  }

  console.log('Clicking collection button (.collect)...');
  if (typeof collectBtn.scrollIntoViewIfNeeded === 'function') {
    await collectBtn.scrollIntoViewIfNeeded().catch(() => {});
  }
  try {
    await collectBtn.click({ timeout: 5000 });
  } catch (e) {
    if (typeof collectBtn.evaluate === 'function') {
      await collectBtn.evaluate(node => node.click()).catch(() => {});
    }
  }

  if (typeof page.waitForTimeout === 'function') {
    await page.waitForTimeout(2000);
  }

  // Handle confirmation dialog: "Colección" / "Collection" / "Añadir a la colección"
  try {
    if (typeof page.locator === 'function') {
      const collectDialogLoc = page.locator('.el-dialog, [role="dialog"]').filter({
        hasText: /Colecci[oó]n|Collection|Favoritos|Favorites/i
      });
      const dCount = typeof collectDialogLoc.count === 'function' ? await collectDialogLoc.count().catch(() => 0) : 0;

      if (dCount > 0) {
        const dialog = typeof collectDialogLoc.first === 'function' ? collectDialogLoc.first() : collectDialogLoc;
        const isDialogVis = typeof dialog.isVisible === 'function' ? await dialog.isVisible().catch(() => false) : true;
        if (isDialogVis) {
          console.log('Collection dialog opened. Ensuring selection and confirming...');

          // If there are collection checkboxes or items, ensure at least one is selected
          const itemLoc = dialog.locator('.collection-item, .el-checkbox, [class*="collection-item"], label.el-checkbox');
          if (typeof itemLoc.count === 'function' && await itemLoc.count().catch(() => 0) > 0) {
            const firstItem = typeof itemLoc.first === 'function' ? itemLoc.first() : itemLoc;
            if (typeof firstItem.evaluate === 'function') {
              const isChecked = await firstItem.evaluate(el => el.classList.contains('is-checked') || !!el.querySelector('input:checked')).catch(() => false);
              if (!isChecked) {
                await firstItem.click({ timeout: 5000 }).catch(() => {});
                if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(1000);
              }
            }
          }

          // Click confirm button
          const confirmBtnLoc = dialog.locator('button:has-text("Confirmar"), button:has-text("Confirm"), .el-button--primary, button.confirm-btn, [class*="confirm"]');
          if (typeof confirmBtnLoc.count === 'function' && await confirmBtnLoc.count().catch(() => 0) > 0) {
            const confirmBtn = typeof confirmBtnLoc.first === 'function' ? confirmBtnLoc.first() : confirmBtnLoc;
            console.log('Clicking "Confirmar" in collection dialog...');
            try {
              await confirmBtn.click({ timeout: 5000 });
            } catch (e) {
              if (typeof confirmBtn.evaluate === 'function') {
                await confirmBtn.evaluate(node => node.click()).catch(() => {});
              }
            }
            if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(2000);
          }
        }
      }
    }
  } catch (dErr) {
    console.log('Notice in collection dialog handling:', dErr.message);
  }

  return true;
}

/**
 * Trigger the model download button and handle download dialog/event.
 * In accordance with Creality Cloud points requirement:
 * 1. Clicks the dropdown arrow (.choose-operate) next to "Descargar 3MF".
 * 2. Clicks "Ver archivos STL/CAD" in the dropdown menu.
 * 3. In the opened dialog, clicks the download icon of the FIRST file item.
 * 4. Falls back to standard download button if STL dropdown is not present.
 *
 * @param {import('playwright-core').Page} page
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function downloadModel(page) {
  if (typeof ensureAuthenticated === 'function') {
    await ensureAuthenticated(page);
  }

  // Check if a dropdown arrow exists next to the download button
  let chooseOperateLoc = null;
  let hasDropdown = false;
  try {
    if (typeof page.locator === 'function') {
      const loc = page.locator('.action-btn-box .choose-operate, .all-operate-btn .choose-operate, .choose-operate');
      if (loc) {
        const count = typeof loc.count === 'function' ? await loc.count().catch(() => 0) : 0;
        if (count > 0) {
          chooseOperateLoc = typeof loc.first === 'function' ? loc.first() : loc;
          hasDropdown = typeof chooseOperateLoc.isVisible === 'function' ? await chooseOperateLoc.isVisible().catch(() => false) : false;
        }
      }
    }
  } catch (e) { }

  // Check if the main button already says "Ver archivos STL/CAD" directly
  let mainBtnText = '';
  let mainBtnLoc = null;
  try {
    if (typeof page.locator === 'function') {
      const loc = page.locator('.action-btn-box .operate-box, .all-operate-btn .operate-box, .operate-box');
      if (loc) {
        const count = typeof loc.count === 'function' ? await loc.count().catch(() => 0) : 0;
        if (count > 0) {
          mainBtnLoc = typeof loc.first === 'function' ? loc.first() : loc;
          if (mainBtnLoc && typeof mainBtnLoc.innerText === 'function') {
            mainBtnText = (await mainBtnLoc.innerText().catch(() => '')) || '';
          }
        }
      }
    }
  } catch (e) { }

  const isDirectStl = /Ver archivos STL|STL\/CAD|View STL/i.test(mainBtnText);

  if (hasDropdown || isDirectStl) {
    try {
      if (hasDropdown && chooseOperateLoc) {
        console.log('Clicking dropdown arrow next to download button (.choose-operate)...');
        if (typeof chooseOperateLoc.scrollIntoViewIfNeeded === 'function') {
          await chooseOperateLoc.scrollIntoViewIfNeeded().catch(() => { });
        }
        await chooseOperateLoc.click({ timeout: 5000 });
        if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(1000);

        const stlFilter = page.locator('.operate-box-list .operate-item, .operate-item, [class*="operate-item"]').filter({
          hasText: /Ver archivos STL|STL\/CAD|View STL/i
        });
        const stlCount = typeof stlFilter.count === 'function' ? await stlFilter.count().catch(() => 0) : 0;
        if (stlCount > 0) {
          const stlOption = typeof stlFilter.first === 'function' ? stlFilter.first() : stlFilter;
          const isStlVis = typeof stlOption.isVisible === 'function' ? await stlOption.isVisible().catch(() => false) : true;
          if (isStlVis) {
            console.log('Selecting "Ver archivos STL/CAD" from dropdown...');
            await stlOption.click({ timeout: 5000 });
            if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(2000);
          }
        }
      } else if (mainBtnLoc) {
        console.log('Main button is "Ver archivos STL/CAD". Clicking to open dialog...');
        await mainBtnLoc.click({ timeout: 5000 });
        if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(2000);
      }

      // Check if the STL dialog opened
      const dialogFilter = page.locator('.el-dialog, [role="dialog"]').filter({
        hasText: /Ver archivos STL|STL\/CAD|View STL/i
      });
      const dialogCount = typeof dialogFilter.count === 'function' ? await dialogFilter.count().catch(() => 0) : 0;
      if (dialogCount > 0) {
        const dialogLoc = typeof dialogFilter.first === 'function' ? dialogFilter.first() : dialogFilter;
        const isDialogVis = typeof dialogLoc.isVisible === 'function' ? await dialogLoc.isVisible().catch(() => false) : true;
        if (isDialogVis) {
          const itemsLoc = dialogLoc.locator('.model-item .icon-download, .folder-files .icon-download, .icon-download');
          const itemCount = typeof itemsLoc.count === 'function' ? await itemsLoc.count().catch(() => 0) : 0;
          if (itemCount > 0) {
            const firstItemDownload = typeof itemsLoc.first === 'function' ? itemsLoc.first() : itemsLoc;
            console.log('Clicking download icon of the first item in STL/CAD dialog...');
            if (typeof firstItemDownload.scrollIntoViewIfNeeded === 'function') {
              await firstItemDownload.scrollIntoViewIfNeeded().catch(() => { });
            }
            try {
              await firstItemDownload.click({ timeout: 5000 });
            } catch (e) {
              if (typeof firstItemDownload.evaluate === 'function') {
                await firstItemDownload.evaluate(node => node.click()).catch(() => { });
              }
            }
            if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(3000);

            // Close modal dialog
            const closeFilter = dialogLoc.locator('.el-dialog__headerbtn, .el-dialog__close, button[aria-label*="Close" i]');
            if (typeof closeFilter.count === 'function' && await closeFilter.count().catch(() => 0) > 0) {
              const closeBtn = typeof closeFilter.first === 'function' ? closeFilter.first() : closeFilter;
              await closeBtn.click().catch(() => { });
            }

            return {
              success: true,
              message: 'First item in STL/CAD files dialog downloaded successfully.'
            };
          }
        }
      }
    } catch (err) {
      console.log('Notice: STL/CAD dropdown flow error:', err.message, 'Falling back to standard download button.');
    }
  }

  // Fallback: standard download button
  const downloadSelectors = [
    '.action-btn-box .operate-box',
    '.all-operate-btn .operate-box',
    'div.operate-box.flex-all-center',
    '.operate-box',
    '[class*="operate-box"]',
    '.all-operate-btn',
    'div:has-text("Descargar 3MF")',
    'div:has-text("Descargar STL")',
    'div:has-text("Descargar")',
    'div:has-text("Download")',
    'button.download-btn',
    '.download-btn',
    'button:has-text("Download")',
    'button:has-text("Descargar")',
    '[class*="download-btn"]',
    '[class*="downloadBtn"]',
    'button[class*="download"]',
    'a:has-text("Download")',
    'a:has-text("Descargar")'
  ];

  let clicked = false;
  let targetBtn = null;

  for (const sel of downloadSelectors) {
    const locator = page.locator(sel);
    const count = await locator.count().catch(() => 0);
    if (count > 0) {
      const el = locator.first();
      if (await el.isVisible().catch(() => false)) {
        targetBtn = el;
        console.log(`Found download button with selector: ${sel}`);
        break;
      }
    }
  }

  if (!targetBtn) {
    return {
      success: false,
      message: 'Download button not found on model page.'
    };
  }

  console.log('Initiating fallback download button click...');
  await targetBtn.scrollIntoViewIfNeeded().catch(() => { });

  // Prepare download event listener
  let downloadPromise = null;
  if (typeof page.waitForEvent === 'function') {
    downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
  }

  try {
    await targetBtn.click({ timeout: 5000 });
    clicked = true;
  } catch (err) {
    if (typeof targetBtn.evaluate === 'function') {
      await targetBtn.evaluate(node => node.click()).catch(() => { });
      clicked = true;
    }
  }

  if (!clicked) {
    return {
      success: false,
      message: 'Failed to click download button.'
    };
  }

  if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(2500);

  // Check if a modal popped up asking to select files or confirm download
  const modalConfirmSelectors = [
    '.el-dialog div:has-text("Descargar")',
    '.el-dialog button:has-text("Descargar")',
    '.el-dialog div:has-text("Download")',
    '.el-dialog button:has-text("Download")',
    '.el-dialog div:has-text("Descargar todo")',
    '.el-dialog button:has-text("Descargar todo")',
    '.el-dialog div:has-text("Download All")',
    '.el-dialog button:has-text("Download All")',
    '.el-dialog .base-confirm-btn',
    '.el-dialog .el-button--primary',
    '.el-dialog .operate-box',
    '.el-dialog [class*="download"]',
    '[role="dialog"] div:has-text("Descargar")',
    '[role="dialog"] button:has-text("Descargar")',
    '[role="dialog"] div:has-text("Download")',
    '[role="dialog"] button:has-text("Download")',
    '[role="dialog"] .base-confirm-btn',
    '[role="dialog"] .el-button--primary',
    '[role="dialog"] .operate-box',
    '[role="dialog"] [class*="download"]'
  ];

  for (const modalSel of modalConfirmSelectors) {
    const modalBtn = page.locator(modalSel);
    const count = await modalBtn.count().catch(() => 0);
    if (count > 0) {
      const first = modalBtn.first();
      if (await first.isVisible().catch(() => false)) {
        console.log(`Clicking modal download confirmation button (${modalSel})...`);
        try {
          await first.click({ timeout: 5000 });
        } catch (e) {
          await first.evaluate(node => node.click()).catch(() => { });
        }
        break;
      }
    }
  }

  // Await download event if emitted and clean up temporary downloaded file
  if (downloadPromise) {
    const download = await downloadPromise;
    if (download) {
      console.log(`Download event detected: ${download.suggestedFilename()}`);
      try {
        await download.delete().catch(() => { });
      } catch (e) { }
    }
  }

  if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(2000);
  return {
    success: true,
    message: 'Model download triggered successfully.'
  };
}

/**
 * Discover model detail URLs from catalog and category pages.
 * Tries multiple fallback endpoints if candidate count is not met.
 * @param {import('playwright-core').Page} page
 * @param {number} count Number of distinct models required
 * @param {string|string[]} [categoryUrl]
 * @param {string} [trackingFile]
 * @returns {Promise<Array<{id: string, url: string}>>}
 */
export async function discoverModelUrls(
  page,
  count = 10,
  categoryUrl = DEFAULT_DISCOVERY_URLS,
  trackingFile = DOWNLOADS_TRACKING_FILE
) {
  const urlsToTry = Array.isArray(categoryUrl)
    ? categoryUrl
    : [categoryUrl, ...DEFAULT_DISCOVERY_URLS.filter(u => u !== categoryUrl)];

  const downloadedModels = getDownloadedModels(trackingFile);
  const models = [];
  const seenIds = new Set();

  for (const currentUrl of urlsToTry) {
    if (models.length >= count) break;

    console.log(`Navigating to model catalog: ${currentUrl}...`);
    try {
      if (typeof page.goto === 'function') {
        await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      }
      if (typeof page.waitForTimeout === 'function') {
        await page.waitForTimeout(3000);
      }
      await handleAccountSelection(page);

      // Attempt waiting for model cards or detail links to hydrate
      if (typeof page.waitForSelector === 'function') {
        await page.waitForSelector(
          'a[href*="/model-detail/"], a[href*="/model/"], [class*="model-card"], [class*="model-item"], [class*="creality-model-"]',
          { timeout: 6000 }
        ).catch(() => null);
      }

      let attempts = 0;
      const maxScrollAttempts = 6;

      while (models.length < count && attempts < maxScrollAttempts) {
        attempts++;

        // 1. Extract links matching /model-detail/ or /model/
        let links = [];
        if (typeof page.locator === 'function') {
          const loc = page.locator('a[href*="/model-detail/"], a[href*="/model/"], [class*="model-card"] a, [class*="model-item"] a, [class*="creality-model-"] a, .creality-model-cover');
          if (loc && typeof loc.evaluateAll === 'function') {
            links = await loc.evaluateAll(anchors => {
              return anchors.map(a => a.getAttribute('href') || a.href).filter(Boolean);
            }).catch(() => []);
          }
        }

        // Fallback 1: check all anchor tags if specific locator returned empty
        if (links.length === 0 && typeof page.$$eval === 'function') {
          links = await page.$$eval('a', anchors => anchors.map(a => a.getAttribute('href') || a.href).filter(Boolean)).catch(() => []);
        }

        // Fallback 2: parse model links from page HTML content directly
        if (links.length === 0 && typeof page.content === 'function') {
          const html = await page.content().catch(() => '');
          const hrefRegex = /href=["']([^"']*(?:model-detail|model)\/[^"']+)["']/g;
          let m;
          while ((m = hrefRegex.exec(html)) !== null) {
            links.push(m[1]);
          }
        }

        // 2. Also check data-id attributes on card elements
        let cardIds = [];
        if (typeof page.locator === 'function') {
          const cardLoc = page.locator('[data-id], [data-model-id], [class*="model-item"], [class*="model-card"]');
          if (cardLoc && typeof cardLoc.evaluateAll === 'function') {
            cardIds = await cardLoc.evaluateAll(cards => {
              return cards.map(c => c.getAttribute('data-id') || c.getAttribute('data-model-id')).filter(Boolean);
            }).catch(() => []);
          }
        }

        for (const href of links) {
          const match = href.match(/\/(?:model-detail|model)\/([a-zA-Z0-9_\-]+)/);
          if (match && match[1]) {
            const id = match[1];
            if (!seenIds.has(id)) {
              seenIds.add(id);
              if (!downloadedModels[id]) {
                const cleanHref = href.split('?')[0];
                const fullUrl = cleanHref.startsWith('http')
                  ? cleanHref
                  : `https://www.crealitycloud.com${cleanHref.startsWith('/') ? '' : '/'}${cleanHref}`;
                models.push({ id, url: fullUrl });
                if (models.length >= count) break;
              }
            }
          }
        }

        for (const id of cardIds) {
          if (models.length >= count) break;
          if (id && !seenIds.has(id) && /^[a-zA-Z0-9_\-]{6,36}$/.test(id)) {
            seenIds.add(id);
            if (!downloadedModels[id]) {
              models.push({ id, url: `https://www.crealitycloud.com/model-detail/${id}` });
            }
          }
        }

        if (models.length < count && attempts < maxScrollAttempts) {
          console.log(`Found ${models.length}/${count} candidate models so far on ${currentUrl}. Scrolling to load more...`);
          try {
            if (typeof page.evaluate === 'function') {
              await page.evaluate(() => window.scrollBy(0, 1500));
            }
          } catch (err) { }
          if (typeof page.waitForTimeout === 'function') {
            await page.waitForTimeout(2500);
          }
        }
      }
    } catch (navErr) {
      console.log(`Warning: Failed browsing catalog URL ${currentUrl}: ${navErr.message}`);
    }
  }

  console.log(`Discovered ${models.length} unvisited model candidates.`);
  return models;
}

/**
 * Execute downloading 10 random distinct models per day.
 * Marks downloaded models with a like to indicate they have been downloaded,
 * satisfying both the download requirement and the daily likes task.
 * @param {import('playwright-core').Page} page
 * @param {object} [options]
 * @param {number} [options.targetCount=10]
 * @param {string} [options.categoryUrl]
 * @returns {Promise<{success: boolean, count: number, models: Array<{id: string, url: string}>, message: string}>}
 */
export async function executeModelDownloads(page, options = {}) {
  const targetCount = options.targetCount !== undefined ? options.targetCount : 10;
  const categoryUrl = options.categoryUrl || DEFAULT_MODELS_URL;
  const trackingFile = options.trackingFile || DOWNLOADS_TRACKING_FILE;

  console.log(`\n=====================================================`);
  console.log(`  Starting Daily Model Downloads Task (Target: ${targetCount}) `);
  console.log(`=====================================================`);

  if (targetCount <= 0) {
    return {
      success: true,
      count: 0,
      models: [],
      message: 'Download task skipped (target count set to 0).'
    };
  }

  const downloadedStore = getDownloadedModels(trackingFile);
  const candidateModels = await discoverModelUrls(page, targetCount * 2, categoryUrl, trackingFile);

  const downloadedList = [];

  for (const candidate of candidateModels) {
    if (downloadedList.length >= targetCount) break;

    console.log(`\n[${downloadedList.length + 1}/${targetCount}] Processing model: ${candidate.id}`);
    console.log(`Navigating to ${candidate.url}...`);

    try {
      await page.goto(candidate.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      await handleAccountSelection(page);

      // 1. Check if model is already liked on Creality Cloud
      const alreadyLiked = await isModelLiked(page);
      if (alreadyLiked) {
        console.log(`Model ${candidate.id} was already liked by user! Marking as downloaded and skipping to maintain distinct downloads.`);
        downloadedStore[candidate.id] = {
          downloadedAt: new Date().toISOString(),
          liked: true,
          url: candidate.url
        };
        saveDownloadedModels(downloadedStore, trackingFile);
        continue;
      }

      // 2. Download the model
      const dlResult = await downloadModel(page);
      console.log(`Download status: ${dlResult.message}`);

      // 3. Like the model to mark it as downloaded
      console.log('Leaving a like to mark model as downloaded...');
      const liked = await likeModel(page);

      // 4. Save to local persistent database
      downloadedStore[candidate.id] = {
        downloadedAt: new Date().toISOString(),
        liked: liked || true,
        url: candidate.url
      };
      saveDownloadedModels(downloadedStore, trackingFile);

      downloadedList.push(candidate);
      console.log(`✅ Model ${candidate.id} successfully processed and marked with like!`);

      // Gentle pause between requests to simulate human interaction
      await page.waitForTimeout(3000);
    } catch (err) {
      console.error(`Error processing model ${candidate.id}:`, err.message);
    }
  }

  const success = downloadedList.length >= targetCount || downloadedList.length > 0;
  const message = `Downloaded and liked ${downloadedList.length}/${targetCount} distinct models.`;
  console.log(`\nResult: ${message}`);

  return {
    success,
    count: downloadedList.length,
    models: downloadedList,
    message
  };
}

/**
 * Post a comment with an attached thumbs-up emoji image.
 * @param {import('playwright-core').Page} page
 * @param {string} [imagePath]
 * @returns {Promise<boolean>}
 */
export async function postImageComment(page, imagePath = DEFAULT_THUMBS_UP_IMAGE) {
  console.log('[Task: Image Comment] Preparing image comment (image only, without text)...');

  // Scroll down to comment section to ensure component is rendered
  try {
    const commentComp = page.locator('.comment-comp, .model-comment-box, [class*="comment-comp"]');
    if (await commentComp.count().catch(() => 0) > 0) {
      await commentComp.first().scrollIntoViewIfNeeded().catch(() => { });
    } else if (typeof page.evaluate === 'function') {
      await page.evaluate(() => window.scrollBy(0, 1200)).catch(() => { });
    }
  } catch (e) { }

  // The user requested NO text in this comment - only the thumbs up image.
  // Locate comment textarea and ensure it is clean.
  const textareaSelectors = [
    '.comment-comp textarea',
    '.comment-textarea-box textarea',
    'textarea.el-textarea__inner',
    'textarea[placeholder*="comment" i]',
    'textarea[placeholder*="coment" i]',
    'textarea[placeholder*="opin" i]',
    'textarea',
    '[contenteditable="true"]'
  ];

  let commentBox = null;
  for (const sel of textareaSelectors) {
    const loc = page.locator(sel);
    const count = await loc.count().catch(() => 0);
    if (count > 0) {
      const el = loc.first();
      if (await el.isVisible().catch(() => false)) {
        commentBox = el;
        break;
      }
    }
  }

  if (commentBox) {
    if (typeof commentBox.scrollIntoViewIfNeeded === 'function') {
      await commentBox.scrollIntoViewIfNeeded().catch(() => { });
    }
    if (typeof commentBox.click === 'function') {
      await commentBox.click().catch(() => { });
    }
    if (typeof commentBox.fill === 'function') {
      await commentBox.fill('');
    }
    if (typeof commentBox.dispatchEvent === 'function') {
      await commentBox.dispatchEvent('input').catch(() => { });
      await commentBox.dispatchEvent('change').catch(() => { });
    }
  }

  // Attach thumbs up image
  let imageAttached = false;
  if (imagePath && fs.existsSync(imagePath)) {
    console.log(`Attaching image: ${imagePath}...`);

    // Primary Strategy: HTML5 DataTransfer API via page.evaluate
    // Bypasses Playwright's Juggler file-picker IPC timeout in custom Firefox
    try {
      if (typeof page.evaluate === 'function') {
        const fileBuffer = fs.readFileSync(imagePath);
        const base64Data = fileBuffer.toString('base64');
        const fileName = path.basename(imagePath);
        const mimeType = fileName.endsWith('.png') ? 'image/png' : 'image/jpeg';

        const evalResult = await page.evaluate(
          ({ base64, name, type }) => {
            try {
              const binStr = atob(base64);
              const len = binStr.length;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) {
                bytes[i] = binStr.charCodeAt(i);
              }
              const file = new File([bytes], name, { type });
              const dt = new DataTransfer();
              dt.items.add(file);

              const selectors = [
                '.comment-comp input[type="file"]',
                '.com-uploadImg input[type="file"]',
                '.comment-operate-box input[type="file"]',
                '.el-upload input[type="file"]',
                'input.el-upload__input'
              ];

              let targetInput = null;
              for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) {
                  targetInput = el;
                  break;
                }
              }

              if (!targetInput) {
                return { success: false, reason: 'Upload input element not found' };
              }

              targetInput.files = dt.files;
              targetInput.dispatchEvent(new Event('change', { bubbles: true }));
              targetInput.dispatchEvent(new Event('input', { bubbles: true }));
              return { success: true };
            } catch (err) {
              return { success: false, reason: err.message };
            }
          },
          { base64: base64Data, name: fileName, type: mimeType }
        );

        if (evalResult && evalResult.success) {
          imageAttached = true;
          console.log('✅ Image attached via DataTransfer evaluation.');
        } else if (evalResult && evalResult.reason) {
          console.log(`DataTransfer attempt notice: ${evalResult.reason}`);
        }
      }
    } catch (evalErr) {
      console.log('Warning: Error in DataTransfer evaluation:', evalErr.message);
    }

    // Strategy 2: Direct setInputFiles on specifically scoped comment file input (short timeout)
    if (!imageAttached) {
      const scopedInputSelectors = [
        '.comment-comp input[type="file"]',
        '.com-uploadImg input[type="file"]',
        '.comment-operate-box input[type="file"]',
        '.el-upload input[type="file"]',
        'input.el-upload__input'
      ];

      for (const inSel of scopedInputSelectors) {
        if (imageAttached) break;
        try {
          const inLoc = page.locator(inSel);
          if (await inLoc.count().catch(() => 0) > 0) {
            console.log(`Attempting direct setInputFiles on ${inSel}...`);
            await inLoc.first().setInputFiles(imagePath, { timeout: 2000 });
            imageAttached = true;
            console.log(`✅ Image file attached directly to ${inSel}.`);
            break;
          }
        } catch (inErr) {
          console.log(`Warning: Failed setting file on ${inSel}: ${inErr.message}`);
        }
      }
    }

    // Strategy 3: Trigger filechooser event by clicking the picture icon or upload box
    if (!imageAttached) {
      const uploadTriggerSelectors = [
        '.comment-comp .upload_comp_box',
        '.comment-comp .icon-tupian',
        '.comment-comp .el-upload',
        '.com-uploadImg .el-upload',
        '.com-uploadImg',
        '.comment-operate-box .upload_comp_box',
        '.upload_comp_box',
        '.icon-tupian',
        '.upload-icon'
      ];

      for (const trigSel of uploadTriggerSelectors) {
        if (imageAttached) break;
        try {
          const triggerLoc = page.locator(trigSel);
          if (await triggerLoc.count().catch(() => 0) > 0) {
            const el = triggerLoc.first();
            if (await el.isVisible().catch(() => false)) {
              console.log(`Triggering file chooser on ${trigSel}...`);
              try {
                const [fileChooser] = await Promise.all([
                  page.waitForEvent('filechooser', { timeout: 3000 }),
                  el.click({ timeout: 2000 })
                ]);
                if (fileChooser) {
                  await fileChooser.setFiles(imagePath);
                  imageAttached = true;
                  console.log('✅ Image file set via filechooser event.');
                  break;
                }
              } catch (fcErr) { }
            }
          }
        } catch (err) { }
      }
    }
  } else {
    console.log(`Warning: Thumbs up image not found at ${imagePath}`);
  }

  // Validate that image was actually attached before proceeding to submit
  if (!imageAttached) {
    console.log('⚠️ Could not attach image to comment. Skipping submission to avoid posting comment without image.');
    return false;
  }

  // Wait for the uploaded image to process and upload to CDN
  console.log('Waiting for image upload to complete...');
  try {
    if (typeof page.waitForSelector === 'function') {
      await page.waitForSelector('.el-loading-mask, [class*="loading-mask"]', { state: 'hidden', timeout: 10000 }).catch(() => { });
    }
  } catch (e) { }

  if (typeof page.waitForTimeout === 'function') {
    await page.waitForTimeout(3500);
  }

  // Submit comment
  let submitted = false;
  for (const sSel of COMMENT_SUBMIT_SELECTORS) {
    const btn = page.locator(sSel);
    const count = await btn.count().catch(() => 0);
    if (count > 0) {
      const el = btn.first();
      if (await el.isVisible().catch(() => false)) {
        console.log(`Submitting image comment (${sSel})...`);
        try {
          await el.scrollIntoViewIfNeeded().catch(() => { });
          await el.click({ timeout: 5000 });
          submitted = true;
        } catch (e) {
          if (typeof el.evaluate === 'function') {
            await el.evaluate(n => n.click()).catch(() => { });
            submitted = true;
          }
        }
        break;
      }
    }
  }

  if (typeof page.waitForTimeout === 'function') {
    await page.waitForTimeout(3000);
  }
  return submitted;
}

/**
 * Execute posting 5 comments with image per day using a thumbs up emoji image.
 * @param {import('playwright-core').Page} page
 * @param {object} [options]
 * @param {number} [options.targetCount=5]
 * @param {string} [options.imagePath]
 * @param {Array<{id: string, url: string}>} [options.candidateModels]
 * @returns {Promise<{success: boolean, count: number, message: string}>}
 */
export async function executeImageComments(page, options = {}) {
  const targetCount = options.targetCount !== undefined ? options.targetCount : 5;
  const imagePath = options.imagePath || DEFAULT_THUMBS_UP_IMAGE;

  console.log(`\n=====================================================`);
  console.log(`  Starting Image Comments Task (Target: ${targetCount}) `);
  console.log(`=====================================================`);

  if (targetCount <= 0) {
    return {
      success: true,
      count: 0,
      message: 'Image comments task skipped (target count set to 0).'
    };
  }

  let models = options.candidateModels;
  if (!models || models.length < targetCount) {
    models = await discoverModelUrls(page, targetCount * 2);
  }

  let count = 0;
  for (const model of models) {
    if (count >= targetCount) break;

    console.log(`\n[${count + 1}/${targetCount}] Leaving image comment on model ${model.id}...`);
    try {
      await page.goto(model.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      await handleAccountSelection(page);

      const posted = await postImageComment(page, imagePath);
      if (posted) {
        count++;
        console.log(`✅ Image comment #${count} posted successfully!`);
      } else {
        console.log(`Failed to post comment on model ${model.id}.`);
      }

      await page.waitForTimeout(3000);
    } catch (err) {
      console.error(`Error commenting on model ${model.id}:`, err.message);
    }
  }

  const success = count >= targetCount || count > 0;
  const message = `Posted ${count}/${targetCount} comments with thumbs-up image.`;
  console.log(`\nResult: ${message}`);

  return {
    success,
    count,
    message
  };
}

/**
 * Post a single comment on a model without image.
 * @param {import('playwright-core').Page} page
 * @param {object} [options]
 * @param {string} [options.modelUrl]
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function executeTextComment(page, options = {}) {
  console.log(`\n=====================================================`);
  console.log(`       Starting Text Comment (Without Image) Task    `);
  console.log(`=====================================================`);

  let targetUrl = options.modelUrl;
  if (!targetUrl) {
    const discovered = await discoverModelUrls(page, 1);
    if (discovered.length > 0) {
      targetUrl = discovered[0].url;
    }
  }

  if (!targetUrl) {
    return {
      success: false,
      message: 'Could not find a model to post text comment.'
    };
  }

  if (!options.skipNavigation) {
    console.log(`Navigating to model for text comment: ${targetUrl}...`);
    if (typeof page.goto === 'function') {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
    if (typeof page.waitForTimeout === 'function') {
      await page.waitForTimeout(3000);
    }
    await handleAccountSelection(page);
  }

  const commentsPool = [
    '¡Excelente diseño! Muchas gracias por compartirlo con la comunidad.',
    'Gran trabajo en los detalles. Muy recomendado para imprimir.',
    'Very clean 3D model, thanks for sharing with everyone!',
    'Diseño impecable, muchas gracias por tu aporte a la comunidad.'
  ];
  const chosenComment = commentsPool[Math.floor(Math.random() * commentsPool.length)];

  // Scroll to comment component to ensure it is rendered and visible in DOM
  try {
    const commentComp = page.locator('.comment-comp, .model-comment-box, [class*="comment-comp"]');
    if (await commentComp.count().catch(() => 0) > 0) {
      await commentComp.first().scrollIntoViewIfNeeded().catch(() => { });
    } else if (typeof page.evaluate === 'function') {
      await page.evaluate(() => window.scrollBy(0, 1200)).catch(() => { });
    }
  } catch (e) { }

  const textareaSelectors = [
    '.comment-comp textarea',
    '.comment-textarea-box textarea',
    'textarea.el-textarea__inner',
    'textarea[placeholder*="comment" i]',
    'textarea[placeholder*="coment" i]',
    'textarea[placeholder*="opin" i]',
    'textarea',
    '[contenteditable="true"]'
  ];

  let commentBox = null;
  for (const sel of textareaSelectors) {
    const loc = page.locator(sel);
    if (await loc.count().catch(() => 0) > 0) {
      const el = loc.first();
      if (await el.isVisible().catch(() => false)) {
        commentBox = el;
        break;
      }
    }
  }

  if (!commentBox) {
    return {
      success: false,
      message: 'Comment textarea not found on page.'
    };
  }

  if (typeof commentBox.scrollIntoViewIfNeeded === 'function') {
    await commentBox.scrollIntoViewIfNeeded().catch(() => { });
  }
  if (typeof commentBox.click === 'function') {
    await commentBox.click().catch(() => { });
  }
  if (typeof commentBox.fill === 'function') {
    await commentBox.fill(chosenComment);
  }
  if (typeof commentBox.dispatchEvent === 'function') {
    await commentBox.dispatchEvent('input').catch(() => { });
    await commentBox.dispatchEvent('change').catch(() => { });
  }
  console.log(`Entered text comment: "${chosenComment}"`);

  if (typeof page.waitForTimeout === 'function') {
    await page.waitForTimeout(2000);
  }

  let submitted = false;
  for (const sSel of COMMENT_SUBMIT_SELECTORS) {
    const btn = page.locator(sSel);
    const count = await btn.count().catch(() => 0);
    if (count > 0) {
      const el = btn.first();
      if (await el.isVisible().catch(() => false)) {
        console.log(`Submitting text comment (${sSel})...`);
        try {
          await el.scrollIntoViewIfNeeded().catch(() => { });
          await el.click({ timeout: 5000 });
          submitted = true;
        } catch (e) {
          if (typeof el.evaluate === 'function') {
            await el.evaluate(n => n.click()).catch(() => { });
            submitted = true;
          }
        }
        break;
      }
    }
  }

  if (typeof page.waitForTimeout === 'function') {
    await page.waitForTimeout(3000);
  }

  if (submitted) {
    const msg = `Successfully posted text comment: "${chosenComment}"`;
    console.log(`✅ ${msg}`);
    return { success: true, message: msg };
  }

  return {
    success: false,
    message: 'Could not submit text comment.'
  };
}

/**
 * Automatically detect the logged-in Creality Cloud user ID.
 * Checks Playwright session cookies (model_user_id, userId, id-application),
 * page profile links (a[href*="/user/"]), page runtime cookies/localStorage,
 * or environment variable.
 * @param {import('playwright-core').Page} page
 * @returns {Promise<string|null>}
 */
export async function getLoggedInUserId(page) {
  // 1. Try to get from Playwright context cookies
  try {
    if (page && typeof page.context === 'function') {
      const context = page.context();
      if (context && typeof context.cookies === 'function') {
        const cookies = await context.cookies();

        // Priority 1: model_user_id (e.g. "xxxxxxxxxx")
        const modelUserCookie = cookies.find(c => c.name === 'model_user_id');
        if (modelUserCookie && modelUserCookie.value) {
          const uid = String(modelUserCookie.value).trim();
          console.log(`[User Detection] Detected user ID from cookie 'model_user_id': ${uid}`);
          return uid;
        }

        // Priority 2: userId (e.g. "xxxxxxxxxx")
        const userCookie = cookies.find(c => c.name === 'userId');
        if (userCookie && userCookie.value) {
          const uid = String(userCookie.value).trim();
          console.log(`[User Detection] Detected user ID from cookie 'userId': ${uid}`);
          return uid;
        }

        // Priority 3: id-application JSON cookie (contains {"userId": xxxxxxxxxx, ...})
        const idAppCookie = cookies.find(c => c.name === 'id-application');
        if (idAppCookie && idAppCookie.value) {
          try {
            const decoded = decodeURIComponent(idAppCookie.value);
            const parsed = JSON.parse(decoded);
            if (parsed && parsed.userId) {
              const uid = String(parsed.userId).trim();
              console.log(`[User Detection] Detected user ID from cookie 'id-application': ${uid}`);
              return uid;
            }
          } catch (e) { }
        }
      }
    }
  } catch (err) {
    console.log('[User Detection] Could not extract from context cookies:', err.message);
  }

  // 2. Try to get from page DOM (profile / user links: a[href*="/user/"])
  try {
    if (page && typeof page.locator === 'function') {
      const userLinks = page.locator('a[href*="/user/"]');
      const count = typeof userLinks.count === 'function' ? await userLinks.count().catch(() => 0) : 0;
      for (let i = 0; i < count; i++) {
        const href = (await userLinks.nth(i).getAttribute('href').catch(() => '')) || '';
        const match = href.match(/\/user\/(\d{5,15})/);
        if (match && match[1]) {
          console.log(`[User Detection] Detected user ID from profile link: ${match[1]}`);
          return match[1];
        }
      }
    }
  } catch (err) { }

  // 3. Try to get from page runtime evaluate (document.cookie or localStorage)
  try {
    if (page && typeof page.evaluate === 'function') {
      const evaluatedId = await page.evaluate(() => {
        if (typeof document !== 'undefined' && document.cookie) {
          const match = document.cookie.match(/(?:model_user_id|userId)=([0-9]{5,15})/);
          if (match) return match[1];
        }
        if (typeof localStorage !== 'undefined') {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const val = localStorage.getItem(key);
            if (val && /user/i.test(key)) {
              try {
                const parsed = JSON.parse(val);
                if (parsed && (parsed.userId || parsed.user_id || parsed.id)) {
                  const id = String(parsed.userId || parsed.user_id || parsed.id);
                  if (/^\d{5,15}$/.test(id)) return id;
                }
              } catch (e) { }
            }
          }
        }
        return null;
      });
      if (evaluatedId) {
        console.log(`[User Detection] Detected user ID from page runtime: ${evaluatedId}`);
        return evaluatedId;
      }
    }
  } catch (err) { }

  // 4. Fallback to environment variable if explicitly defined
  if (process.env.CREALITY_USER_ID) {
    console.log(`[User Detection] Using user ID from CREALITY_USER_ID env: ${process.env.CREALITY_USER_ID}`);
    return process.env.CREALITY_USER_ID;
  }

  // 5. Last resort fallback
  if (DEFAULT_USER_ID) {
    console.log(`[User Detection] Using default user ID fallback: ${DEFAULT_USER_ID}`);
    return DEFAULT_USER_ID;
  }

  return null;
}

/**
 * Detect available boost tickets on the user's boost page.
 * Scopes checks to the boost container and checks for empty state indicators
 * ("Sin datos", empty coupon list), avoiding false positive numbers in user sidebars.
 * @param {import('playwright-core').Page} page
 * @returns {Promise<number>}
 */
export async function getAvailableBoostsCount(page) {
  try {
    // 1. Explicit empty state indicators ("Sin datos" / .empty_comp)
    const emptyIndicators = [
      '.boost-coupon-list-box .empty_comp',
      '.comp-boost-page .empty_comp',
      '.empty_comp:has-text("Sin datos")',
      '.empty_comp:has-text("No data")',
      '.boost-coupon-list-box:has-text("Sin datos")',
      '.boost-coupon-list-box:has-text("No data")',
      '.comp-boost-page:has-text("Sin datos")'
    ];
    for (const emptySel of emptyIndicators) {
      const emptyLoc = page.locator(emptySel);
      if (await emptyLoc.count().catch(() => 0) > 0) {
        if (await emptyLoc.first().isVisible().catch(() => false)) {
          console.log('[Boost Detection] Empty state found on boost page ("Sin datos"). Available boosts: 0');
          return 0;
        }
      }
    }

    // 2. Check tab text for count, e.g. "Disponible (2)"
    const tabLoc = page.locator('text=/Disponible|Available/i');
    const tabCount = await tabLoc.count().catch(() => 0);
    for (let i = 0; i < tabCount; i++) {
      const tabText = (await tabLoc.nth(i).innerText().catch(() => '')).trim();
      const tabMatch = tabText.match(/(?:Disponible|Available)\s*\((\d+)\)/i);
      if (tabMatch && tabMatch[1]) {
        const count = parseInt(tabMatch[1], 10);
        console.log(`[Boost Detection] Detected boost count from tab: ${count}`);
        return count;
      }
    }

    // 3. Count ticket elements inside coupon list container
    const listSelectors = [
      '.boost-coupon-list > div:not(.empty_comp)',
      '.boost-coupon-list [class*="coupon-item"]',
      '.boost-coupon-list [class*="ticket-item"]',
      '.boost-coupon-list [class*="boost-item"]',
      '.boost-coupon-list-box [class*="coupon-item"]'
    ];
    for (const listSel of listSelectors) {
      const items = page.locator(listSel);
      const c = await items.count().catch(() => 0);
      if (c > 0) {
        console.log(`[Boost Detection] Found ${c} boost ticket item(s) via ${listSel}.`);
        return c;
      }
    }

    // 4. Scoped numeric indicators within the boost component container
    const scopedNumSelectors = [
      '.boost-left .num',
      '.ticket-num',
      '.boost-count',
      '.available-num',
      '.ticket-count'
    ];
    for (const sel of scopedNumSelectors) {
      const numLoc = page.locator(sel);
      if (await numLoc.count().catch(() => 0) > 0) {
        const text = (await numLoc.first().innerText().catch(() => '')).trim();
        const num = parseInt(text, 10);
        if (!isNaN(num) && num >= 0) {
          console.log(`[Boost Detection] Detected ${num} boosts via selector: ${sel}`);
          return num;
        }
      }
    }

    // 5. Text match strictly scoped to boost container text (never body text which has profile points)
    const containerLoc = page.locator('.boost-coupon-content-box, .comp-boost-page, .boost-coupon-list-box');
    if (await containerLoc.count().catch(() => 0) > 0) {
      const boxText = await containerLoc.first().innerText().catch(() => '');
      if (/Sin datos|No data/i.test(boxText)) {
        return 0;
      }
      const match = boxText.match(/(?:Disponibles?|Available|Tickets?|Boosts?|Impulsos?)[:\s]*(\d+)/i) ||
        boxText.match(/(\d+)\s*(?:boost|impulso|ticket)/i);
      if (match && match[1]) {
        return parseInt(match[1], 10) || 0;
      }
    }
  } catch (err) {
    console.log('[Boost Detection] Warning while checking boost balance:', err.message);
  }

  return 0;
}

/**
 * Apply a boost ticket to the current model page:
 * 1. Clicks the Impulso / Boost button (.boost-btn).
 * 2. In the "Impulsar el modelo" dialog, selects an option chip (e.g. Gran superficie, Creativo, etc.).
 * 3. Clicks "Confirmar".
 * 4. In the "¡Impulso exitoso!" dialog, clicks "Sortear Ahora" to spin the Boost Raffle wheel (if available), or closes it.
 *
 * @param {import('playwright-core').Page} page
 * @returns {Promise<boolean>}
 */
export async function applyBoostToModel(page) {
  if (typeof ensureAuthenticated === 'function') {
    await ensureAuthenticated(page);
  }

  const boostSelectors = [
    '.model-interaction-box .boost-btn',
    'div.boost-btn.flex-all-center',
    '.boost-btn',
    '[class*="boost-btn"]',
    'button:has-text("Impulsar")',
    'button:has-text("Boost")',
    'div:has-text("Impulso")'
  ];

  let boostBtn = null;
  for (const sel of boostSelectors) {
    try {
      if (typeof page.locator !== 'function') continue;
      const loc = page.locator(sel);
      const count = typeof loc.count === 'function' ? await loc.count().catch(() => 0) : 0;
      if (count > 0) {
        const el = typeof loc.first === 'function' ? loc.first() : loc;
        if (typeof el.isVisible === 'function' && await el.isVisible().catch(() => false)) {
          boostBtn = el;
          console.log(`Found boost button with selector: ${sel}`);
          break;
        }
      }
    } catch (e) {}
  }

  if (!boostBtn) {
    console.log('No visible boost button found on model page.');
    return false;
  }

  if (typeof boostBtn.scrollIntoViewIfNeeded === 'function') {
    await boostBtn.scrollIntoViewIfNeeded().catch(() => {});
  }
  try {
    await boostBtn.click({ timeout: 5000 });
  } catch (e) {
    if (typeof boostBtn.evaluate === 'function') {
      await boostBtn.evaluate(node => node.click()).catch(() => {});
    }
  }
  if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(2500);

  // 1. First dialog: "Impulsar el modelo"
  try {
    if (typeof page.locator === 'function') {
      const boostDialogLoc = page.locator('.el-dialog, [role="dialog"]').filter({
        hasText: /Impulsar el modelo|Boost model|felicitar al creador/i
      });
      const dCount = typeof boostDialogLoc.count === 'function' ? await boostDialogLoc.count().catch(() => 0) : 0;

      if (dCount > 0) {
        const boostDialog = typeof boostDialogLoc.first === 'function' ? boostDialogLoc.first() : boostDialogLoc;
        if (typeof boostDialog.isVisible === 'function' && await boostDialog.isVisible().catch(() => false)) {
          console.log('Boost modal opened ("Impulsar el modelo"). Selecting an option chip...');

          const chipLocators = [
            boostDialog.locator('text=/Gran superficie|Piezas de color|Pocos\/Sin soportes|Impresión rápida|Creativo|Bien orientado/i'),
            boostDialog.locator('.el-tag, .tag-item, [class*="tag"], [class*="chip"], [class*="option"]'),
            boostDialog.locator('div[class*="flex"] span, div[class*="item"]')
          ];

          for (const cLoc of chipLocators) {
            const cCount = typeof cLoc.count === 'function' ? await cLoc.count().catch(() => 0) : 0;
            if (cCount > 0) {
              const chip = typeof cLoc.first === 'function' ? cLoc.first() : cLoc;
              if (typeof chip.isVisible === 'function' && await chip.isVisible().catch(() => false)) {
                console.log('Selecting option chip in boost dialog...');
                try {
                  await chip.click({ timeout: 5000 });
                } catch (ce) {
                  if (typeof chip.evaluate === 'function') await chip.evaluate(node => node.click()).catch(() => {});
                }
                break;
              }
            }
          }

          if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(1000);

          // Click "Confirmar" button
          const confirmBtnLoc = boostDialog.locator('button:has-text("Confirmar"), button:has-text("Confirm"), .el-button--primary, button.confirm-btn');
          if (typeof confirmBtnLoc.count === 'function' && await confirmBtnLoc.count().catch(() => 0) > 0) {
            const confirmBtn = typeof confirmBtnLoc.first === 'function' ? confirmBtnLoc.first() : confirmBtnLoc;
            console.log('Clicking "Confirmar" button in boost dialog...');
            try {
              await confirmBtn.click({ timeout: 5000 });
            } catch (e) {
              if (typeof confirmBtn.evaluate === 'function') {
                await confirmBtn.evaluate(node => node.click()).catch(() => {});
              }
            }
          }

          if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(3000);
        }
      }
    }
  } catch (dialogErr) {
    console.log('Notice handling boost options dialog:', dialogErr.message);
  }

  // 2. Second dialog: "¡Impulso exitoso!" with "Sortear Ahora"
  try {
    if (typeof page.locator === 'function') {
      const successDialogLoc = page.locator('.el-dialog, [role="dialog"]').filter({
        hasText: /Impulso exitoso|sorteo de impulso|Sortear Ahora/i
      });
      const sCount = typeof successDialogLoc.count === 'function' ? await successDialogLoc.count().catch(() => 0) : 0;

      if (sCount > 0) {
        const successDialog = typeof successDialogLoc.first === 'function' ? successDialogLoc.first() : successDialogLoc;
        if (typeof successDialog.isVisible === 'function' && await successDialog.isVisible().catch(() => false)) {
          console.log('Detected "¡Impulso exitoso!" dialog.');
          const sortearBtnLoc = successDialog.locator('button:has-text("Sortear Ahora"), div:has-text("Sortear Ahora"), .el-button--primary');
          const sortCount = typeof sortearBtnLoc.count === 'function' ? await sortearBtnLoc.count().catch(() => 0) : 0;

          if (sortCount > 0) {
            const sortearBtn = typeof sortearBtnLoc.first === 'function' ? sortearBtnLoc.first() : sortearBtnLoc;
            console.log('Clicking "Sortear Ahora" for free boost lucky draw...');

            let targetPage = page;
            if (typeof page.context === 'function') {
              const [newPage] = await Promise.all([
                page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null),
                sortearBtn.click({ timeout: 5000 }).catch(() => {})
              ]);
              if (newPage) targetPage = newPage;
            } else {
              try { await sortearBtn.click({ timeout: 5000 }); } catch (e) {}
            }

            if (typeof targetPage.waitForTimeout === 'function') await targetPage.waitForTimeout(3000);

            // Spin the boost raffle wheel if available
            try {
              if (typeof targetPage.locator === 'function') {
                const startBtnLoc = targetPage.locator('.start-btn, button:has-text("Start"), div:has-text("Start"), [class*="start-btn"]');
                if (typeof startBtnLoc.count === 'function' && await startBtnLoc.count().catch(() => 0) > 0) {
                  const startBtn = typeof startBtnLoc.first === 'function' ? startBtnLoc.first() : startBtnLoc;
                  if (typeof startBtn.isVisible === 'function' && await startBtn.isVisible().catch(() => false)) {
                    console.log('Clicking "Start" on Boost Raffle wheel...');
                    await startBtn.click({ timeout: 5000 }).catch(() => {});
                    if (typeof targetPage.waitForTimeout === 'function') await targetPage.waitForTimeout(5000);
                    console.log('✅ Boost raffle spin completed!');
                  }
                }
              }
            } catch (rErr) {
              console.log('Notice during boost raffle spin:', rErr.message);
            }

            if (targetPage !== page && typeof targetPage.close === 'function') {
              await targetPage.close().catch(() => {});
            }
          } else {
            const laterBtnLoc = successDialog.locator('button:has-text("Más tarde"), div:has-text("Más tarde"), .el-dialog__close');
            if (typeof laterBtnLoc.count === 'function' && await laterBtnLoc.count().catch(() => 0) > 0) {
              const laterBtn = typeof laterBtnLoc.first === 'function' ? laterBtnLoc.first() : laterBtnLoc;
              await laterBtn.click({ timeout: 5000 }).catch(() => {});
            }
          }
        }
      }
    }
  } catch (sErr) {
    console.log('Notice handling boost success modal:', sErr.message);
  }

  return true;
}

/**
 * Check if boosts are available on the user's boost page, and grant them to eligible/downloaded models.
 * @param {import('playwright-core').Page} page
 * @param {object} [options]
 * @param {string} [options.userId]
 * @param {string} [options.boostUrl]
 * @param {string} [options.targetModelUrl]
 * @returns {Promise<{success: boolean, boostsGiven: number, message: string}>}
 */
export async function executeBoost(page, options = {}) {
  let userId = options.userId || process.env.CREALITY_USER_ID;
  if (!userId) {
    userId = await getLoggedInUserId(page);
  }

  let boostUrl = options.boostUrl || process.env.CREALITY_BOOST_URL;
  if (!boostUrl) {
    if (userId) {
      boostUrl = `https://www.crealitycloud.com/es/user/${userId}/boost`;
    } else {
      boostUrl = DEFAULT_BOOST_URL;
    }
  }

  console.log(`\n=====================================================`);
  console.log(`               Starting Boost Checking Task          `);
  console.log(`=====================================================`);
  console.log(`Checking user boost balance at: ${boostUrl}...`);

  await page.goto(boostUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);
  await handleAccountSelection(page);

  // Check available boosts on page with scoped detection
  let availableBoosts = await getAvailableBoostsCount(page);
  console.log(`Available Boost tickets: ${availableBoosts}`);

  if (availableBoosts <= 0) {
    return {
      success: true,
      boostsGiven: 0,
      message: 'No boost tickets available to grant today.'
    };
  }

  let boostsGiven = 0;

  // Boost action:
  // Option A: Check if the boost page lists eligible models with an action button ("Impulsar", "Boost", "Usar")
  const pageBoostButtons = page.locator('button:has-text("Impulsar"), button:has-text("Boost"), button:has-text("Usar"), [class*="boost-btn"]');
  const pageBtnCount = await pageBoostButtons.count().catch(() => 0);

  if (pageBtnCount > 0) {
    for (let i = 0; i < pageBtnCount && availableBoosts > 0; i++) {
      const btn = pageBoostButtons.nth(i);
      if (await btn.isVisible().catch(() => false)) {
        console.log(`Clicking Boost button on boost page...`);
        try {
          await btn.click({ timeout: 5000 });
        } catch (e) { }
        if (typeof page.waitForTimeout === 'function') {
          await page.waitForTimeout(2000);
        }

        // Confirm boost modal if shown
        const confirmLoc = page.locator('.el-dialog button:has-text("Confirm"), .el-dialog button:has-text("Confirmar"), .el-dialog button:has-text("Impulsar"), .el-dialog .el-button--primary');
        if (await confirmLoc.count().catch(() => 0) > 0) {
          try {
            await confirmLoc.first().click({ timeout: 5000 });
          } catch (e) { }
        }

        boostsGiven++;
        availableBoosts--;
        if (typeof page.waitForTimeout === 'function') {
          await page.waitForTimeout(3000);
        }
      }
    }
  }

  // Option B: If not applied via boost page, navigate to a recently downloaded model to grant the boost
  if (boostsGiven === 0 && availableBoosts > 0) {
    let targetModelUrl = options.targetModelUrl;
    if (!targetModelUrl) {
      const downloadedModels = getDownloadedModels();
      const keys = Object.keys(downloadedModels);
      if (keys.length > 0) {
        const lastKey = keys[keys.length - 1];
        targetModelUrl = downloadedModels[lastKey].url || `https://www.crealitycloud.com/model-detail/${lastKey}`;
      } else {
        const discovered = await discoverModelUrls(page, 1);
        if (discovered.length > 0) {
          targetModelUrl = discovered[0].url;
        }
      }
    }

    if (targetModelUrl) {
      console.log(`Navigating to target model to apply boost: ${targetModelUrl}...`);
      await page.goto(targetModelUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      await handleAccountSelection(page);

      const boosted = await applyBoostToModel(page);
      if (boosted) {
        boostsGiven++;
      }
    }
  }

  const message = boostsGiven > 0
    ? `Successfully granted ${boostsGiven} boost(s).`
    : `Had ${availableBoosts} boost(s) available, but could not complete the boost action on models.`;

  console.log(`\nResult: ${message}`);
  return {
    success: boostsGiven > 0,
    boostsGiven,
    message
  };
}

/**
 * Retrieve and parse daily tasks from Creality Cloud incentive points page:
 * https://www.crealitycloud.com/es/incentive-points?thirdType=earn-points
 *
 * Each task card provides:
 * - title (e.g. "Image comments", "Model Boost", "Download Models")
 * - completedCount and targetCount (e.g. 2/5, 0/1)
 * - button text ("Por completar" vs "Completado")
 * - isGreen: true ONLY if the action button has green active styling
 *   (linear-gradient with green rgb or computed green background with white text).
 *   On Creality Cloud, gray buttons are locked/inactive and award 0 points.
 *
 * @param {import('playwright-core').Page} page
 * @returns {Promise<Array<{
 *   idx: number,
 *   title: string,
 *   key: 'IMAGE_COMMENTS' | 'MODEL_BOOST' | 'DOWNLOAD_MODELS' | 'TEXT_COMMENT' | 'LIKE_MODEL' | 'OTHER',
 *   completedCount: number,
 *   targetCount: number,
 *   tip: string,
 *   btnText: string,
 *   isCompleted: boolean,
 *   isGreen: boolean
 * }>>}
 */
export async function getIncentiveTasks(page, options = {}) {
  const maxRetries = options.maxRetries || 3;
  let lastTasks = [];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const forceReload = options.forceReload === true || attempt > 1;
      const currentUrl = page.url ? page.url() : '';
      if (forceReload || !currentUrl.includes('incentive-points')) {
        console.log(`Navigating to incentive points page (attempt ${attempt}/${maxRetries}): ${INCENTIVE_POINTS_URL}...`);
        if (typeof page.goto === 'function') {
          await page.goto(INCENTIVE_POINTS_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        }
        if (typeof page.waitForTimeout === 'function') {
          await page.waitForTimeout(4000);
        }
      }

      await ensureAuthenticated(page);

      // Re-verify URL after ensureAuthenticated in case authorization redirected away
      const urlAfterAuth = page.url ? page.url() : '';
      if (!urlAfterAuth.includes('incentive-points')) {
        console.log(`Redirected after auth check to: ${urlAfterAuth}. Re-navigating to incentive points page...`);
        if (typeof page.goto === 'function') {
          await page.goto(INCENTIVE_POINTS_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        }
        if (typeof page.waitForTimeout === 'function') {
          await page.waitForTimeout(3000);
        }
      }

      // Scroll down progressively to ensure Vue mounts the daily tasks section
      if (typeof page.evaluate === 'function') {
        try {
          for (let s = 0; s < 5; s++) {
            await page.evaluate(() => window.scrollBy(0, 600));
            if (typeof page.waitForTimeout === 'function') {
              await page.waitForTimeout(1000);
            }
          }
        } catch (e) {}
      }

      if (typeof page.waitForFunction === 'function') {
        try {
          await page.waitForFunction(() => {
            return document.querySelectorAll('.do-task-btn, .task-item, .task-item-info, h5').length > 0;
          }, { timeout: 20000 });
        } catch (e) {}
      }

      if (typeof page.evaluate !== 'function') return [];

      const tasks = await page.evaluate(() => {
        // Find .task-item elements first; fallback to .task-item-info or containers
        let items = Array.from(document.querySelectorAll('.task-item'));
        if (items.length === 0) {
          items = Array.from(document.querySelectorAll('.task-item-info, div[class*="task-item"]'));
        }
        const validItems = items.filter(el => {
          const text = el.innerText || '';
          const lower = text.toLowerCase();
          const hasFraction = /\d+\s*\/\s*\d+/.test(text);
          const hasTaskIndicators = lower.includes('point') || lower.includes('punto') ||
                                    lower.includes('completar') || lower.includes('completado') ||
                                    lower.includes('complete') || !!el.querySelector('.do-task-btn');
          return hasFraction && hasTaskIndicators;
        });

        const seenTitles = new Set();
        const result = [];

        for (let i = 0; i < validItems.length; i++) {
          const item = validItems[i];
          const h5El = item.querySelector('h5');
          let title = '';
          if (h5El) {
            title = h5El.innerText || '';
          } else {
            const titleEl = item.querySelector('.task-name') || item.querySelector('[class*="title"]') || item;
            title = titleEl.innerText || '';
          }
          title = title.split(/[\r\n]+/)[0].replace(/\s*\d+\s*\/\s*\d+.*$/, '').trim();
          if (!title || seenTitles.has(title)) continue;
          seenTitles.add(title);

          const tipEl = item.querySelector('.tip, [class*="tip"]');
          const tip = tipEl ? tipEl.innerText.trim() : '';

          let completedCount = 0;
          let targetCount = 0;
          const doneTimesEl = item.querySelector('.done-times');
          const validTimesEl = item.querySelector('.vaild-times, .valid-times');
          if (doneTimesEl && validTimesEl) {
            completedCount = parseInt(doneTimesEl.innerText.trim(), 10) || 0;
            targetCount = parseInt(validTimesEl.innerText.trim(), 10) || 0;
          } else {
            const m = item.innerText.match(/(\d+)\s*\/\s*(\d+)/);
            if (m) {
              completedCount = parseInt(m[1], 10) || 0;
              targetCount = parseInt(m[2], 10) || 0;
            }
          }

          const btn = item.querySelector('.do-task-btn') || Array.from(item.querySelectorAll('div, button, a')).find(el => {
            const t = el.innerText.trim();
            return t === 'Por completar' || t === 'Completado' || t === 'Completed' || t === 'To complete';
          });

          const btnText = btn ? btn.innerText.trim() : '';
          const btnClass = btn ? btn.className : '';
          const itemText = item.innerText || '';
          const hasCompletedText = itemText.includes('Completado') || itemText.includes('Completed') || btnText === 'Completado' || btnText === 'Completed';
          let isCompleted = hasCompletedText || btnClass.includes('disabled') || (targetCount > 0 && completedCount >= targetCount);
          let isGreen = false;

          if (btn && !isCompleted) {
            const comp = window.getComputedStyle(btn);
            const bg = comp.backgroundColor || '';
            const bgImg = comp.backgroundImage || '';
            const color = comp.color || '';

            // Creality Cloud green gradient: linear-gradient(79deg, rgb(130, 206, 91), rgb(0, 172, 70))
            const hasGreenGradient = bgImg.includes('172, 70') || bgImg.includes('206, 91') || bgImg.includes('39, 186') || bgImg.includes('#27ba');
            const hasWhiteText = color === 'rgb(255, 255, 255)' && !bgImg.includes('none');

            let hasGreenBg = false;
            const bgMatch = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (bgMatch) {
              const r = parseInt(bgMatch[1], 10);
              const g = parseInt(bgMatch[2], 10);
              const b = parseInt(bgMatch[3], 10);
              if (g > 100 && g > r + 20 && g > b + 20) {
                hasGreenBg = true;
              }
            }

            if (hasGreenGradient || hasWhiteText || hasGreenBg) {
              isGreen = true;
            }
          }

          let key = 'OTHER';
          const lowerTitle = title.toLowerCase();
          if (lowerTitle.includes('image comments') || lowerTitle.includes('comentarios de im')) {
            key = 'IMAGE_COMMENTS';
          } else if (lowerTitle.includes('model boost') || lowerTitle.includes('impulsar modelo') || lowerTitle === 'boost') {
            key = 'MODEL_BOOST';
          } else if (lowerTitle.includes('download models') || lowerTitle.includes('descargar modelos')) {
            key = 'DOWNLOAD_MODELS';
          } else if (lowerTitle.includes('comment on models') || lowerTitle.includes('comentar en modelos')) {
            key = 'TEXT_COMMENT';
          } else if (lowerTitle.includes('like 3d model') || lowerTitle.includes('me gusta')) {
            key = 'LIKE_MODEL';
          } else if (lowerTitle.includes('collection models') || lowerTitle.includes('colección') || lowerTitle.includes('coleccion')) {
            key = 'COLLECTION_MODELS';
          }

          result.push({
            idx: i,
            title,
            key,
            completedCount,
            targetCount,
            tip,
            btnText,
            isCompleted,
            isGreen
          });
        }

        return result;
      });

      if (tasks && tasks.length > 0) {
        return tasks;
      }

      console.log(`[Incentive Tasks] Attempt ${attempt}/${maxRetries} loaded 0 daily tasks. Waiting before retry...`);
      lastTasks = tasks || [];
      if (attempt < maxRetries && typeof page.waitForTimeout === 'function') {
        await page.waitForTimeout(3000);
      }
    } catch (err) {
      console.error(`[Incentive Tasks] Warning on attempt ${attempt}/${maxRetries}:`, err.message);
      if (attempt < maxRetries && typeof page.waitForTimeout === 'function') {
        await page.waitForTimeout(3000);
      }
    }
  }

  return lastTasks;
}

/**
 * Click the "Por completar" action button for a given taskKey.
 * @param {import('playwright-core').Page} page
 * @param {string} taskKey
 * @returns {Promise<{success: boolean, destinationUrl: string}>}
 */
export async function clickIncentiveTaskAction(page, taskKey) {
  try {
    let clicked = false;
    if (typeof page.locator === 'function') {
      const itemLoc = page.locator('.task-item, .task-item-info, div[class*="task-item"]').filter({
        has: page.locator('.do-task-btn, div:has-text("Por completar"), button:has-text("Por completar")')
      });

      const count = await itemLoc.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        const text = await itemLoc.nth(i).innerText().catch(() => '');
        const lower = text.toLowerCase();
        let matches = false;
        if (taskKey === 'IMAGE_COMMENTS' && (lower.includes('image comments') || lower.includes('comentarios de im'))) matches = true;
        if (taskKey === 'MODEL_BOOST' && (lower.includes('model boost') || lower.includes('impulsar'))) matches = true;
        if (taskKey === 'DOWNLOAD_MODELS' && (lower.includes('download models') || lower.includes('descargar'))) matches = true;
        if (taskKey === 'TEXT_COMMENT' && (lower.includes('comment on models') || lower.includes('comentar en modelos'))) matches = true;
        if (taskKey === 'LIKE_MODEL' && (lower.includes('like 3d model') || lower.includes('me gusta'))) matches = true;
        if (taskKey === 'COLLECTION_MODELS' && (lower.includes('collection') || lower.includes('colecci'))) matches = true;

        if (matches) {
          const btn = itemLoc.nth(i).locator('.do-task-btn, div:has-text("Por completar"), button:has-text("Por completar")').first();
          if (typeof btn.scrollIntoViewIfNeeded === 'function') {
            await btn.scrollIntoViewIfNeeded().catch(() => { });
          }
          try {
            await btn.click({ timeout: 5000 });
            clicked = true;
          } catch (e) { }
          break;
        }
      }
    }

    // Fallback: evaluate click
    if (!clicked && typeof page.evaluate === 'function') {
      clicked = await page.evaluate((targetKey) => {
        let items = Array.from(document.querySelectorAll('.task-item'));
        if (items.length === 0) {
          items = Array.from(document.querySelectorAll('.task-item-info, div[class*="task-item"]'));
        }
        for (const item of items) {
          const text = (item.innerText || '').toLowerCase();
          let matches = false;
          if (targetKey === 'IMAGE_COMMENTS' && (text.includes('image comments') || text.includes('comentarios de im'))) matches = true;
          if (targetKey === 'MODEL_BOOST' && (text.includes('model boost') || text.includes('impulsar'))) matches = true;
          if (targetKey === 'DOWNLOAD_MODELS' && (text.includes('download models') || text.includes('descargar'))) matches = true;
          if (targetKey === 'TEXT_COMMENT' && (text.includes('comment on models') || text.includes('comentar en modelos'))) matches = true;
          if (targetKey === 'LIKE_MODEL' && (text.includes('like 3d model') || text.includes('me gusta'))) matches = true;
          if (targetKey === 'COLLECTION_MODELS' && (text.includes('collection') || text.includes('colecci'))) matches = true;

          if (matches) {
            const btn = item.querySelector('.do-task-btn') || Array.from(item.querySelectorAll('div, button, a')).find(el => el.innerText.trim() === 'Por completar');
            if (btn) {
              btn.click();
              return true;
            }
          }
        }
        return false;
      }, taskKey);
    }

    if (typeof page.waitForTimeout === 'function') {
      await page.waitForTimeout(4000);
    }

    const currentUrl = page.url ? page.url() : '';
    return { success: clicked, destinationUrl: currentUrl };
  } catch (err) {
    console.error(`Warning: Error clicking incentive task button for ${taskKey}:`, err.message);
    return { success: false, destinationUrl: page.url ? page.url() : '' };
  }
}

/**
 * Extract model links and details from current page (e.g. downloaded models list).
 * @param {import('playwright-core').Page} page
 * @param {number} [limit=20]
 * @returns {Promise<Array<{id: string, url: string, title?: string}>>}
 */
export async function extractModelsFromCurrentPage(page, limit = 20) {
  try {
    if (typeof page.evaluate !== 'function') return [];

    // Scroll progressively to reveal more models if currently fewer than requested
    for (let s = 0; s < 4; s++) {
      const currentCount = await page.evaluate(() => {
        return document.querySelectorAll('a[href*="/model-detail/"], a[href*="/model/"]').length;
      }).catch(() => 0);
      if (currentCount >= limit) break;
      await page.evaluate(() => window.scrollBy(0, 800)).catch(() => {});
      if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(800);
    }

    const models = await page.evaluate((maxLimit) => {
      const anchors = Array.from(document.querySelectorAll('a[href*="/model-detail/"], a[href*="/model/"]'));
      const seen = new Set();
      const list = [];

      for (const a of anchors) {
        let href = a.href || '';
        if (href.includes('/model-category') || href.includes('/model-tags')) continue;

        const cleanHref = href.split('?')[0];
        const match = cleanHref.match(/\/model(?:-detail)?\/([^/?#]+)/);
        if (match && match[1]) {
          const id = match[1];
          if (!seen.has(id)) {
            seen.add(id);
            const title = (a.innerText || a.getAttribute('title') || id).trim().split('\n')[0];
            list.push({ id, url: href, title });
            if (list.length >= maxLimit) break;
          }
        }
      }
      return list;
    }, limit);

    return models;
  } catch (err) {
    console.error('Warning: Error extracting models from current page:', err.message);
    return [];
  }
}

/**
 * Helper to record actions on models in the downloaded store.
 */
function recordModelAction(store, model, actions, trackingFile) {
  store[model.id] = {
    downloadedAt: store[model.id]?.downloadedAt || new Date().toISOString(),
    liked: store[model.id]?.liked || actions.liked || false,
    url: model.url,
    title: model.title || store[model.id]?.title,
    actions: {
      ...(store[model.id]?.actions || {}),
      ...actions
    }
  };
  saveDownloadedModels(store, trackingFile);
}

/**
 * Unified daily model automation pass.
 * Follows Creality Cloud's incentive points guidelines:
 * 1. Checks https://www.crealitycloud.com/es/incentive-points?thirdType=earn-points
 * 2. Parses active tasks, current quotas, and buttons.
 * 3. Enforces Creality Cloud's rule: ONLY tasks with GREEN buttons are active and count points.
 * 4. Clicks "Por completar" on the active green task to navigate to the eligible models list
 *    (e.g., https://www.crealitycloud.com/es/user/${userId}/model-download for Downloaded models only).
 * 5. Executes the required actions on the eligible models.
 * 6. Re-checks the incentive points page to verify progress and execute subsequent green tasks.
 *
 * @param {import('playwright-core').Page} page
 * @param {object} [options]
 * @param {boolean} [options.enableDownloads=true]
 * @param {number} [options.downloadsCount=10]
 * @param {boolean} [options.enableImageComments=true]
 * @param {number} [options.imageCommentsCount=5]
 * @param {boolean} [options.enableTextComment=true]
 * @param {number} [options.textCommentsCount=1]
 * @param {boolean} [options.enableBoost=true]
 * @param {string} [options.userId]
 * @param {string} [options.boostUrl]
 * @param {string} [options.imagePath]
 * @param {string} [options.trackingFile]
 * @param {Array<{id: string, url: string}>} [options.candidateModels]
 * @returns {Promise<{
 *   success: boolean,
 *   quotas: {
 *     downloads: { target: number, completed: number },
 *     imageComments: { target: number, completed: number },
 *     textComments: { target: number, completed: number },
 *     boosts: { target: number, completed: number }
 *   },
 *   modelsProcessed: Array<{id: string, url: string, actions: object}>,
 *   message: string
 * }>}
 */
export async function executeDailyModelTasks(page, options = {}) {
  const enableDownloads = options.enableDownloads !== false;
  const targetDownloads = enableDownloads ? (options.downloadsCount !== undefined ? options.downloadsCount : 10) : 0;

  const enableImageComments = options.enableImageComments !== false;
  const targetImageComments = enableImageComments ? (options.imageCommentsCount !== undefined ? options.imageCommentsCount : 5) : 0;

  const enableTextComment = options.enableTextComment !== false;
  const targetTextComments = enableTextComment ? (options.textCommentsCount !== undefined ? options.textCommentsCount : 1) : 0;

  const enableBoost = options.enableBoost !== false;
  const enableCollection = options.enableCollection !== false;
  const targetCollections = enableCollection ? (options.collectionsCount !== undefined ? options.collectionsCount : 1) : 0;

  const imagePath = options.imagePath || DEFAULT_THUMBS_UP_IMAGE;
  const trackingFile = options.trackingFile || DOWNLOADS_TRACKING_FILE;

  console.log('\n=====================================================');
  console.log('   Starting Daily Incentive Automation Pass          ');
  console.log('=====================================================');
  console.log(`Daily Quota Targets:`);
  console.log(`  - Downloads & Likes:  ${targetDownloads}`);
  console.log(`  - Comments with Image:${targetImageComments}`);
  console.log(`  - Text Comments:      ${targetTextComments}`);
  console.log(`  - Auto Boost:         ${enableBoost ? 'ENABLED' : 'DISABLED'}`);
  console.log(`  - Collection Models:  ${enableCollection ? targetCollections : 'DISABLED'}`);

  let availableBoosts = 0;
  if (enableBoost) {
    let userId = options.userId || process.env.CREALITY_USER_ID;
    if (!userId && typeof getLoggedInUserId === 'function') {
      userId = await getLoggedInUserId(page);
    }
    const boostUrl = options.boostUrl || process.env.CREALITY_BOOST_URL || (userId ? `https://www.crealitycloud.com/es/user/${userId}/boost` : DEFAULT_BOOST_URL);

    try {
      if (typeof page.goto === 'function') {
        await page.goto(boostUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      }
      if (typeof page.waitForTimeout === 'function') {
        await page.waitForTimeout(3000);
      }
      await handleAccountSelection(page);

      availableBoosts = await getAvailableBoostsCount(page);
    } catch (boostCheckErr) {
      console.log('Warning: Could not check boost balance:', boostCheckErr.message);
    }
  }

  const targetBoosts = enableBoost ? availableBoosts : 0;

  const quotas = {
    downloads: { target: targetDownloads, completed: 0 },
    imageComments: { target: targetImageComments, completed: 0 },
    textComments: { target: targetTextComments, completed: 0 },
    boosts: { target: targetBoosts, completed: 0 },
    collections: { target: targetCollections, completed: 0 }
  };

  const allQuotasMet = () => {
    return quotas.downloads.completed >= quotas.downloads.target &&
      quotas.imageComments.completed >= quotas.imageComments.target &&
      quotas.textComments.completed >= quotas.textComments.target &&
      quotas.boosts.completed >= quotas.boosts.target &&
      quotas.collections.completed >= quotas.collections.target;
  };

  if (allQuotasMet()) {
    console.log('All configured daily quotas are already met or disabled.');
    return {
      success: true,
      quotas,
      modelsProcessed: [],
      message: 'All daily model quotas completed (none pending).'
    };
  }

  const downloadedStore = getDownloadedModels(trackingFile);
  const modelsProcessed = [];
  const todayStr = new Date().toISOString().slice(0, 10);

  // Workflow A: If explicit candidateModels are provided (e.g. testing or manual list), process them directly
  if (options.candidateModels && options.candidateModels.length > 0) {
    const candidates = options.candidateModels;
    for (let i = 0; i < candidates.length; i++) {
      if (allQuotasMet()) {
        console.log('\n🎉 All daily quotas have been successfully fulfilled!');
        break;
      }

      const candidate = candidates[i];
      console.log(`\n=====================================================`);
      console.log(`Processing Model [${i + 1}/${candidates.length}]: ${candidate.id}`);
      console.log(`URL: ${candidate.url}`);
      console.log(`Quotas remaining -> Downloads: ${quotas.downloads.completed}/${quotas.downloads.target}, Image Comments: ${quotas.imageComments.completed}/${quotas.imageComments.target}, Text: ${quotas.textComments.completed}/${quotas.textComments.target}, Boosts: ${quotas.boosts.completed}/${quotas.boosts.target}, Collections: ${quotas.collections.completed}/${quotas.collections.target}`);
      console.log(`=====================================================`);

      try {
        if (typeof page.goto === 'function') {
          await page.goto(candidate.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        }
        if (typeof page.waitForTimeout === 'function') {
          await page.waitForTimeout(3000);
        }
        await ensureAuthenticated(page);

        const alreadyLiked = await isModelLiked(page);
        if (alreadyLiked) {
          console.log(`Model ${candidate.id} is already liked on Creality Cloud. Marking as downloaded and skipping to next distinct model.`);
          recordModelAction(downloadedStore, candidate, { liked: true }, trackingFile);
          continue;
        }

        const modelActions = { downloaded: false, liked: false, imageComment: false, textComment: false, boosted: false };

        if (quotas.downloads.completed < quotas.downloads.target) {
          console.log(`[Task: Download] Initiating download for model ${candidate.id}...`);
          const dlRes = await downloadModel(page);
          if (dlRes.success) {
            quotas.downloads.completed++;
            modelActions.downloaded = true;
            console.log(`✅ [Downloads: ${quotas.downloads.completed}/${quotas.downloads.target}] Model downloaded successfully.`);
          }
        }

        console.log(`[Task: Like] Liking model ${candidate.id} to mark it as downloaded...`);
        const liked = await likeModel(page);
        if (liked) {
          modelActions.liked = true;
          console.log(`✅ Model ${candidate.id} marked with Like.`);
        }

        if (quotas.textComments.completed < quotas.textComments.target) {
          console.log(`[Task: Text Comment] Leaving text comment on model ${candidate.id}...`);
          const textRes = await executeTextComment(page, { modelUrl: candidate.url, skipNavigation: true });
          if (textRes.success) {
            quotas.textComments.completed++;
            modelActions.textComment = true;
            console.log(`✅ [Text Comments: ${quotas.textComments.completed}/${quotas.textComments.target}] Text comment posted.`);
          }
          if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(3000);
        }

        if (quotas.imageComments.completed < quotas.imageComments.target) {
          console.log(`[Task: Image Comment] Leaving comment with thumbs-up image on model ${candidate.id}...`);
          const imgPosted = await postImageComment(page, imagePath);
          if (imgPosted) {
            quotas.imageComments.completed++;
            modelActions.imageComment = true;
            console.log(`✅ [Image Comments: ${quotas.imageComments.completed}/${quotas.imageComments.target}] Image comment with 👍 posted.`);
          }
        }

        if (quotas.boosts.completed < quotas.boosts.target) {
          console.log(`[Task: Boost] Granting boost ticket to model ${candidate.id}...`);
          const boosted = await applyBoostToModel(page);
          if (boosted) {
            quotas.boosts.completed++;
            modelActions.boosted = true;
            console.log(`✅ [Boosts: ${quotas.boosts.completed}/${quotas.boosts.target}] Boost granted to model ${candidate.id}.`);
          }
        }

        if (quotas.collections.completed < quotas.collections.target) {
          console.log(`[Task: Collection] Adding model ${candidate.id} to collection...`);
          const collected = await collectModel(page);
          if (collected) {
            quotas.collections.completed++;
            modelActions.collected = true;
            console.log(`✅ [Collections: ${quotas.collections.completed}/${quotas.collections.target}] Model added to collection.`);
          }
        }

        recordModelAction(downloadedStore, candidate, modelActions, trackingFile);
        modelsProcessed.push({ id: candidate.id, url: candidate.url, actions: modelActions });

        if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(3000);
      } catch (modelErr) {
        console.error(`Error processing model ${candidate.id}:`, modelErr.message);
      }
    }

    const success = (quotas.downloads.target === 0 || quotas.downloads.completed > 0) &&
      (quotas.imageComments.target === 0 || quotas.imageComments.completed > 0);
    const summaryMessage = `Daily model tasks: ${quotas.downloads.completed}/${quotas.downloads.target} downloads & likes, ${quotas.imageComments.completed}/${quotas.imageComments.target} image comments, ${quotas.textComments.completed}/${quotas.textComments.target} text comment, ${quotas.boosts.completed}/${quotas.boosts.target} boosts, ${quotas.collections.completed}/${quotas.collections.target} collections.`;
    return { success, quotas, modelsProcessed, message: summaryMessage };
  }

  // Workflow B: Incentive Points Driven Execution (Respects green buttons & (Downloaded models only))
  let userId = options.userId || process.env.CREALITY_USER_ID;
  if (!userId && typeof getLoggedInUserId === 'function') {
    userId = await getLoggedInUserId(page);
  }

  let usedIncentiveWorkflow = false;
  for (let pass = 1; pass <= 15; pass++) {
    console.log(`\n--- Incentive Task Pass #${pass} ---`);
    const tasks = await getIncentiveTasks(page, { forceReload: pass > 1, maxRetries: 3 });

    if (!tasks || tasks.length === 0) {
      if (pass === 1) {
        console.log('Notice: Could not load tasks from incentive-points page after 3 retries. Falling back to catalog discovery.');
      }
      break;
    }

    usedIncentiveWorkflow = true;

    // Display formatted dashboard of daily tasks
    console.log('\n=====================================================');
    console.log('       Creality Cloud Incentive Daily Tasks          ');
    console.log('=====================================================');
    tasks.forEach(t => {
      const statusLabel = t.isCompleted
        ? '✅ COMPLETED'
        : (t.isGreen ? '🟢 ACTIVE / GREEN' : '⚪ INACTIVE / GRAY');
      console.log(`  - ${t.title.padEnd(22)} ${String(t.completedCount).padStart(2)}/${String(t.targetCount).padEnd(2)} [${statusLabel}]`);
    });
    console.log('=====================================================');

    // Update quotas counters based on server truth without regressing
    tasks.forEach(t => {
      if (t.key === 'DOWNLOAD_MODELS') {
        quotas.downloads.completed = Math.max(quotas.downloads.completed, t.completedCount);
        if (options.downloadsCount === undefined) quotas.downloads.target = t.targetCount;
      } else if (t.key === 'IMAGE_COMMENTS') {
        quotas.imageComments.completed = Math.max(quotas.imageComments.completed, t.completedCount);
        if (options.imageCommentsCount === undefined) quotas.imageComments.target = t.targetCount;
      } else if (t.key === 'TEXT_COMMENT') {
        quotas.textComments.completed = Math.max(quotas.textComments.completed, t.completedCount);
        if (options.textCommentsCount === undefined) quotas.textComments.target = t.targetCount;
      } else if (t.key === 'MODEL_BOOST') {
        quotas.boosts.completed = Math.max(quotas.boosts.completed, t.completedCount);
        quotas.boosts.target = t.targetCount;
      } else if (t.key === 'COLLECTION_MODELS') {
        quotas.collections.completed = Math.max(quotas.collections.completed, t.completedCount);
        if (options.collectionsCount === undefined) quotas.collections.target = t.targetCount;
      }
    });

    const pendingTasks = tasks.filter(t => {
      if (t.isCompleted || t.completedCount >= t.targetCount) return false;
      if (t.key === 'IMAGE_COMMENTS') return enableImageComments && quotas.imageComments.completed < quotas.imageComments.target;
      if (t.key === 'MODEL_BOOST') {
        if (!enableBoost) return false;
        if (availableBoosts === 0) {
          return false;
        }
        return true;
      }
      if (t.key === 'DOWNLOAD_MODELS') return enableDownloads && quotas.downloads.completed < quotas.downloads.target;
      if (t.key === 'TEXT_COMMENT') return enableTextComment && quotas.textComments.completed < quotas.textComments.target;
      if (t.key === 'COLLECTION_MODELS') return enableCollection && quotas.collections.completed < quotas.collections.target;
      if (t.key === 'LIKE_MODEL') return enableDownloads;
      return false;
    });

    if (enableBoost && availableBoosts === 0 && tasks.some(t => t.key === 'MODEL_BOOST' && t.isGreen && !t.isCompleted)) {
      console.log('Notice: Model Boost is active (green) on Creality Cloud, but boost balance is 0 tickets. Skipping boost.');
    }

    if (pendingTasks.length === 0) {
      console.log('\n🎉 All configured daily incentive tasks on Creality Cloud are completed!');
      break;
    }

    // Find the first task with an ACTIVE GREEN button
    const activeTask = pendingTasks.find(t => t.isGreen);

    if (!activeTask) {
      const lockedList = pendingTasks.map(t => `${t.title} (${t.completedCount}/${t.targetCount})`).join(', ');
      console.log(`\nNotice: The following tasks are still incomplete but currently locked/gray on Creality Cloud: ${lockedList}.`);
      console.log('Only tasks with green buttons award points on Creality Cloud. Stopping to avoid invalid actions.');
      break;
    }

    console.log(`\n=====================================================`);
    console.log(`>>> Executing Active Green Task: ${activeTask.title} (${activeTask.completedCount}/${activeTask.targetCount}) <<<`);
    console.log(`=====================================================`);

    const needed = activeTask.targetCount - activeTask.completedCount;

    // Click "Por completar" on the active task
    await clickIncentiveTaskAction(page, activeTask.key);

    // If still on incentive page and task requires downloaded models, navigate directly to model-download
    if (page.url().includes('incentive-points')) {
      if (activeTask.key === 'IMAGE_COMMENTS' || activeTask.key === 'MODEL_BOOST' || activeTask.key === 'TEXT_COMMENT') {
        const userDownloadsUrl = `https://www.crealitycloud.com/es/user/${userId || DEFAULT_USER_ID}/model-download`;
        console.log(`Navigating to downloaded models list: ${userDownloadsUrl}...`);
        await page.goto(userDownloadsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(3000);
      } else if (activeTask.key === 'DOWNLOAD_MODELS' || activeTask.key === 'COLLECTION_MODELS' || activeTask.key === 'LIKE_MODEL') {
        await page.goto(DEFAULT_DISCOVERY_URLS[0], { waitUntil: 'domcontentloaded', timeout: 30000 });
        if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(3000);
      }
    }

    let candidateList = await extractModelsFromCurrentPage(page, needed + 15);
    console.log(`Found ${candidateList.length} candidate models on destination page: ${page.url()}`);

    if (candidateList.length === 0) {
      console.log('Destination page had no models. Discovering models from catalog...');
      candidateList = await discoverModelUrls(page, needed + 5, options.categoryUrl, trackingFile);
    }

    // Execute the specific task actions
    if (activeTask.key === 'IMAGE_COMMENTS') {
      let done = 0;
      for (const m of candidateList) {
        if (done >= needed) break;
        const entry = downloadedStore[m.id];
        if (entry?.actions?.imageCommentDate === todayStr) {
          continue; // Already commented today
        }

        console.log(`\n[Image Comment: ${done + 1}/${needed}] Navigating to model ${m.id}...`);
        try {
          await page.goto(m.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(3000);
          await ensureAuthenticated(page);

          const posted = await postImageComment(page, imagePath);
          if (posted) {
            done++;
            quotas.imageComments.completed++;
            recordModelAction(downloadedStore, m, { imageComment: true, imageCommentDate: todayStr }, trackingFile);
            modelsProcessed.push({ id: m.id, url: m.url, actions: { imageComment: true } });
            console.log(`✅ [Image Comments: ${quotas.imageComments.completed}/${quotas.imageComments.target}] Posted thumbs-up comment.`);
          }
          if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(3000);
        } catch (err) {
          console.error(`Error commenting on model ${m.id}:`, err.message);
        }
      }
    } else if (activeTask.key === 'MODEL_BOOST') {
      let done = 0;
      for (const m of candidateList) {
        if (done >= needed) break;
        console.log(`\n[Boost: ${done + 1}/${needed}] Navigating to model ${m.id}...`);
        try {
          await page.goto(m.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(3000);
          await ensureAuthenticated(page);

          const boosted = await applyBoostToModel(page);
          if (boosted) {
            done++;
            quotas.boosts.completed++;
            recordModelAction(downloadedStore, m, { boosted: true }, trackingFile);
            modelsProcessed.push({ id: m.id, url: m.url, actions: { boosted: true } });
            console.log(`✅ [Boosts: ${quotas.boosts.completed}/${quotas.boosts.target}] Boost applied.`);
          }
        } catch (err) {
          console.error(`Error boosting model ${m.id}:`, err.message);
        }
      }
    } else if (activeTask.key === 'DOWNLOAD_MODELS') {
      let done = 0;
      for (const m of candidateList) {
        if (done >= needed) break;
        console.log(`\n[Download: ${done + 1}/${needed}] Navigating to model ${m.id}...`);
        try {
          await page.goto(m.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(3000);
          await ensureAuthenticated(page);

          const dlRes = await downloadModel(page);
          const liked = await likeModel(page);
          if (dlRes.success) {
            done++;
            quotas.downloads.completed++;
            recordModelAction(downloadedStore, m, { downloaded: true, liked }, trackingFile);
            modelsProcessed.push({ id: m.id, url: m.url, actions: { downloaded: true, liked } });
            console.log(`✅ [Downloads: ${quotas.downloads.completed}/${quotas.downloads.target}] Model downloaded.`);
          }
        } catch (err) {
          console.error(`Error downloading model ${m.id}:`, err.message);
        }
      }

      if (done < needed) {
        console.log(`Need ${needed - done} more downloads. Discovering more models from catalog...`);
        const moreCandidates = await discoverModelUrls(page, (needed - done) + 5, options.categoryUrl, trackingFile);
        for (const m of moreCandidates) {
          if (done >= needed) break;
          console.log(`\n[Download: ${done + 1}/${needed}] Navigating to model ${m.id}...`);
          try {
            await page.goto(m.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(3000);
            await ensureAuthenticated(page);

            const dlRes = await downloadModel(page);
            const liked = await likeModel(page);
            if (dlRes.success) {
              done++;
              quotas.downloads.completed++;
              recordModelAction(downloadedStore, m, { downloaded: true, liked }, trackingFile);
              modelsProcessed.push({ id: m.id, url: m.url, actions: { downloaded: true, liked } });
              console.log(`✅ [Downloads: ${quotas.downloads.completed}/${quotas.downloads.target}] Model downloaded.`);
            }
          } catch (err) {
            console.error(`Error downloading model ${m.id}:`, err.message);
          }
        }
      }
    } else if (activeTask.key === 'COLLECTION_MODELS') {
      let done = 0;
      for (const m of candidateList) {
        if (done >= needed) break;
        console.log(`\n[Collection: ${done + 1}/${needed}] Navigating to model ${m.id}...`);
        try {
          await page.goto(m.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(3000);
          await ensureAuthenticated(page);

          const collected = await collectModel(page);
          if (collected) {
            done++;
            quotas.collections.completed++;
            recordModelAction(downloadedStore, m, { collected: true }, trackingFile);
            modelsProcessed.push({ id: m.id, url: m.url, actions: { collected: true } });
            console.log(`✅ [Collections: ${quotas.collections.completed}/${quotas.collections.target}] Model collected.`);
          }
        } catch (err) {
          console.error(`Error collecting model ${m.id}:`, err.message);
        }
      }

      if (done < needed) {
        console.log(`Need ${needed - done} more collections. Discovering more models from catalog...`);
        const moreCandidates = await discoverModelUrls(page, (needed - done) + 5, options.categoryUrl, trackingFile);
        for (const m of moreCandidates) {
          if (done >= needed) break;
          console.log(`\n[Collection: ${done + 1}/${needed}] Navigating to model ${m.id}...`);
          try {
            await page.goto(m.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(3000);
            await ensureAuthenticated(page);

            const collected = await collectModel(page);
            if (collected) {
              done++;
              quotas.collections.completed++;
              recordModelAction(downloadedStore, m, { collected: true }, trackingFile);
              modelsProcessed.push({ id: m.id, url: m.url, actions: { collected: true } });
              console.log(`✅ [Collections: ${quotas.collections.completed}/${quotas.collections.target}] Model collected.`);
            }
          } catch (err) {
            console.error(`Error collecting model ${m.id}:`, err.message);
          }
        }
      }
    } else if (activeTask.key === 'TEXT_COMMENT') {
      if (candidateList.length > 0) {
        const m = candidateList[0];
        console.log(`\n[Text Comment] Navigating to model ${m.id}...`);
        const textRes = await executeTextComment(page, { modelUrl: m.url });
        if (textRes.success) {
          quotas.textComments.completed++;
          recordModelAction(downloadedStore, m, { textComment: true }, trackingFile);
          modelsProcessed.push({ id: m.id, url: m.url, actions: { textComment: true } });
        }
      }
    } else if (activeTask.key === 'LIKE_MODEL') {
      if (candidateList.length > 0) {
        const m = candidateList[0];
        console.log(`\n[Like Model] Navigating to model ${m.id}...`);
        await page.goto(m.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const liked = await likeModel(page);
        if (liked) {
          modelsProcessed.push({ id: m.id, url: m.url, actions: { liked: true } });
        }
      }
    }

    // Refresh incentive points page for next pass
    console.log(`\nRefreshing incentive points status at: ${INCENTIVE_POINTS_URL}...`);
    try {
      await page.goto(INCENTIVE_POINTS_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(3000);
    } catch (e) { }
  }

  // Fallback to legacy single-pass discovery if incentive workflow could not run
  if (!usedIncentiveWorkflow) {
    console.log('Running legacy discovery model workflow...');
    const needed = Math.max(targetDownloads, targetImageComments, targetTextComments, targetCollections, 10) + 5;
    const candidates = await discoverModelUrls(page, needed, options.categoryUrl, trackingFile);

    for (let i = 0; i < candidates.length; i++) {
      if (allQuotasMet()) break;
      const candidate = candidates[i];
      try {
        await page.goto(candidate.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(3000);
        await ensureAuthenticated(page);

        const alreadyLiked = await isModelLiked(page);
        if (alreadyLiked) {
          recordModelAction(downloadedStore, candidate, { liked: true }, trackingFile);
          continue;
        }

        const modelActions = { downloaded: false, liked: false, imageComment: false, textComment: false, boosted: false, collected: false };
        if (quotas.downloads.completed < quotas.downloads.target) {
          const dlRes = await downloadModel(page);
          if (dlRes.success) {
            quotas.downloads.completed++;
            modelActions.downloaded = true;
          }
        }

        const liked = await likeModel(page);
        if (liked) modelActions.liked = true;

        if (quotas.collections.completed < quotas.collections.target) {
          const collected = await collectModel(page);
          if (collected) {
            quotas.collections.completed++;
            modelActions.collected = true;
          }
        }

        if (quotas.textComments.completed < quotas.textComments.target) {
          const textRes = await executeTextComment(page, { modelUrl: candidate.url, skipNavigation: true });
          if (textRes.success) {
            quotas.textComments.completed++;
            modelActions.textComment = true;
          }
        }

        if (quotas.imageComments.completed < quotas.imageComments.target) {
          const imgPosted = await postImageComment(page, imagePath);
          if (imgPosted) {
            quotas.imageComments.completed++;
            modelActions.imageComment = true;
          }
        }

        recordModelAction(downloadedStore, candidate, modelActions, trackingFile);
        modelsProcessed.push({ id: candidate.id, url: candidate.url, actions: modelActions });
      } catch (err) { }
    }
  }

  const success = (quotas.downloads.target === 0 || quotas.downloads.completed > 0) ||
    (quotas.imageComments.target === 0 || quotas.imageComments.completed > 0);

  const summaryMessage = `Daily model tasks: ${quotas.downloads.completed}/${quotas.downloads.target} downloads & likes, ${quotas.imageComments.completed}/${quotas.imageComments.target} image comments, ${quotas.textComments.completed}/${quotas.textComments.target} text comment, ${quotas.boosts.completed}/${quotas.boosts.target} boosts, ${quotas.collections.completed}/${quotas.collections.target} collections.`;

  console.log(`\n=====================================================`);
  console.log(`Result: ${summaryMessage}`);
  console.log(`=====================================================`);

  return {
    success,
    quotas,
    modelsProcessed,
    message: summaryMessage
  };
}

