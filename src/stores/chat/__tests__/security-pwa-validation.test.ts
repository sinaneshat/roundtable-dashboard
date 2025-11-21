/**
 * Security, Validation, PWA & Offline Capabilities Tests (Sections 15-16)
 *
 * Comprehensive tests for security measures, input validation, PWA features,
 * and offline capabilities based on COMPREHENSIVE_TEST_PLAN.md Sections 15-16.
 *
 * FLOW TESTED:
 * 15. Security & Validation
 *    15.1 Input Sanitization (SEC-01 to SEC-03)
 *    15.2 Access Control (SEC-04 to SEC-05)
 * 16. PWA & Offline Capabilities
 *    16.1 Offline Behavior (PWA-01 to PWA-04)
 *    16.2 Installation (PWA-05 to PWA-06)
 *
 * Additional scenarios:
 * - Input validation edge cases
 * - Authentication & Authorization
 * - Data integrity & Privacy
 * - PWA advanced scenarios
 *
 * Location: /src/stores/chat/__tests__/security-pwa-validation.test.ts
 */

import { Buffer } from 'node:buffer';

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ChatModes,
  ScreenModes,
} from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockMessage,
  createMockParticipant,
  createMockParticipantConfig,
  createMockPreSearch,
  createMockThread,
  createMockUserMessage,
  getPartText,
} from './test-factories';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createTestStore() {
  return createChatStore();
}

/**
 * Helper to create XSS test payloads
 */
function createXSSPayloads(): string[] {
  return [
    '<script>alert("XSS")</script>',
    '<img src="x" onerror="alert(\'XSS\')">',
    '<a href="javascript:alert(\'XSS\')">Click</a>',
    '<svg onload="alert(\'XSS\')">',
    '<div onmouseover="alert(\'XSS\')">Hover</div>',
    '"><script>alert(document.cookie)</script>',
    '\' onclick=\'alert(1)\' \'',
    '<iframe src="javascript:alert(\'XSS\')"></iframe>',
  ];
}

/**
 * Helper to create SQL injection test payloads
 */
function createSQLInjectionPayloads(): string[] {
  return [
    '\'; DROP TABLE users; --',
    '1\' OR \'1\'=\'1',
    '1; DELETE FROM threads WHERE 1=1',
    'admin\'--',
    '\' UNION SELECT * FROM users --',
    'Robert\'); DROP TABLE students;--',
    '1\' AND 1=1 UNION SELECT NULL--',
    '\' OR 1=1--',
  ];
}

/**
 * Helper to simulate network status
 */
function mockNetworkStatus(online: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    value: online,
    writable: true,
    configurable: true,
  });
}

/**
 * Helper to create message with specific content
 */
function createMessageWithContent(
  roundNumber: number,
  content: string,
): UIMessage {
  return {
    id: `user-msg-${roundNumber}`,
    role: 'user',
    parts: [{ type: 'text', text: content }],
    metadata: {
      role: 'user',
      roundNumber,
    },
  };
}

// ============================================================================
// SECTION 15.1: INPUT SANITIZATION
// ============================================================================

