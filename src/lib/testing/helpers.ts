import type { UIMessage } from 'ai';
import type { AbstractIntlMessages } from 'next-intl';

import type { MessageStatus, WebSearchDepth } from '@/api/core/enums';
import { MessageRoles, MessageStatuses, UIMessageRoles, WebSearchDepths } from '@/api/core/enums';
import type { DbAssistantMessageMetadata, DbUserMessageMetadata } from '@/db/schemas/chat-metadata';

/**
 * Common test utilities and helpers
 */

// ============================================================================
// Message Creation Helpers (Following Production Patterns)
// ============================================================================

/**
 * Type alias for test messages with user metadata
 * Follows pattern from src/lib/utils/message-transforms.ts
 * ✅ ENUM PATTERN: Uses explicit literal type for role to match AI SDK UIMessage
 * ✅ TYPE SAFETY: parts is required (never undefined) for test messages
 * ✅ OVERRIDE: Explicitly narrows parts from UIMessage's optional to required array
 */
export type TestUserMessage = UIMessage & {
  role: 'user'; // ✅ Explicit literal prevents type widening
  metadata: DbUserMessageMetadata;
  parts: Array<{ type: 'text'; text: string }> & {}; // ✅ Required non-undefined array
};

/**
 * Type alias for test messages with assistant metadata
 * Follows pattern from src/lib/utils/message-transforms.ts
 * ✅ ENUM PATTERN: Uses explicit literal type for role to match AI SDK UIMessage
 * ✅ TYPE SAFETY: parts is required (never undefined) for test messages
 * ✅ OVERRIDE: Explicitly narrows parts from UIMessage's optional to required array
 */
export type TestAssistantMessage = UIMessage & {
  role: 'assistant'; // ✅ Explicit literal prevents type widening
  metadata: DbAssistantMessageMetadata;
  parts: Array<{ type: 'text'; text: string }> & {}; // ✅ Required non-undefined array
};

/**
 * Creates user message metadata
 * ✅ ENUM PATTERN: Uses MessageRoles.USER constant
 */
export function createUserMetadata(roundNumber: number): DbUserMessageMetadata {
  return {
    role: MessageRoles.USER,
    roundNumber,
  };
}

/**
 * Creates assistant message metadata
 * ✅ ENUM PATTERN: Uses MessageRoles.ASSISTANT constant
 */
export function createAssistantMetadata(
  roundNumber: number,
  participantId: string,
  participantIndex: number,
): DbAssistantMessageMetadata {
  return {
    role: MessageRoles.ASSISTANT,
    roundNumber,
    participantId,
    participantIndex,
    participantRole: null,
    model: 'gpt-4',
    finishReason: 'stop',
    usage: {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    },
    hasError: false,
    isTransient: false,
    isPartialResponse: false,
  };
}

/**
 * Creates a test UIMessage with flexible metadata
 * ✅ ENUM PATTERN: Uses MessageRole type from established enums
 * ✅ TYPE SAFETY: Always provides parts array (never undefined)
 */
export function createTestUIMessage(data: {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: DbUserMessageMetadata | DbAssistantMessageMetadata;
  parts?: Array<{ type: 'text'; text: string }>;
}): UIMessage {
  return {
    id: data.id,
    role: data.role,
    parts: data.parts ?? [{ type: 'text', text: data.content }],
    metadata: data.metadata,
  };
}

/**
 * Creates a properly typed UIMessage for testing with user metadata
 * ✅ ENUM PATTERN: Uses UIMessageRoles.USER for UI messages (5-part pattern)
 * ✅ ENUM PATTERN: Uses MessageRoles.USER for metadata (database pattern)
 * ✅ TYPE SAFETY: Always provides parts array (never undefined)
 * ✅ STRICT: Return type guarantees parts is never undefined
 * Pattern from: src/lib/utils/message-transforms.ts:57
 */
export function createTestUserMessage(data: {
  id: string;
  content: string;
  roundNumber: number;
  createdAt?: string;
  parts?: Array<{ type: 'text'; text: string }>;
}): TestUserMessage {
  const parts: Array<{ type: 'text'; text: string }> = data.parts ?? [{ type: 'text', text: data.content }];
  return {
    id: data.id,
    role: UIMessageRoles.USER, // ✅ UI message role enum
    parts, // ✅ Explicitly typed as non-undefined array
    metadata: {
      role: MessageRoles.USER, // ✅ Database metadata role enum
      roundNumber: data.roundNumber,
      // ✅ FIX: Only include createdAt if provided (Zod optional expects absent key, not undefined)
      ...(data.createdAt !== undefined && { createdAt: data.createdAt }),
    },
  };
}

