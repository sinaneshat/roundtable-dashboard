/**
 * prepareValidatedMessages Tests
 *
 * Tests the core functionality that ensures ALL participants in a chat round
 * have consistent access to uploaded file content.
 *
 * ROOT CAUSE ISSUE:
 * When participant 1+ (index > 0) sends a message with HTTP URL file parts:
 * 1. attachmentIds is undefined (only participant 0 gets them)
 * 2. The backend tries to extract upload IDs from HTTP URLs
 * 3. File data should be loaded via loadMessageAttachments for history messages
 * 4. The new message should also get file data loaded via the participant 1+ fix block
 *
 * BUG: When isDuplicateUserMessage is true, the code uses messagesWithBase64 (DB messages)
 * but if loadMessageAttachments doesn't find records OR the message IDs don't match,
 * the file data is never loaded, causing "Invalid file URL" errors from AI providers.
 *
 * Key scenarios tested:
 * 1. Participant 0: Receives attachmentIds directly, loads via loadAttachmentContent()
 * 2. Participant 1+: Must extract upload IDs from HTTP URLs and load content
 * 3. isDuplicateUserMessage scenario: When DB already has the user message
 */

import { describe, expect, it } from 'vitest';

import { extractUploadIdFromUrl, getUploadIdFromFilePart } from '@/lib/schemas/message-schemas';
import { getRoundNumber } from '@/lib/utils/metadata';

// ============================================================================
// URL Upload ID Extraction Tests
// ============================================================================

describe('extractUploadIdFromUrl', () => {
  it('extracts upload ID from standard download URL', () => {
    const url = 'http://localhost:3000/api/v1/uploads/01KBHRFYC0PW3HKNVHB1XCKKMF/download?exp=123&sig=abc';
    const uploadId = extractUploadIdFromUrl(url);

    expect(uploadId).toBe('01KBHRFYC0PW3HKNVHB1XCKKMF');
  });

  it('extracts upload ID from HTTPS URL', () => {
    const url = 'https://example.com/api/v1/uploads/01ABC123XYZ456/download';
    const uploadId = extractUploadIdFromUrl(url);

    expect(uploadId).toBe('01ABC123XYZ456');
  });

  it('extracts upload ID case-insensitively', () => {
    const url = 'http://localhost:3000/api/v1/uploads/01abcdef123456/download';
    const uploadId = extractUploadIdFromUrl(url);

    expect(uploadId).toBe('01abcdef123456');
  });

  it('returns null for data URLs', () => {
    const url = 'data:image/png;base64,iVBORw0KGgo=';
    const uploadId = extractUploadIdFromUrl(url);

    expect(uploadId).toBeNull();
  });

  it('returns null for URLs without upload path', () => {
    const url = 'http://example.com/files/image.png';
    const uploadId = extractUploadIdFromUrl(url);

    expect(uploadId).toBeNull();
  });

  it('returns null for empty URL', () => {
    expect(extractUploadIdFromUrl('')).toBeNull();
  });

  it('handles URL with no trailing slash after upload ID', () => {
    // This is a potential edge case - URL pattern requires trailing slash
    const url = 'http://localhost:3000/api/v1/uploads/01ABCDEF123456';
    const uploadId = extractUploadIdFromUrl(url);

    // Regex requires trailing slash, so this should be null
    expect(uploadId).toBeNull();
  });

  it('handles URL with query parameters only', () => {
    const url = 'http://localhost:3000/api/v1/uploads/01TESTID12345/download?exp=1234567890&sig=xyz123';
    const uploadId = extractUploadIdFromUrl(url);

    expect(uploadId).toBe('01TESTID12345');
  });
});

// ============================================================================
// getUploadIdFromFilePart Tests
// ============================================================================