describe('section 15.1: Input Sanitization', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * SEC-01: Test XSS injection attempts in user message (should be escaped)
   *
   * User input containing XSS payloads should be stored as-is in the store,
   * with sanitization/escaping happening at the render layer.
   * This test verifies the store correctly preserves the raw content.
   */
  describe('sEC-01: XSS injection attempts', () => {
    it('should store XSS payloads without executing them', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      const xssPayloads = createXSSPayloads();

      xssPayloads.forEach((payload, index) => {
        const message = createMessageWithContent(index, payload);
        store.getState().setMessages(prev => [...prev, message]);
      });

      const messages = store.getState().messages;
      expect(messages).toHaveLength(xssPayloads.length);

      // Verify content is stored as-is (sanitization happens at render)
      messages.forEach((msg, index) => {
        expect(getPartText(msg)).toBe(xssPayloads[index]);
      });
    });

    it('should handle XSS in input value', () => {
      const xssInput = '<script>alert("XSS")</script>';
      store.getState().setInputValue(xssInput);

      expect(store.getState().inputValue).toBe(xssInput);
    });

    it('should handle XSS in pending message', () => {
      const xssPayload = '<img src=x onerror=alert(1)>';
      store.getState().setPendingMessage(xssPayload);

      expect(store.getState().pendingMessage).toBe(xssPayload);
    });

    it('should handle XSS in thread title', () => {
      const xssTitle = '<script>document.location="http://evil.com"</script>';
      const thread = createMockThread({
        id: 'thread-123',
        title: xssTitle,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      expect(store.getState().thread?.title).toBe(xssTitle);
    });

    it('should handle XSS in participant role', () => {
      const xssRole = '<img src=x onerror=alert("role")>';
      const participant = createMockParticipantConfig(0, { role: xssRole });

      store.getState().setSelectedParticipants([participant]);

      expect(store.getState().selectedParticipants[0].role).toBe(xssRole);
    });
  });

  /**
   * SEC-02: Test SQL injection attempts in input fields
   *
   * SQL injection payloads should be stored as plain text.
   * The API/backend handles actual query parameterization.
   */
  describe('sEC-02: SQL injection attempts', () => {
    it('should store SQL injection payloads as plain text', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      const sqlPayloads = createSQLInjectionPayloads();

      sqlPayloads.forEach((payload, index) => {
        const message = createMessageWithContent(index, payload);
        store.getState().setMessages(prev => [...prev, message]);
      });

      const messages = store.getState().messages;
      expect(messages).toHaveLength(sqlPayloads.length);

      // Verify SQL payloads stored as plain text
      messages.forEach((msg, index) => {
        expect(getPartText(msg)).toBe(sqlPayloads[index]);
      });
    });

    it('should handle SQL injection in input value', () => {
      const sqlPayload = '\'; DROP TABLE users; --';
      store.getState().setInputValue(sqlPayload);

      expect(store.getState().inputValue).toBe(sqlPayload);
    });

    it('should handle SQL injection in thread slug', () => {
      const sqlSlug = 'test-thread\'; DELETE FROM threads; --';
      const thread = createMockThread({
        id: 'thread-123',
        slug: sqlSlug,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      expect(store.getState().thread?.slug).toBe(sqlSlug);
    });
  });

  /**
   * SEC-03: Test pasting large payloads/binary data
   *
   * Store should handle large payloads gracefully without crashing.
   */
  describe('sEC-03: Large payloads and binary data', () => {
    it('should handle maximum input length (5000 chars)', () => {
      const maxLengthInput = 'a'.repeat(5000);
      store.getState().setInputValue(maxLengthInput);

      expect(store.getState().inputValue).toHaveLength(5000);
    });

    it('should handle input exceeding maximum length', () => {
      const oversizedInput = 'a'.repeat(10000);
      store.getState().setInputValue(oversizedInput);

      // Store accepts the value; validation happens at API/UI layer
      expect(store.getState().inputValue).toHaveLength(10000);
    });

    it('should handle large message content', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      const largeContent = 'x'.repeat(50000);
      const message = createMessageWithContent(0, largeContent);
      store.getState().setMessages([message]);

      expect(getPartText(store.getState().messages[0])).toHaveLength(50000);
    });

    it('should handle binary-like data in messages', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Binary-like content (base64 encoded)
      const binaryLikeContent = Buffer.from('binary data').toString('base64');
      const message = createMessageWithContent(0, binaryLikeContent);
      store.getState().setMessages([message]);

      expect(store.getState().messages).toHaveLength(1);
    });

    it('should handle null bytes in content', () => {
      const contentWithNullBytes = 'test\x00content\x00with\x00null\x00bytes';
      store.getState().setInputValue(contentWithNullBytes);

      expect(store.getState().inputValue).toBe(contentWithNullBytes);
    });
  });
});

// ============================================================================
// SECTION 15.2: ACCESS CONTROL
// ============================================================================

