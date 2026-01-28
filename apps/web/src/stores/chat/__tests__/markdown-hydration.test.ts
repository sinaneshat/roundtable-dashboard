/**
 * Markdown Hydration Tests
 *
 * Tests for markdown formatting consistency to catch:
 * 1. Markdown rendering identical on SSR and client
 * 2. No flash of raw markdown before formatted
 * 3. Code blocks handling across hydration
 * 4. Inline formatting consistency
 * 5. Whitespace preservation
 * 6. Streaming markdown without re-parse flicker
 *
 * NOTE: These tests focus on the store-level content handling.
 * Actual markdown rendering is handled by components (Markdown/LazyStreamdown),
 * but the store must preserve content exactly for consistent rendering.
 *
 * @see /Users/avabagherzadeh/Desktop/projects/deadpixel/billing-dashboard/docs/FLOW_DOCUMENTATION.md
 */

import { MessagePartTypes } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockParticipants,
  createMockThread,
  createTestAssistantMessage,
  createTestUserMessage,
} from '@/lib/testing';
import { createChatStore } from '@/stores/chat';

// ============================================================================
// Test Assertions
// ============================================================================

/**
 * Asserts that a value is defined (not undefined or null).
 * After calling this, TypeScript knows the value is of type T.
 */
function assertDefined<T>(value: T | undefined | null, msg?: string): asserts value is T {
  if (value === undefined || value === null) {
    throw new Error(msg ?? 'Expected value to be defined');
  }
}

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Get text content from a message
 */
function getMessageText(message: UIMessage): string {
  const firstPart = message.parts?.[0];
  if (firstPart && 'text' in firstPart && typeof firstPart.text === 'string') {
    return firstPart.text;
  }
  return '';
}

/**
 * Simulate SSR hydration
 */
function hydrateFromSSR(
  store: ReturnType<typeof createChatStore>,
  thread: ReturnType<typeof createMockThread>,
  participants: ReturnType<typeof createMockParticipants>,
  messages: UIMessage[],
) {
  store.getState().initializeThread(thread, participants, messages);
  store.getState().setHasInitiallyLoaded(true);
  store.getState().setShowInitialUI(false);
}

/**
 * Sample markdown content for testing
 */
const MARKDOWN_SAMPLES = {
  codeBlock: `Here's some code:

\`\`\`typescript
function hello(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

That's the code.`,

  complex: `# Heading 1

## Heading 2

Here's a paragraph with **bold**, *italic*, and \`inline code\`.

- List item 1
- List item 2
  - Nested item

> Blockquote text here

| Column 1 | Column 2 |
|----------|----------|
| Data 1   | Data 2   |

---

[Link text](https://example.com)`,

  inlineFormatting: 'Text with **bold**, *italic*, ~~strikethrough~~, and `code`.',

  multipleCodeBlocks: `First block:
\`\`\`javascript
console.log('first');
\`\`\`

Second block:
\`\`\`python
print('second')
\`\`\``,

  nestedStructures: `
- Item 1
  - Nested 1.1
    - Deep nested 1.1.1
  - Nested 1.2
- Item 2
  1. Ordered nested
  2. Another ordered
`,

  simple: '# Hello World\n\nThis is a paragraph.',

  whitespaceSignificant: `Line 1

Line 2 with space above

    Indented line (4 spaces)

\tTabbed line`,
};

// ============================================================================
// Test Suite: Markdown Hydration
// ============================================================================

