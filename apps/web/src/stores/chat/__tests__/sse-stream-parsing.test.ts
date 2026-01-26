/**
 * SSE Stream Parsing and Event Handling Tests
 *
 * Tests for parsing Server-Sent Events (SSE) streams from the chat API
 * as documented in FLOW_DOCUMENTATION.md:
 *
 * Event Types:
 * - start: Message metadata, participant info
 * - text-delta: Streaming text content
 * - finish: Completion reason, token usage
 * - done: Stream completed
 * - error: Stream error
 *
 * Pre-Search Events:
 * - status: Pre-search status changes
 * - query-generated: Search query with rationale
 * - search-result: Individual search results
 * - summary: Search summary
 *
 * Council Moderator Events:
 * - status: Council Moderator status changes
 * - key-insight: Council Moderator key insights
 * - participant-summary: Per-participant summary
 * - verdict: Final verdict
 *
 * Key Validations:
 * - Correct event parsing
 * - State updates from events
 * - Error handling
 * - Stream completion detection
 */

import { FinishReasons, MessageRoles, MessageStatuses } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import type { DbAssistantMessageMetadata } from '@/services/api';

// ============================================================================
// TEST HELPERS
// ============================================================================

type SSEEventData = {
  messageMetadata?: DbAssistantMessageMetadata;
  delta?: string;
  finishReason?: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  status?: string;
  query?: string;
  rationale?: string;
  searchDepth?: string;
  index?: number;
  total?: number;
  answer?: string;
  results?: { title: string; url: string; content: string; score: number }[];
  responseTime?: number;
  summary?: string;
  insight?: string;
  participantId?: string;
  participantIndex?: number;
  strengths?: string[];
  areasForImprovement?: string[];
  score?: number;
  verdict?: string;
  recommendations?: string[];
  message?: string;
  code?: string;
};

type ParsedSSEEvent = {
  event: string;
  data: SSEEventData;
};

/**
 * Parses SSE event string into structured object
 */
function parseSSEEvent(eventString: string): ParsedSSEEvent | null {
  const lines = eventString.trim().split('\n');
  let event = '';
  let data = '';

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      event = line.slice(7);
    } else if (line.startsWith('data: ')) {
      data = line.slice(6);
    }
  }

  if (!event || !data) {
    return null;
  }

  try {
    return {
      data: JSON.parse(data) as SSEEventData,
      event,
    };
  } catch {
    return null;
  }
}

/**
 * Creates an SSE event string from structured data
 */
function createSSEEventString(event: string, data: SSEEventData): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Simulates reading SSE stream and collecting events
 */
function collectSSEEvents(eventStrings: string[]): ParsedSSEEvent[] {
  return eventStrings
    .map(parseSSEEvent)
    .filter((e): e is ParsedSSEEvent => e !== null);
}

// ============================================================================
// PARTICIPANT MESSAGE SSE EVENTS
// ============================================================================

