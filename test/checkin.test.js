import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getBrowserPath, launchBrowser, isLoggedIn, executeCheckin, executeRaffle } from '../src/checkinService.js';
import { firefox } from 'playwright-core';

// Mock playwright-core
vi.mock('playwright-core', () => {
  const mockContext = {
    pages: vi.fn(() => []),
    newPage: vi.fn().mockResolvedValue({}),
    close: vi.fn()
  };
  return {
    firefox: {
      launchPersistentContext: vi.fn().mockResolvedValue(mockContext)
    }
  };
});

// Mock fs to simulate browser binary existence
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    existsSync: vi.fn((path) => {
      if (path.endsWith('bin/firefox')) return true;
      return actual.existsSync(path);
    })
  };
});

describe('checkinService tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return correct browser binary path', () => {
    const path = getBrowserPath();
    expect(path).toContain('bin/firefox');
  });

  it('should launch browser with expected options', async () => {
    await launchBrowser(true);
    expect(firefox.launchPersistentContext).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headless: true,
        env: expect.objectContaining({
          STEALTHFOX_SEED: expect.any(String),
          STEALTHFOX_TIMEZONE: expect.any(String)
        })
      })
    );
  });

  it('should detect logged out state if Log In button is visible', async () => {
    const mockPage = {
      locator: vi.fn(() => ({
        first: () => ({
          isVisible: vi.fn().mockResolvedValue(true)
        })
      }))
    };

    const loggedIn = await isLoggedIn(mockPage);
    expect(loggedIn).toBe(false);
  });

  it('should detect logged in state if Log In button is not visible', async () => {
    const mockPage = {
      locator: vi.fn(() => ({
        first: () => ({
          isVisible: vi.fn().mockRejectedValue(new Error('Timeout'))
        })
      }))
    };

    const loggedIn = await isLoggedIn(mockPage);
    expect(loggedIn).toBe(true);
  });

  it('should fail check-in if user is not logged in', async () => {
    const mockPage = {
      goto: vi.fn(),
      locator: vi.fn((selector) => {
        if (selector.includes('span:has-text("Log In")')) {
          return {
            first: () => ({
              isVisible: vi.fn().mockResolvedValue(true) // logged out
            })
          };
        }
        return { count: vi.fn().mockResolvedValue(0) };
      })
    };

    const result = await executeCheckin(mockPage);
    expect(result.success).toBe(false);
    expect(result.message).toContain('User is not logged in');
  });

  it('should detect and report if already checked in via element text', async () => {
    const mockPage = {
      goto: vi.fn(),
      waitForTimeout: vi.fn(),
      screenshot: vi.fn(),
      locator: vi.fn((selector) => {
        if (selector.includes('span:has-text("Log In")')) {
          return {
            first: () => ({
              isVisible: vi.fn().mockResolvedValue(false) // logged in
            })
          };
        }
        if (selector === 'iframe.iframe-box') {
          return {
            count: vi.fn().mockResolvedValue(1) // iframe exists
          };
        }
        return {
          count: vi.fn().mockResolvedValue(0)
        };
      }),
      frameLocator: vi.fn(() => ({
        locator: vi.fn((selector) => {
          if (selector === '.sign-in-btn, button, [role="button"], a') {
            return {
              filter: () => ({
                count: vi.fn().mockResolvedValue(1),
                nth: vi.fn(() => ({
                  textContent: vi.fn().mockResolvedValue('Checked In'),
                  isVisible: vi.fn().mockResolvedValue(true)
                }))
              })
            };
          }
          return { count: vi.fn().mockResolvedValue(0) };
        })
      }))
    };

    const result = await executeCheckin(mockPage);
    expect(result.success).toBe(true);
    expect(result.message).toContain('Already checked in today!');
    expect(mockPage.screenshot).toHaveBeenCalled();
  });

  it('should click checkin button and return success', async () => {
    const clickMock = vi.fn();
    const mockPage = {
      goto: vi.fn(),
      waitForTimeout: vi.fn(),
      screenshot: vi.fn(),
      locator: vi.fn((selector) => {
        if (selector.includes('span:has-text("Log In")')) {
          return {
            first: () => ({
              isVisible: vi.fn().mockResolvedValue(false) // logged in
            })
          };
        }
        if (selector === 'iframe.iframe-box') {
          return {
            count: vi.fn().mockResolvedValue(1) // iframe exists
          };
        }
        return {
          count: vi.fn().mockResolvedValue(0)
        };
      }),
      frameLocator: vi.fn(() => ({
        locator: vi.fn((selector) => {
          if (selector === '.sign-in-btn, button, [role="button"], a') {
            return {
              filter: () => ({
                count: vi.fn().mockResolvedValue(1),
                nth: vi.fn(() => ({
                  textContent: vi.fn().mockResolvedValue('Check In Now'),
                  isVisible: vi.fn().mockResolvedValue(true),
                  scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
                  click: clickMock
                }))
              })
            };
          }
          return { count: vi.fn().mockResolvedValue(0) };
        })
      }))
    };

    const result = await executeCheckin(mockPage);
    expect(result.success).toBe(true);
    expect(result.message).toContain('Successfully clicked check-in button');
    expect(clickMock).toHaveBeenCalled();
    expect(mockPage.screenshot).toHaveBeenCalled();
  });

  describe('executeRaffle tests', () => {
    it('should return successfully with 0 prizes if 0 tickets available', async () => {
      const mockPage = {
        goto: vi.fn(),
        waitForTimeout: vi.fn(),
        locator: vi.fn((selector) => {
          if (selector === 'text=Select Account') {
            return { count: vi.fn().mockResolvedValue(0) };
          }
          if (selector === '.lucky-draw-left .num') {
            return {
              count: vi.fn().mockResolvedValue(1),
              innerText: vi.fn().mockResolvedValue('0')
            };
          }
          return { count: vi.fn().mockResolvedValue(0) };
        })
      };

      const result = await executeRaffle(mockPage);
      expect(result.success).toBe(true);
      expect(result.message).toContain('No raffle tickets available');
      expect(result.prizes).toEqual([]);
    });

    it('should click Continue if Select Account authorization is shown, then perform a draw', async () => {
      const clickContinueMock = vi.fn();
      const clickStartMock = vi.fn();
      const clickGotItMock = vi.fn();
      
      let numCalls = 0;

      const mockPage = {
        goto: vi.fn(),
        waitForTimeout: vi.fn(),
        screenshot: vi.fn(),
        locator: vi.fn((selector) => {
          if (selector === 'text=Select Account') {
            return { count: vi.fn().mockResolvedValue(1) }; // yes, auth screen
          }
          if (selector === 'button.cus-button.primary.success') {
            return {
              count: vi.fn().mockResolvedValue(1),
              click: clickContinueMock
            };
          }
          if (selector === '.lucky-draw-left .num') {
            return {
              count: vi.fn().mockResolvedValue(1),
              innerText: vi.fn().mockImplementation(async () => {
                numCalls++;
                // return 1 for first check, then 0 for next check
                return numCalls === 1 ? '1' : '0';
              })
            };
          }
          if (selector === '.start-btn') {
            return {
              count: vi.fn().mockResolvedValue(1),
              click: clickStartMock
            };
          }
          if (selector === 'button, div, span') {
            return {
              filter: (opts) => {
                return {
                  first: () => ({
                    waitFor: vi.fn().mockResolvedValue(undefined),
                    click: clickGotItMock
                  })
                };
              }
            };
          }
          if (selector === '.dtc-lottery_container') {
            return {
              count: vi.fn().mockResolvedValue(1),
              innerText: vi.fn().mockResolvedValue('Congratulations! 200 Points have been added to your account.')
            };
          }
          return { count: vi.fn().mockResolvedValue(0) };
        })
      };

      const result = await executeRaffle(mockPage);
      expect(result.success).toBe(true);
      expect(clickContinueMock).toHaveBeenCalled();
      expect(clickStartMock).toHaveBeenCalled();
      expect(clickGotItMock).toHaveBeenCalled();
      expect(result.prizes).toEqual(['200 Points']);
    });
  });
});