describe('markdown Hydration', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  describe('render markdown identically on SSR and client', () => {
    it('should preserve exact markdown content during hydration', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(1, 'thread-123');

      const originalContent = MARKDOWN_SAMPLES.complex;
      const messages = [
        createTestUserMessage({
          content: 'Explain something',
          id: 'msg-user',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: originalContent,
          id: 'msg-p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      hydrateFromSSR(store, thread, participants, messages);

      const hydratedMessage = store.getState().messages.find(m => m.id === 'msg-p0');
      assertDefined(hydratedMessage, 'Hydrated message should exist');
      expect(getMessageText(hydratedMessage)).toBe(originalContent);
    });

    it('should preserve markdown with special characters', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(1, 'thread-123');

      const contentWithSpecialChars = '# Heading with <html> tags\n\n`<script>alert("xss")</script>`\n\nMore & more "quotes"';

      const messages = [
        createTestUserMessage({ content: 'Question', id: 'msg-user', roundNumber: 0 }),
        createTestAssistantMessage({
          content: contentWithSpecialChars,
          id: 'msg-p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      hydrateFromSSR(store, thread, participants, messages);

      const hydratedMessage = store.getState().messages.find(m => m.id === 'msg-p0');
      assertDefined(hydratedMessage, 'Hydrated message should exist');
      expect(getMessageText(hydratedMessage)).toBe(contentWithSpecialChars);
    });

    it('should preserve unicode and emoji in markdown', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(1, 'thread-123');

      const unicodeContent = '# 你好世界 🌍\n\n**Bold:** émoji → 🎉\n\n```\nconst greeting = "مرحبا";\n```';

      const messages = [
        createTestUserMessage({ content: 'Question', id: 'msg-user', roundNumber: 0 }),
        createTestAssistantMessage({
          content: unicodeContent,
          id: 'msg-p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      hydrateFromSSR(store, thread, participants, messages);

      const hydratedMessage = store.getState().messages.find(m => m.id === 'msg-p0');
      assertDefined(hydratedMessage, 'Hydrated message should exist');
      expect(getMessageText(hydratedMessage)).toBe(unicodeContent);
    });
  });

  describe('not flash raw markdown before formatted', () => {
    it('should provide content immediately on hydration', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(1, 'thread-123');

      const messages = [
        createTestUserMessage({ content: 'Question', id: 'msg-user', roundNumber: 0 }),
        createTestAssistantMessage({
          content: MARKDOWN_SAMPLES.complex,
          id: 'msg-p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      // Track state to ensure no empty flash
      let sawEmptyContent = false;
      const unsubscribe = store.subscribe(() => {
        const p0Msg = store.getState().messages.find(m => m.id === 'msg-p0');
        if (p0Msg && getMessageText(p0Msg) === '') {
          sawEmptyContent = true;
        }
      });

      hydrateFromSSR(store, thread, participants, messages);

      unsubscribe();

      // Should never have empty content for the message
      expect(sawEmptyContent).toBe(false);

      // Final content should be correct
      const p0Msg = store.getState().messages.find(m => m.id === 'msg-p0');
      assertDefined(p0Msg, 'Message p0 should exist');
      expect(getMessageText(p0Msg)).toBe(MARKDOWN_SAMPLES.complex);
    });

    it('should have content populated in single state update', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(1, 'thread-123');

      const messages = [
        createTestUserMessage({ content: 'Question', id: 'msg-user', roundNumber: 0 }),
        createTestAssistantMessage({
          content: MARKDOWN_SAMPLES.simple,
          id: 'msg-p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      let updateCount = 0;
      const unsubscribe = store.subscribe(() => {
        updateCount++;
      });

      hydrateFromSSR(store, thread, participants, messages);

      unsubscribe();

      // Should be minimal updates (initializeThread is batched)
      expect(updateCount).toBeLessThanOrEqual(5);
    });
  });

  describe('handle code blocks consistently across hydration', () => {
    it('should preserve code block with language identifier', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(1, 'thread-123');

      const messages = [
        createTestUserMessage({ content: 'Question', id: 'msg-user', roundNumber: 0 }),
        createTestAssistantMessage({
          content: MARKDOWN_SAMPLES.codeBlock,
          id: 'msg-p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      hydrateFromSSR(store, thread, participants, messages);

      const codeBlockMsg = store.getState().messages.find(m => m.id === 'msg-p0');
      assertDefined(codeBlockMsg, 'Code block message should exist');
      const content = getMessageText(codeBlockMsg);

      // Verify code block structure preserved
      expect(content).toContain('```typescript');
      expect(content).toContain('function hello');
      expect(content).toContain('```\n');
    });

    it('should preserve multiple code blocks', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(1, 'thread-123');

      const messages = [
        createTestUserMessage({ content: 'Question', id: 'msg-user', roundNumber: 0 }),
        createTestAssistantMessage({
          content: MARKDOWN_SAMPLES.multipleCodeBlocks,
          id: 'msg-p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      hydrateFromSSR(store, thread, participants, messages);

      const multiCodeBlockMsg = store.getState().messages.find(m => m.id === 'msg-p0');
      assertDefined(multiCodeBlockMsg, 'Multi code block message should exist');
      const content = getMessageText(multiCodeBlockMsg);

      expect(content).toContain('```javascript');
      expect(content).toContain('```python');
      expect(content.match(/```/g)).toHaveLength(4); // 2 open + 2 close
    });

    it('should preserve code indentation within blocks', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(1, 'thread-123');

      const indentedCode = `\`\`\`python
def foo():
    if True:
        return {
            "key": "value",
            "nested": {
                "deep": True
            }
        }
\`\`\``;

      const messages = [
        createTestUserMessage({ content: 'Question', id: 'msg-user', roundNumber: 0 }),
        createTestAssistantMessage({
          content: indentedCode,
          id: 'msg-p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      hydrateFromSSR(store, thread, participants, messages);

      const indentedCodeMsg = store.getState().messages.find(m => m.id === 'msg-p0');
      assertDefined(indentedCodeMsg, 'Indented code message should exist');
      const content = getMessageText(indentedCodeMsg);

      // Check indentation is preserved
      expect(content).toContain('    if True:');
      expect(content).toContain('        return {');
      expect(content).toContain('            "key"');
    });
  });

  describe('handle inline formatting consistently', () => {
    it('should preserve inline formatting markers', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(1, 'thread-123');

      const messages = [
        createTestUserMessage({ content: 'Question', id: 'msg-user', roundNumber: 0 }),
        createTestAssistantMessage({
          content: MARKDOWN_SAMPLES.inlineFormatting,
          id: 'msg-p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      hydrateFromSSR(store, thread, participants, messages);

      const inlineFormattingMsg = store.getState().messages.find(m => m.id === 'msg-p0');
      assertDefined(inlineFormattingMsg, 'Inline formatting message should exist');
      const content = getMessageText(inlineFormattingMsg);

      expect(content).toContain('**bold**');
      expect(content).toContain('*italic*');
      expect(content).toContain('~~strikethrough~~');
      expect(content).toContain('`code`');
    });

    it('should preserve nested formatting', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(1, 'thread-123');

      const nestedFormatting = 'This has ***bold italic*** and **bold with `code` inside**.';

      const messages = [
        createTestUserMessage({ content: 'Question', id: 'msg-user', roundNumber: 0 }),
        createTestAssistantMessage({
          content: nestedFormatting,
          id: 'msg-p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      hydrateFromSSR(store, thread, participants, messages);

      const nestedMsg = store.getState().messages.find(m => m.id === 'msg-p0');
      assertDefined(nestedMsg, 'Nested formatting message should exist');
      const content = getMessageText(nestedMsg);
      expect(content).toBe(nestedFormatting);
    });
  });

  describe('preserve whitespace formatting', () => {
    it('should preserve significant whitespace', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(1, 'thread-123');

      const messages = [
        createTestUserMessage({ content: 'Question', id: 'msg-user', roundNumber: 0 }),
        createTestAssistantMessage({
          content: MARKDOWN_SAMPLES.whitespaceSignificant,
          id: 'msg-p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      hydrateFromSSR(store, thread, participants, messages);

      const whitespaceMsg = store.getState().messages.find(m => m.id === 'msg-p0');
      assertDefined(whitespaceMsg, 'Whitespace message should exist');
      const content = getMessageText(whitespaceMsg);

      // Double newlines preserved
      expect(content).toContain('\n\n');

      // Indentation preserved
      expect(content).toContain('    Indented');

      // Tab preserved
      expect(content).toContain('\t');
    });

    it('should preserve trailing newlines', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(1, 'thread-123');

      const contentWithTrailing = 'Content here.\n\n';

      const messages = [
        createTestUserMessage({ content: 'Question', id: 'msg-user', roundNumber: 0 }),
        createTestAssistantMessage({
          content: contentWithTrailing,
          id: 'msg-p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      hydrateFromSSR(store, thread, participants, messages);

      const trailingMsg = store.getState().messages.find(m => m.id === 'msg-p0');
      assertDefined(trailingMsg, 'Trailing newline message should exist');
      const content = getMessageText(trailingMsg);
      expect(content).toBe(contentWithTrailing);
    });

    it('should preserve leading whitespace in content', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(1, 'thread-123');

      const contentWithLeading = '   Leading spaces preserved';

      const messages = [
        createTestUserMessage({ content: 'Question', id: 'msg-user', roundNumber: 0 }),
        createTestAssistantMessage({
          content: contentWithLeading,
          id: 'msg-p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      hydrateFromSSR(store, thread, participants, messages);

      const leadingMsg = store.getState().messages.find(m => m.id === 'msg-p0');
      assertDefined(leadingMsg, 'Leading whitespace message should exist');
      const content = getMessageText(leadingMsg);
      expect(content).toBe(contentWithLeading);
    });
  });

  describe('handle streaming markdown without re-parse flicker', () => {
    it('should accumulate markdown content during streaming', () => {
      const participants = createMockParticipants(1, 'thread-123');
      store.getState().setParticipants(participants);

      // Simulate streaming chunks of markdown
      store.getState().appendEntityStreamingText(0, '# Heading\n\n', 0);
      const msg1 = store.getState().messages[0];
      assertDefined(msg1, 'First streaming message should exist');
      expect(getMessageText(msg1)).toBe('# Heading\n\n');

      store.getState().appendEntityStreamingText(0, 'Paragraph with **bold', 0);
      const msg2 = store.getState().messages[0];
      assertDefined(msg2, 'Streaming message should exist after second append');
      expect(getMessageText(msg2)).toBe('# Heading\n\nParagraph with **bold');

      store.getState().appendEntityStreamingText(0, '** text.\n\n', 0);
      const msg3 = store.getState().messages[0];
      assertDefined(msg3, 'Streaming message should exist after third append');
      expect(getMessageText(msg3)).toBe('# Heading\n\nParagraph with **bold** text.\n\n');

      store.getState().appendEntityStreamingText(0, '```js\ncode()\n```', 0);

      const finalMsg = store.getState().messages[0];
      assertDefined(finalMsg, 'Final streaming message should exist');
      const finalContent = getMessageText(finalMsg);
      expect(finalContent).toBe('# Heading\n\nParagraph with **bold** text.\n\n```js\ncode()\n```');
    });

    it('should handle incomplete code block during streaming', () => {
      const participants = createMockParticipants(1, 'thread-123');
      store.getState().setParticipants(participants);

      // Start code block
      store.getState().appendEntityStreamingText(0, '```typescript\n', 0);
      const codeMsg1 = store.getState().messages[0];
      assertDefined(codeMsg1, 'Code block message should exist');
      expect(getMessageText(codeMsg1)).toBe('```typescript\n');

      // Add code content
      store.getState().appendEntityStreamingText(0, 'const x = 1;\n', 0);
      const codeMsg2 = store.getState().messages[0];
      assertDefined(codeMsg2, 'Code block message should exist after content');
      expect(getMessageText(codeMsg2)).toBe('```typescript\nconst x = 1;\n');

      // Close code block
      store.getState().appendEntityStreamingText(0, '```', 0);

      const codeMsgFinal = store.getState().messages[0];
      assertDefined(codeMsgFinal, 'Final code block message should exist');
      const finalContent = getMessageText(codeMsgFinal);
      expect(finalContent).toBe('```typescript\nconst x = 1;\n```');
    });

    it('should handle incomplete inline formatting during streaming', () => {
      const participants = createMockParticipants(1, 'thread-123');
      store.getState().setParticipants(participants);

      // Start bold
      store.getState().appendEntityStreamingText(0, 'This is **', 0);
      const boldMsg1 = store.getState().messages[0];
      assertDefined(boldMsg1, 'Bold start message should exist');
      expect(getMessageText(boldMsg1)).toBe('This is **');

      // Add bold content
      store.getState().appendEntityStreamingText(0, 'important', 0);
      const boldMsg2 = store.getState().messages[0];
      assertDefined(boldMsg2, 'Bold content message should exist');
      expect(getMessageText(boldMsg2)).toBe('This is **important');

      // Close bold
      store.getState().appendEntityStreamingText(0, '** text.', 0);

      const boldMsgFinal = store.getState().messages[0];
      assertDefined(boldMsgFinal, 'Final bold message should exist');
      const finalContent = getMessageText(boldMsgFinal);
      expect(finalContent).toBe('This is **important** text.');
    });

    it('should maintain content integrity across many small chunks', () => {
      const participants = createMockParticipants(1, 'thread-123');
      store.getState().setParticipants(participants);

      const fullContent = MARKDOWN_SAMPLES.complex;
      const chunks = fullContent.split('');

      // Stream character by character
      for (const chunk of chunks) {
        store.getState().appendEntityStreamingText(0, chunk, 0);
      }

      const streamedMsg = store.getState().messages[0];
      assertDefined(streamedMsg, 'Streamed message should exist');
      const streamedContent = getMessageText(streamedMsg);
      expect(streamedContent).toBe(fullContent);
    });
  });

  describe('nested structures preservation', () => {
    it('should preserve nested list structures', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(1, 'thread-123');

      const messages = [
        createTestUserMessage({ content: 'Question', id: 'msg-user', roundNumber: 0 }),
        createTestAssistantMessage({
          content: MARKDOWN_SAMPLES.nestedStructures,
          id: 'msg-p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      hydrateFromSSR(store, thread, participants, messages);

      const nestedListMsg = store.getState().messages.find(m => m.id === 'msg-p0');
      assertDefined(nestedListMsg, 'Nested list message should exist');
      const content = getMessageText(nestedListMsg);
      expect(content).toBe(MARKDOWN_SAMPLES.nestedStructures);
    });
  });

  describe('message parts structure for markdown', () => {
    it('should store markdown in single TEXT part', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(1, 'thread-123');

      const messages = [
        createTestUserMessage({ content: 'Question', id: 'msg-user', roundNumber: 0 }),
        createTestAssistantMessage({
          content: MARKDOWN_SAMPLES.complex,
          id: 'msg-p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      hydrateFromSSR(store, thread, participants, messages);

      const message = store.getState().messages.find(m => m.id === 'msg-p0');
      assertDefined(message, 'Message should exist');
      assertDefined(message.parts, 'Message parts should exist');

      expect(message.parts).toHaveLength(1);
      const firstPart = message.parts[0];
      assertDefined(firstPart, 'First part should exist');
      expect(firstPart.type).toBe(MessagePartTypes.TEXT);
    });

    it('should preserve streaming content in TEXT part', () => {
      const participants = createMockParticipants(1, 'thread-123');
      store.getState().setParticipants(participants);

      store.getState().appendEntityStreamingText(0, MARKDOWN_SAMPLES.simple, 0);

      const message = store.getState().messages[0];
      assertDefined(message, 'Streaming message should exist');
      assertDefined(message.parts, 'Message parts should exist');

      expect(message.parts).toHaveLength(1);
      const firstPart = message.parts[0];
      assertDefined(firstPart, 'First part should exist');
      expect(firstPart).toEqual({
        text: MARKDOWN_SAMPLES.simple,
        type: MessagePartTypes.TEXT,
      });
    });
  });
});
