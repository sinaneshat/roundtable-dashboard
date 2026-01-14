import { MessageRoles } from '@/api/core/enums';

/**
 * Typed Test Mock Factories
 *
 * Reusable typed mock patterns to replace inline unknown/any types in tests.
 */

/**
 * API Call Tracker
 * REPLACES: `calls: Array<{ endpoint: string; method: string; timestamp: number; params?: unknown }>`
 */
export type ApiCallParams = {
  threadId?: string;
  roundNumber?: number;
  participantIndex?: number;
  status?: string;
  limit?: number;
  offset?: number;
};

export type ApiCallRecord = {
  endpoint: string;
  method: string;
  timestamp: number;
  params?: ApiCallParams;
};

export type ApiCallTracker = {
  calls: ApiCallRecord[];
  getCallsByEndpoint: (endpoint: string) => ApiCallRecord[];
  getCallCount: (endpoint: string) => number;
  getTotalCalls: () => number;
  clear: () => void;
};

export function createApiCallTracker(): ApiCallTracker {
  const calls: ApiCallRecord[] = [];

  return {
    calls,
    getCallsByEndpoint: endpoint => calls.filter(c => c.endpoint.includes(endpoint)),
    getCallCount: endpoint => calls.filter(c => c.endpoint.includes(endpoint)).length,
    getTotalCalls: () => calls.length,
    clear: () => {
      calls.length = 0;
    },
  };
}

export function trackApiCall(
  tracker: ApiCallTracker,
  endpoint: string,
  method: string,
  params?: ApiCallParams,
): void {
  tracker.calls.push({ endpoint, method, timestamp: Date.now(), params });
}

/**
 * Call Record Tracker (for rapid duplicate call detection)
 * REPLACES: `type CallRecord = { type: string; timestamp: number; tick: number; args?: unknown }`
 */
export type CallRecordArgs = {
  roundNumber?: number;
  participantIndex?: number;
  messageId?: string;
  status?: string;
};

export type TypedCallRecord = {
  type: string;
  timestamp: number;
  tick: number;
  args?: CallRecordArgs;
};

export type CallTracker = {
  calls: TypedCallRecord[];
  currentTick: number;
  recordCall: (type: string, args?: CallRecordArgs) => void;
  advanceTick: () => void;
  getCallsInTick: (tick: number) => TypedCallRecord[];
  getDuplicatesInTick: (tick: number) => Map<string, TypedCallRecord[]>;
  clear: () => void;
};

export function createCallTracker(): CallTracker {
  const calls: TypedCallRecord[] = [];
  let currentTick = 0;

  return {
    calls,
    currentTick,
    recordCall: (type: string, args?: CallRecordArgs) => {
      calls.push({
        type,
        timestamp: Date.now(),
        tick: currentTick,
        args,
      });
    },
    advanceTick: () => {
      currentTick++;
    },
    getCallsInTick: (tick: number) => {
      return calls.filter(c => c.tick === tick);
    },
    getDuplicatesInTick: (tick: number) => {
      const tickCalls = calls.filter(c => c.tick === tick);
      const grouped = new Map<string, TypedCallRecord[]>();

      for (const call of tickCalls) {
        const existing = grouped.get(call.type) ?? [];
        existing.push(call);
        grouped.set(call.type, existing);
      }

      const duplicates = new Map<string, TypedCallRecord[]>();
      for (const [type, records] of grouped) {
        if (records.length > 1) {
          duplicates.set(type, records);
        }
      }

      return duplicates;
    },
    clear: () => {
      calls.length = 0;
      currentTick = 0;
    },
  };
}

/**
 * Query Fetch Tracker
 * REPLACES: `recordFetch: (queryKey: unknown[], cacheHit: boolean, staleTime?: number) => void`
 */
export type QueryKeyParam = {
  threadId?: string;
  roundNumber?: number;
  messageId?: string;
};

export type QueryKey = ReadonlyArray<string | number | QueryKeyParam>;

export type QueryFetchRecord = {
  queryKey: QueryKey;
  cacheHit: boolean;
  staleTime?: number;
  timestamp: number;
};

export type QueryFetchTracker = {
  fetches: QueryFetchRecord[];
  recordFetch: (queryKey: QueryKey, cacheHit: boolean, staleTime?: number) => void;
  getFetchCount: () => number;
  getCacheHitRate: () => number;
  clear: () => void;
};

export function createQueryFetchTracker(): QueryFetchTracker {
  const fetches: QueryFetchRecord[] = [];

  return {
    fetches,
    recordFetch(queryKey: QueryKey, cacheHit: boolean, staleTime?: number) {
      fetches.push({
        queryKey,
        cacheHit,
        staleTime,
        timestamp: Date.now(),
      });
    },
    getFetchCount: () => fetches.length,
    getCacheHitRate: () => {
      if (fetches.length === 0)
        return 0;
      const hits = fetches.filter(f => f.cacheHit).length;
      return hits / fetches.length;
    },
    clear: () => {
      fetches.length = 0;
    },
  };
}

/**
 * State Update Tracker
 * REPLACES: `lastState: unknown` and `changes: Array<{ field: string; from: unknown; to: unknown }>`
 */
export type StateFieldValue = string | number | boolean | null;

export type TrackedState = {
  isStreaming?: boolean;
  currentParticipantIndex?: number;
  streamingRoundNumber?: number | null;
  status?: string;
  hasError?: boolean;
};

export type StateChange = {
  field: string;
  from: StateFieldValue;
  to: StateFieldValue;
};