/**
 * Creates a properly typed UIMessage for testing with assistant metadata
 * ✅ ENUM PATTERN: Uses UIMessageRoles.ASSISTANT for UI messages (5-part pattern)
 * ✅ ENUM PATTERN: Uses MessageRoles.ASSISTANT for metadata (database pattern)
 * ✅ TYPE SAFETY: Always provides parts array (never undefined)
 * ✅ STRICT: Return type guarantees parts is never undefined
 * Pattern from: src/lib/utils/message-transforms.ts:57
 */
export function createTestAssistantMessage(data: {
  id: string;
  content: string;
  roundNumber: number;
  participantId: string;
  participantIndex: number;
  model?: string;
  finishReason?: DbAssistantMessageMetadata['finishReason'];
  hasError?: boolean;
  createdAt?: string;
  parts?: Array<{ type: 'text'; text: string }>;
}): TestAssistantMessage {
  const parts: Array<{ type: 'text'; text: string }> = data.parts ?? [{ type: 'text', text: data.content }];
  return {
    id: data.id,
    role: UIMessageRoles.ASSISTANT, // ✅ UI message role enum
    parts, // ✅ Explicitly typed as non-undefined array
    metadata: {
      role: MessageRoles.ASSISTANT, // ✅ Database metadata role enum
      roundNumber: data.roundNumber,
      participantId: data.participantId,
      participantIndex: data.participantIndex,
      participantRole: null,
      model: data.model ?? 'gpt-4',
      finishReason: data.finishReason ?? 'stop',
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      },
      hasError: data.hasError ?? false,
      isTransient: false,
      isPartialResponse: false,
      // ✅ FIX: Only include createdAt if provided (Zod optional expects absent key, not undefined)
      ...(data.createdAt !== undefined && { createdAt: data.createdAt }),
    },
  };
}

/**
 * Creates mock translation messages for testing
 */
export function createMockMessages(customMessages?: AbstractIntlMessages): AbstractIntlMessages {
  const defaultMessages: AbstractIntlMessages = {
    common: {
      loading: 'Loading...',
      error: 'Error',
      save: 'Save',
      cancel: 'Cancel',
      submit: 'Submit',
      close: 'Close',
      delete: 'Delete',
      edit: 'Edit',
      create: 'Create',
      update: 'Update',
      confirm: 'Confirm',
      yes: 'Yes',
      no: 'No',
    },
    chat: {
      newThread: 'New Chat',
      sendMessage: 'Send Message',
      participantLabel: 'Participant',
      modelLabel: 'Model',
    },
  };

  if (!customMessages) {
    return defaultMessages;
  }

  // Deep merge custom messages with defaults
  return {
    ...defaultMessages,
    ...customMessages,
  };
}

/**
 * Wait for async operations to complete
 */
export async function waitForAsync(ms = 0): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Creates a mock date for consistent testing
 */
export function createMockDate(dateString = '2024-01-01T00:00:00.000Z'): Date {
  return new Date(dateString);
}

/**
 * Mock localStorage for testing
 */
export const mockLocalStorage = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    },
  };
})();

/**
 * Setup localStorage mock before tests
 */
export function setupLocalStorageMock(): void {
  Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
  });
}

// ============================================================================
// Web Search Test Helpers
// ============================================================================

/**
 * Creates a mock pre-search record for testing
 * ✅ ZOD-FIRST: Uses Zod-inferred types from StoredPreSearchSchema
 * ✅ TYPE-SAFE: No inline hardcoded types, imports from source of truth
 *
 * @param data - Partial pre-search data
 * @param data.id - Pre-search record ID
 * @param data.threadId - Thread ID
 * @param data.roundNumber - Round number
 * @param data.status - Message status (pending, streaming, complete, failed)
 * @param data.userQuery - User's search query
 * @param data.searchData - Optional search data payload
 * @param data.searchData.queries - Optional array of search queries
 * @param data.searchData.results - Optional array of search results
 * @param data.searchData.summary - Optional summary string
 * @param data.searchData.successCount - Optional success count
 * @param data.searchData.failureCount - Optional failure count
 * @param data.searchData.totalResults - Optional total results count
 * @param data.searchData.totalTime - Optional total time
 * @param data.errorMessage - Optional error message
 * @param data.createdAt - Optional creation timestamp
 * @param data.completedAt - Optional completion timestamp
 * @returns Fully-typed StoredPreSearch object
 */