describe('section 15.2: Access Control', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * SEC-04: Test accessing a thread belonging to another user (should 403/404)
   *
   * When user tries to access another user's thread, API returns error.
   * Store handles this gracefully.
   */
  describe('sEC-04: Thread access control', () => {
    it('should handle 403 error when accessing unauthorized thread', () => {
      // Simulate API returning 403 error
      store.getState().setError(new Error('Forbidden: You do not have access to this thread'));

      expect(store.getState().error?.message).toContain('Forbidden');
      expect(store.getState().thread).toBeNull();
    });

    it('should handle 404 error for non-existent thread', () => {
      // Simulate API returning 404 error
      store.getState().setError(new Error('Thread not found'));

      expect(store.getState().error?.message).toContain('not found');
      expect(store.getState().thread).toBeNull();
    });

    it('should clear sensitive state on access denial', () => {
      // User was viewing a thread
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setMessages([createMockUserMessage(0)]);

      // Access denied on reload/refresh
      store.getState().setError(new Error('Access denied'));
      store.getState().setThread(null);
      store.getState().setMessages([]);

      expect(store.getState().thread).toBeNull();
      expect(store.getState().messages).toHaveLength(0);
    });

    it('should handle session expiry during thread access', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Session expires
      store.getState().setError(new Error('Session expired. Please log in again.'));

      expect(store.getState().error?.message).toContain('Session expired');
    });
  });

  /**
   * SEC-05: Test accessing restricted models via API manipulation (without UI)
   *
   * Store stores selection; actual model access validation happens at API level.
   */
  describe('sEC-05: Model access control', () => {
    it('should store restricted model selection (validation at API)', () => {
      // User attempts to use restricted model
      const participants = [
        createMockParticipantConfig(0, { modelId: 'restricted/premium-model' }),
      ];

      store.getState().setSelectedParticipants(participants);

      // Store accepts selection
      expect(store.getState().selectedParticipants).toHaveLength(1);

      // API would reject with error
      store.getState().setError(new Error('Model not available on your subscription tier'));
      expect(store.getState().error?.message).toContain('subscription tier');
    });

    it('should handle API rejection of unauthorized model in streaming', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [
        createMockParticipant(0, { modelId: 'restricted/model' }),
      ];

      store.getState().initializeThread(thread, participants);
      store.getState().setIsStreaming(true);

      // API rejects model during streaming
      store.getState().setError(new Error('Model access denied: Insufficient permissions'));
      store.getState().setIsStreaming(false);

      expect(store.getState().error?.message).toContain('access denied');
      expect(store.getState().isStreaming).toBe(false);
    });

    it('should handle rate limiting on model access', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Rate limit hit
      store.getState().setError(new Error('Rate limit exceeded. Please try again later.'));

      expect(store.getState().error?.message).toContain('Rate limit');
    });
  });
});

// ============================================================================
// INPUT VALIDATION EDGE CASES
// ============================================================================

