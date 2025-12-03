/**
 * Multi-Participant File Attachment Tests
 *
 * Tests the core functionality ensuring ALL participants in a chat round
 * have consistent access to uploaded file content.
 *
 * Key scenarios tested:
 * 1. Participant 0: Receives attachmentIds directly, loads via loadAttachmentContent()
 * 2. Participant 1+: Loads messages from DB, needs loadMessageAttachments() for base64
 * 3. Subsequent rounds: All participants maintain access to all thread attachments
 * 4. Base64 conversion consistency across participants
 * 5. Error handling when files are missing or invalid
 *
 * Reference: CLAUDE.md - Multi-participant streaming architecture
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  arrayBufferToBase64,
  isVisualMimeType,
  isWithinSizeLimit,
  loadAttachmentContent,
  loadMessageAttachments,
  uint8ArrayToBase64,
} from '../attachment-content.service';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock storage service
const mockGetFile = vi.fn();
vi.mock('../storage.service', () => ({
  getFile: (bucket: R2Bucket | undefined, key: string) => mockGetFile(bucket, key),
}));

// Mock database
const mockDbSelect = vi.fn();
const mockDbQuery = {
  upload: {
    findMany: vi.fn(),
  },
};

function createMockDb() {
  return {
    select: () => ({
      from: () => ({
        where: mockDbSelect,
        innerJoin: () => ({
          where: mockDbSelect,
        }),
      }),
    }),
    query: mockDbQuery,
  };
}

// ============================================================================
// Test Data Factories
// ============================================================================

function createMockUpload(overrides: Partial<{
  id: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  r2Key: string;
  status: string;
}> = {}) {
  return {
    id: overrides.id ?? 'upload-001',
    filename: overrides.filename ?? 'test-image.png',
    mimeType: overrides.mimeType ?? 'image/png',
    fileSize: overrides.fileSize ?? 50000,
    r2Key: overrides.r2Key ?? 'uploads/test-image.png',
    status: overrides.status ?? 'uploaded',
    ...overrides,
  };
}

function createMockFileData(content = 'test file content'): ArrayBuffer {
  const encoder = new TextEncoder();
  return encoder.encode(content).buffer as ArrayBuffer;
}

// ============================================================================
// Base64 Conversion Tests
// ============================================================================

describe('base64 Conversion Utilities', () => {
  describe('uint8ArrayToBase64', () => {
    it('converts Uint8Array to base64 string', () => {
      const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const result = uint8ArrayToBase64(data);

      expect(result).toBe('SGVsbG8='); // Base64 of "Hello"
    });

    it('handles empty Uint8Array', () => {
      const data = new Uint8Array([]);
      const result = uint8ArrayToBase64(data);

      expect(result).toBe('');
    });

    it('handles binary data with all byte values', () => {
      // Test with bytes that include special characters
      const data = new Uint8Array([0, 127, 255, 128, 1]);
      const result = uint8ArrayToBase64(data);

      // Verify it decodes back correctly
      const decoded = atob(result);
      expect(decoded.charCodeAt(0)).toBe(0);
      expect(decoded.charCodeAt(1)).toBe(127);
      expect(decoded.charCodeAt(2)).toBe(255);
    });
  });

  describe('arrayBufferToBase64', () => {
    it('delegates to uint8ArrayToBase64', () => {
      const buffer = createMockFileData('Hello');
      const result = arrayBufferToBase64(buffer);

      // Should produce same result as uint8ArrayToBase64
      const uint8Data = new Uint8Array(buffer);
      const expectedResult = uint8ArrayToBase64(uint8Data);

      expect(result).toBe(expectedResult);
    });

    it('handles large ArrayBuffers', () => {
      // Create a 1MB buffer
      const largeBuffer = new ArrayBuffer(1024 * 1024);
      const view = new Uint8Array(largeBuffer);
      view.fill(65); // Fill with 'A'

      const result = arrayBufferToBase64(largeBuffer);

      // Should not throw and produce valid base64
      expect(result.length).toBeGreaterThan(0);
      expect(() => atob(result)).not.toThrow();
    });
  });
});

// ============================================================================
// MIME Type and Size Validation Tests
// ============================================================================

describe('file Validation Utilities', () => {
  describe('isVisualMimeType', () => {
    it('returns true for image MIME types', () => {
      expect(isVisualMimeType('image/png')).toBe(true);
      expect(isVisualMimeType('image/jpeg')).toBe(true);
      expect(isVisualMimeType('image/gif')).toBe(true);
      expect(isVisualMimeType('image/webp')).toBe(true);
    });

    it('returns true for PDF', () => {
      expect(isVisualMimeType('application/pdf')).toBe(true);
    });

    it('returns false for non-visual MIME types', () => {
      expect(isVisualMimeType('text/plain')).toBe(false);
      expect(isVisualMimeType('application/json')).toBe(false);
      expect(isVisualMimeType('video/mp4')).toBe(false);
    });
  });

  describe('isWithinSizeLimit', () => {
    it('returns true for files under 10MB', () => {
      expect(isWithinSizeLimit(1024)).toBe(true); // 1KB
      expect(isWithinSizeLimit(1024 * 1024)).toBe(true); // 1MB
      expect(isWithinSizeLimit(5 * 1024 * 1024)).toBe(true); // 5MB
      expect(isWithinSizeLimit(10 * 1024 * 1024)).toBe(true); // Exactly 10MB
    });

    it('returns false for files over 10MB', () => {
      expect(isWithinSizeLimit(10 * 1024 * 1024 + 1)).toBe(false);
      expect(isWithinSizeLimit(20 * 1024 * 1024)).toBe(false);
    });
  });
});

// ============================================================================
// loadAttachmentContent Tests (Participant 0)
// ============================================================================

describe('loadAttachmentContent (Participant 0 Path)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and converts image attachment to base64', async () => {
    const mockUpload = createMockUpload({
      id: 'upload-img-001',
      filename: 'test.png',
      mimeType: 'image/png',
      fileSize: 50000,
      r2Key: 'uploads/test.png',
    });

    const mockFileContent = createMockFileData('PNG binary data');

    mockDbSelect.mockResolvedValue([mockUpload]);
    mockGetFile.mockResolvedValue({ data: mockFileContent });

    const result = await loadAttachmentContent({
      attachmentIds: ['upload-img-001'],
      r2Bucket: {} as R2Bucket,
      db: createMockDb() as never,
    });

    expect(result.fileParts).toHaveLength(1);
    expect(result.fileParts[0]).toMatchObject({
      type: 'file',
      mimeType: 'image/png',
      mediaType: 'image/png',
      filename: 'test.png',
    });
    expect(result.fileParts[0].data).toBeInstanceOf(Uint8Array);
    expect(result.fileParts[0].url).toMatch(/^data:image\/png;base64,/);
    expect(result.stats.loaded).toBe(1);
    expect(result.stats.failed).toBe(0);
  });

  it('loads multiple attachments maintaining order', async () => {
    const mockUploads = [
      createMockUpload({ id: 'upload-1', filename: 'image1.png' }),
      createMockUpload({ id: 'upload-2', filename: 'image2.jpg', mimeType: 'image/jpeg' }),
      createMockUpload({ id: 'upload-3', filename: 'doc.pdf', mimeType: 'application/pdf' }),
    ];

    mockDbSelect.mockResolvedValue(mockUploads);
    mockGetFile.mockResolvedValue({ data: createMockFileData() });

    const result = await loadAttachmentContent({
      attachmentIds: ['upload-1', 'upload-2', 'upload-3'],
      r2Bucket: {} as R2Bucket,
      db: createMockDb() as never,
    });

    expect(result.fileParts).toHaveLength(3);
    expect(result.fileParts[0].filename).toBe('image1.png');
    expect(result.fileParts[1].filename).toBe('image2.jpg');
    expect(result.fileParts[2].filename).toBe('doc.pdf');
    expect(result.stats.loaded).toBe(3);
  });

  it('skips non-visual MIME types', async () => {
    const mockUploads = [
      createMockUpload({ id: 'upload-1', filename: 'image.png', mimeType: 'image/png' }),
      createMockUpload({ id: 'upload-2', filename: 'data.json', mimeType: 'application/json' }),
      createMockUpload({ id: 'upload-3', filename: 'text.txt', mimeType: 'text/plain' }),
    ];

    mockDbSelect.mockResolvedValue(mockUploads);
    mockGetFile.mockResolvedValue({ data: createMockFileData() });

    const result = await loadAttachmentContent({
      attachmentIds: ['upload-1', 'upload-2', 'upload-3'],
      r2Bucket: {} as R2Bucket,
      db: createMockDb() as never,
    });

    // Only image should be loaded
    expect(result.fileParts).toHaveLength(1);
    expect(result.fileParts[0].filename).toBe('image.png');
    expect(result.stats.skipped).toBe(2);
  });

  it('reports error for files too large', async () => {
    const largeUpload = createMockUpload({
      id: 'upload-large',
      filename: 'huge.png',
      mimeType: 'image/png',
      fileSize: 15 * 1024 * 1024, // 15MB
    });

    mockDbSelect.mockResolvedValue([largeUpload]);

    const result = await loadAttachmentContent({
      attachmentIds: ['upload-large'],
      r2Bucket: {} as R2Bucket,
      db: createMockDb() as never,
    });

    expect(result.fileParts).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain('too large');
    expect(result.stats.failed).toBe(1);
  });

  it('reports error when file not found in storage', async () => {
    const mockUpload = createMockUpload();

    mockDbSelect.mockResolvedValue([mockUpload]);
    mockGetFile.mockResolvedValue({ data: null });

    const result = await loadAttachmentContent({
      attachmentIds: ['upload-001'],
      r2Bucket: {} as R2Bucket,
      db: createMockDb() as never,
    });

    expect(result.fileParts).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toBe('File not found in storage');
    expect(result.stats.failed).toBe(1);
  });

  it('returns empty result for empty attachmentIds', async () => {
    const result = await loadAttachmentContent({
      attachmentIds: [],
      r2Bucket: {} as R2Bucket,
      db: createMockDb() as never,
    });

    expect(result.fileParts).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(result.stats.total).toBe(0);
  });

  it('produces consistent base64 output for same input', async () => {
    const mockUpload = createMockUpload();
    const fileContent = createMockFileData('deterministic content');

    mockDbSelect.mockResolvedValue([mockUpload]);
    mockGetFile.mockResolvedValue({ data: fileContent });

    const result1 = await loadAttachmentContent({
      attachmentIds: ['upload-001'],
      r2Bucket: {} as R2Bucket,
      db: createMockDb() as never,
    });

    const result2 = await loadAttachmentContent({
      attachmentIds: ['upload-001'],
      r2Bucket: {} as R2Bucket,
      db: createMockDb() as never,
    });

    // Base64 output should be identical for same input
    expect(result1.fileParts[0].url).toBe(result2.fileParts[0].url);
  });
});

// ============================================================================
// loadMessageAttachments Tests (Participant 1+ Path)
// ============================================================================

describe('loadMessageAttachments (Participant 1+ Path)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads attachments via messageUpload junction table', async () => {
    const mockUpload = createMockUpload({
      id: 'upload-001',
      filename: 'chart.png',
      mimeType: 'image/png',
    });

    // Simulate Drizzle join result
    mockDbSelect.mockResolvedValue([
      {
        message_upload: {
          messageId: 'msg-001',
          uploadId: 'upload-001',
          displayOrder: 0,
        },
        upload: mockUpload,
      },
    ]);

    mockGetFile.mockResolvedValue({ data: createMockFileData() });

    const result = await loadMessageAttachments({
      messageIds: ['msg-001'],
      r2Bucket: {} as R2Bucket,
      db: createMockDb() as never,
    });

    expect(result.filePartsByMessageId.size).toBe(1);
    expect(result.filePartsByMessageId.has('msg-001')).toBe(true);

    const parts = result.filePartsByMessageId.get('msg-001')!;
    expect(parts).toHaveLength(1);
    expect(parts[0].filename).toBe('chart.png');
    expect(parts[0].url).toMatch(/^data:image\/png;base64,/);
    expect(result.stats.loaded).toBe(1);
  });

  it('loads attachments for multiple messages preserving message association', async () => {
    // Simulate multiple messages with attachments
    mockDbSelect.mockResolvedValue([
      {
        message_upload: { messageId: 'msg-001', uploadId: 'upload-1', displayOrder: 0 },
        upload: createMockUpload({ id: 'upload-1', filename: 'file1.png' }),
      },
      {
        message_upload: { messageId: 'msg-001', uploadId: 'upload-2', displayOrder: 1 },
        upload: createMockUpload({ id: 'upload-2', filename: 'file2.png' }),
      },
      {
        message_upload: { messageId: 'msg-002', uploadId: 'upload-3', displayOrder: 0 },
        upload: createMockUpload({ id: 'upload-3', filename: 'file3.jpg', mimeType: 'image/jpeg' }),
      },
    ]);

    mockGetFile.mockResolvedValue({ data: createMockFileData() });

    const result = await loadMessageAttachments({
      messageIds: ['msg-001', 'msg-002'],
      r2Bucket: {} as R2Bucket,
      db: createMockDb() as never,
    });

    // Message 1 has 2 attachments
    expect(result.filePartsByMessageId.get('msg-001')).toHaveLength(2);
    // Message 2 has 1 attachment
    expect(result.filePartsByMessageId.get('msg-002')).toHaveLength(1);
    expect(result.stats.messagesWithAttachments).toBe(2);
    expect(result.stats.totalUploads).toBe(3);
    expect(result.stats.loaded).toBe(3);
  });

  it('respects displayOrder for attachment ordering', async () => {
    // Attachments returned out of order
    mockDbSelect.mockResolvedValue([
      {
        message_upload: { messageId: 'msg-001', uploadId: 'upload-3', displayOrder: 2 },
        upload: createMockUpload({ id: 'upload-3', filename: 'third.png' }),
      },
      {
        message_upload: { messageId: 'msg-001', uploadId: 'upload-1', displayOrder: 0 },
        upload: createMockUpload({ id: 'upload-1', filename: 'first.png' }),
      },
      {
        message_upload: { messageId: 'msg-001', uploadId: 'upload-2', displayOrder: 1 },
        upload: createMockUpload({ id: 'upload-2', filename: 'second.png' }),
      },
    ]);

    mockGetFile.mockResolvedValue({ data: createMockFileData() });

    const result = await loadMessageAttachments({
      messageIds: ['msg-001'],
      r2Bucket: {} as R2Bucket,
      db: createMockDb() as never,
    });

    const parts = result.filePartsByMessageId.get('msg-001')!;
    expect(parts[0].filename).toBe('first.png');
    expect(parts[1].filename).toBe('second.png');
    expect(parts[2].filename).toBe('third.png');
  });

  it('returns empty map when no attachments found', async () => {
    mockDbSelect.mockResolvedValue([]);

    const result = await loadMessageAttachments({
      messageIds: ['msg-001'],
      r2Bucket: {} as R2Bucket,
      db: createMockDb() as never,
    });

    expect(result.filePartsByMessageId.size).toBe(0);
    expect(result.stats.messagesWithAttachments).toBe(0);
  });

  it('handles partial failures gracefully', async () => {
    mockDbSelect.mockResolvedValue([
      {
        message_upload: { messageId: 'msg-001', uploadId: 'upload-1', displayOrder: 0 },
        upload: createMockUpload({ id: 'upload-1', filename: 'good.png' }),
      },
      {
        message_upload: { messageId: 'msg-001', uploadId: 'upload-2', displayOrder: 1 },
        upload: createMockUpload({ id: 'upload-2', filename: 'missing.png' }),
      },
    ]);

    // First file succeeds, second fails
    mockGetFile
      .mockResolvedValueOnce({ data: createMockFileData() })
      .mockResolvedValueOnce({ data: null });

    const result = await loadMessageAttachments({
      messageIds: ['msg-001'],
      r2Bucket: {} as R2Bucket,
      db: createMockDb() as never,
    });

    // Should still return the successful part
    expect(result.filePartsByMessageId.get('msg-001')).toHaveLength(1);
    expect(result.filePartsByMessageId.get('msg-001')![0].filename).toBe('good.png');
    expect(result.stats.loaded).toBe(1);
    expect(result.stats.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
  });
});

// ============================================================================
// Multi-Participant Consistency Tests
// ============================================================================

describe('multi-Participant Attachment Consistency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('participant 0 and participant 1+ receive identical base64 content', async () => {
    const mockUpload = createMockUpload({
      id: 'upload-001',
      filename: 'shared.png',
      mimeType: 'image/png',
    });

    const fileContent = createMockFileData('shared image content');

    // Participant 0: Uses loadAttachmentContent with attachmentIds
    mockDbSelect.mockResolvedValue([mockUpload]);
    mockGetFile.mockResolvedValue({ data: fileContent });

    const participant0Result = await loadAttachmentContent({
      attachmentIds: ['upload-001'],
      r2Bucket: {} as R2Bucket,
      db: createMockDb() as never,
    });

    // Participant 1+: Uses loadMessageAttachments with messageUpload junction
    mockDbSelect.mockResolvedValue([
      {
        message_upload: { messageId: 'msg-001', uploadId: 'upload-001', displayOrder: 0 },
        upload: mockUpload,
      },
    ]);

    const participant1Result = await loadMessageAttachments({
      messageIds: ['msg-001'],
      r2Bucket: {} as R2Bucket,
      db: createMockDb() as never,
    });

    // Both should have identical base64 output
    const p0Part = participant0Result.fileParts[0];
    const p1Part = participant1Result.filePartsByMessageId.get('msg-001')![0];

    expect(p0Part.url).toBe(p1Part.url);
    expect(p0Part.mimeType).toBe(p1Part.mimeType);
    expect(p0Part.filename).toBe(p1Part.filename);

    // Uint8Array data should be equal
    expect(p0Part.data).toEqual(p1Part.data);
  });

  it('all required fields present for OpenRouter provider compatibility', async () => {
    const mockUpload = createMockUpload();
    mockDbSelect.mockResolvedValue([mockUpload]);
    mockGetFile.mockResolvedValue({ data: createMockFileData() });

    const result = await loadAttachmentContent({
      attachmentIds: ['upload-001'],
      r2Bucket: {} as R2Bucket,
      db: createMockDb() as never,
    });

    const part = result.fileParts[0];

    // OpenRouter provider requires these fields
    expect(part.type).toBe('file');
    expect(part.data).toBeInstanceOf(Uint8Array);
    expect(part.mimeType).toBeDefined();

    // UIMessage compatibility requires these fields
    expect(part.url).toBeDefined();
    expect(part.url).toMatch(/^data:.*base64,/);
    expect(part.mediaType).toBe(part.mimeType);

    // Optional but useful
    expect(part.filename).toBeDefined();
  });

  it('data URL format is valid for AI providers', async () => {
    const mockUpload = createMockUpload({
      mimeType: 'image/png',
    });
    mockDbSelect.mockResolvedValue([mockUpload]);
    mockGetFile.mockResolvedValue({ data: createMockFileData('test') });

    const result = await loadAttachmentContent({
      attachmentIds: ['upload-001'],
      r2Bucket: {} as R2Bucket,
      db: createMockDb() as never,
    });

    const part = result.fileParts[0];

    // Validate data URL format
    const dataUrlRegex = /^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/;
    expect(part.url).toMatch(dataUrlRegex);

    // Extract and validate components
    const match = part.url.match(dataUrlRegex);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('image/png'); // MIME type
    expect(() => atob(match![2])).not.toThrow(); // Valid base64
  });
});

// ============================================================================
// Cross-Round Attachment Persistence Tests
// ============================================================================

describe('cross-Round Attachment Access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('subsequent rounds can access round 0 attachments', async () => {
    // Round 0 user message with attachment
    const round0Upload = createMockUpload({
      id: 'upload-round0',
      filename: 'round0-file.png',
    });

    // Simulate loading round 0 attachments from round 2
    mockDbSelect.mockResolvedValue([
      {
        message_upload: { messageId: 'msg-round0-user', uploadId: 'upload-round0', displayOrder: 0 },
        upload: round0Upload,
      },
    ]);
    mockGetFile.mockResolvedValue({ data: createMockFileData() });

    const result = await loadMessageAttachments({
      messageIds: ['msg-round0-user'],
      r2Bucket: {} as R2Bucket,
      db: createMockDb() as never,
    });

    // Round 0 attachment should still be accessible
    expect(result.filePartsByMessageId.has('msg-round0-user')).toBe(true);
    expect(result.filePartsByMessageId.get('msg-round0-user')![0].filename).toBe('round0-file.png');
  });

  it('multiple rounds of attachments all accessible', async () => {
    // Simulate conversation with attachments in multiple rounds
    mockDbSelect.mockResolvedValue([
      {
        message_upload: { messageId: 'msg-r0', uploadId: 'upload-r0', displayOrder: 0 },
        upload: createMockUpload({ id: 'upload-r0', filename: 'r0.png' }),
      },
      {
        message_upload: { messageId: 'msg-r1', uploadId: 'upload-r1', displayOrder: 0 },
        upload: createMockUpload({ id: 'upload-r1', filename: 'r1.png' }),
      },
      {
        message_upload: { messageId: 'msg-r2', uploadId: 'upload-r2', displayOrder: 0 },
        upload: createMockUpload({ id: 'upload-r2', filename: 'r2.png' }),
      },
    ]);
    mockGetFile.mockResolvedValue({ data: createMockFileData() });

    const result = await loadMessageAttachments({
      messageIds: ['msg-r0', 'msg-r1', 'msg-r2'],
      r2Bucket: {} as R2Bucket,
      db: createMockDb() as never,
    });

    // All rounds should have their attachments
    expect(result.filePartsByMessageId.size).toBe(3);
    expect(result.filePartsByMessageId.get('msg-r0')![0].filename).toBe('r0.png');
    expect(result.filePartsByMessageId.get('msg-r1')![0].filename).toBe('r1.png');
    expect(result.filePartsByMessageId.get('msg-r2')![0].filename).toBe('r2.png');
  });

  it('participant changes do not affect attachment accessibility', async () => {
    // Scenario: User changes participants between rounds
    // Original participant (GPT-4o) → New participant (Claude)
    // Both should access round 0 attachments

    const round0Attachment = createMockUpload({
      id: 'upload-001',
      filename: 'diagram.png',
    });

    mockDbSelect.mockResolvedValue([
      {
        message_upload: { messageId: 'msg-001', uploadId: 'upload-001', displayOrder: 0 },
        upload: round0Attachment,
      },
    ]);
    mockGetFile.mockResolvedValue({ data: createMockFileData('diagram content') });

    // Simulate original participant loading
    const originalParticipantResult = await loadMessageAttachments({
      messageIds: ['msg-001'],
      r2Bucket: {} as R2Bucket,
      db: createMockDb() as never,
    });

    // Simulate new participant loading (same query, same result expected)
    const newParticipantResult = await loadMessageAttachments({
      messageIds: ['msg-001'],
      r2Bucket: {} as R2Bucket,
      db: createMockDb() as never,
    });

    // Both participants should get identical content
    const original = originalParticipantResult.filePartsByMessageId.get('msg-001')![0];
    const newPart = newParticipantResult.filePartsByMessageId.get('msg-001')![0];

    expect(original.url).toBe(newPart.url);
    expect(original.data).toEqual(newPart.data);
  });
});

// ============================================================================
// Error Handling and Edge Cases
// ============================================================================

describe('attachment Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles storage fetch errors gracefully', async () => {
    mockDbSelect.mockResolvedValue([createMockUpload()]);
    mockGetFile.mockRejectedValue(new Error('Network error'));

    const result = await loadAttachmentContent({
      attachmentIds: ['upload-001'],
      r2Bucket: {} as R2Bucket,
      db: createMockDb() as never,
    });

    expect(result.fileParts).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toBe('Network error');
    expect(result.stats.failed).toBe(1);
  });

  it('handles database errors gracefully', async () => {
    mockDbSelect.mockRejectedValue(new Error('Database connection failed'));

    await expect(
      loadAttachmentContent({
        attachmentIds: ['upload-001'],
        r2Bucket: {} as R2Bucket,
        db: createMockDb() as never,
      }),
    ).rejects.toThrow('Database connection failed');
  });

  it('handles mixed success and failure scenarios', async () => {
    mockDbSelect.mockResolvedValue([
      createMockUpload({ id: 'good-1', filename: 'good1.png' }),
      createMockUpload({ id: 'bad-1', filename: 'bad1.png' }),
      createMockUpload({ id: 'good-2', filename: 'good2.png' }),
    ]);

    mockGetFile
      .mockResolvedValueOnce({ data: createMockFileData() }) // good-1
      .mockRejectedValueOnce(new Error('File corrupted')) // bad-1
      .mockResolvedValueOnce({ data: createMockFileData() }); // good-2

    const result = await loadAttachmentContent({
      attachmentIds: ['good-1', 'bad-1', 'good-2'],
      r2Bucket: {} as R2Bucket,
      db: createMockDb() as never,
    });

    expect(result.fileParts).toHaveLength(2);
    expect(result.fileParts[0].filename).toBe('good1.png');
    expect(result.fileParts[1].filename).toBe('good2.png');
    expect(result.errors).toHaveLength(1);
    expect(result.stats.loaded).toBe(2);
    expect(result.stats.failed).toBe(1);
  });

  it('handles empty file data', async () => {
    mockDbSelect.mockResolvedValue([createMockUpload()]);
    mockGetFile.mockResolvedValue({ data: new ArrayBuffer(0) });

    const result = await loadAttachmentContent({
      attachmentIds: ['upload-001'],
      r2Bucket: {} as R2Bucket,
      db: createMockDb() as never,
    });

    // Empty file should still produce valid (empty) base64
    expect(result.fileParts).toHaveLength(1);
    expect(result.fileParts[0].url).toMatch(/^data:image\/png;base64,$/);
  });
});