describe('participant Message SSE Events', () => {
  describe('start Event', () => {
    it('parses start event with message metadata', () => {
      const eventString = createSSEEventString('start', {
        messageMetadata: {
          model: 'gpt-4',
          participantId: 'participant-0',
          participantIndex: 0,
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
        },
      });

      const parsed = parseSSEEvent(eventString);

      expect(parsed?.event).toBe('start');
      expect(parsed?.data.messageMetadata).toBeDefined();
      expect((parsed?.data.messageMetadata as DbAssistantMessageMetadata).roundNumber).toBe(0);
    });

    it('extracts participant info from start event', () => {
      const startData = {
        messageMetadata: {
          model: 'claude-3-opus',
          participantId: 'participant-2',
          participantIndex: 2,
          role: MessageRoles.ASSISTANT,
          roundNumber: 1,
        },
      };

      const metadata = startData.messageMetadata;

      expect(metadata.participantIndex).toBe(2);
      expect(metadata.participantId).toBe('participant-2');
      expect(metadata.model).toBe('claude-3-opus');
    });
  });

  describe('text-delta Event', () => {
    it('parses text-delta event with content', () => {
      const eventString = createSSEEventString('text-delta', {
        delta: 'Hello ',
      });

      const parsed = parseSSEEvent(eventString);

      expect(parsed?.event).toBe('text-delta');
      expect(parsed?.data.delta).toBe('Hello ');
    });

    it('accumulates multiple text-delta events', () => {
      const deltas = ['Hello ', 'world', '!', ' How ', 'are ', 'you?'];
      let accumulated = '';

      deltas.forEach((delta) => {
        accumulated += delta;
      });

      expect(accumulated).toBe('Hello world! How are you?');
    });

    it('handles special characters in text-delta', () => {
      const eventString = createSSEEventString('text-delta', {
        delta: 'Here\'s some "quoted" text & <special> chars',
      });

      const parsed = parseSSEEvent(eventString);

      expect(parsed?.data.delta).toBe('Here\'s some "quoted" text & <special> chars');
    });

    it('handles unicode in text-delta', () => {
      const eventString = createSSEEventString('text-delta', {
        delta: 'Hello 世界 🌍 émoji',
      });

      const parsed = parseSSEEvent(eventString);

      expect(parsed?.data.delta).toBe('Hello 世界 🌍 émoji');
    });
  });

  describe('finish Event', () => {
    it('parses finish event with stop reason', () => {
      const eventString = createSSEEventString('finish', {
        finishReason: 'stop',
        usage: {
          completionTokens: 50,
          promptTokens: 100,
          totalTokens: 150,
        },
      });

      const parsed = parseSSEEvent(eventString);

      expect(parsed?.event).toBe('finish');
      expect(parsed?.data.finishReason).toBe('stop');
    });

    it('parses token usage from finish event', () => {
      const finishData = {
        finishReason: 'stop',
        usage: {
          completionTokens: 75,
          promptTokens: 150,
          totalTokens: 225,
        },
      };

      const usage = finishData.usage;

      expect(usage.promptTokens).toBe(150);
      expect(usage.completionTokens).toBe(75);
      expect(usage.totalTokens).toBe(225);
    });

    it('handles length finish reason', () => {
      const eventString = createSSEEventString('finish', {
        finishReason: 'length',
        usage: { completionTokens: 4096, promptTokens: 100, totalTokens: 4196 },
      });

      const parsed = parseSSEEvent(eventString);

      expect(parsed?.data.finishReason).toBe('length');
    });
  });

  describe('done Event', () => {
    it('parses done event signaling stream completion', () => {
      const eventString = createSSEEventString('done', {});

      const parsed = parseSSEEvent(eventString);

      expect(parsed?.event).toBe('done');
    });
  });

  describe('error Event', () => {
    it('parses error event with message', () => {
      const eventString = createSSEEventString('error', {
        code: 'rate_limit_error',
        message: 'Rate limit exceeded',
      });

      const parsed = parseSSEEvent(eventString);

      expect(parsed?.event).toBe('error');
      expect(parsed?.data.message).toBe('Rate limit exceeded');
      expect(parsed?.data.code).toBe('rate_limit_error');
    });
  });
});

// ============================================================================
// PRE-SEARCH SSE EVENTS
// ============================================================================

