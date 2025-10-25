# AI SDK v5 Utility Layer

Comprehensive utility layer for AI SDK v5 integration, reducing code duplication and improving reusability across the application.

## 📂 File Structure

```
src/lib/ai/
├── index.ts              # Barrel export (main entry point)
├── types.ts              # Type definitions and re-exports
├── message-utils.ts      # Message transformation and validation
├── streaming-utils.ts    # Stream creation and manipulation
├── data-parts.ts         # Custom data parts helpers
├── persistence-utils.ts  # Database persistence helpers
└── prompts.ts            # System prompt builders
```

## 🎯 Purpose

This utility layer addresses code duplication identified in Analysis Agent 1 findings by providing:

1. **Centralized AI SDK imports** - Single source for AI SDK types and functions
2. **Reusable message transformations** - Standard conversions between UIMessage and ModelMessage
3. **Stream management** - Simplified streaming patterns with lifecycle callbacks
4. **Data part helpers** - ID management to prevent common bugs
5. **Persistence patterns** - Database operations following Cloudflare D1 best practices
6. **Prompt templates** - Structured system prompt construction

## 📚 Usage Examples

### Message Utilities

```typescript
import {
  convertUIToModelMessages,
  validateMessages,
  createErrorUIMessage
} from '@/lib/ai';

// Convert messages before sending to LLM
const modelMessages = convertUIToModelMessages(uiMessages);

// Validate message structure
const result = validateMessages(messages);
if (!result.valid) {
  throw new Error('Invalid messages');
}

// Note: AI SDK v5's useChat handles deduplication automatically

// Create error message
const errorMessage = createErrorUIMessage(
  participant,
  0,
  'Rate limit exceeded',
  'provider_rate_limit'
);
```

### Streaming Utilities

```typescript
import {
  createStreamingChatResponse,
  buildStreamConfig,
  createUIStreamResponse
} from '@/lib/ai';

// High-level streaming with callbacks
return createStreamingChatResponse(
  {
    model,
    temperature: 0.7,
    systemPrompt: 'You are a helpful assistant',
    previousMessages: chatHistory,
  },
  newUserMessage,
  {
    onComplete: async (fullText, messageId) => {
      await saveMessage(threadId, messageId, fullText);
    },
  }
);

// Low-level stream response
const result = await streamText({ model, messages });
return createUIStreamResponse(result);
```

### Data Parts Utilities

```typescript
import {
  createScopedIdGenerator,
  createStreamingDataPart,
  filterDataPartsByType
} from '@/lib/ai';

// Create ID generator for analysis steps
const generateAnalysisId = createScopedIdGenerator('analysis');

// Stream data parts with unique IDs
const progressPart = createStreamingDataPart(
  'analysis',
  { step: 1, status: 'processing' },
  generateAnalysisId
);

stream.writeData(progressPart);

// Filter data parts by type (frontend)
const analysisParts = filterDataPartsByType(data || [], 'analysis');
```

### Persistence Utilities

```typescript
import {
  createUserMessage,
  createAssistantMessage,
  prepareBatchInsert
} from '@/lib/ai';

// Create messages for database
const userMsg = createUserMessage('Hello!', threadId, roundNumber);
const assistantMsg = createAssistantMessage(
  'Hi there!',
  threadId,
  participantId,
  { model: 'gpt-4o-mini' },
  roundNumber
);

// Batch insert (Cloudflare D1 pattern)
const batchValues = prepareBatchInsert([userMsg, assistantMsg], threadId);
await db.batch([
  db.insert(tables.chatMessage).values(batchValues[0]),
  db.insert(tables.chatMessage).values(batchValues[1])
]);
```

### Prompt Utilities

```typescript
import {
  buildSystemPrompt,
  buildPromptFromTemplate,
  CommonPromptTemplates
} from '@/lib/ai';

// Build structured system prompt
const systemPrompt = buildSystemPrompt({
  role: 'You are a helpful coding assistant',
  instructions: [
    'Provide clear code examples',
    'Explain your reasoning'
  ],
  constraints: [
    'Keep responses under 500 words'
  ],
  outputFormat: 'Markdown format with code blocks'
});

// Use pre-built template
const prompt = buildPromptFromTemplate(
  CommonPromptTemplates.codeReview,
  { code: '...', language: 'TypeScript' }
);
```

## 🔑 Key Patterns

### AI SDK v5 Official Patterns

All utilities follow AI SDK v5 official patterns:

- **UIMessage Format**: Rich UI representation with parts, metadata, tools
- **ModelMessage Format**: Simplified LLM provider format
- **Message Conversion**: `convertToModelMessages()` before sending to LLMs
- **Message Validation**: `validateUIMessages()` for runtime safety
- **Stream Response**: `toUIMessageStreamResponse()` for frontend consumption
- **Data Parts**: Unique IDs prevent frontend overwrites

### Backend Patterns Compliance

Follows patterns from `/docs/backend-patterns.md`:

- **Batch-First**: Uses `db.batch()` instead of transactions (Cloudflare D1)
- **Type Safety**: Zero casting, Zod validation throughout
- **Error Handling**: Structured errors with context
- **Logging**: Comprehensive operation logging

### Deduplication Strategy

**AI SDK v5 Automatic Deduplication**
- AI SDK v5's `useChat` hook handles message deduplication automatically
- No manual deduplication required in application code
- Deduplication occurs at the framework level for optimal performance

## 🎓 Learning Resources

- **AI SDK v5 Documentation**: https://sdk.vercel.ai/docs
- **AI SDK v5 Course**: `.context/ai-sdk-v5-crash-course-full-digest.txt`
- **Backend Patterns**: `/docs/backend-patterns.md`
- **Analysis Report**: `.context/analysis-10-architecture-consolidation.md`

## ✅ Type Safety

All utilities provide full TypeScript type inference:

- Zero `any` types
- Generic type parameters where appropriate
- Zod schema integration for runtime validation
- Type guards for narrowing

## 🚀 Benefits

1. **Reduced Code Duplication**: Common patterns extracted to reusable utilities
2. **Consistency**: Standardized approach across the application
3. **Type Safety**: Full TypeScript inference end-to-end
4. **Documentation**: Comprehensive JSDoc with examples
5. **Maintainability**: Single place to update AI SDK integration patterns
6. **Bug Prevention**: ID management prevents common streaming bugs

## 📝 Notes

- **NO Breaking Changes**: Pure additions, no modifications to existing code
- **Gradual Adoption**: Use utilities where they provide value
- **Pattern Reference**: Each utility documents the pattern it implements
- **AI SDK v5**: All patterns follow AI SDK v5 official recommendations

## 🔄 Future Enhancements

Potential additions as needs arise:

- Tool calling utilities
- Prompt caching helpers
- Token counting utilities
- Cost tracking helpers
- Multi-model orchestration patterns
