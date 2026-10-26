import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  getDownloadedModels,
  saveDownloadedModels,
  isModelLiked,
  likeModel,
  downloadModel,
  discoverModelUrls,
  executeModelDownloads,
  postImageComment,
  executeImageComments,
  executeTextComment,
  executeBoost,
  getAvailableBoostsCount,
  getLoggedInUserId,
  ensureAuthenticated,
  COMMENT_SUBMIT_SELECTORS,
  executeDailyModelTasks,
  INCENTIVE_POINTS_URL,
  getIncentiveTasks,
  clickIncentiveTaskAction,
  extractModelsFromCurrentPage
} from '../src/taskService.js';
import { envBool } from '../checkin.js';

describe('taskService tests', () => {
  const testTrackingFile = path.resolve(__dirname, 'test_downloaded_models.json');
  const dummyImg = path.resolve(__dirname, 'test_dummy.jpg');

  beforeEach(() => {
    vi.clearAllMocks();
    if (fs.existsSync(testTrackingFile)) {
      fs.unlinkSync(testTrackingFile);
    }
    fs.writeFileSync(dummyImg, 'fake-image-bytes');
  });

  afterEach(() => {
    if (fs.existsSync(testTrackingFile)) {
      fs.unlinkSync(testTrackingFile);
    }
    if (fs.existsSync(dummyImg)) {
      fs.unlinkSync(dummyImg);
    }
  });

  describe('Downloaded models persistence', () => {
    it('should return empty object if file does not exist', () => {
      const result = getDownloadedModels(testTrackingFile);
      expect(result).toEqual({});
    });

    it('should save and retrieve downloaded models correctly', () => {
      const mockData = {
        'model-123': { downloadedAt: '2026-10-23T00:00:00Z', liked: true, url: 'https://example.com/123' }
      };
      saveDownloadedModels(mockData, testTrackingFile);
      const retrieved = getDownloadedModels(testTrackingFile);
      expect(retrieved).toEqual(mockData);
    });
  });

  describe('isModelLiked & likeModel', () => {
    it('should detect when a model is already liked via class name', async () => {
      const mockPage = {
        locator: vi.fn(() => ({
          count: vi.fn().mockResolvedValue(1),
          first: () => ({
            isVisible: vi.fn().mockResolvedValue(true),
            getAttribute: vi.fn((attr) => {
              if (attr === 'class') return Promise.resolve('like-btn is-active');
              return Promise.resolve(null);
            }),
            innerText: vi.fn().mockResolvedValue('Liked'),
            locator: vi.fn(() => ({
              count: vi.fn().mockResolvedValue(0)
            }))
          })
        }))
      };

      const liked = await isModelLiked(mockPage);
      expect(liked).toBe(true);
    });

    it('should detect when a model is not liked', async () => {
      const mockPage = {
        locator: vi.fn(() => ({
          count: vi.fn().mockResolvedValue(1),
          first: () => ({
            isVisible: vi.fn().mockResolvedValue(true),
            getAttribute: vi.fn(() => Promise.resolve('like-btn')),
            innerText: vi.fn().mockResolvedValue('Like'),
            locator: vi.fn(() => ({
              count: vi.fn().mockResolvedValue(0)
            }))
          })
        }))
      };

      const liked = await isModelLiked(mockPage);
      expect(liked).toBe(false);
    });

    it('should click like button when model is not yet liked', async () => {
      let clickCalled = false;
      let likedState = false;

      const mockPage = {
        waitForTimeout: vi.fn(),
        locator: vi.fn((sel) => ({
          count: vi.fn().mockResolvedValue(1),
          first: () => ({
            isVisible: vi.fn().mockResolvedValue(true),
            getAttribute: vi.fn((attr) => {
              if (attr === 'class') return Promise.resolve(likedState ? 'active' : 'like-btn');
              return Promise.resolve(null);
            }),
            innerText: vi.fn().mockResolvedValue('Like'),
            scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(),
            click: vi.fn().mockImplementation(async () => {
              clickCalled = true;
              likedState = true;
            }),
            locator: vi.fn(() => ({
              count: vi.fn().mockResolvedValue(0)
            }))
          })
        }))
      };

      const result = await likeModel(mockPage);
      expect(result).toBe(true);
      expect(clickCalled).toBe(true);
    });

    it('should correctly handle Creality Cloud div.liked.flex-all-center (unliked vs active)', async () => {
      // 1. When unliked: base class is "liked flex-all-center" without "active"
      const unlikedPage = {
        locator: vi.fn((sel) => {
          if (sel.includes('.model-interaction-comp .liked') || sel.includes('div.liked.flex-all-center')) {
            return {
              count: vi.fn().mockResolvedValue(1),
              first: () => ({
                isVisible: vi.fn().mockResolvedValue(true),
                getAttribute: vi.fn((attr) => (attr === 'class' ? Promise.resolve('liked flex-all-center') : Promise.resolve(null))),
                innerText: vi.fn().mockResolvedValue('2.8K'),
                locator: vi.fn(() => ({ count: vi.fn().mockResolvedValue(0) }))
              })
            };
          }
          return { count: vi.fn().mockResolvedValue(0) };
        })
      };

      expect(await isModelLiked(unlikedPage)).toBe(false);

      // 2. When liked: class has "active" ("liked flex-all-center active")
      const likedPage = {
        locator: vi.fn((sel) => {
          if (sel.includes('.model-interaction-comp .liked') || sel.includes('div.liked.flex-all-center')) {
            return {
              count: vi.fn().mockResolvedValue(1),
              first: () => ({
                isVisible: vi.fn().mockResolvedValue(true),
                getAttribute: vi.fn((attr) => (attr === 'class' ? Promise.resolve('liked flex-all-center active') : Promise.resolve(null))),
                innerText: vi.fn().mockResolvedValue('2.8K'),
                locator: vi.fn(() => ({ count: vi.fn().mockResolvedValue(0) }))
              })
            };
          }
          return { count: vi.fn().mockResolvedValue(0) };
        })
      };

      expect(await isModelLiked(likedPage)).toBe(true);
    });

    it('should click Creality Cloud .model-interaction-comp .liked button when unliked', async () => {
      let clickTriggered = false;
      let matchedSelector = '';

      const mockPage = {
        waitForTimeout: vi.fn(),
        locator: vi.fn((sel) => {
          if (sel === '.model-interaction-comp .liked' || sel === 'div.liked.flex-all-center') {
            return {
              count: vi.fn().mockResolvedValue(1),
              first: () => ({
                isVisible: vi.fn().mockResolvedValue(true),
                getAttribute: vi.fn((attr) => (attr === 'class' ? Promise.resolve('liked flex-all-center') : Promise.resolve(null))),
                innerText: vi.fn().mockResolvedValue('2.8K'),
                scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(),
                click: vi.fn().mockImplementation(async () => {
                  clickTriggered = true;
                  matchedSelector = sel;
                }),
                locator: vi.fn(() => ({ count: vi.fn().mockResolvedValue(0) }))
              })
            };
          }
          return { count: vi.fn().mockResolvedValue(0) };
        })
      };

      const result = await likeModel(mockPage);
      expect(result).toBe(true);
      expect(clickTriggered).toBe(true);
      expect(matchedSelector).toBe('.model-interaction-comp .liked');
    });
  });

  describe('downloadModel', () => {
    it('should click download button and modal confirm button', async () => {
      let mainClick = false;
      let modalClick = false;

      const mockPage = {
        waitForTimeout: vi.fn(),
        waitForEvent: vi.fn().mockResolvedValue({
          suggestedFilename: () => 'model.stl',
          delete: vi.fn().mockResolvedValue()
        }),
        locator: vi.fn((sel) => {
          if (sel.includes('.el-dialog button:has-text("Download")')) {
            return {
              count: vi.fn().mockResolvedValue(1),
              first: () => ({
                isVisible: vi.fn().mockResolvedValue(true),
                click: vi.fn().mockImplementation(async () => { modalClick = true; })
              })
            };
          }
          if (sel.includes('button.download-btn')) {
            return {
              count: vi.fn().mockResolvedValue(1),
              first: () => ({
                isVisible: vi.fn().mockResolvedValue(true),
                scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(),
                click: vi.fn().mockImplementation(async () => { mainClick = true; })
              })
            };
          }
          return {
            count: vi.fn().mockResolvedValue(0),
            first: () => ({ isVisible: vi.fn().mockResolvedValue(false) })
          };
        })
      };

      const result = await downloadModel(mockPage);
      expect(result.success).toBe(true);
      expect(mainClick).toBe(true);
    });

    it('should click dropdown chevron, open STL/CAD dialog, and download first item', async () => {
      let chevronClicked = false;
      let stlOptionClicked = false;
      let firstItemClicked = false;
      let dialogClosed = false;

      const mockPage = {
        waitForTimeout: vi.fn(),
        locator: vi.fn((sel) => {
          if (sel.includes('.choose-operate')) {
            return {
              count: vi.fn().mockResolvedValue(1),
              first: () => ({
                isVisible: vi.fn().mockResolvedValue(true),
                scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(),
                click: vi.fn().mockImplementation(async () => { chevronClicked = true; })
              })
            };
          }
          if (sel.includes('.operate-item')) {
            return {
              filter: () => ({
                count: vi.fn().mockResolvedValue(1),
                first: () => ({
                  isVisible: vi.fn().mockResolvedValue(true),
                  click: vi.fn().mockImplementation(async () => { stlOptionClicked = true; })
                })
              })
            };
          }
          if (sel.includes('.el-dialog') || sel.includes('[role="dialog"]')) {
            return {
              filter: () => ({
                count: vi.fn().mockResolvedValue(1),
                first: () => ({
                  isVisible: vi.fn().mockResolvedValue(true),
                  locator: vi.fn((childSel) => {
                    if (childSel.includes('.icon-download')) {
                      return {
                        count: vi.fn().mockResolvedValue(3),
                        first: () => ({
                          scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(),
                          click: vi.fn().mockImplementation(async () => { firstItemClicked = true; })
                        })
                      };
                    }
                    if (childSel.includes('.el-dialog__headerbtn')) {
                      return {
                        count: vi.fn().mockResolvedValue(1),
                        first: () => ({
                          click: vi.fn().mockImplementation(async () => { dialogClosed = true; })
                        })
                      };
                    }
                    return { count: vi.fn().mockResolvedValue(0) };
                  })
                })
              })
            };
          }
          return {
            count: vi.fn().mockResolvedValue(0),
            first: () => ({ isVisible: vi.fn().mockResolvedValue(false) })
          };
        })
      };

      const result = await downloadModel(mockPage);
      expect(result.success).toBe(true);
      expect(chevronClicked).toBe(true);
      expect(stlOptionClicked).toBe(true);
      expect(firstItemClicked).toBe(true);
      expect(dialogClosed).toBe(true);
      expect(result.message).toContain('First item in STL/CAD files dialog downloaded');
    });

    it('should return failure if download button is missing', async () => {
      const mockPage = {
        waitForTimeout: vi.fn(),
        locator: vi.fn(() => ({
          count: vi.fn().mockResolvedValue(0)
        }))
      };

      const result = await downloadModel(mockPage);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Download button not found');
    });
  });

  describe('discoverModelUrls', () => {
    it('should discover distinct candidate model URLs', async () => {
      const mockPage = {
        goto: vi.fn(),
        waitForTimeout: vi.fn(),
        locator: vi.fn((sel) => {
          if (sel.includes('a[href*="/model-detail/"]')) {
            return {
              evaluateAll: vi.fn().mockResolvedValue([
                '/model-detail/model-101',
                '/model-detail/model-102',
                'https://www.crealitycloud.com/model-detail/model-103'
              ])
            };
          }
          return {
            count: vi.fn().mockResolvedValue(0)
          };
        })
      };

      const candidates = await discoverModelUrls(mockPage, 3);
      expect(candidates.length).toBe(3);
      expect(candidates[0].id).toBe('model-101');
      expect(candidates[1].id).toBe('model-102');
      expect(candidates[2].id).toBe('model-103');
    });
  });

  describe('executeModelDownloads', () => {
    it('should skip if target count is 0', async () => {
      const mockPage = {};
      const result = await executeModelDownloads(mockPage, { targetCount: 0 });
      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
    });

    it('should download 2 models and mark each with like', async () => {
      const mockPage = {
        goto: vi.fn(),
        waitForTimeout: vi.fn(),
        evaluate: vi.fn(),
        waitForEvent: vi.fn().mockResolvedValue({
          suggestedFilename: () => 'model.stl',
          delete: vi.fn().mockResolvedValue()
        }),
        locator: vi.fn((sel) => {
          if (sel.includes('a[href*="/model-detail/"]')) {
            return {
              evaluateAll: vi.fn().mockResolvedValue([
                '/model-detail/mod-alpha',
                '/model-detail/mod-beta'
              ])
            };
          }
          if (sel.includes('download-btn')) {
            return {
              count: vi.fn().mockResolvedValue(1),
              first: () => ({
                isVisible: vi.fn().mockResolvedValue(true),
                scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(),
                click: vi.fn().mockResolvedValue()
              })
            };
          }
          if (sel.includes('.like-box')) {
            return {
              count: vi.fn().mockResolvedValue(1),
              first: () => ({
                isVisible: vi.fn().mockResolvedValue(true),
                getAttribute: vi.fn().mockResolvedValue('like-box'), // not liked
                innerText: vi.fn().mockResolvedValue('Like'),
                scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(),
                click: vi.fn().mockResolvedValue(),
                locator: vi.fn(() => ({ count: vi.fn().mockResolvedValue(0) }))
              })
            };
          }
          return {
            count: vi.fn().mockResolvedValue(0),
            first: () => ({ isVisible: vi.fn().mockResolvedValue(false) })
          };
        })
      };

      const result = await executeModelDownloads(mockPage, { targetCount: 2, trackingFile: testTrackingFile });
      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      expect(result.models.length).toBe(2);
    });
  });

  describe('postImageComment & executeImageComments', () => {
    it('should attach image file and submit comment without text (image only)', async () => {
      let filledComment = 'draft-text';
      let evaluateCalled = false;
      let submitClicked = false;

      const mockPage = {
        waitForTimeout: vi.fn(),
        evaluate: vi.fn(() => {
          evaluateCalled = true;
          return { success: true };
        }),
        locator: vi.fn((sel) => {
          if (sel.includes('textarea')) {
            return {
              count: vi.fn().mockResolvedValue(1),
              first: () => ({
                isVisible: vi.fn().mockResolvedValue(true),
                scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(),
                click: vi.fn().mockResolvedValue(),
                fill: vi.fn((text) => { filledComment = text; }),
                dispatchEvent: vi.fn().mockResolvedValue()
              })
            };
          }
          if (sel.includes('input[type="file"]')) {
            return {
              count: vi.fn().mockResolvedValue(1),
              first: () => ({
                setInputFiles: vi.fn()
              })
            };
          }
          if (sel.includes('Comentarios') || sel.includes('Comment') || sel.includes('Comentar')) {
            return {
              count: vi.fn().mockResolvedValue(1),
              first: () => ({
                isVisible: vi.fn().mockResolvedValue(true),
                scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(),
                click: vi.fn(() => { submitClicked = true; })
              })
            };
          }
          return {
            count: vi.fn().mockResolvedValue(0),
            first: () => ({ isVisible: vi.fn().mockResolvedValue(false) })
          };
        })
      };

      const success = await postImageComment(mockPage, dummyImg);
      expect(success).toBe(true);
      expect(filledComment).toBe(''); // Image-only comment has no text
      expect(evaluateCalled).toBe(true);
      expect(submitClicked).toBe(true);
    });

    it('should loop and post comments on multiple models', async () => {
      const mockPage = {
        goto: vi.fn(),
        waitForTimeout: vi.fn(),
        evaluate: vi.fn().mockResolvedValue({ success: true }),
        locator: vi.fn((sel) => {
          if (sel.includes('textarea')) {
            return {
              count: vi.fn().mockResolvedValue(1),
              first: () => ({
                isVisible: vi.fn().mockResolvedValue(true),
                scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(),
                fill: vi.fn()
              })
            };
          }
          if (sel.includes('input[type="file"]')) {
            return {
              count: vi.fn().mockResolvedValue(1),
              first: () => ({
                setInputFiles: vi.fn()
              })
            };
          }
          if (sel.includes('Comentarios') || sel.includes('Comment') || sel.includes('Comentar')) {
            return {
              count: vi.fn().mockResolvedValue(1),
              first: () => ({
                isVisible: vi.fn().mockResolvedValue(true),
                scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(),
                click: vi.fn()
              })
            };
          }
          return {
            count: vi.fn().mockResolvedValue(0),
            first: () => ({ isVisible: vi.fn().mockResolvedValue(false) })
          };
        })
      };

      const result = await executeImageComments(mockPage, {
        targetCount: 2,
        imagePath: dummyImg,
        candidateModels: [
          { id: '1', url: 'https://example.com/1' },
          { id: '2', url: 'https://example.com/2' }
        ]
      });

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
    });
  });

  describe('executeTextComment', () => {
    it('should post comment without image file', async () => {
      let filledComment = '';
      let submitClicked = false;

      const mockPage = {
        goto: vi.fn(),
        waitForTimeout: vi.fn(),
        locator: vi.fn((sel) => {
          if (sel.includes('textarea')) {
            return {
              count: vi.fn().mockResolvedValue(1),
              first: () => ({
                isVisible: vi.fn().mockResolvedValue(true),
                scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(),
                fill: vi.fn((text) => { filledComment = text; })
              })
            };
          }
          if (sel.includes('Comentarios') || sel.includes('Comment') || sel.includes('Comentar')) {
            return {
              count: vi.fn().mockResolvedValue(1),
              first: () => ({
                isVisible: vi.fn().mockResolvedValue(true),
                scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(),
                click: vi.fn(() => { submitClicked = true; })
              })
            };
          }
          return {
            count: vi.fn().mockResolvedValue(0),
            first: () => ({ isVisible: vi.fn().mockResolvedValue(false) })
          };
        })
      };

      const result = await executeTextComment(mockPage, {
        modelUrl: 'https://www.crealitycloud.com/model-detail/test-123'
      });

      expect(result.success).toBe(true);
      expect(filledComment.length).toBeGreaterThan(0);
      expect(result.message).toContain('Successfully posted text comment');
    });
  });

  describe('getAvailableBoostsCount', () => {
    it('should return 0 when empty state ("Sin datos" / .empty_comp) is present', async () => {
      const mockPage = {
        locator: vi.fn((sel) => {
          if (sel.includes('.empty_comp') || sel.includes('Sin datos')) {
            return {
              count: vi.fn().mockResolvedValue(1),
              first: () => ({ isVisible: vi.fn().mockResolvedValue(true) })
            };
          }
          // Simulate sidebar containing user points e.g. 5,944
          if (sel.includes('.num')) {
            return {
              count: vi.fn().mockResolvedValue(1),
              first: () => ({ innerText: vi.fn().mockResolvedValue('5,944') })
            };
          }
          return {
            count: vi.fn().mockResolvedValue(0),
            first: () => ({ isVisible: vi.fn().mockResolvedValue(false) })
          };
        })
      };

      const count = await getAvailableBoostsCount(mockPage);
      expect(count).toBe(0);
    });

    it('should extract count from tab when present, e.g. "Disponible (3)"', async () => {
      const mockPage = {
        locator: vi.fn((sel) => {
          if (sel.includes('Disponible') || sel.includes('Available')) {
            return {
              count: vi.fn().mockResolvedValue(1),
              nth: vi.fn().mockReturnValue({
                innerText: vi.fn().mockResolvedValue('Disponible (3)')
              })
            };
          }
          return {
            count: vi.fn().mockResolvedValue(0),
            first: () => ({ isVisible: vi.fn().mockResolvedValue(false) })
          };
        })
      };

      const count = await getAvailableBoostsCount(mockPage);
      expect(count).toBe(3);
    });

    it('should extract count from ticket coupon items', async () => {
      const mockPage = {
        locator: vi.fn((sel) => {
          if (sel.includes('coupon-item') || sel.includes('ticket-item')) {
            return {
              count: vi.fn().mockResolvedValue(2)
            };
          }
          return {
            count: vi.fn().mockResolvedValue(0),
            first: () => ({ isVisible: vi.fn().mockResolvedValue(false) })
          };
        })
      };

      const count = await getAvailableBoostsCount(mockPage);
      expect(count).toBe(2);
    });
  });

  describe('executeBoost', () => {
    it('should report when 0 boosts are available', async () => {
      const mockPage = {
        goto: vi.fn(),
        waitForTimeout: vi.fn(),
        innerText: vi.fn().mockResolvedValue('Disponibles: 0 boost tickets'),
        locator: vi.fn(() => ({
          count: vi.fn().mockResolvedValue(0),
          first: () => ({
            innerText: vi.fn().mockResolvedValue('0')
          })
        }))
      };

      const result = await executeBoost(mockPage, { userId: 'xxxxxxxxxx' });
      expect(result.success).toBe(true);
      expect(result.boostsGiven).toBe(0);
      expect(result.message).toContain('No boost tickets available');
    });

    it('should apply boost when tickets are available', async () => {
      let boostClicked = false;
      let confirmClicked = false;

      const mockPage = {
        goto: vi.fn(),
        waitForTimeout: vi.fn(),
        innerText: vi.fn().mockResolvedValue('Disponibles: 1 boost'),
        locator: vi.fn((sel) => {
          if (sel.includes('.boost-left .num') || sel.includes('.ticket-num')) {
            return {
              count: vi.fn().mockResolvedValue(1),
              first: () => ({
                innerText: vi.fn().mockResolvedValue('1')
              })
            };
          }
          if (sel.includes('.el-dialog') || sel.includes('button:has-text("Confirm")')) {
            return {
              count: vi.fn().mockResolvedValue(1),
              first: () => ({
                click: vi.fn(() => { confirmClicked = true; })
              })
            };
          }
          if (sel.includes('button:has-text("Boost")') || sel.includes('button:has-text("Impulsar")')) {
            return {
              count: vi.fn().mockResolvedValue(1),
              nth: vi.fn(() => ({
                isVisible: vi.fn().mockResolvedValue(true),
                click: vi.fn(() => { boostClicked = true; })
              })),
              first: () => ({
                isVisible: vi.fn().mockResolvedValue(true),
                click: vi.fn(() => { boostClicked = true; })
              })
            };
          }
          return {
            count: vi.fn().mockResolvedValue(0),
            first: () => ({ isVisible: vi.fn().mockResolvedValue(false) })
          };
        })
      };

      const result = await executeBoost(mockPage, { userId: 'xxxxxxxxxx' });
      expect(result.success).toBe(true);
      expect(result.boostsGiven).toBe(1);
      expect(boostClicked).toBe(true);
      expect(confirmClicked).toBe(true);
    });

    it('should auto-detect user ID if userId is omitted in executeBoost', async () => {
      const mockPage = {
        context: () => ({
          cookies: vi.fn().mockResolvedValue([
            { name: 'model_user_id', value: '99887766' }
          ])
        }),
        goto: vi.fn(),
        waitForTimeout: vi.fn(),
        innerText: vi.fn().mockResolvedValue('Disponibles: 0 boost tickets'),
        locator: vi.fn(() => ({
          count: vi.fn().mockResolvedValue(0),
          first: () => ({ innerText: vi.fn().mockResolvedValue('0') })
        }))
      };

      const result = await executeBoost(mockPage, {});
      expect(result.success).toBe(true);
      expect(mockPage.goto).toHaveBeenCalledWith(
        expect.stringContaining('99887766'),
        expect.any(Object)
      );
    });
  });

  describe('getLoggedInUserId tests', () => {
    it('should detect user ID from model_user_id cookie', async () => {
      const mockPage = {
        context: () => ({
          cookies: vi.fn().mockResolvedValue([
            { name: 'some_other', value: '123' },
            { name: 'model_user_id', value: 'xxxxxxxxxx' }
          ])
        })
      };

      const userId = await getLoggedInUserId(mockPage);
      expect(userId).toBe('xxxxxxxxxx');
    });

    it('should detect user ID from userId cookie', async () => {
      const mockPage = {
        context: () => ({
          cookies: vi.fn().mockResolvedValue([
            { name: 'userId', value: '55443322' }
          ])
        })
      };

      const userId = await getLoggedInUserId(mockPage);
      expect(userId).toBe('55443322');
    });

    it('should detect user ID from id-application JSON cookie', async () => {
      const mockPage = {
        context: () => ({
          cookies: vi.fn().mockResolvedValue([
            { name: 'id-application', value: encodeURIComponent(JSON.stringify({ userId: 77889900 })) }
          ])
        })
      };

      const userId = await getLoggedInUserId(mockPage);
      expect(userId).toBe('77889900');
    });

    it('should fallback to DOM profile link if cookies lack user ID', async () => {
      const mockPage = {
        context: () => ({
          cookies: vi.fn().mockResolvedValue([])
        }),
        locator: vi.fn((sel) => {
          if (sel.includes('a[href*="/user/"]')) {
            return {
              count: vi.fn().mockResolvedValue(1),
              nth: () => ({
                getAttribute: vi.fn().mockResolvedValue('https://www.crealitycloud.com/es/user/66778899')
              })
            };
          }
          return { count: vi.fn().mockResolvedValue(0) };
        })
      };

      const userId = await getLoggedInUserId(mockPage);
      expect(userId).toBe('66778899');
    });

    it('should fallback to runtime evaluate if cookies and DOM are missing', async () => {
      const mockPage = {
        context: () => ({
          cookies: vi.fn().mockResolvedValue([])
        }),
        locator: vi.fn(() => ({ count: vi.fn().mockResolvedValue(0) })),
        evaluate: vi.fn().mockResolvedValue('11223344')
      };

      const userId = await getLoggedInUserId(mockPage);
      expect(userId).toBe('11223344');
    });
  });

  describe('envBool helper', () => {
    it('should default to true if variable is undefined, null, or empty string', () => {
      expect(envBool(undefined)).toBe(true);
      expect(envBool(null)).toBe(true);
      expect(envBool('')).toBe(true);
      expect(envBool('   ')).toBe(true);
    });

    it('should return true for truthy string values', () => {
      expect(envBool('true')).toBe(true);
      expect(envBool('TRUE')).toBe(true);
      expect(envBool('1')).toBe(true);
      expect(envBool('yes')).toBe(true);
    });

    it('should return false only when set to false or 0', () => {
      expect(envBool('false')).toBe(false);
      expect(envBool('FALSE')).toBe(false);
      expect(envBool('0')).toBe(false);
      expect(envBool(' 0 ')).toBe(false);
      expect(envBool(' false ')).toBe(false);
    });

    it('should respect custom default value when input is missing', () => {
      expect(envBool(undefined, false)).toBe(false);
      expect(envBool(null, false)).toBe(false);
      expect(envBool('', false)).toBe(false);
    });
  });

  describe('ensureAuthenticated and COMMENT_SUBMIT_SELECTORS', () => {
    it('should include .comment-operate-box and Comentarios in submit selectors', () => {
      const hasOperateBox = COMMENT_SUBMIT_SELECTORS.some(s => s.includes('.comment-operate-box'));
      const hasComentarios = COMMENT_SUBMIT_SELECTORS.some(s => s.includes('Comentarios'));
      expect(hasOperateBox).toBe(true);
      expect(hasComentarios).toBe(true);
    });

    it('should call handleAccountSelection and check for login dialogs', async () => {
      const mockPage = {
        locator: vi.fn(() => ({
          count: vi.fn().mockResolvedValue(0),
          first: () => ({ isVisible: vi.fn().mockResolvedValue(false) })
        }))
      };

      const result = await ensureAuthenticated(mockPage);
      expect(result).toBe(true);
    });
  });

  describe('executeDailyModelTasks (Unified Single-Pass)', () => {
    it('should return success immediately if all quotas are set to 0', async () => {
      const mockPage = {};
      const result = await executeDailyModelTasks(mockPage, {
        downloadsCount: 0,
        imageCommentsCount: 0,
        textCommentsCount: 0,
        enableBoost: false
      });

      expect(result.success).toBe(true);
      expect(result.modelsProcessed.length).toBe(0);
    });

    it('should process candidates sequentially and execute all pending actions on each model', async () => {
      const mockPage = {
        goto: vi.fn().mockResolvedValue(null),
        waitForTimeout: vi.fn().mockResolvedValue(null),
        locator: vi.fn((selector) => {
          // Model card / buttons
          return {
            count: vi.fn().mockResolvedValue(1),
            first: () => ({
              isVisible: vi.fn().mockResolvedValue(true),
              getAttribute: vi.fn().mockResolvedValue(null),
              innerText: vi.fn().mockResolvedValue(''),
              scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(null),
              click: vi.fn().mockResolvedValue(null),
              fill: vi.fn().mockResolvedValue(null),
              setInputFiles: vi.fn().mockResolvedValue(null),
              locator: vi.fn(() => ({ count: vi.fn().mockResolvedValue(0) }))
            }),
            evaluateAll: vi.fn().mockResolvedValue([])
          };
        }),
        $$eval: vi.fn().mockResolvedValue([]),
        evaluate: vi.fn().mockResolvedValue({ success: true }),
        waitForEvent: vi.fn().mockResolvedValue(null)
      };

      const candidateModels = [
        { id: 'model-alpha', url: 'https://www.crealitycloud.com/model-detail/model-alpha' },
        { id: 'model-beta', url: 'https://www.crealitycloud.com/model-detail/model-beta' }
      ];

      const result = await executeDailyModelTasks(mockPage, {
        candidateModels,
        downloadsCount: 2,
        imageCommentsCount: 2,
        textCommentsCount: 1, // Only 1 normal text comment across all models
        enableBoost: false,
        imagePath: dummyImg,
        trackingFile: testTrackingFile
      });

      expect(result.success).toBe(true);
      expect(result.quotas.downloads.completed).toBe(2);
      expect(result.quotas.imageComments.completed).toBe(2);
      expect(result.quotas.textComments.completed).toBe(1);

      // Verify that model 1 had text comment, but model 2 skipped text comment
      const modelAlpha = result.modelsProcessed.find(m => m.id === 'model-alpha');
      const modelBeta = result.modelsProcessed.find(m => m.id === 'model-beta');

      expect(modelAlpha).toBeDefined();
      expect(modelAlpha.actions.downloaded).toBe(true);
      expect(modelAlpha.actions.liked).toBe(true);
      expect(modelAlpha.actions.textComment).toBe(true);
      expect(modelAlpha.actions.imageComment).toBe(true);

      expect(modelBeta).toBeDefined();
      expect(modelBeta.actions.downloaded).toBe(true);
      expect(modelBeta.actions.liked).toBe(true);
      expect(modelBeta.actions.textComment).toBe(false); // Quota already met on modelAlpha!
      expect(modelBeta.actions.imageComment).toBe(true);
    });

    it('should skip model if already liked on the web page to maintain distinct downloads', async () => {
      let currentModelId = '';
      const mockPage = {
        goto: vi.fn(async (url) => {
          currentModelId = url && url.includes('model-already-liked') ? 'model-already-liked' : 'model-new';
        }),
        waitForTimeout: vi.fn().mockResolvedValue(null),
        locator: vi.fn((selector) => {
          if (selector.includes('like')) {
            return {
              count: vi.fn().mockResolvedValue(1),
              first: () => ({
                isVisible: vi.fn().mockResolvedValue(true),
                getAttribute: vi.fn((attr) => {
                  if (attr === 'class' && currentModelId === 'model-already-liked') return Promise.resolve('like-btn is-active');
                  return Promise.resolve('like-btn');
                }),
                innerText: vi.fn().mockResolvedValue(''),
                scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(null),
                click: vi.fn().mockResolvedValue(null),
                locator: vi.fn(() => ({ count: vi.fn().mockResolvedValue(0) }))
              })
            };
          }
          return {
            count: vi.fn().mockResolvedValue(1),
            first: () => ({
              isVisible: vi.fn().mockResolvedValue(true),
              getAttribute: vi.fn().mockResolvedValue(null),
              innerText: vi.fn().mockResolvedValue(''),
              scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(null),
              click: vi.fn().mockResolvedValue(null),
              fill: vi.fn().mockResolvedValue(null),
              setInputFiles: vi.fn().mockResolvedValue(null),
              locator: vi.fn(() => ({ count: vi.fn().mockResolvedValue(0) }))
            }),
            evaluateAll: vi.fn().mockResolvedValue([])
          };
        }),
        $$eval: vi.fn().mockResolvedValue([]),
        evaluate: vi.fn().mockResolvedValue({ success: true }),
        waitForEvent: vi.fn().mockResolvedValue(null)
      };

      const candidateModels = [
        { id: 'model-already-liked', url: 'https://www.crealitycloud.com/model-detail/model-already-liked' },
        { id: 'model-new', url: 'https://www.crealitycloud.com/model-detail/model-new' }
      ];

      const result = await executeDailyModelTasks(mockPage, {
        candidateModels,
        downloadsCount: 1,
        imageCommentsCount: 1,
        textCommentsCount: 0,
        enableBoost: false,
        imagePath: dummyImg,
        trackingFile: testTrackingFile
      });

      expect(result.success).toBe(true);
      expect(result.quotas.downloads.completed).toBe(1);

      // The saved downloaded models should record model-already-liked as previously liked
      const saved = getDownloadedModels(testTrackingFile);
      expect(saved['model-already-liked']).toBeDefined();
      expect(saved['model-already-liked'].liked).toBe(true);
      expect(saved['model-new']).toBeDefined();
    });
  });

  describe('Incentive Points & Green Tasks Automation', () => {
    it('should parse incentive tasks and detect green active buttons vs gray locked vs completed', async () => {
      const mockPage = {
        url: () => INCENTIVE_POINTS_URL,
        goto: vi.fn(),
        waitForTimeout: vi.fn(),
        waitForFunction: vi.fn(),
        evaluate: vi.fn().mockImplementation((fn) => {
          if (typeof fn === 'function') {
            return Promise.resolve([
              {
                idx: 0,
                title: 'Image comments',
                key: 'IMAGE_COMMENTS',
                completedCount: 2,
                targetCount: 5,
                tip: '+2 Points（Downloaded models only）',
                btnText: 'Por completar',
                isCompleted: false,
                isGreen: true
              },
              {
                idx: 1,
                title: 'Model Boost',
                key: 'MODEL_BOOST',
                completedCount: 0,
                targetCount: 1,
                tip: '+1 Points（Downloaded models only）',
                btnText: 'Por completar',
                isCompleted: false,
                isGreen: true
              },
              {
                idx: 2,
                title: 'Download Models',
                key: 'DOWNLOAD_MODELS',
                completedCount: 0,
                targetCount: 10,
                tip: '+1 Point',
                btnText: 'Por completar',
                isCompleted: false,
                isGreen: false
              },
              {
                idx: 3,
                title: 'Like 3D Model',
                key: 'LIKE_MODEL',
                completedCount: 1,
                targetCount: 1,
                tip: '+1 Point',
                btnText: 'Completado',
                isCompleted: true,
                isGreen: false
              }
            ]);
          }
          return Promise.resolve(null);
        })
      };

      const tasks = await getIncentiveTasks(mockPage);
      expect(tasks.length).toBe(4);

      const imgComments = tasks.find(t => t.key === 'IMAGE_COMMENTS');
      expect(imgComments.isGreen).toBe(true);
      expect(imgComments.isCompleted).toBe(false);
      expect(imgComments.completedCount).toBe(2);
      expect(imgComments.targetCount).toBe(5);

      const downloadTask = tasks.find(t => t.key === 'DOWNLOAD_MODELS');
      expect(downloadTask.isGreen).toBe(false);
      expect(downloadTask.isCompleted).toBe(false);

      const likeTask = tasks.find(t => t.key === 'LIKE_MODEL');
      expect(likeTask.isCompleted).toBe(true);
      expect(likeTask.isGreen).toBe(false);
    });

    it('should click "Por completar" on target task and report destination URL', async () => {
      let clicked = false;
      const mockPage = {
        url: () => (clicked ? 'https://www.crealitycloud.com/es/user/xxxxxxxxxx/model-download' : INCENTIVE_POINTS_URL),
        locator: vi.fn(() => ({
          filter: vi.fn(() => ({
            count: vi.fn().mockResolvedValue(1),
            nth: vi.fn(() => ({
              innerText: vi.fn().mockResolvedValue('Image comments 2/5 Por completar'),
              locator: vi.fn(() => ({
                first: () => ({
                  scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(),
                  click: vi.fn(async () => { clicked = true; })
                })
              }))
            }))
          }))
        })),
        waitForTimeout: vi.fn()
      };

      const res = await clickIncentiveTaskAction(mockPage, 'IMAGE_COMMENTS');
      expect(res.success).toBe(true);
      expect(res.destinationUrl).toContain('/model-download');
    });

    it('should extract models from current page excluding category and tags', async () => {
      const mockPage = {
        evaluate: vi.fn((fn, limit) => {
          return Promise.resolve([
            { id: 'model-a', url: 'https://crealitycloud.com/es/model-detail/model-a?source=11', title: 'Model A' },
            { id: 'model-b', url: 'https://crealitycloud.com/es/model-detail/model-b', title: 'Model B' }
          ].slice(0, limit));
        })
      };

      const models = await extractModelsFromCurrentPage(mockPage, 10);
      expect(models.length).toBe(2);
      expect(models[0].id).toBe('model-a');
      expect(models[1].id).toBe('model-b');
    });
  });
});