describe('pre-Search SSE Events', () => {
  describe('status Event', () => {
    it('parses status change to streaming', () => {
      const eventString = createSSEEventString('status', {
        status: MessageStatuses.STREAMING,
      });

      const parsed = parseSSEEvent(eventString);

      expect(parsed?.event).toBe('status');
      expect(parsed?.data.status).toBe(MessageStatuses.STREAMING);
    });

    it('parses status change to complete', () => {
      const eventString = createSSEEventString('status', {
        status: MessageStatuses.COMPLETE,
      });

      const parsed = parseSSEEvent(eventString);

      expect(parsed?.data.status).toBe(MessageStatuses.COMPLETE);
    });
  });

  describe('query-generated Event', () => {
    it('parses generated search query', () => {
      const eventString = createSSEEventString('query-generated', {
        index: 0,
        query: 'latest React 19 features 2024',
        rationale: 'User asked about React updates',
        searchDepth: 'basic',
        total: 2,
      });

      const parsed = parseSSEEvent(eventString);

      expect(parsed?.event).toBe('query-generated');
      expect(parsed?.data.query).toBe('latest React 19 features 2024');
      expect(parsed?.data.rationale).toBe('User asked about React updates');
      expect(parsed?.data.searchDepth).toBe('basic');
    });

    it('tracks query progress with index/total', () => {
      const queryData = {
        index: 1,
        query: 'query 2',
        rationale: 'reason',
        searchDepth: 'advanced',
        total: 3,
      };

      expect(queryData.index).toBe(1);
      expect(queryData.total).toBe(3);
      // Progress: (1 + 1) / 3 = 66%
      const progress = ((queryData.index + 1) / queryData.total) * 100;
      expect(progress).toBeCloseTo(66.67, 1);
    });
  });

  describe('search-result Event', () => {
    it('parses search result with answer', () => {
      const eventString = createSSEEventString('search-result', {
        answer: 'React 19 introduces several new features including...',
        query: 'React 19 features',
        responseTime: 1234,
        results: [
          {
            content: 'Full release notes content...',
            score: 0.95,
            title: 'React 19 Release Notes',
            url: 'https://react.dev/blog/react-19',
          },
        ],
      });

      const parsed = parseSSEEvent(eventString);

      expect(parsed?.event).toBe('search-result');
      expect(parsed?.data.query).toBe('React 19 features');
      expect(parsed?.data.answer).toBeDefined();
      expect(parsed?.data.responseTime).toBe(1234);
    });

    it('parses multiple search results', () => {
      const resultData = {
        answer: 'summary',
        query: 'test',
        responseTime: 1000,
        results: [
          { content: 'Content 1', score: 0.9, title: 'Result 1', url: 'https://example.com/1' },
          { content: 'Content 2', score: 0.85, title: 'Result 2', url: 'https://example.com/2' },
          { content: 'Content 3', score: 0.8, title: 'Result 3', url: 'https://example.com/3' },
        ],
      };

      expect(resultData.results).toHaveLength(3);
      const firstResult = resultData.results[0];
      if (!firstResult) {
        throw new Error('Expected first result');
      }
      expect(firstResult.score).toBe(0.9);
    });
  });

  describe('summary Event', () => {
    it('parses pre-search summary', () => {
      const eventString = createSSEEventString('summary', {
        summary: 'Based on the search results, the key findings are...',
      });

      const parsed = parseSSEEvent(eventString);

      expect(parsed?.event).toBe('summary');
      expect(parsed?.data.summary).toContain('key findings');
    });
  });
});

// ============================================================================
// COUNCIL MODERATOR SSE EVENTS
// ============================================================================

describe('council Moderator SSE Events', () => {
  describe('key-insight Event', () => {
    it('parses key insight', () => {
      const eventString = createSSEEventString('key-insight', {
        insight: 'All participants agreed on the core architecture approach.',
      });

      const parsed = parseSSEEvent(eventString);

      expect(parsed?.event).toBe('key-insight');
      expect(parsed?.data.insight).toContain('core architecture approach');
    });

    it('accumulates multiple key insights', () => {
      const insights: string[] = [];

      const events = [
        { data: { insight: 'Insight 1: Performance is critical' }, event: 'key-insight' },
        { data: { insight: 'Insight 2: Scalability concerns' }, event: 'key-insight' },
        { data: { insight: 'Insight 3: Security first' }, event: 'key-insight' },
      ];

      events.forEach((e) => {
        if (e.event === 'key-insight') {
          insights.push(e.data.insight);
        }
      });

      expect(insights).toHaveLength(3);
    });
  });

  describe('participant-summary Event', () => {
    it('parses per-participant summary', () => {
      const eventString = createSSEEventString('participant-summary', {
        areasForImprovement: ['Could be more concise'],
        participantId: 'participant-0',
        participantIndex: 0,
        score: 8.5,
        strengths: ['Clear communication', 'Good examples'],
        summary: 'This participant provided a comprehensive summary...',
      });

      const parsed = parseSSEEvent(eventString);

      expect(parsed?.event).toBe('participant-summary');
      expect(parsed?.data.participantId).toBe('participant-0');
      expect(parsed?.data.score).toBe(8.5);
    });

    it('collects all participant summaries', () => {
      const participantSummaries: { participantId: string; score: number }[] = [];

      const events = [
        { participantId: 'p0', score: 8.0 },
        { participantId: 'p1', score: 7.5 },
        { participantId: 'p2', score: 9.0 },
      ];

      events.forEach((e) => {
        participantSummaries.push(e);
      });

      // Calculate rankings
      const ranked = participantSummaries.sort((a, b) => b.score - a.score);

      expect(ranked[0]?.participantId).toBe('p2');
      expect(ranked[0]?.score).toBe(9.0);
    });
  });

  describe('verdict Event', () => {
    it('parses final verdict', () => {
      const eventString = createSSEEventString('verdict', {
        verdict: 'After analyzing all responses, the consensus is...',
      });

      const parsed = parseSSEEvent(eventString);

      expect(parsed?.event).toBe('verdict');
      expect(parsed?.data.verdict).toContain('consensus');
    });
  });

  describe('recommendations Event', () => {
    it('parses recommendations', () => {
      const eventString = createSSEEventString('recommendations', {
        recommendations: [
          'Consider implementing caching',
          'Review security implications',
          'Add comprehensive testing',
        ],
      });

      const parsed = parseSSEEvent(eventString);

      expect(parsed?.event).toBe('recommendations');
      expect(parsed?.data.recommendations).toHaveLength(3);
    });
  });
});