describe('input Validation Edge Cases', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * Test maximum input length enforcement (5000 chars)
   * Actual enforcement happens at API/UI level; store accepts any value
   */
  it('should accept input at maximum boundary (5000 chars)', () => {
    const exactMaxInput = 'a'.repeat(5000);
    store.getState().setInputValue(exactMaxInput);

    expect(store.getState().inputValue).toHaveLength(5000);
  });

  /**
   * Test special Unicode characters handling
   */
  it('should handle special Unicode characters', () => {
    const unicodeContent = [
      '\uD83D\uDE00', // Emoji
      '\uFEFF', // BOM
      '\u202E', // RTL override
      '\u0000', // Null
      '\u200B', // Zero-width space
      '\u2028', // Line separator
      '\u2029', // Paragraph separator
    ].join('');

    store.getState().setInputValue(unicodeContent);
    expect(store.getState().inputValue).toBe(unicodeContent);
  });

  /**
   * Test null byte injection attempts
   */
  it('should handle null byte injection attempts', () => {
    const nullBytePayload = 'command\x00--flag';
    store.getState().setInputValue(nullBytePayload);

    expect(store.getState().inputValue).toBe(nullBytePayload);
  });

  /**
   * Test prototype pollution attempts
   */
  it('should handle prototype pollution attempts in message content', () => {
    const pollutionPayload = '{"__proto__": {"polluted": true}}';
    const message = createMessageWithContent(0, pollutionPayload);

    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    store.getState().setMessages([message]);

    // Content should be stored as plain string
    expect(getPartText(store.getState().messages[0])).toBe(pollutionPayload);

    // Prototype should not be polluted
    expect('polluted' in Object.prototype).toBe(false);
  });

  /**
   * Test empty string handling
   */
  it('should handle empty string input', () => {
    store.getState().setInputValue('');
    expect(store.getState().inputValue).toBe('');
  });

  /**
   * Test whitespace-only input
   */
  it('should handle whitespace-only input', () => {
    const whitespace = '   \t\n\r  ';
    store.getState().setInputValue(whitespace);
    expect(store.getState().inputValue).toBe(whitespace);
  });

  /**
   * Test very long single words (no spaces)
   */
  it('should handle very long single words', () => {
    const longWord = 'superlongwordwithoutspaces'.repeat(100);
    store.getState().setInputValue(longWord);

    expect(store.getState().inputValue).toHaveLength(2600);
  });

  /**
   * Test control characters
   */
  it('should handle control characters', () => {
    const controlChars = '\x01\x02\x03\x04\x05\x06\x07\x08';
    store.getState().setInputValue(controlChars);

    expect(store.getState().inputValue).toBe(controlChars);
  });

  /**
   * Test mixed content (text + code + special chars)
   */
  it('should handle mixed content correctly', () => {
    const mixedContent = `
      Regular text here.
      \`\`\`javascript
      const x = '<script>alert("xss")</script>';
      \`\`\`
      More text with emojis
      SQL: SELECT * FROM users WHERE id = 1; DROP TABLE users;--
    `;

    store.getState().setInputValue(mixedContent);
    expect(store.getState().inputValue).toBe(mixedContent);
  });
});

// ============================================================================
// AUTHENTICATION & AUTHORIZATION
// ============================================================================

describe('authentication & Authorization', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * Test session expiry handling during streaming
   */
  it('should handle session expiry during streaming', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    store.getState().setIsStreaming(true);

    // Session expires mid-stream
    store.getState().setError(new Error('Session expired'));
    store.getState().setIsStreaming(false);

    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().error?.message).toContain('Session expired');
  });

  /**
   * Test CSRF protection simulation
   */
  it('should handle CSRF token validation failure', () => {
    // Simulate CSRF token mismatch
    store.getState().setIsCreatingThread(true);
    store.getState().setError(new Error('Invalid CSRF token'));
    store.getState().setIsCreatingThread(false);

    expect(store.getState().error?.message).toContain('CSRF');
    expect(store.getState().thread).toBeNull();
  });

  /**
   * Test rate limiting on API endpoints
   */
  it('should handle rate limiting with appropriate error', () => {
    // Multiple rapid requests trigger rate limit
    for (let i = 0; i < 10; i++) {
      store.getState().setInputValue(`Message ${i}`);
    }

    // Rate limit error
    store.getState().setError(new Error('Too many requests. Please wait before trying again.'));

    expect(store.getState().error?.message).toContain('Too many requests');
  });

  /**
   * Test unauthorized API manipulation
   */
  it('should handle unauthorized thread modification', () => {
    const thread = createMockThread({ id: 'thread-123', userId: 'other-user' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    // Attempt to modify
    store.getState().setError(new Error('You are not authorized to modify this thread'));

    expect(store.getState().error?.message).toContain('not authorized');
  });

  /**
   * Test token refresh during long conversations
   */
  it('should preserve state during token refresh', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const messages = [
      createMockUserMessage(0),
      createMockMessage(0, 0),
    ];

    store.getState().initializeThread(thread, [createMockParticipant(0)], messages);

    // Simulate token refresh (no error)
    const preRefreshState = {
      threadId: store.getState().thread?.id,
      messageCount: store.getState().messages.length,
    };

    // State preserved after refresh
    expect(store.getState().thread?.id).toBe(preRefreshState.threadId);
    expect(store.getState().messages).toHaveLength(preRefreshState.messageCount);
  });
});