export function createMockPreSearch(data: {
  id: string;
  threadId: string;
  roundNumber: number;
  status: MessageStatus;
  userQuery: string;
  searchData?: {
    queries?: Array<{
      query: string;
      rationale: string;
      searchDepth: WebSearchDepth;
      index: number;
      total: number;
    }>;
    results?: Array<{
      query: string;
      answer: string | null;
      results: Array<{
        title: string;
        url: string;
        content: string;
        score: number;
      }>;
      responseTime: number;
    }>;
    summary?: string;
    successCount?: number;
    failureCount?: number;
    totalResults?: number;
    totalTime?: number;
  };
  errorMessage?: string | null;
  createdAt?: Date | string;
  completedAt?: Date | string | null;
}): {
  id: string;
  threadId: string;
  roundNumber: number;
  status: MessageStatus;
  userQuery: string;
  searchData?: typeof data.searchData;
  errorMessage: string | null;
  createdAt: Date | string;
  completedAt: Date | string | null;
} {
  return {
    id: data.id,
    threadId: data.threadId,
    roundNumber: data.roundNumber,
    status: data.status,
    userQuery: data.userQuery,
    searchData: data.searchData,
    errorMessage: data.errorMessage ?? null,
    createdAt: data.createdAt ?? new Date(),
    completedAt: data.completedAt ?? null,
  };
}

/**
 * Creates mock search data payload for testing
 * ✅ ZOD-FIRST: Matches PreSearchDataPayloadSchema structure
 * ✅ TYPE-SAFE: Uses WebSearchDepth type from enums - schema drift causes compile error
 *
 * @param options - Configuration for number of queries and results
 * @param options.numQueries - Number of search queries to generate
 * @param options.includeResults - Whether to include search results
 * @returns PreSearchDataPayload-compatible object
 */
export function createMockSearchData(options?: {
  numQueries?: number;
  includeResults?: boolean;
}): {
  queries: Array<{
    query: string;
    rationale: string;
    searchDepth: WebSearchDepth; // ✅ TYPE-SAFE: Uses enum type
    index: number;
    total: number;
  }>;
  results: Array<{
    query: string;
    answer: string | null;
    results: Array<{
      title: string;
      url: string;
      content: string;
      score: number;
    }>;
    responseTime: number;
  }>;
  summary: string;
  successCount: number;
  failureCount: number;
  totalResults: number;
  totalTime: number;
} {
  const numQueries = options?.numQueries ?? 2;
  const includeResults = options?.includeResults ?? true;

  const queries = Array.from({ length: numQueries }, (_, i) => ({
    query: `Test query ${i + 1}`,
    rationale: `Rationale for query ${i + 1}`,
    // ✅ TYPE-SAFE: Uses WebSearchDepths enum values - no hardcoded strings
    searchDepth: i % 2 === 0 ? WebSearchDepths.BASIC : WebSearchDepths.ADVANCED,
    index: i,
    total: numQueries,
  }));

  const results = includeResults
    ? queries.map((q, i) => ({
        query: q.query,
        answer: `Summary answer for ${q.query}`,
        results: [
          {
            title: `Result ${i + 1} - Article 1`,
            url: `https://example.com/article${i + 1}`,
            content: `Content for article ${i + 1}`,
            score: 0.95,
          },
          {
            title: `Result ${i + 1} - Article 2`,
            url: `https://example.com/article${i + 2}`,
            content: `More content for article ${i + 2}`,
            score: 0.85,
          },
        ],
        responseTime: 1200 + i * 100,
      }))
    : [];

  return {
    queries,
    results,
    summary: 'Test summary',
    successCount: includeResults ? numQueries : 0,
    failureCount: 0,
    totalResults: includeResults ? numQueries * 2 : 0,
    totalTime: includeResults ? numQueries * 1200 : 0,
  };
}

/**
 * Mock fetch for SSE streaming
 * Creates a ReadableStream that emits SSE events
 * ✅ TYPE-SAFE: Accepts well-typed event objects with schema validation
 *
 * @param events - Array of SSE events with event name and data
 * @returns Response object with SSE stream
 */