// ============================================================================
// COMPLETE STREAM SEQUENCE TESTS
// ============================================================================

describe('complete Stream Sequences', () => {
  describe('participant Message Stream', () => {
    it('processes complete participant stream sequence', () => {
      const events = [
        createSSEEventString('start', {
          messageMetadata: {
            model: 'gpt-4',
            participantId: 'p0',
            participantIndex: 0,
            role: MessageRoles.ASSISTANT,
            roundNumber: 0,
          },
        }),
        createSSEEventString('text-delta', { delta: 'Hello ' }),
        createSSEEventString('text-delta', { delta: 'world!' }),
        createSSEEventString('finish', {
          finishReason: 'stop',
          usage: { completionTokens: 5, promptTokens: 100, totalTokens: 105 },
        }),
        createSSEEventString('done', {}),
      ];

      const parsed = collectSSEEvents(events);

      expect(parsed).toHaveLength(5);
      expect(parsed[0]?.event).toBe('start');
      expect(parsed[1]?.event).toBe('text-delta');
      expect(parsed[2]?.event).toBe('text-delta');
      expect(parsed[3]?.event).toBe('finish');
      expect(parsed[4]?.event).toBe('done');

      // Accumulate content
      const content = parsed
        .filter(e => e.event === 'text-delta')
        .map(e => e.data.delta as string)
        .join('');

      expect(content).toBe('Hello world!');
    });
  });

  describe('pre-Search Stream', () => {
    it('processes complete pre-search stream sequence', () => {
      const events = [
        createSSEEventString('status', { status: MessageStatuses.STREAMING }),
        createSSEEventString('query-generated', {
          index: 0,
          query: 'query 1',
          rationale: 'reason',
          searchDepth: 'basic',
          total: 2,
        }),
        createSSEEventString('query-generated', {
          index: 1,
          query: 'query 2',
          rationale: 'reason',
          searchDepth: 'advanced',
          total: 2,
        }),
        createSSEEventString('search-result', {
          answer: 'answer 1',
          query: 'query 1',
          responseTime: 1000,
          results: [],
        }),
        createSSEEventString('search-result', {
          answer: 'answer 2',
          query: 'query 2',
          responseTime: 1200,
          results: [],
        }),
        createSSEEventString('summary', { summary: 'Summary content' }),
        createSSEEventString('done', { status: MessageStatuses.COMPLETE }),
      ];

      const parsed = collectSSEEvents(events);

      expect(parsed).toHaveLength(7);

      const queries = parsed.filter(e => e.event === 'query-generated');
      expect(queries).toHaveLength(2);

      const results = parsed.filter(e => e.event === 'search-result');
      expect(results).toHaveLength(2);

      const done = parsed.find(e => e.event === 'done');
      expect(done?.data.status).toBe(MessageStatuses.COMPLETE);
    });
  });

  describe('summary Stream', () => {
    it('processes complete summary stream sequence', () => {
      const events = [
        createSSEEventString('status', { status: MessageStatuses.STREAMING }),
        createSSEEventString('key-insight', { insight: 'Insight 1' }),
        createSSEEventString('key-insight', { insight: 'Insight 2' }),
        createSSEEventString('participant-summary', { participantId: 'p0', score: 8.0, summary: 'P0 summary' }),
        createSSEEventString('participant-summary', { participantId: 'p1', score: 8.5, summary: 'P1 summary' }),
        createSSEEventString('verdict', { verdict: 'Final verdict' }),
        createSSEEventString('recommendations', { recommendations: ['Rec 1', 'Rec 2'] }),
        createSSEEventString('done', { status: MessageStatuses.COMPLETE }),
      ];

      const parsed = collectSSEEvents(events);

      expect(parsed).toHaveLength(8);

      const insights = parsed.filter(e => e.event === 'key-insight');
      expect(insights).toHaveLength(2);

      const participantSummaries = parsed.filter(e => e.event === 'participant-summary');
      expect(participantSummaries).toHaveLength(2);
    });
  });
});