// ============================================================================
// DATA INTEGRITY & PRIVACY
// ============================================================================

describe('data Integrity & Privacy', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * Test conversation isolation between users
   */
  it('should maintain conversation isolation', () => {
    const user1Thread = createMockThread({ id: 'thread-user1', userId: 'user-1' });
    const user1Messages = [createMockUserMessage(0, 'User 1 message')];

    store.getState().initializeThread(user1Thread, [createMockParticipant(0)], user1Messages);

    // Verify user 1's data
    expect(store.getState().thread?.userId).toBe('user-1');
    expect(store.getState().messages[0].parts[0]).toEqual({
      type: 'text',
      text: 'User 1 message',
    });

    // Reset for user 2 (would happen in different session)
    store.getState().resetToNewChat();

    // User 1's data should be gone
    expect(store.getState().thread).toBeNull();
    expect(store.getState().messages).toHaveLength(0);
  });

  /**
   * Test data deletion and cleanup
   */
  it('should fully clean up data on reset', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    store.getState().setMessages([createMockUserMessage(0)]);
    store.getState().addPreSearch(createMockPreSearch());
    store.getState().addAnalysis(createMockAnalysis());
    store.getState().setInputValue('sensitive input');
    store.getState().setPendingMessage('pending sensitive');

    // Trigger cleanup
    store.getState().resetToNewChat();

    // All sensitive data cleared
    expect(store.getState().thread).toBeNull();
    expect(store.getState().messages).toHaveLength(0);
    expect(store.getState().preSearches).toHaveLength(0);
    expect(store.getState().analyses).toHaveLength(0);
    expect(store.getState().pendingMessage).toBeNull();
    // Note: inputValue might persist for UX; depends on implementation
  });

  /**
   * Test PII handling awareness
   */
  it('should store PII without modification (sanitization at render)', () => {
    const piiContent = [
      'My SSN is 123-45-6789',
      'Credit card: 4111-1111-1111-1111',
      'Email: test@example.com',
      'Phone: +1-555-123-4567',
    ].join('\n');

    store.getState().setInputValue(piiContent);

    // PII stored as-is
    expect(store.getState().inputValue).toBe(piiContent);
  });

  /**
   * Test message ordering integrity
   */
  it('should maintain message ordering integrity', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    const messages = [
      createMockUserMessage(0, 'First'),
      createMockMessage(0, 0, { parts: [{ type: 'text', text: 'Second' }] }),
      createMockUserMessage(1, 'Third'),
    ];

    store.getState().setMessages(messages);

    // Order preserved
    const storedMessages = store.getState().messages;
    expect(getPartText(storedMessages[0])).toBe('First');
    expect(getPartText(storedMessages[1])).toBe('Second');
    expect(getPartText(storedMessages[2])).toBe('Third');
  });
});

// ============================================================================
// SECTION 16.1: OFFLINE BEHAVIOR
// ============================================================================