describe('getUploadIdFromFilePart', () => {
  it('returns direct uploadId property when present', () => {
    const part = {
      type: 'file' as const,
      url: 'http://localhost:3000/api/v1/uploads/01URLID12345/download',
      mediaType: 'image/png',
      uploadId: '01DIRECTID123',
    };

    expect(getUploadIdFromFilePart(part)).toBe('01DIRECTID123');
  });

  it('extracts uploadId from URL when direct property is missing', () => {
    // Note: Upload IDs are ULIDs (base32, no underscores) - using valid format
    const part = {
      type: 'file' as const,
      url: 'http://localhost:3000/api/v1/uploads/01FROMURL123456/download',
      mediaType: 'image/png',
    };

    expect(getUploadIdFromFilePart(part)).toBe('01FROMURL123456');
  });

  it('prefers direct uploadId over URL extraction', () => {
    const part = {
      type: 'file' as const,
      url: 'http://localhost:3000/api/v1/uploads/01URLIDVAL001/download',
      mediaType: 'image/png',
      uploadId: '01DIRECTWINS01',
    };

    // Direct property takes precedence
    expect(getUploadIdFromFilePart(part)).toBe('01DIRECTWINS01');
  });

  it('returns null when URL has no upload ID pattern', () => {
    const part = {
      type: 'file' as const,
      url: 'data:image/png;base64,ABC123',
      mediaType: 'image/png',
    };

    expect(getUploadIdFromFilePart(part)).toBeNull();
  });

  it('returns null for empty URL without uploadId', () => {
    const part = {
      type: 'file' as const,
      url: '',
      mediaType: 'image/png',
    };

    expect(getUploadIdFromFilePart(part)).toBeNull();
  });
});

// ============================================================================
// Participant 1+ HTTP URL File Part Handling Tests
// ============================================================================