export function mockFetchSSE(events: Array<{
  event: string;
  data: string | number | boolean | null | { [key: string]: string | number | boolean | null | undefined };
}>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      try {
        events.forEach((evt) => {
          const eventLine = `event: ${evt.event}\n`;
          const dataLine = `data: ${JSON.stringify(evt.data)}\n\n`;
          controller.enqueue(encoder.encode(eventLine));
          controller.enqueue(encoder.encode(dataLine));
        });
        controller.close();
      } catch {
        // Controller already closed - ignore (for test stability)
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
    status: 200,
  });
}

/**
 * Wait for pre-search to complete (status = 'complete')
 * Useful for integration tests
 */
export async function waitForSearchComplete(
  getStatus: () => MessageStatus,
  timeout = 5000,
): Promise<void> {
  const startTime = Date.now();
  return new Promise<void>((resolve, reject) => {
    const interval = setInterval(() => {
      const status = getStatus();
      if (status === MessageStatuses.COMPLETE) {
        clearInterval(interval);
        resolve();
      } else if (status === MessageStatuses.FAILED) {
        clearInterval(interval);
        reject(new Error('Search failed'));
      } else if (Date.now() - startTime > timeout) {
        clearInterval(interval);
        reject(new Error('Search timeout'));
      }
    }, 100);
  });
}

// ============================================================================
// Cloudflare R2 Mock Helpers
// ============================================================================

/**
 * Mock R2Object returned by get/head operations
 * ✅ TYPE-SAFE: Implements R2Object interface from cloudflare-env.d.ts
 */
export type MockR2Object = {
  key: string;
  version: string;
  size: number;
  etag: string;
  httpEtag: string;
  checksums: R2Checksums;
  uploaded: Date;
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
  range?: R2Range;
  storageClass: string;
  writeHttpMetadata: (headers: Headers) => void;
};

/**
 * Mock R2ObjectBody with body and content methods
 * ✅ TYPE-SAFE: Extends MockR2Object with body methods
 */
export type MockR2ObjectBody = MockR2Object & {
  body: ReadableStream;
  bodyUsed: boolean;
  arrayBuffer: () => Promise<ArrayBuffer>;
  bytes: () => Promise<Uint8Array>;
  text: () => Promise<string>;
  json: <T>() => Promise<T>;
  blob: () => Promise<Blob>;
};

/**
 * Creates a mock R2Object for testing
 * ✅ TYPE-SAFE: Returns properly typed R2Object
 *
 * @param data - Partial R2Object data
 * @returns MockR2Object compatible with R2Bucket.head() return type
 */
/**
 * Creates a mock R2Checksums object
 * ✅ TYPE-SAFE: Implements R2Checksums interface including toJSON method
 */
function createMockR2Checksums(data?: Partial<R2Checksums>): R2Checksums {
  return {
    md5: data?.md5,
    sha1: data?.sha1,
    sha256: data?.sha256,
    sha384: data?.sha384,
    sha512: data?.sha512,
    toJSON: () => ({
      md5: data?.md5 ? btoa(String.fromCharCode(...new Uint8Array(data.md5))) : undefined,
      sha1: data?.sha1 ? btoa(String.fromCharCode(...new Uint8Array(data.sha1))) : undefined,
      sha256: data?.sha256 ? btoa(String.fromCharCode(...new Uint8Array(data.sha256))) : undefined,
      sha384: data?.sha384 ? btoa(String.fromCharCode(...new Uint8Array(data.sha384))) : undefined,
      sha512: data?.sha512 ? btoa(String.fromCharCode(...new Uint8Array(data.sha512))) : undefined,
    }),
  };
}

export function createMockR2Object(data?: Partial<MockR2Object>): MockR2Object {
  return {
    key: data?.key ?? 'test-key',
    version: data?.version ?? 'v1',
    size: data?.size ?? 1024,
    etag: data?.etag ?? 'abc123',
    httpEtag: data?.httpEtag ?? '"abc123"',
    checksums: data?.checksums ?? createMockR2Checksums(),
    uploaded: data?.uploaded ?? new Date(),
    httpMetadata: data?.httpMetadata,
    customMetadata: data?.customMetadata,
    storageClass: data?.storageClass ?? 'STANDARD',
    writeHttpMetadata: data?.writeHttpMetadata ?? ((_headers: Headers) => {}),
  };
}