// ============================================================================
// ERROR HANDLING TESTS
// ============================================================================

describe('sSE Error Handling', () => {
  describe('malformed Events', () => {
    it('handles missing event field', () => {
      const malformed = 'data: {"message": "test"}\n\n';
      const parsed = parseSSEEvent(malformed);

      expect(parsed).toBeNull();
    });

    it('handles missing data field', () => {
      const malformed = 'event: text-delta\n\n';
      const parsed = parseSSEEvent(malformed);

      expect(parsed).toBeNull();
    });

    it('handles invalid JSON in data', () => {
      const malformed = 'event: text-delta\ndata: {invalid json}\n\n';
      const parsed = parseSSEEvent(malformed);

      expect(parsed).toBeNull();
    });
  });

  describe('stream Interruption', () => {
    it('handles stream ending without done event', () => {
      const events = [
        createSSEEventString('start', { messageMetadata: { role: MessageRoles.ASSISTANT } }),
        createSSEEventString('text-delta', { delta: 'Partial content...' }),
        // No finish or done event
      ];

      const parsed = collectSSEEvents(events);

      expect(parsed).toHaveLength(2);

      // Should detect incomplete stream
      const hasDone = parsed.some(e => e.event === 'done');
      expect(hasDone).toBeFalsy();
    });

    it('handles error event mid-stream', () => {
      const events = [
        createSSEEventString('start', { messageMetadata: { role: MessageRoles.ASSISTANT } }),
        createSSEEventString('text-delta', { delta: 'Partial...' }),
        createSSEEventString('error', { code: 'timeout', message: 'Connection timeout' }),
      ];

      const parsed = collectSSEEvents(events);

      const errorEvent = parsed.find(e => e.event === 'error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent?.data.message).toBe('Connection timeout');
    });
  });
});

// ============================================================================
// STATE UPDATES FROM EVENTS
// ============================================================================

describe('state Updates from SSE Events', () => {
  describe('message Building', () => {
    it('builds message from stream events', () => {
      const message = {
        content: '',
        id: '',
        metadata: null as DbAssistantMessageMetadata | null,
        role: MessageRoles.ASSISTANT as const,
      };

      // Process start event
      const startData = {
        messageMetadata: {
          finishReason: FinishReasons.UNKNOWN,
          hasError: false,
          isPartialResponse: true,
          isTransient: true,
          model: 'gpt-4',
          participantId: 'p0',
          participantIndex: 0,
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          usage: { completionTokens: 0, promptTokens: 0, totalTokens: 0 },
        } as DbAssistantMessageMetadata,
      };
      message.metadata = startData.messageMetadata;

      // Process text-delta events
      const deltas = ['Hello ', 'world', '!'];
      deltas.forEach((d) => {
        message.content += d;
      });

      // Process finish event
      const finishData = {
        finishReason: 'stop',
        usage: { completionTokens: 5, promptTokens: 100, totalTokens: 105 },
      };
      message.metadata.finishReason = finishData.finishReason as DbAssistantMessageMetadata['finishReason'];
      message.metadata.usage = finishData.usage;
      message.metadata.isTransient = false;
      message.metadata.isPartialResponse = false;

      expect(message.content).toBe('Hello world!');
      expect(message.metadata.finishReason).toBe('stop');
      expect(message.metadata.usage.totalTokens).toBe(105);
    });
  });

  describe('pre-Search Data Building', () => {
    it('builds search data from stream events', () => {
      const searchData = {
        failureCount: 0,
        queries: [] as { query: string; rationale: string; searchDepth: string; index: number; total: number }[],
        results: [] as { query: string; answer: string; results: unknown[]; responseTime: number }[],
        successCount: 0,
        summary: '',
        totalResults: 0,
        totalTime: 0,
      };

      // Process query-generated events
      const query1 = { index: 0, query: 'q1', rationale: 'r1', searchDepth: 'basic', total: 2 };
      const query2 = { index: 1, query: 'q2', rationale: 'r2', searchDepth: 'advanced', total: 2 };
      searchData.queries.push(query1, query2);

      // Process search-result events
      const result1 = { answer: 'a1', query: 'q1', responseTime: 1000, results: [{}, {}, {}] };
      const result2 = { answer: 'a2', query: 'q2', responseTime: 1200, results: [{}, {}] };
      searchData.results.push(result1, result2);
      searchData.successCount = 2;
      searchData.totalResults = 5;
      searchData.totalTime = 2200;

      // Process summary event
      searchData.summary = 'Search summary';

      expect(searchData.queries).toHaveLength(2);
      expect(searchData.results).toHaveLength(2);
      expect(searchData.successCount).toBe(2);
      expect(searchData.totalResults).toBe(5);
    });
  });

  describe('summary Data Building', () => {
    it('builds summary data from stream events', () => {
      const summaryData = {
        keyInsights: [] as string[],
        participantSummaries: [] as { participantId: string; score: number; summary: string }[],
        recommendations: [] as string[],
        verdict: '',
      };

      // Process key-insight events
      summaryData.keyInsights.push('Insight 1', 'Insight 2');

      // Process participant-summary events
      summaryData.participantSummaries.push(
        { participantId: 'p0', score: 8.0, summary: 'P0 summary' },
        { participantId: 'p1', score: 8.5, summary: 'P1 summary' },
      );

      // Process verdict event
      summaryData.verdict = 'Final verdict';

      // Process recommendations event
      summaryData.recommendations = ['Rec 1', 'Rec 2'];

      expect(summaryData.keyInsights).toHaveLength(2);
      expect(summaryData.participantSummaries).toHaveLength(2);
      expect(summaryData.verdict).toBe('Final verdict');
      expect(summaryData.recommendations).toHaveLength(2);
    });
  });
});

// ============================================================================
// STREAM TIMING TESTS
// ============================================================================

describe('stream Timing', () => {
  describe('first Token Latency', () => {
    it('tracks time to first text-delta', () => {
      const startTime = Date.now();
      let firstTokenTime: number | null = null;

      const events = ['start', 'text-delta', 'text-delta', 'finish', 'done'];

      events.forEach((event) => {
        if (event === 'text-delta' && firstTokenTime === null) {
          firstTokenTime = Date.now() - startTime;
        }
      });

      // First token detected
      expect(firstTokenTime).not.toBeNull();
    });
  });

  describe('stream Duration', () => {
    it('tracks total stream duration', () => {
      const startTime = Date.now();
      let endTime: number | null = null;

      const events = ['start', 'text-delta', 'finish', 'done'];

      events.forEach((event) => {
        if (event === 'done') {
          endTime = Date.now();
        }
      });

      if (endTime === null) {
        throw new Error('Expected endTime to be set');
      }
      const duration = endTime - startTime;
      expect(duration).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('edge Cases', () => {
  describe('empty Content', () => {
    it('handles empty text-delta', () => {
      const eventString = createSSEEventString('text-delta', { delta: '' });
      const parsed = parseSSEEvent(eventString);

      expect(parsed?.data.delta).toBe('');
    });
  });

  describe('large Content', () => {
    it('handles large text in single delta', () => {
      const largeText = 'x'.repeat(10000);
      const eventString = createSSEEventString('text-delta', { delta: largeText });
      const parsed = parseSSEEvent(eventString);

      expect((parsed?.data.delta as string)).toHaveLength(10000);
    });
  });

  describe('rapid Events', () => {
    it('handles many rapid text-delta events', () => {
      const events = Array.from({ length: 100 }, (_, i) =>
        createSSEEventString('text-delta', { delta: `word${i} ` }));

      const parsed = collectSSEEvents(events);

      expect(parsed).toHaveLength(100);

      const content = parsed.map(e => e.data.delta as string).join('');
      expect(content).toContain('word0 ');
      expect(content).toContain('word99 ');
    });
  });
});