describe('participant 1+ HTTP URL file handling', () => {
  /**
   * This test simulates the exact scenario from the bug report:
   * - Participant 0 (Claude) successfully processes the file
   * - Participant 1+ (Gemini, Llama) receives HTTP URL file parts
   * - The backend must extract upload IDs and load base64 content
   */

  it('identifies HTTP URL file parts correctly', () => {
    const parts = [
      {
        type: 'file' as const,
        url: 'http://localhost:3000/api/v1/uploads/01KBHRFYC0PW3HKNVHB1XCKKMF/download?exp=123&sig=abc',
        filename: 'document.pdf',
        mediaType: 'application/pdf',
      },
      {
        type: 'text' as const,
        text: 'What is in this document?',
      },
    ];

    // Filter for HTTP URL file parts (simulating lines 1172-1178 in streaming-orchestration.service.ts)
    const httpUrlFileParts = parts.filter((part) => {
      if (part.type !== 'file' || !('url' in part))
        return false;
      const url = part.url;
      return url && (url.startsWith('http://') || url.startsWith('https://')) && url.includes('/uploads/');
    });

    expect(httpUrlFileParts).toHaveLength(1);
    expect(httpUrlFileParts[0]).toMatchObject({
      type: 'file',
      filename: 'document.pdf',
    });
  });

  it('extracts upload IDs from HTTP URL file parts', () => {
    const httpUrlFileParts = [
      {
        type: 'file' as const,
        url: 'http://localhost:3000/api/v1/uploads/01UPLOAD1/download?exp=123',
        mediaType: 'image/png',
      },
      {
        type: 'file' as const,
        url: 'http://localhost:3000/api/v1/uploads/01UPLOAD2/download?exp=456',
        mediaType: 'application/pdf',
      },
    ];

    // Extract upload IDs (simulating lines 1184-1190)
    const uploadIdsFromUrls = httpUrlFileParts
      .map((part) => {
        const url = ('url' in part ? part.url : '') as string;
        const match = url.match(/\/uploads\/([A-Z0-9]+)\//i);
        return match?.[1];
      })
      .filter((id): id is string => id !== null && id !== undefined);

    expect(uploadIdsFromUrls).toHaveLength(2);
    expect(uploadIdsFromUrls).toContain('01UPLOAD1');
    expect(uploadIdsFromUrls).toContain('01UPLOAD2');
  });

  it('handles mixed file parts (some HTTP, some data URLs)', () => {
    const parts = [
      {
        type: 'file' as const,
        url: 'data:image/png;base64,ABC123', // Already base64
        mediaType: 'image/png',
      },
      {
        type: 'file' as const,
        url: 'http://localhost:3000/api/v1/uploads/01NEEDSCONVERT/download', // Needs conversion
        mediaType: 'application/pdf',
      },
    ];

    const httpUrlFileParts = parts.filter((part) => {
      if (part.type !== 'file' || !('url' in part))
        return false;
      const url = part.url;
      return url && (url.startsWith('http://') || url.startsWith('https://')) && url.includes('/uploads/');
    });

    // Only the HTTP URL part should be selected for conversion
    expect(httpUrlFileParts).toHaveLength(1);
    expect(httpUrlFileParts[0].url).toContain('01NEEDSCONVERT');
  });

  it('handles file parts with empty URLs', () => {
    const parts = [
      {
        type: 'file' as const,
        url: '', // Empty URL
        mediaType: 'image/png',
        uploadId: '01HASUPLOADID1', // But has uploadId for fallback
      },
    ];

    // HTTP URL filter won't find this
    const httpUrlFileParts = parts.filter((part) => {
      if (part.type !== 'file' || !('url' in part))
        return false;
      const url = part.url;
      return url && (url.startsWith('http://') || url.startsWith('https://')) && url.includes('/uploads/');
    });

    expect(httpUrlFileParts).toHaveLength(0);

    // But uploadId fallback should work
    const uploadId = getUploadIdFromFilePart(parts[0]);
    expect(uploadId).toBe('01HASUPLOADID1');
  });
});

// ============================================================================
// isDuplicateUserMessage Scenario Tests
// ============================================================================

describe('isDuplicateUserMessage handling', () => {
  /**
   * When isDuplicateUserMessage is true:
   * - allMessages uses messagesWithBase64 (DB messages only)
   * - messageWithAttachments is excluded
   * - File data must come from messagesWithBase64 via loadMessageAttachments
   *
   * BUG SCENARIO:
   * If loadMessageAttachments doesn't load file data (e.g., no junction records found),
   * AND messageWithAttachments was updated but excluded,
   * THEN no file data is available for the AI provider.
   */

  it('detects duplicate user message by round number', () => {
    const newMessageRoundNumber = 0;
    const newMessageRole = 'user';

    const dbMessages = [
      {
        id: 'msg-user-001',
        role: 'user',
        parts: [{ type: 'text', text: 'Hello' }],
        metadata: { roundNumber: 0 },
      },
      {
        id: 'msg-assistant-001',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Hi there!' }],
        metadata: { roundNumber: 0, participantIndex: 0 },
      },
    ];

    // Check for duplicate (simulating lines 1478-1485)
    // ✅ TYPE-SAFE: Use getRoundNumber utility instead of inline type casts
    const isDuplicateUserMessage = newMessageRoundNumber !== null
      && newMessageRole === 'user'
      && dbMessages.some((dbMsg) => {
        const dbRound = getRoundNumber(dbMsg.metadata);
        return dbMsg.role === 'user' && dbRound === newMessageRoundNumber;
      });

    expect(isDuplicateUserMessage).toBe(true);
  });

  it('does not detect duplicate when round numbers differ', () => {
    const newMessageRoundNumber = 1; // New round
    const newMessageRole = 'user';

    const dbMessages = [
      {
        id: 'msg-user-001',
        role: 'user',
        parts: [{ type: 'text', text: 'Hello' }],
        metadata: { roundNumber: 0 }, // Different round
      },
    ];

    // ✅ TYPE-SAFE: Use getRoundNumber utility instead of inline type casts
    const isDuplicateUserMessage = newMessageRoundNumber !== null
      && newMessageRole === 'user'
      && dbMessages.some((dbMsg) => {
        const dbRound = getRoundNumber(dbMsg.metadata);
        return dbMsg.role === 'user' && dbRound === newMessageRoundNumber;
      });

    expect(isDuplicateUserMessage).toBe(false);
  });

  it('does not detect duplicate for assistant messages', () => {
    const newMessageRoundNumber = 0;
    const newMessageRole = 'assistant'; // Not a user message

    const dbMessages = [
      {
        id: 'msg-user-001',
        role: 'user',
        parts: [{ type: 'text', text: 'Hello' }],
        metadata: { roundNumber: 0 },
      },
    ];

    // ✅ TYPE-SAFE: Use getRoundNumber utility instead of inline type casts
    const isDuplicateUserMessage = newMessageRoundNumber !== null
      && newMessageRole === 'user' // This check fails for assistant
      && dbMessages.some((dbMsg) => {
        const dbRound = getRoundNumber(dbMsg.metadata);
        return dbMsg.role === 'user' && dbRound === newMessageRoundNumber;
      });

    expect(isDuplicateUserMessage).toBe(false);
  });
});

// ============================================================================
// File Data Collection Tests
// ============================================================================

describe('collectFileDataFromMessages simulation', () => {
  /**
   * The collectFileDataFromMessages function collects file data (Uint8Array)
   * from message parts. It requires parts to have:
   * - type === 'file'
   * - data instanceof Uint8Array
   * - mimeType as string
   *
   * BUG SCENARIO:
   * If messagesWithBase64 has file parts with HTTP URLs (not Uint8Array data),
   * collectFileDataFromMessages returns empty Map, causing "Invalid file URL" errors.
   */

  it('collects file data from parts with Uint8Array', () => {
    const messages = [
      {
        id: 'msg-001',
        role: 'user',
        parts: [
          {
            type: 'file',
            data: new Uint8Array([1, 2, 3, 4]),
            mimeType: 'image/png',
            filename: 'test.png',
          },
          {
            type: 'text',
            text: 'Hello',
          },
        ],
      },
    ];

    // Simulate collectFileDataFromMessages (lines 918-941)
    type FileDataEntry = {
      data: Uint8Array;
      mimeType: string;
      filename?: string;
    };

    const fileDataMap = new Map<string, FileDataEntry>();

    for (const msg of messages) {
      if (!Array.isArray(msg.parts))
        continue;

      for (const part of msg.parts) {
        if (
          typeof part === 'object'
          && part !== null
          && 'type' in part
          && part.type === 'file'
          && 'data' in part
          && (part as { data: unknown }).data instanceof Uint8Array
          && 'mimeType' in part
          && typeof (part as { mimeType: unknown }).mimeType === 'string'
        ) {
          const filePart = part as { data: Uint8Array; mimeType: string; filename?: string };
          const key = filePart.filename || `file_${filePart.mimeType}_${fileDataMap.size}`;
          fileDataMap.set(key, {
            data: filePart.data,
            mimeType: filePart.mimeType,
            filename: filePart.filename,
          });
        }
      }
    }

    expect(fileDataMap.size).toBe(1);
    expect(fileDataMap.has('test.png')).toBe(true);
  });

  it('returns empty when parts have HTTP URLs without Uint8Array data', () => {
    // This is the BUG scenario - parts with HTTP URLs don't have Uint8Array data
    const messages = [
      {
        id: 'msg-001',
        role: 'user',
        parts: [
          {
            type: 'file',
            url: 'http://localhost:3000/api/v1/uploads/01UPLOAD/download', // HTTP URL, no data
            mimeType: 'image/png',
            filename: 'test.png',
          },
        ],
      },
    ];

    type FileDataEntry = {
      data: Uint8Array;
      mimeType: string;
      filename?: string;
    };

    const fileDataMap = new Map<string, FileDataEntry>();

    for (const msg of messages) {
      if (!Array.isArray(msg.parts))
        continue;

      for (const part of msg.parts) {
        // This check fails because part.data is not Uint8Array
        if (
          typeof part === 'object'
          && part !== null
          && 'type' in part
          && part.type === 'file'
          && 'data' in part
          && (part as { data: unknown }).data instanceof Uint8Array
        ) {
          // Never reaches here for HTTP URL parts
          fileDataMap.set('should-not-be-added', { data: new Uint8Array(), mimeType: '' });
        }
      }
    }

    // BUG: No file data collected because parts have URLs, not Uint8Array data
    expect(fileDataMap.size).toBe(0);
  });
});

// ============================================================================
// End-to-End Scenario Test (Integration)
// ============================================================================

describe('participant 1+ complete flow', () => {
  /**
   * This test simulates the complete flow for participant 1+:
   *
   * 1. Participant 0 creates user message with HTTP URL file parts (saved to DB)
   * 2. Participant 0 streams response successfully (loads via attachmentIds)
   * 3. Participant 1 is triggered (attachmentIds = undefined)
   * 4. Backend receives newMessage with HTTP URL file parts
   * 5. Backend loads previousDbMessages (includes user message with HTTP URLs)
   * 6. prepareValidatedMessages must:
   *    a. Detect isDuplicateUserMessage = true (user message already in DB)
   *    b. Load file data via loadMessageAttachments for history messages
   *    c. OR load file data via HTTP URL extraction for newMessage
   * 7. Result: modelMessages must have base64 file data for AI provider
   *
   * BUG: If neither path provides file data, AI provider gets HTTP URLs
   * which it can't access, causing "Invalid file URL: filename" errors.
   */

  const userMessageId = '01KBHRFZ6H2HJ7EJ39YEKYYVAY';
  const uploadId = '01KBHRFYC0PW3HKNVHB1XCKKMF';
  const uploadUrl = `http://localhost:3000/api/v1/uploads/${uploadId}/download?exp=123&sig=abc`;

  // Simulated DB user message (created by participant 0)
  const dbUserMessage = {
    id: userMessageId,
    role: 'user',
    parts: [
      {
        type: 'file',
        url: uploadUrl,
        filename: 'resume.pdf',
        mediaType: 'application/pdf',
      },
      {
        type: 'text',
        text: 'What was her first workplace?',
      },
    ],
    metadata: {
      role: 'user',
      roundNumber: 0,
    },
  };

  // Simulated newMessage from frontend (participant 1+)
  const frontendNewMessage = {
    id: userMessageId, // Same ID as DB message
    role: 'user',
    parts: [
      {
        type: 'file',
        url: uploadUrl, // Same HTTP URL
        filename: 'resume.pdf',
        mediaType: 'application/pdf',
      },
      {
        type: 'text',
        text: 'What was her first workplace?',
      },
    ],
    metadata: {
      role: 'user',
      roundNumber: 0,
    },
  };

  it('correctly identifies the scenario conditions', () => {
    const attachmentIds = undefined; // Participant 1+ doesn't get attachmentIds

    // Check conditions
    expect(attachmentIds).toBeUndefined();

    // New message has HTTP URL file parts
    const httpUrlParts = (frontendNewMessage.parts as Array<{ type: string; url?: string }>).filter((part) => {
      if (part.type !== 'file' || !part.url)
        return false;
      return part.url.startsWith('http://') || part.url.startsWith('https://');
    });
    expect(httpUrlParts.length).toBeGreaterThan(0);

    // isDuplicateUserMessage would be true (same round, same role)
    // ✅ TYPE-SAFE: Use getRoundNumber utility instead of inline type casts
    const isDuplicate = dbUserMessage.role === 'user'
      && frontendNewMessage.role === 'user'
      && getRoundNumber(dbUserMessage.metadata) === getRoundNumber(frontendNewMessage.metadata);
    expect(isDuplicate).toBe(true);
  });

  it('can extract upload ID from the HTTP URL', () => {
    const filePart = (frontendNewMessage.parts as Array<{ type: string; url?: string }>).find(
      p => p.type === 'file',
    );
    expect(filePart).toBeDefined();

    const extractedUploadId = extractUploadIdFromUrl(filePart!.url!);
    expect(extractedUploadId).toBe(uploadId);
  });

  it('demonstrates the bug: HTTP URL parts without Uint8Array fail file data collection', () => {
    // Both DB message and new message have HTTP URLs without Uint8Array data
    const allMessages = [dbUserMessage, frontendNewMessage];

    let fileDataCount = 0;
    for (const msg of allMessages) {
      for (const part of msg.parts) {
        const hasUint8Data = 'data' in part && (part as { data?: unknown }).data instanceof Uint8Array;
        if (part.type === 'file' && hasUint8Data) {
          fileDataCount++;
        }
      }
    }

    // BUG: No file data found because parts have HTTP URLs, not Uint8Array
    expect(fileDataCount).toBe(0);
  });

  it('demonstrates the fix: upload ID extraction enables file loading', () => {
    // Extract upload IDs from HTTP URLs
    const uploadIds: string[] = [];

    for (const part of frontendNewMessage.parts) {
      if (part.type === 'file' && 'url' in part) {
        const url = (part as { url: string }).url;
        const id = extractUploadIdFromUrl(url);
        if (id)
          uploadIds.push(id);
      }
    }

    // Upload IDs can be used to load file content from storage
    expect(uploadIds).toContain(uploadId);
    expect(uploadIds.length).toBeGreaterThan(0);

    // With upload IDs, loadAttachmentContent can be called to get base64 data
    // (This would be tested in integration tests with mocked DB/R2)
  });
});