/**
 * Creates a mock R2ObjectBody for testing get operations
 * ✅ TYPE-SAFE: Returns properly typed R2ObjectBody
 *
 * @param data - Partial R2ObjectBody data
 * @param content - Content to return from arrayBuffer/text/json methods
 * @returns MockR2ObjectBody compatible with R2Bucket.get() return type
 */
export function createMockR2ObjectBody(
  data?: Partial<MockR2ObjectBody>,
  content: ArrayBuffer | string = new ArrayBuffer(0),
): MockR2ObjectBody {
  const arrayBufferContent = typeof content === 'string'
    ? new TextEncoder().encode(content).buffer
    : content;

  return {
    ...createMockR2Object(data),
    body: data?.body ?? new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(arrayBufferContent));
        controller.close();
      },
    }),
    bodyUsed: data?.bodyUsed ?? false,
    arrayBuffer: data?.arrayBuffer ?? (() => Promise.resolve(arrayBufferContent)),
    bytes: data?.bytes ?? (() => Promise.resolve(new Uint8Array(arrayBufferContent))),
    text: data?.text ?? (() => Promise.resolve(
      typeof content === 'string' ? content : new TextDecoder().decode(arrayBufferContent),
    )),
    json: data?.json ?? (<T>() => Promise.resolve(
      JSON.parse(typeof content === 'string' ? content : new TextDecoder().decode(arrayBufferContent)) as T,
    )),
    blob: data?.blob ?? (() => Promise.resolve(new Blob([arrayBufferContent]))),
  };
}

/**
 * Partial R2Bucket implementation for mocking
 * Only includes methods commonly used in tests
 */
export type PartialR2Bucket = {
  head?: (key: string) => Promise<R2Object | null>;
  get?: {
    (key: string, options: R2GetOptions & { onlyIf: R2Conditional | Headers }): Promise<R2ObjectBody | R2Object | null>;
    (key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>;
  };
  put?: {
    (key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob, options?: R2PutOptions & { onlyIf: R2Conditional | Headers }): Promise<R2Object | null>;
    (key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob, options?: R2PutOptions): Promise<R2Object>;
  };
  delete?: (keys: string | string[]) => Promise<void>;
  list?: (options?: R2ListOptions) => Promise<R2Objects>;
  createMultipartUpload?: (key: string, options?: R2MultipartOptions) => Promise<R2MultipartUpload>;
  resumeMultipartUpload?: (key: string, uploadId: string) => R2MultipartUpload;
};

/**
 * Creates a mock R2Bucket for testing storage operations
 * ✅ TYPE-SAFE: Returns type-compatible R2Bucket mock
 * ✅ PATTERN: Use this instead of `{} as unknown as R2Bucket`
 *
 * @param methods - Partial implementation of R2Bucket methods
 * @returns R2Bucket-compatible mock object
 *
 * @example
 * ```ts
 * const mockBucket = createMockR2Bucket({
 *   get: vi.fn().mockResolvedValue(createMockR2ObjectBody({}, 'content')),
 *   put: vi.fn().mockResolvedValue(createMockR2Object()),
 * });
 * ```
 */
export function createMockR2Bucket(methods?: PartialR2Bucket): R2Bucket {
  const defaultMethods: PartialR2Bucket = {
    head: () => Promise.resolve(null),
    get: () => Promise.resolve(null),
    put: () => Promise.resolve(createMockR2Object()),
    delete: () => Promise.resolve(),
    list: () => Promise.resolve({ objects: [], truncated: false, delimitedPrefixes: [] }),
    createMultipartUpload: () => Promise.resolve({
      key: 'test-key',
      uploadId: 'test-upload-id',
      uploadPart: () => Promise.resolve({ partNumber: 1, etag: 'part-etag' }),
      abort: () => Promise.resolve(),
      complete: () => Promise.resolve(createMockR2Object()),
    }),
    resumeMultipartUpload: () => ({
      key: 'test-key',
      uploadId: 'test-upload-id',
      uploadPart: () => Promise.resolve({ partNumber: 1, etag: 'part-etag' }),
      abort: () => Promise.resolve(),
      complete: () => Promise.resolve(createMockR2Object()),
    }),
  };

  // Merge provided methods with defaults
  const mergedMethods = { ...defaultMethods, ...methods };

  // Cast to R2Bucket - the partial methods satisfy the abstract class interface
  // when used in tests (we only call the methods we've mocked)
  return mergedMethods as unknown as R2Bucket;
}