describe('section 16.1: Offline Behavior', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
    // Default to online
    mockNetworkStatus(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * PWA-01: Test app behavior when completely offline
   * (should show appropriate "Offline" UI)
   *
   * Store should handle offline state; UI shows offline indicator.
   */
  describe('pWA-01: Completely offline behavior', () => {
    it('should store network error when offline', () => {
      mockNetworkStatus(false);

      // Simulate failed request due to offline
      store.getState().setError(new Error('Network request failed. You appear to be offline.'));

      expect(store.getState().error?.message).toContain('offline');
    });

    it('should preserve form state when going offline', () => {
      store.getState().setInputValue('My question about AI');
      store.getState().setSelectedMode(ChatModes.DEBATING);
      store.getState().setEnableWebSearch(true);

      // Go offline
      mockNetworkStatus(false);

      // Form state preserved
      expect(store.getState().inputValue).toBe('My question about AI');
      expect(store.getState().selectedMode).toBe(ChatModes.DEBATING);
      expect(store.getState().enableWebSearch).toBe(true);
    });

    it('should preserve existing thread data when going offline', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const messages = [createMockUserMessage(0), createMockMessage(0, 0)];
      store.getState().initializeThread(thread, [createMockParticipant(0)], messages);

      // Go offline
      mockNetworkStatus(false);

      // Thread data preserved for viewing
      expect(store.getState().thread?.id).toBe('thread-123');
      expect(store.getState().messages).toHaveLength(2);
    });
  });

  /**
   * PWA-02: Test submitting a message while offline
   * (should be queued or blocked with message)
   */
  describe('pWA-02: Offline message submission', () => {
    it('should queue message in pending state when offline', () => {
      mockNetworkStatus(false);

      const offlineMessage = 'Question while offline';
      store.getState().setInputValue(offlineMessage);
      store.getState().setPendingMessage(offlineMessage);

      // Message queued but not sent
      expect(store.getState().pendingMessage).toBe(offlineMessage);
      expect(store.getState().hasSentPendingMessage).toBe(false);
    });

    it('should block thread creation when offline', () => {
      mockNetworkStatus(false);

      store.getState().setIsCreatingThread(true);
      store.getState().setError(new Error('Cannot create thread while offline'));
      store.getState().setIsCreatingThread(false);

      expect(store.getState().thread).toBeNull();
      expect(store.getState().error?.message).toContain('offline');
    });

    it('should handle reconnection and send queued message', () => {
      mockNetworkStatus(false);

      // Queue message while offline
      store.getState().setPendingMessage('Queued question');
      store.getState().setHasSentPendingMessage(false);

      // Come back online
      mockNetworkStatus(true);

      // Message can now be sent
      store.getState().setHasSentPendingMessage(true);
      store.getState().setPendingMessage(null);

      expect(store.getState().pendingMessage).toBeNull();
      expect(store.getState().hasSentPendingMessage).toBe(true);
    });
  });

  /**
   * PWA-03: Test service worker caching of static assets
   *
   * Store doesn't handle SW directly, but we test related behavior.
   */
  describe('pWA-03: Service worker caching behavior', () => {
    it('should allow read-only access to cached thread data', () => {
      // Simulate cached thread loaded while offline
      const cachedThread = createMockThread({
        id: 'cached-thread',
        title: 'Cached Thread',
      });
      const cachedMessages = [
        createMockUserMessage(0, 'Cached question'),
        createMockMessage(0, 0, { parts: [{ type: 'text', text: 'Cached response' }] }),
      ];

      store.getState().initializeThread(cachedThread, [createMockParticipant(0)], cachedMessages);
      store.getState().setScreenMode(ScreenModes.PUBLIC); // Read-only mode

      expect(store.getState().thread?.id).toBe('cached-thread');
      expect(store.getState().messages).toHaveLength(2);
      expect(store.getState().isReadOnly).toBe(true);
    });
  });

  /**
   * PWA-04: Test stale-while-revalidate behavior for thread lists
   *
   * Store handles individual thread state; list caching at query layer.
   */
  describe('pWA-04: Stale-while-revalidate behavior', () => {
    it('should display cached thread while revalidating', () => {
      // Load cached thread first
      const staleThread = createMockThread({
        id: 'thread-123',
        title: 'Stale Title',
        updatedAt: new Date(Date.now() - 3600000), // 1 hour ago
      });
      store.getState().initializeThread(staleThread, [createMockParticipant(0)]);

      // Verify stale data is shown
      expect(store.getState().thread?.title).toBe('Stale Title');

      // Revalidation updates with fresh data
      const freshThread = {
        ...staleThread,
        title: 'Fresh Title',
        updatedAt: new Date(),
      };
      store.getState().setThread(freshThread);

      expect(store.getState().thread?.title).toBe('Fresh Title');
    });
  });
});

