import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendNotification } from '../src/notificationService.js';
import { spawn } from 'child_process';

// Mock child_process
vi.mock('child_process', () => {
  const mockChild = {
    stdout: {
      on: vi.fn((event, callback) => {
        if (event === 'data') {
          // Store it or invoke it if needed
        }
      })
    },
    stderr: {
      on: vi.fn((event, callback) => {
        if (event === 'data') {
          // Store it or invoke it if needed
        }
      })
    },
    on: vi.fn((event, callback) => {
      if (event === 'close') {
        // Automatically close with success
        setTimeout(() => callback(0), 10);
      }
    })
  };
  return {
    spawn: vi.fn(() => mockChild)
  };
});

describe('notificationService tests', () => {
  const originalEnv = process.env.APPRISE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.APPRISE_URL = originalEnv;
  });

  it('should skip if APPRISE_URL is not set', async () => {
    delete process.env.APPRISE_URL;
    const result = await sendNotification('Title', 'Body');
    expect(result).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('should skip if APPRISE_URL is empty', async () => {
    process.env.APPRISE_URL = '   ,  ';
    const result = await sendNotification('Title', 'Body');
    expect(result).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('should call apprise command with correct arguments', async () => {
    process.env.APPRISE_URL = 'tgram://123/456';
    const result = await sendNotification('My Title', 'My Body');
    expect(result).toBe(true);
    expect(spawn).toHaveBeenCalledWith('apprise', [
      '-t', 'My Title',
      '-b', 'My Body',
      'tgram://123/456'
    ]);
  });

  it('should support multiple comma-separated URLs', async () => {
    process.env.APPRISE_URL = 'tgram://123/456, whatsapp://token@id/to';
    const result = await sendNotification('My Title', 'My Body');
    expect(result).toBe(true);
    expect(spawn).toHaveBeenCalledWith('apprise', [
      '-t', 'My Title',
      '-b', 'My Body',
      'tgram://123/456',
      'whatsapp://token@id/to'
    ]);
  });

  it('should resolve to false and not crash if child process emits error', async () => {
    process.env.APPRISE_URL = 'tgram://123/456';
    
    const spawnMock = vi.mocked(spawn);
    spawnMock.mockImplementationOnce(() => {
      return {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === 'error') {
            setTimeout(() => callback(new Error('Spawn failed')), 10);
          }
        })
      };
    });
    
    const result = await sendNotification('My Title', 'My Body');
    expect(result).toBe(false);
  });
});
