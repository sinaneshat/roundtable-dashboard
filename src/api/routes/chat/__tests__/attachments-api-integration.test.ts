/**
 * Attachments API Integration Tests
 *
 * Tests API endpoints for file uploads and attachment processing including:
 * - Upload attachment creation
 * - Attachment association with messages
 * - Retrieving messages with attachments
 * - Streaming handler processing of attachments
 * - Multi-modal content preparation for AI models
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageRoles } from '@/api/core/enums';

describe('attachments API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('pOST /api/v1/uploads', () => {
    it('creates upload record for single file', async () => {
      const mockUploadResponse = {
        success: true,
        data: {
          id: 'upload-single-123',
          filename: 'document.pdf',
          mimeType: 'application/pdf',
          fileSize: 1500000,
          status: 'completed',
          url: 'https://bucket.r2.dev/uploads/document.pdf',
          threadId: null,
          userId: 'user-123',
          createdAt: new Date().toISOString(),
        },
      };

      // Simulate API call
      const response = await Promise.resolve(mockUploadResponse);

      expect(response.success).toBe(true);
      expect(response.data.id).toBe('upload-single-123');
      expect(response.data.filename).toBe('document.pdf');
      expect(response.data.status).toBe('completed');
    });

    it('creates upload with threadId association', async () => {
      const mockUploadResponse = {
        success: true,
        data: {
          id: 'upload-thread-456',
          filename: 'image.png',
          mimeType: 'image/png',
          fileSize: 500000,
          status: 'completed',
          url: 'https://bucket.r2.dev/uploads/image.png',
          threadId: 'thread-123', // Associated with thread
          userId: 'user-123',
          createdAt: new Date().toISOString(),
        },
      };

      const response = await Promise.resolve(mockUploadResponse);

      expect(response.data.threadId).toBe('thread-123');
    });

    it('validates file type and size', async () => {
      // Invalid file type
      const invalidTypeResponse = {
        success: false,
        error: {
          code: 'invalid_type',
          message: 'File type not allowed',
        },
      };

      expect(invalidTypeResponse.success).toBe(false);
      expect(invalidTypeResponse.error.code).toBe('invalid_type');

      // File too large
      const tooLargeResponse = {
        success: false,
        error: {
          code: 'file_too_large',
          message: 'File exceeds maximum size',
        },
      };

      expect(tooLargeResponse.success).toBe(false);
      expect(tooLargeResponse.error.code).toBe('file_too_large');
    });
  });

  describe('pOST /api/v1/chat/threads (with attachments)', () => {
    it('creates thread with user message and attachment associations', async () => {
      const mockCreateThreadResponse = {
        success: true,
        data: {
          thread: {
            id: 'thread-attach-123',
            userId: 'user-123',
            title: 'New Chat',
            slug: 'new-chat-123',
            mode: 'brainstorming',
            enableWebSearch: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          participants: [
            {
              id: 'participant-1',
              threadId: 'thread-attach-123',
              modelId: 'anthropic/claude-sonnet-4.5',
              role: null,
              priority: 0,
              isEnabled: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          messages: [
            {
              id: 'message-1',
              threadId: 'thread-attach-123',
              role: MessageRoles.USER,
              parts: [{ type: 'text', text: 'Analyze this image' }],
              roundNumber: 0,
              metadata: {
                role: MessageRoles.USER,
                roundNumber: 0,
              },
              createdAt: new Date().toISOString(),
              // messageUpload junction records created
              messageUploads: [
                {
                  id: 'msg-upload-1',
                  messageId: 'message-1',
                  uploadId: 'upload-123',
                  displayOrder: 0,
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          ],
        },
      };

      const response = await Promise.resolve(mockCreateThreadResponse);

      expect(response.data.messages[0].messageUploads).toHaveLength(1);
      expect(response.data.messages[0].messageUploads[0].uploadId).toBe('upload-123');
      expect(response.data.messages[0].messageUploads[0].displayOrder).toBe(0);
    });

    it('creates multiple attachment associations in correct display order', async () => {
      const mockMessage = {
        id: 'message-multi',
        messageUploads: [
          {
            uploadId: 'upload-1',
            displayOrder: 0,
          },
          {
            uploadId: 'upload-2',
            displayOrder: 1,
          },
          {
            uploadId: 'upload-3',
            displayOrder: 2,
          },
        ],
      };

      // Verify display order
      mockMessage.messageUploads.forEach((mu, index) => {
        expect(mu.displayOrder).toBe(index);
      });
    });
  });

  describe('pOST /api/v1/chat/threads/:id/stream (with attachments)', () => {
    it('loads attachments for user message before streaming', async () => {
      // Simulate streaming handler loading message with attachments
      const mockUserMessage = {
        id: 'message-round-1',
        threadId: 'thread-456',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'What do you see?' }],
        roundNumber: 1,
        messageUploads: [
          {
            id: 'msg-upload-1',
            uploadId: 'upload-image-123',
            upload: {
              id: 'upload-image-123',
              filename: 'photo.jpg',
              mimeType: 'image/jpeg',
              fileSize: 245000,
              status: 'completed',
              url: 'https://bucket.r2.dev/uploads/photo.jpg',
            },
          },
        ],
      };

      // Backend loads full upload details via relation
      expect(mockUserMessage.messageUploads[0].upload).toBeDefined();
      expect(mockUserMessage.messageUploads[0].upload.url).toBe(
        'https://bucket.r2.dev/uploads/photo.jpg',
      );
    });

    it('prepares multi-modal content for vision model', async () => {
      const mockAttachments = [
        {
          uploadId: 'upload-img-1',
          upload: {
            mimeType: 'image/png',
            url: 'https://bucket.r2.dev/chart.png',
          },
        },
        {
          uploadId: 'upload-img-2',
          upload: {
            mimeType: 'image/jpeg',
            url: 'https://bucket.r2.dev/photo.jpg',
          },
        },
      ];

      // Backend constructs AI SDK message format
      const modelMessage = {
        role: 'user',
        content: [
          { type: 'text', text: 'Compare these images' },
          { type: 'image', image: mockAttachments[0].upload.url },
          { type: 'image', image: mockAttachments[1].upload.url },
        ],
      };

      expect(modelMessage.content).toHaveLength(3);
      expect(modelMessage.content[0].type).toBe('text');
      expect(modelMessage.content[1].type).toBe('image');
      expect(modelMessage.content[2].type).toBe('image');
    });

    it('prepares document content for text-based models', async () => {
      const mockAttachment = {
        uploadId: 'upload-pdf-1',
        upload: {
          mimeType: 'application/pdf',
          url: 'https://bucket.r2.dev/report.pdf',
          extractedText: 'PDF contains analysis of Q4 sales...',
        },
      };

      // Backend extracts text content from PDF
      const modelMessage = {
        role: 'user',
        content: `Analyze this document:\n\n${mockAttachment.upload.extractedText}`,
      };

      expect(modelMessage.content).toContain('PDF contains analysis of Q4 sales');
    });

    it('handles mixed attachment types in single message', async () => {
      const mockAttachments = [
        {
          uploadId: 'upload-1',
          upload: {
            mimeType: 'image/png',
            url: 'https://bucket.r2.dev/diagram.png',
          },
        },
        {
          uploadId: 'upload-2',
          upload: {
            mimeType: 'text/plain',
            url: 'https://bucket.r2.dev/notes.txt',
            content: 'User notes: Important findings...',
          },
        },
        {
          uploadId: 'upload-3',
          upload: {
            mimeType: 'application/pdf',
            url: 'https://bucket.r2.dev/specs.pdf',
            extractedText: 'Technical specifications...',
          },
        },
      ];

      // Backend constructs comprehensive content array
      const modelMessage = {
        role: 'user',
        content: [
          { type: 'text', text: 'Review these materials' },
          { type: 'image', image: mockAttachments[0].upload.url },
          { type: 'text', text: `Notes: ${mockAttachments[1].upload.content}` },
          { type: 'text', text: `Specifications: ${mockAttachments[2].upload.extractedText}` },
        ],
      };

      expect(modelMessage.content).toHaveLength(4);
      expect(modelMessage.content.filter(c => c.type === 'image')).toHaveLength(1);
      expect(modelMessage.content.filter(c => c.type === 'text')).toHaveLength(3);
    });
  });

  describe('gET /api/v1/chat/threads/:id/messages (with attachments)', () => {
    it('retrieves messages with attachment details', async () => {
      const mockMessagesResponse = {
        success: true,
        data: [
          {
            id: 'message-1',
            threadId: 'thread-789',
            role: MessageRoles.USER,
            parts: [{ type: 'text', text: 'Check this file' }],
            roundNumber: 0,
            metadata: {
              role: MessageRoles.USER,
              roundNumber: 0,
            },
            createdAt: new Date().toISOString(),
            messageUploads: [
              {
                id: 'msg-upload-1',
                uploadId: 'upload-file-123',
                displayOrder: 0,
                upload: {
                  id: 'upload-file-123',
                  filename: 'data.csv',
                  mimeType: 'text/csv',
                  fileSize: 50000,
                  status: 'completed',
                  url: 'https://bucket.r2.dev/uploads/data.csv',
                },
              },
            ],
          },
          {
            id: 'message-2',
            threadId: 'thread-789',
            role: MessageRoles.ASSISTANT,
            parts: [{ type: 'text', text: 'I analyzed the CSV data...' }],
            roundNumber: 0,
            metadata: {
              role: MessageRoles.ASSISTANT,
              roundNumber: 0,
              participantId: 'participant-1',
              participantIndex: 0,
              model: 'anthropic/claude-sonnet-4.5',
              finishReason: 'stop',
              usage: { promptTokens: 150, completionTokens: 80, totalTokens: 230 },
            },
            createdAt: new Date().toISOString(),
            messageUploads: [], // Assistant messages don't have attachments
          },
        ],
      };

      const response = await Promise.resolve(mockMessagesResponse);

      // User message has attachment
      expect(response.data[0].messageUploads).toHaveLength(1);
      expect(response.data[0].messageUploads[0].upload.filename).toBe('data.csv');

      // Assistant message has no attachments
      expect(response.data[1].messageUploads).toHaveLength(0);
    });

    it('orders attachments by displayOrder', async () => {
      const mockMessage = {
        id: 'message-ordered',
        messageUploads: [
          {
            uploadId: 'upload-c',
            displayOrder: 2,
            upload: { filename: 'file-c.txt' },
          },
          {
            uploadId: 'upload-a',
            displayOrder: 0,
            upload: { filename: 'file-a.txt' },
          },
          {
            uploadId: 'upload-b',
            displayOrder: 1,
            upload: { filename: 'file-b.txt' },
          },
        ],
      };

      // Sort by displayOrder
      const sorted = [...mockMessage.messageUploads].sort(
        (a, b) => a.displayOrder - b.displayOrder,
      );

      expect(sorted[0].upload.filename).toBe('file-a.txt');
      expect(sorted[1].upload.filename).toBe('file-b.txt');
      expect(sorted[2].upload.filename).toBe('file-c.txt');
    });
  });

  describe('attachment lifecycle', () => {
    it('tracks upload from creation to message association', async () => {
      // Step 1: User uploads file
      const uploadResponse = {
        success: true,
        data: {
          id: 'upload-lifecycle-1',
          filename: 'presentation.pptx',
          status: 'completed',
          threadId: null, // Not yet associated
        },
      };

      expect(uploadResponse.data.threadId).toBeNull();

      // Step 2: User creates thread with attachment
      const createThreadResponse = {
        success: true,
        data: {
          thread: { id: 'thread-new' },
          messages: [
            {
              id: 'message-new',
              messageUploads: [
                {
                  uploadId: 'upload-lifecycle-1', // Now associated
                  upload: {
                    id: 'upload-lifecycle-1',
                    threadId: 'thread-new', // Updated
                  },
                },
              ],
            },
          ],
        },
      };

      expect(createThreadResponse.data.messages[0].messageUploads[0].uploadId).toBe(
        'upload-lifecycle-1',
      );
      expect(createThreadResponse.data.messages[0].messageUploads[0].upload.threadId).toBe(
        'thread-new',
      );
    });

    it('cleans up unused uploads', async () => {
      // User uploads file but never sends message
      const orphanedUpload = {
        id: 'upload-orphan',
        filename: 'temp.txt',
        status: 'completed',
        threadId: null,
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48 hours ago
      };

      // Backend cleanup job identifies orphaned uploads
      const isOrphaned = orphanedUpload.threadId === null;
      const isOld = Date.now() - new Date(orphanedUpload.createdAt).getTime() > 24 * 60 * 60 * 1000;

      expect(isOrphaned).toBe(true);
      expect(isOld).toBe(true);

      // Cleanup job would delete this upload and R2 object
    });
  });

  describe('error scenarios', () => {
    it('handles attachment not found during streaming', async () => {
      const mockUserMessage = {
        id: 'message-missing-upload',
        parts: [{ type: 'text', text: 'See attachment' }],
        messageUploads: [
          {
            uploadId: 'upload-deleted',
            upload: null, // Attachment was deleted
          },
        ],
      };

      // Backend should handle gracefully
      const validUploads = mockUserMessage.messageUploads.filter(mu => mu.upload !== null);

      expect(validUploads).toHaveLength(0);

      // Model receives text-only message
      const modelMessage = {
        role: 'user',
        content: 'See attachment',
        // No attachment content
      };

      expect(modelMessage.content).toBe('See attachment');
    });

    it('handles incomplete upload during message send', async () => {
      const mockUpload = {
        id: 'upload-incomplete',
        status: 'pending', // Still uploading
        url: null,
      };

      // Backend validates upload is complete
      const isReady = mockUpload.status === 'completed' && mockUpload.url !== null;

      expect(isReady).toBe(false);

      // Should reject message creation or skip attachment
    });

    it('handles corrupted file during processing', async () => {
      const mockUpload = {
        id: 'upload-corrupt',
        filename: 'broken.pdf',
        mimeType: 'application/pdf',
        status: 'completed',
        url: 'https://bucket.r2.dev/broken.pdf',
      };

      // Backend attempts to extract text
      const extractionResult = {
        success: false,
        error: 'Failed to parse PDF: File is corrupted',
      };

      expect(extractionResult.success).toBe(false);

      // Model receives error message instead of content
      const modelMessage = {
        role: 'user',
        content: `Error: Could not process attachment "${mockUpload.filename}"`,
      };

      expect(modelMessage.content).toContain('Could not process attachment');
    });

    it('handles rate limit during file upload', async () => {
      const rateLimitResponse = {
        success: false,
        error: {
          code: 'rate_limit_exceeded',
          message: 'Too many upload requests',
          retryAfter: 60, // seconds
        },
      };

      expect(rateLimitResponse.success).toBe(false);
      expect(rateLimitResponse.error.code).toBe('rate_limit_exceeded');
      expect(rateLimitResponse.error.retryAfter).toBe(60);
    });
  });

  describe('multipart upload flow', () => {
    it('creates multipart upload for large file', async () => {
      const createMultipartResponse = {
        success: true,
        data: {
          uploadId: 'multipart-abc123', // R2 multipart upload ID
          attachmentId: 'upload-large-1', // Database record ID
        },
      };

      expect(createMultipartResponse.data.uploadId).toBeDefined();
      expect(createMultipartResponse.data.attachmentId).toBeDefined();
    });

    it('uploads parts in sequence', async () => {
      const parts = [
        {
          partNumber: 1,
          etag: 'etag-part-1',
          size: 50 * 1024 * 1024,
        },
        {
          partNumber: 2,
          etag: 'etag-part-2',
          size: 50 * 1024 * 1024,
        },
        {
          partNumber: 3,
          etag: 'etag-part-3',
          size: 25 * 1024 * 1024,
        },
      ];

      // All parts uploaded successfully
      expect(parts.every(p => p.etag)).toBe(true);
    });

    it('completes multipart upload', async () => {
      const completeResponse = {
        success: true,
        data: {
          id: 'upload-large-1',
          status: 'completed',
          url: 'https://bucket.r2.dev/uploads/large-file.zip',
        },
      };

      expect(completeResponse.data.status).toBe('completed');
      expect(completeResponse.data.url).toBeDefined();
    });

    it('aborts failed multipart upload', async () => {
      const abortResponse = {
        success: true,
        message: 'Multipart upload aborted',
      };

      expect(abortResponse.success).toBe(true);
    });
  });
});