export type StateUpdateTracker = {
  updateCount: number;
  lastState: TrackedState;
  changes: StateChange[];
  trackUpdate: (state: TrackedState) => void;
  getUpdateCount: () => number;
  clear: () => void;
};

export function createStateUpdateTracker(): StateUpdateTracker {
  let updateCount = 0;
  const lastState: TrackedState = {};
  const changes: StateChange[] = [];

  return {
    updateCount,
    lastState,
    changes,
    trackUpdate: (state: TrackedState) => {
      updateCount++;
      for (const [key, value] of Object.entries(state)) {
        const typedKey = key as keyof TrackedState;
        const lastValue = lastState[typedKey];
        if (lastValue !== value) {
          changes.push({
            field: key,
            from: (lastValue ?? null) as StateFieldValue,
            to: (value ?? null) as StateFieldValue,
          });
          lastState[typedKey] = value as never;
        }
      }
    },
    getUpdateCount: () => updateCount,
    clear: () => {
      updateCount = 0;
      Object.keys(lastState).forEach((key) => {
        delete lastState[key as keyof TrackedState];
      });
      changes.length = 0;
    },
  };
}

/**
 * Call Type Tracker (for flow events)
 * REPLACES: `type CallType = string; data?: unknown`
 */
export type FlowCallType
  = | 'handleNewRound'
    | 'advanceParticipant'
    | 'handleCompletion'
    | 'triggerPreSearch'
    | 'triggerModerator';

export type FlowCallData = {
  participantIndex?: number;
  messageId?: string;
  status?: string;
  hasError?: boolean;
};

export type FlowCallRecord = {
  type: FlowCallType;
  roundNumber: number;
  data?: FlowCallData;
  timestamp: number;
};

export function createFlowCallRecord(
  type: FlowCallType,
  roundNumber: number,
  data?: FlowCallData,
): FlowCallRecord {
  return {
    type,
    roundNumber,
    data,
    timestamp: Date.now(),
  };
}

/**
 * Frozen Object Checker
 * REPLACES: `function isFrozen(obj: unknown): boolean`
 */
export function isFrozenObject(obj: unknown): boolean {
  if (obj === null || typeof obj !== 'object') {
    return false;
  }
  return Object.isFrozen(obj);
}

export function hasFrozenProperty(obj: unknown, path = ''): string | null {
  if (obj === null || typeof obj !== 'object') {
    return null;
  }

  if (Object.isFrozen(obj)) {
    return path || 'root';
  }

  for (const [key, value] of Object.entries(obj)) {
    const newPath = path ? `${path}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      const frozenPath = hasFrozenProperty(value, newPath);
      if (frozenPath) {
        return frozenPath;
      }
    }
  }

  return null;
}

/**
 * Mock Error Class
 * REPLACES: `isInstance: (error: unknown) => error instanceof Error`
 */
export function isErrorInstance(error: unknown): error is Error {
  return error instanceof Error;
}

export function createMockError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

/**
 * Mock Streaming Response Factory
 * REPLACES: `as unknown as Response` for streaming responses
 *
 * NOTE: These mocks use minimal type assertions for test Response objects.
 * Production code should use proper Response objects from fetch API.
 */
export type MockReadableStreamReader = {
  read: () => Promise<ReadableStreamReadResult<Uint8Array>>;
  releaseLock: () => void;
  closed: Promise<void>;
  cancel: () => Promise<void>;
};

export type MockReadableStreamBody = {
  getReader: () => MockReadableStreamReader;
};

export type MockStreamingResponseInit = {
  chunks: string[];
  contentType?: string;
  status?: number;
};

export function createMockStreamingResponse(init: MockStreamingResponseInit): Response {
  const { chunks, contentType = 'text/event-stream', status = 200 } = init;

  let chunkIndex = 0;

  const reader: MockReadableStreamReader = {
    read: async () => {
      if (chunkIndex >= chunks.length) {
        return { done: true, value: undefined };
      }

      const chunk = chunks[chunkIndex];
      chunkIndex++;

      return {
        done: false,
        value: new TextEncoder().encode(chunk),
      };
    },
    releaseLock: () => {},
    closed: Promise.resolve(),
    cancel: async () => {},
  };

  const body: MockReadableStreamBody = {
    getReader: () => reader,
  };

  const responseInit: ResponseInit = {
    status,
    headers: new Headers({
      'content-type': contentType,
    }),
  };

  return new Response(body as ReadableStream<Uint8Array>, responseInit);
}

/**
 * Mock JSON Response Factory
 * REPLACES: Direct JSON response mocking
 */
export function createMockJsonResponse<T>(data: T, status = 200): Response {
  const responseInit: ResponseInit = {
    status,
    headers: new Headers({
      'content-type': 'application/json',
    }),
  };

  return new Response(JSON.stringify(data), responseInit);
}

/**
 * Invalid UIMessage Metadata Factory
 * REPLACES: `metadata: null as unknown as Record<string, unknown>`
 *
 * Use this when testing edge cases where metadata might be malformed.
 * For normal test cases, use createTestUserMessage/createTestAssistantMessage helpers.
 *
 * NOTE: This intentionally returns `unknown` because it's used to test error handling
 * for invalid/malformed metadata. Tests should use type guards to narrow the type safely.
 */
export type InvalidMetadataType = 'null' | 'undefined' | 'empty' | 'missing-round';

type InvalidMetadataObject = {
  role?: string;
};

export function createInvalidMetadata(type: InvalidMetadataType): unknown {
  const variants: Record<InvalidMetadataType, unknown> = {
    'null': null,
    'undefined': undefined,
    'empty': {},
    'missing-round': { role: MessageRoles.USER } satisfies InvalidMetadataObject,
  };

  return variants[type];
}