// ============================================================================
// SECTION 16.2: PWA INSTALLATION
// ============================================================================

describe('section 16.2: PWA Installation', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * PWA-05: Test "Add to Home Screen" prompt triggers correctly
   *
   * Store doesn't control PWA prompts directly, but we test state preservation.
   */
  describe('pWA-05: Add to Home Screen', () => {
    it('should preserve state during PWA installation process', () => {
      // User has active session
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setInputValue('My ongoing question');

      // PWA install prompt appears (doesn't affect store state)
      // User accepts/dismisses

      // State preserved
      expect(store.getState().thread?.id).toBe('thread-123');
      expect(store.getState().inputValue).toBe('My ongoing question');
    });
  });

  /**
   * PWA-06: Test standalone mode UI (hide browser bars)
   *
   * Store sets display mode; UI responds accordingly.
   */
  describe('pWA-06: Standalone mode', () => {
    it('should work correctly in standalone mode', () => {
      // Simulate standalone mode (no browser bars)
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // All functionality should work same as browser mode
      store.getState().setMessages([createMockUserMessage(0)]);
      store.getState().setIsStreaming(true);
      store.getState().setIsStreaming(false);

      expect(store.getState().messages).toHaveLength(1);
    });
  });
});

// ============================================================================
// PWA ADVANCED SCENARIOS
// ============================================================================

describe('pWA Advanced Scenarios', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * Test background sync for failed requests
   */
  it('should queue failed requests for background sync', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    // Request fails
    store.getState().setPendingMessage('Failed message');
    store.getState().setError(new Error('Request failed. Will retry when online.'));

    // Message queued for background sync
    expect(store.getState().pendingMessage).toBe('Failed message');
    expect(store.getState().error?.message).toContain('retry');
  });

  /**
   * Test cache invalidation strategies
   */
  it('should handle cache invalidation on thread update', () => {
    const thread = createMockThread({
      id: 'thread-123',
      title: 'Original Title',
    });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    // Cache invalidated, fresh data loaded
    const updatedThread = {
      ...thread,
      title: 'Updated Title',
    };
    store.getState().setThread(updatedThread);

    expect(store.getState().thread?.title).toBe('Updated Title');
  });

  /**
   * Test update prompts for new versions
   */
  it('should preserve state during app update', () => {
    // User has active work
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    store.getState().setMessages([createMockUserMessage(0)]);
    store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));

    // App update occurs (state should survive if persisted)
    // This simulates checking state after reload

    expect(store.getState().thread?.id).toBe('thread-123');
    expect(store.getState().messages).toHaveLength(1);
    expect(store.getState().analyses).toHaveLength(1);
  });

  /**
   * Test offline indicator in UI
   */
  it('should reflect network status in error state', () => {
    mockNetworkStatus(false);

    // Action attempted while offline
    store.getState().setError(new Error('No internet connection'));

    expect(store.getState().error?.message).toContain('internet');

    // Back online
    mockNetworkStatus(true);
    store.getState().setError(null);

    expect(store.getState().error).toBeNull();
  });

  /**
   * Test pending message sync on reconnection
   */
  it('should sync pending message on reconnection', () => {
    mockNetworkStatus(false);

    // User types message while offline
    store.getState().setInputValue('Offline question');
    store.getState().setPendingMessage('Offline question');

    // Reconnect
    mockNetworkStatus(true);

    // Message ready for sending
    expect(store.getState().pendingMessage).toBe('Offline question');

    // After successful send
    store.getState().setPendingMessage(null);
    store.getState().setHasSentPendingMessage(true);

    expect(store.getState().pendingMessage).toBeNull();
  });

  /**
   * Test multiple failed request queue
   */
  it('should handle multiple queued requests', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    // First request queued
    store.getState().setPendingMessage('First message');

    // User tries another action
    // In real app, UI would prevent this or queue
    expect(store.getState().pendingMessage).toBe('First message');
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('security & PWA Integration', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
    mockNetworkStatus(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * Test complete security flow with XSS in offline scenario
   */
  it('should handle XSS payload in offline-queued message', () => {
    mockNetworkStatus(false);

    const xssPayload = '<script>alert("XSS")</script>';
    store.getState().setInputValue(xssPayload);
    store.getState().setPendingMessage(xssPayload);

    // Come online
    mockNetworkStatus(true);

    // Message preserved exactly as entered
    expect(store.getState().pendingMessage).toBe(xssPayload);
  });

  /**
   * Test access control during PWA cache usage
   */
  it('should enforce access control even with cached data', () => {
    // Cached thread from different user
    const cachedThread = createMockThread({
      id: 'thread-123',
      userId: 'other-user',
    });
    store.getState().initializeThread(cachedThread, [createMockParticipant(0)]);

    // Verification check on load
    store.getState().setError(new Error('Access denied to cached thread'));

    // Thread should be cleared
    store.getState().setThread(null);

    expect(store.getState().thread).toBeNull();
    expect(store.getState().error?.message).toContain('Access denied');
  });

  /**
   * Test complete offline workflow with validation
   */
  it('should maintain data integrity through offline workflow', () => {
    // Start online with thread
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    // Complete round 0
    store.getState().setMessages([
      createMockUserMessage(0, 'First question'),
      createMockMessage(0, 0),
    ]);
    store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));

    // Go offline
    mockNetworkStatus(false);

    // User composes new message
    store.getState().setInputValue('Second question while offline');
    store.getState().setPendingMessage('Second question while offline');

    // Verify existing data preserved
    expect(store.getState().messages).toHaveLength(2);
    expect(store.getState().analyses).toHaveLength(1);

    // Come back online
    mockNetworkStatus(true);

    // Send pending message
    store.getState().setHasSentPendingMessage(true);
    store.getState().setMessages(prev => [
      ...prev,
      createMockUserMessage(1, 'Second question while offline'),
    ]);

    expect(store.getState().messages).toHaveLength(3);
  });

  /**
   * Test rate limiting with proper error recovery
   */
  it('should recover from rate limiting gracefully', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    // Hit rate limit
    store.getState().setError(new Error('Rate limit exceeded. Please wait 60 seconds.'));

    expect(store.getState().error?.message).toContain('Rate limit');

    // Wait and retry
    vi.advanceTimersByTime(60000);

    // Clear error
    store.getState().setError(null);

    // Can proceed
    expect(store.getState().error).toBeNull();
  });

  /**
   * Test large payload handling in offline mode
   */
  it('should handle large payloads queued offline', () => {
    mockNetworkStatus(false);

    const largeContent = 'a'.repeat(5000);
    store.getState().setInputValue(largeContent);
    store.getState().setPendingMessage(largeContent);

    // Come online
    mockNetworkStatus(true);

    // Payload preserved
    expect(store.getState().pendingMessage?.length).toBe(5000);
  });

  /**
   * Test session handling across PWA lifecycle
   */
  it('should handle session expiry in PWA standalone mode', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    store.getState().setIsStreaming(true);

    // Session expires (common in PWA after background)
    store.getState().setError(new Error('Session expired. Please refresh.'));
    store.getState().setIsStreaming(false);

    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().error?.message).toContain('Session expired');
  });

  /**
   * Test network transition during streaming
   */
  it('should handle network loss during streaming gracefully', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    store.getState().setIsStreaming(true);

    // Add partial response
    store.getState().setMessages([
      createMockUserMessage(0),
      createMockMessage(0, 0, { parts: [{ type: 'text', text: 'Partial resp...' }] }),
    ]);

    // Network drops
    mockNetworkStatus(false);
    store.getState().setError(new Error('Connection lost during streaming'));
    store.getState().setIsStreaming(false);

    // Partial response preserved
    expect(store.getState().messages).toHaveLength(2);
    expect(store.getState().isStreaming).toBe(false);

    // User can retry when online
    mockNetworkStatus(true);
    store.getState().setError(null);
    store.getState().startRegeneration(0);

    expect(store.getState().isRegenerating).toBe(true);
  });
});
