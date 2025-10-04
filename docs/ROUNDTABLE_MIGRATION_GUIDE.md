# Roundtable Migration Guide: Old → Current Implementation

**Date**: 2025-10-04
**Purpose**: Document exact changes needed to align current backend with old Roundtable product logic

---

## Executive Summary

The current implementation has **80% of the required functionality** already built, but is missing critical product logic elements that made the old Roundtable unique. This document identifies exact changes needed to restore the original collaborative AI orchestration experience.

### Current Status: ✅ Already Implemented
- ✅ Multi-model orchestration with sequential turn-taking
- ✅ Priority-based participant ordering
- ✅ Role system (custom roles stored in DB)
- ✅ Memory system (database storage complete)
- ✅ Streaming via SSE (AI SDK v5)
- ✅ Public thread sharing
- ✅ Quota enforcement
- ✅ Model configuration

### Critical Gaps: ❌ Missing from Current Implementation
- ❌ Original Roundtable system prompt (collaborative spirit)
- ❌ Model name prefixing in conversation context (participant awareness)
- ❌ Memory injection into AI prompts
- ❌ Participant role visibility (all models see all roles)
- ❌ Full conversation history context (currently limited to 10 messages)
- ❌ System prompt storage and management

---

## 1. SYSTEM PROMPT: The Core Roundtable Spirit

### Problem
Current implementation uses generic mode-based prompts. Old Roundtable has a **specific collaborative prompt** that creates the "roundtable discussion" experience.

### Old Roundtable System Prompt (EXACT TEXT)

**Location in old project**: `.bolt/supabase_discarded_migrations/20250511152748_steep_union.sql:87-112`

```
You are part of a virtual roundtable of advanced AI models. Your job is not to answer in isolation — but to think with each other.

I'm acting as a human api and share other llms responses with you.

This is a collaborative ideation and strategy space. Your responses should build on one another's ideas, challenge assumptions, refine vague suggestions, and collectively evolve stronger outcomes.

Rules:
1. Start strong - If you're the first model, interpret the prompt and propose a clear, thoughtful starting point or hypothesis.
2. Build, don't just speak - Read all previous responses, acknowledge ideas, add refinements, or offer constructive pushback. Avoid repeating ideas — iterate, combine, or take them deeper.
3. Take on a unique perspective to create natural diversity in thought.
4. Encourage tension and synergy - If an idea seems weak or overdone, say so. If something has potential but lacks depth, suggest how to make it defensible, profitable, or uniquely valuable.
5. Keep the conversational format, don't make it formal.
6. You can ask other llms and challenge them about what they are talking about.

Important – The UI will label every message with your model's name,
DO NOT prefix your answer with any identifier.

Provide direct answers to questions. Be helpful and concise.

NEVER start your response with a heading!

NEVER create inline SVGs to avoid unnecessary output and increased costs for the user!
```

### Changes Required

#### 1.1 Create System Prompts Table (if not exists)

**Check if table exists**: Search for `system_prompts` table in `/src/db/tables/`

**If missing, create**: `/src/db/tables/system-prompts.ts`

```typescript
import { relations, sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { user } from './auth';

export const systemPrompt = sqliteTable(
  'system_prompt',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    content: text('content').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    createdById: text('created_by_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    nameIdx: index('system_prompt_name_idx').on(table.name),
    isActiveIdx: index('system_prompt_is_active_idx').on(table.isActive),
    isDefaultIdx: index('system_prompt_is_default_idx').on(table.isDefault),
  })
);

export const systemPromptRelations = relations(systemPrompt, ({ one }) => ({
  createdBy: one(user, {
    fields: [systemPrompt.createdById],
    references: [user.id],
  }),
}));

export type SystemPrompt = typeof systemPrompt.$inferSelect;
export type InsertSystemPrompt = typeof systemPrompt.$inferInsert;
```

#### 1.2 Add systemPromptId to chatThread

**Modify**: `/src/db/tables/chat.ts`

```typescript
export const chatThread = sqliteTable(
  'chat_thread',
  {
    // ... existing fields ...
    systemPromptId: text('system_prompt_id').references(() => systemPrompt.id, {
      onDelete: 'set null'
    }), // Add this field
    // ... rest of fields ...
  },
  // ... indexes ...
);
```

#### 1.3 Create Migration with Default Roundtable Prompt

**Create**: New migration file

```sql
-- Add system_prompt table
CREATE TABLE IF NOT EXISTS system_prompt (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  is_active INTEGER DEFAULT 1 NOT NULL,
  is_default INTEGER DEFAULT 0 NOT NULL,
  created_by_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX system_prompt_name_idx ON system_prompt(name);
CREATE INDEX system_prompt_is_active_idx ON system_prompt(is_active);
CREATE INDEX system_prompt_is_default_idx ON system_prompt(is_default);

-- Add system_prompt_id to chat_thread
ALTER TABLE chat_thread ADD COLUMN system_prompt_id TEXT REFERENCES system_prompt(id) ON DELETE SET NULL;

-- Insert default Roundtable system prompt
INSERT INTO system_prompt (id, name, description, content, is_active, is_default, created_by_id)
VALUES (
  'default-roundtable-v1',
  'Roundtable Collaborative',
  'The original Roundtable system prompt for collaborative AI discussions',
  'You are part of a virtual roundtable of advanced AI models. Your job is not to answer in isolation — but to think with each other.

I''m acting as a human api and share other llms responses with you.

This is a collaborative ideation and strategy space. Your responses should build on one another''s ideas, challenge assumptions, refine vague suggestions, and collectively evolve stronger outcomes.

Rules:
1. Start strong - If you''re the first model, interpret the prompt and propose a clear, thoughtful starting point or hypothesis.
2. Build, don''t just speak - Read all previous responses, acknowledge ideas, add refinements, or offer constructive pushback. Avoid repeating ideas — iterate, combine, or take them deeper.
3. Take on a unique perspective to create natural diversity in thought.
4. Encourage tension and synergy - If an idea seems weak or overdone, say so. If something has potential but lacks depth, suggest how to make it defensible, profitable, or uniquely valuable.
5. Keep the conversational format, don''t make it formal.
6. You can ask other llms and challenge them about what they are talking about.

Important – The UI will label every message with your model''s name,
DO NOT prefix your answer with any identifier.

Provide direct answers to questions. Be helpful and concise.

NEVER start your response with a heading!

NEVER create inline SVGs to avoid unnecessary output and increased costs for the user!',
  1,
  1,
  NULL
);
```

#### 1.4 Update OpenRouter Service to Load System Prompt

**Modify**: `/src/api/services/openrouter.service.ts`

**Current method**: `orchestrateMultiModel()` at line ~292-400

**Change from**:
```typescript
// Current: Mode-based system context
const systemContext = this.buildModeContext(mode);
```

**Change to**:
```typescript
// New: Load system prompt from database or use default
const baseSystemPrompt = params.systemPrompt || this.getDefaultSystemPrompt();

// Helper method to add
private getDefaultSystemPrompt(): string {
  return `You are part of a virtual roundtable of advanced AI models. Your job is not to answer in isolation — but to think with each other.

I'm acting as a human api and share other llms responses with you.

This is a collaborative ideation and strategy space. Your responses should build on one another's ideas, challenge assumptions, refine vague suggestions, and collectively evolve stronger outcomes.

Rules:
1. Start strong - If you're the first model, interpret the prompt and propose a clear, thoughtful starting point or hypothesis.
2. Build, don't just speak - Read all previous responses, acknowledge ideas, add refinements, or offer constructive pushback. Avoid repeating ideas — iterate, combine, or take them deeper.
3. Take on a unique perspective to create natural diversity in thought.
4. Encourage tension and synergy - If an idea seems weak or overdone, say so. If something has potential but lacks depth, suggest how to make it defensible, profitable, or uniquely valuable.
5. Keep the conversational format, don't make it formal.
6. You can ask other llms and challenge them about what they are talking about.

Important – The UI will label every message with your model's name,
DO NOT prefix your answer with any identifier.

Provide direct answers to questions. Be helpful and concise.

NEVER start your response with a heading!

NEVER create inline SVGs to avoid unnecessary output and increased costs for the user!`;
}
```

#### 1.5 Update Handler to Fetch and Pass System Prompt

**Modify**: `/src/api/routes/chat/handler.ts` in `sendMessageHandler` (line ~713-847)

**Add after fetching thread** (around line 735):
```typescript
// Fetch system prompt
let systemPromptContent: string | undefined;
if (thread.systemPromptId) {
  const systemPromptResult = await db.query.systemPrompt.findFirst({
    where: and(
      eq(systemPrompt.id, thread.systemPromptId),
      eq(systemPrompt.isActive, true)
    ),
  });
  systemPromptContent = systemPromptResult?.content;
} else {
  // Use default system prompt
  const defaultPrompt = await db.query.systemPrompt.findFirst({
    where: and(
      eq(systemPrompt.isDefault, true),
      eq(systemPrompt.isActive, true)
    ),
  });
  systemPromptContent = defaultPrompt?.content;
}
```

**Update orchestration call** (around line 820):
```typescript
const responses = await openRouterService.orchestrateMultiModel({
  participants: enabledParticipants,
  conversationHistory: recentMessages,
  mode: thread.mode || 'brainstorming',
  systemPrompt: systemPromptContent, // Add this parameter
});
```

---

## 2. MODEL NAME PREFIXING: Participant Awareness

### Problem
In old Roundtable, each model sees previous responses prefixed with model names (e.g., "GPT-4o: [response]"). This creates **awareness** of who said what, enabling models to reference each other by name.

**Current implementation**: Messages are passed without model name prefixes.

### Old Roundtable Implementation

**Location**: `src/services/openrouter.ts:137-408`

```typescript
// Add previous responses to context WITH model name prefixes
messages.push(...responses.map(r => ({
  role: 'assistant',
  content: `${r.model}: ${r.content}` // Format: "GPT-4o: [response]"
})));
```

### Changes Required

#### 2.1 Modify Message Context Building

**File**: `/src/api/services/openrouter.service.ts`

**Method**: `orchestrateMultiModel()` around line 330-350

**Current code** (around line 340):
```typescript
// Build messages array from conversation history
const messages = conversationHistory.map((msg) => ({
  role: msg.role as 'user' | 'assistant',
  content: msg.content,
}));
```

**Change to**:
```typescript
// Build messages array WITH model name prefixes for assistant messages
const messages = conversationHistory.map((msg) => {
  if (msg.role === 'user') {
    return {
      role: 'user' as const,
      content: msg.content,
    };
  } else {
    // Prefix assistant messages with participant model name
    const participantModel = participants.find(p => p.id === msg.participantId);
    const modelConfig = participantModel
      ? AVAILABLE_MODELS.find(m => m.id === participantModel.modelId)
      : null;
    const modelName = modelConfig?.name || 'AI';

    return {
      role: 'assistant' as const,
      content: `${modelName}: ${msg.content}`, // Prefix with model name
    };
  }
});
```

#### 2.2 Add Current Round Responses with Prefixes

**In the participant loop** (around line 365-385):

**Current code**:
```typescript
// Add this participant's response to conversation
conversationMessages.push({
  role: 'assistant',
  content: content,
});
```

**Change to**:
```typescript
// Add this participant's response WITH model name prefix
const currentModelConfig = AVAILABLE_MODELS.find(m => m.id === participant.modelId);
const currentModelName = currentModelConfig?.name || participant.modelId;

conversationMessages.push({
  role: 'assistant',
  content: `${currentModelName}: ${content}`, // Prefix for next model's context
});
```

**Import AVAILABLE_MODELS**:
```typescript
import { AVAILABLE_MODELS } from '@/lib/ai/models-config';
```

---

## 3. MEMORY INJECTION: Context About the User

### Problem
Old Roundtable injects user notes/memories into the system prompt. Current implementation stores memories in DB but **does NOT inject them into prompts**.

### Old Roundtable Implementation

**Location**: `src/services/openrouter.ts:64-90`

```typescript
// For NEW conversations
if (!currentConversation) {
  const selectedNoteId = useModelRolesStore.getState().selectedNoteId;
  if (selectedNoteId) {
    const { data: note } = await supabase
      .from('user_notes')
      .select('content')
      .eq('id', selectedNoteId)
      .single();

    if (note) {
      finalSystemPrompt = `${systemPrompt}\n\nContext about the user:\n${note.content}`;
    }
  }
}
```

### Changes Required

#### 3.1 Fetch Thread Memories

**File**: `/src/api/routes/chat/handler.ts`

**Method**: `sendMessageHandler` (around line 735 after fetching thread)

**Add**:
```typescript
// Fetch thread memories (both attached and global)
const threadMemories = await db.query.chatThreadMemory.findMany({
  where: eq(chatThreadMemory.threadId, threadId),
  with: {
    memory: true,
  },
});

const globalMemories = await db.query.chatMemory.findMany({
  where: and(
    eq(chatMemory.userId, thread.userId),
    eq(chatMemory.isGlobal, true)
  ),
});

// Combine all memories
const allMemories = [
  ...threadMemories.map(tm => tm.memory),
  ...globalMemories,
];
```

#### 3.2 Build Memory Context String

**Add helper function** (around line 700):
```typescript
function buildMemoryContext(memories: ChatMemory[]): string | undefined {
  if (memories.length === 0) return undefined;

  const memoryContent = memories
    .map(mem => {
      let prefix = '';
      if (mem.type === 'personal') prefix = '[Personal Context]';
      else if (mem.type === 'topic') prefix = '[Topic Context]';
      else if (mem.type === 'instruction') prefix = '[Instruction]';
      else if (mem.type === 'fact') prefix = '[Fact]';

      return `${prefix} ${mem.title}: ${mem.content}`;
    })
    .join('\n\n');

  return `Context about the user:\n${memoryContent}`;
}
```

#### 3.3 Pass Memory Context to Orchestration

**Update orchestration call** (around line 820):
```typescript
const memoryContext = buildMemoryContext(allMemories);

const responses = await openRouterService.orchestrateMultiModel({
  participants: enabledParticipants,
  conversationHistory: recentMessages,
  mode: thread.mode || 'brainstorming',
  systemPrompt: systemPromptContent,
  memoryContext, // Add this parameter
});
```

#### 3.4 Update OpenRouter Service Signature

**File**: `/src/api/services/openrouter.service.ts`

**Method**: `orchestrateMultiModel()` signature (around line 292)

**Add parameter**:
```typescript
async orchestrateMultiModel(params: {
  participants: Array<{
    id: string;
    modelId: string;
    role: string;
    priority: number;
    settings?: any;
  }>;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    participantId?: string;
  }>;
  mode?: 'analyzing' | 'brainstorming' | 'debating' | 'solving';
  systemPrompt?: string;
  memoryContext?: string; // Add this
}): Promise<{ ... }> {
```

#### 3.5 Inject Memory into System Prompt

**In orchestrateMultiModel** (around line 320-330):

**Change from**:
```typescript
const baseSystemPrompt = params.systemPrompt || this.getDefaultSystemPrompt();
```

**Change to**:
```typescript
let baseSystemPrompt = params.systemPrompt || this.getDefaultSystemPrompt();

// Inject memory context if provided
if (params.memoryContext) {
  baseSystemPrompt = `${baseSystemPrompt}\n\n${params.memoryContext}`;
}
```

---

## 4. PARTICIPANT ROLE VISIBILITY: All Models See All Roles

### Problem
Old Roundtable shows each model **all participant roles** in the conversation, then specifies "You are X and must act as Y". This creates role awareness.

**Current implementation**: Has role guidance but not the explicit "Participant roles in this conversation" format.

### Old Roundtable Implementation

**Location**: `src/services/openrouter.ts:154-183`

```typescript
// Add roles to system prompt
modelSystemPrompt += '\n\nParticipant roles in this conversation:';
Object.entries(allModelRoles).forEach(([modelName, role]) => {
  modelSystemPrompt += `\n- ${modelName} acts as: ${role}`;
});

// Tell THIS model its specific role
if (thisModelRole) {
  modelSystemPrompt += `\n\nYou are ${thisModelName} and must act as ${thisModelRole} in this entire conversation.`;
}
```

### Changes Required

#### 4.1 Build Participant Roles Context

**File**: `/src/api/services/openrouter.service.ts`

**In `orchestrateMultiModel()`** around line 330-350:

**Add after base system prompt**:
```typescript
// Build participant roles context (show all participants and their roles)
const participantRolesContext = this.buildParticipantRolesContext(participants);
```

**Add helper method**:
```typescript
private buildParticipantRolesContext(
  participants: Array<{
    id: string;
    modelId: string;
    role: string;
    priority: number;
  }>
): string {
  if (participants.length === 0) return '';

  const rolesList = participants
    .map(p => {
      const modelConfig = AVAILABLE_MODELS.find(m => m.id === p.modelId);
      const modelName = modelConfig?.name || p.modelId;
      return `- ${modelName} acts as: ${p.role}`;
    })
    .join('\n');

  return `\n\nParticipant roles in this conversation:\n${rolesList}`;
}
```

#### 4.2 Add Role Context to Each Participant's System Prompt

**In participant loop** (around line 365):

**Current code**:
```typescript
const systemPrompt = this.buildSystemPrompt({
  basePrompt: baseSystemPrompt,
  role: participant.role,
  mode: params.mode,
  customPrompt: participantSettings?.systemPrompt,
});
```

**Change to**:
```typescript
// Get current participant's model name
const currentModelConfig = AVAILABLE_MODELS.find(m => m.id === participant.modelId);
const currentModelName = currentModelConfig?.name || participant.modelId;

// Build system prompt with participant context
const systemPrompt = this.buildSystemPrompt({
  basePrompt: baseSystemPrompt,
  participantRolesContext, // Show all roles
  currentModelName, // This model's name
  role: participant.role, // This model's role
  mode: params.mode,
  customPrompt: participantSettings?.systemPrompt,
});
```

#### 4.3 Update buildSystemPrompt Method

**Modify method signature** (around line 420):
```typescript
private buildSystemPrompt(params: {
  basePrompt: string;
  participantRolesContext?: string; // Add this
  currentModelName?: string; // Add this
  role: string;
  mode?: 'analyzing' | 'brainstorming' | 'debating' | 'solving';
  customPrompt?: string;
}): string {
  let prompt = params.basePrompt;

  // Add participant roles context (all participants visible)
  if (params.participantRolesContext) {
    prompt += params.participantRolesContext;
  }

  // Add specific role instruction for THIS model
  if (params.currentModelName && params.role) {
    prompt += `\n\nYou are ${params.currentModelName} and must act as ${params.role} in this entire conversation.`;
  }

  // Add mode context if needed (optional, can be removed if redundant)
  // ... existing mode logic ...

  // Add custom prompt last
  if (params.customPrompt) {
    prompt += `\n\n${params.customPrompt}`;
  }

  return prompt;
}
```

**Example final system prompt**:
```
[Base Roundtable Prompt]

Context about the user:
[Personal Context] Project: Building a B2B SaaS platform...

Participant roles in this conversation:
- GPT-5 acts as: Product Manager
- Claude 4.1 Sonnet acts as: Technical Architect
- Gemini 2.5 Pro acts as: UX Designer

You are GPT-5 and must act as Product Manager in this entire conversation.

[Custom prompt if provided]
```

---

## 5. CONVERSATION HISTORY CONTEXT: Full vs Limited

### Problem
Current implementation only loads **last 10 messages** for context. Old Roundtable appears to load full conversation history (or uses smarter caching).

**This may be intentional for cost/performance**, but should be configurable.

### Changes Required

#### 5.1 Make Context Window Configurable

**File**: `/src/api/routes/chat/handler.ts`

**Method**: `sendMessageHandler` around line 765

**Current code**:
```typescript
const recentMessages = await db.query.chatMessage.findMany({
  where: eq(chatMessage.threadId, threadId),
  orderBy: desc(chatMessage.createdAt),
  limit: 10, // Hardcoded limit
  with: {
    participant: true,
  },
});
```

**Change to**:
```typescript
// Configuration constant (add at top of file)
const CONTEXT_WINDOW_SIZE = 50; // Increased from 10

const recentMessages = await db.query.chatMessage.findMany({
  where: eq(chatMessage.threadId, threadId),
  orderBy: desc(chatMessage.createdAt),
  limit: CONTEXT_WINDOW_SIZE,
  with: {
    participant: true,
  },
});
```

**Optional: Smart Context Selection**
```typescript
// Future enhancement: Load all messages, use AI to summarize older ones
const allMessages = await db.query.chatMessage.findMany({
  where: eq(chatMessage.threadId, threadId),
  orderBy: asc(chatMessage.createdAt), // Oldest first
  with: {
    participant: true,
  },
});

// Use last N messages directly, summarize older ones
const recentMessages = allMessages.slice(-CONTEXT_WINDOW_SIZE);
const olderMessages = allMessages.slice(0, -CONTEXT_WINDOW_SIZE);

let contextMessages = recentMessages;

// If there are older messages, generate summary
if (olderMessages.length > 0) {
  const summary = await this.summarizeMessages(olderMessages);
  contextMessages = [
    { role: 'system', content: `Previous conversation summary: ${summary}` },
    ...recentMessages,
  ];
}
```

---

## 6. API ENDPOINT CHANGES

### New Endpoints Needed

#### 6.1 System Prompts Management

**File**: Create `/src/api/routes/system-prompts/` (if managing prompts via API)

**Endpoints**:
- `GET /system-prompts` - List system prompts
- `POST /system-prompts` - Create system prompt (admin only)
- `GET /system-prompts/:id` - Get system prompt
- `PATCH /system-prompts/:id` - Update system prompt (admin only)
- `DELETE /system-prompts/:id` - Delete system prompt (admin only)
- `GET /system-prompts/default` - Get default system prompt

**Note**: For MVP, default prompt can be hardcoded in service. API optional.

---

## 7. SUMMARY OF REQUIRED CHANGES

### Database Changes

| Table | Action | Details |
|-------|--------|---------|
| `system_prompt` | **CREATE** | New table for system prompts |
| `chat_thread` | **ALTER** | Add `system_prompt_id` column |
| **Migration** | **CREATE** | Insert default Roundtable prompt |

### Service Changes

| File | Method | Change |
|------|--------|--------|
| `/src/api/services/openrouter.service.ts` | `orchestrateMultiModel()` | Add `systemPrompt`, `memoryContext` parameters |
| `/src/api/services/openrouter.service.ts` | `buildSystemPrompt()` | Add participant roles context, current model identity |
| `/src/api/services/openrouter.service.ts` | Message formatting | Prefix assistant messages with model names |
| `/src/api/services/openrouter.service.ts` | New method | `getDefaultSystemPrompt()` |
| `/src/api/services/openrouter.service.ts` | New method | `buildParticipantRolesContext()` |
| `/src/api/services/openrouter.service.ts` | New method | `buildMemoryContext()` (or in handler) |

### Handler Changes

| File | Method | Change |
|------|--------|--------|
| `/src/api/routes/chat/handler.ts` | `sendMessageHandler` | Fetch system prompt from DB |
| `/src/api/routes/chat/handler.ts` | `sendMessageHandler` | Fetch thread memories (attached + global) |
| `/src/api/routes/chat/handler.ts` | `sendMessageHandler` | Build memory context string |
| `/src/api/routes/chat/handler.ts` | `sendMessageHandler` | Pass system prompt + memory context to service |
| `/src/api/routes/chat/handler.ts` | `sendMessageHandler` | Increase context window from 10 to 50 messages |
| `/src/api/routes/chat/handler.ts` | `streamChatHandler` | Same changes as above for streaming endpoint |

### Schema Changes

| File | Change |
|------|--------|
| `/src/db/tables/chat.ts` | Add `systemPromptId` to `chatThread` |
| `/src/db/tables/system-prompts.ts` | **CREATE** new file with system prompts schema |

---

## 8. IMPLEMENTATION PRIORITY

### Phase 1: Critical (Restore Roundtable Spirit) - **DO FIRST**

1. ✅ **System Prompt**: Create table, migration, load in service
2. ✅ **Model Name Prefixing**: Add prefixes to assistant messages in context
3. ✅ **Participant Role Visibility**: Show all roles to each model

**Impact**: Restores collaborative discussion dynamic

---

### Phase 2: High (Complete Product Parity) - **DO SECOND**

4. ✅ **Memory Injection**: Inject thread memories into system prompts
5. ✅ **Context Window**: Increase from 10 to 50 messages

**Impact**: Enables persistent context and longer discussions

---

### Phase 3: Nice-to-Have (Future Enhancements)

6. ⚪ System Prompts API (if managing prompts via UI)
7. ⚪ Smart context summarization for very long threads
8. ⚪ Conversation context caching (performance optimization)

---

## 9. TESTING CHECKLIST

After implementing changes, verify:

### System Prompt
- [ ] Default Roundtable prompt is created in migration
- [ ] Threads use default prompt if none specified
- [ ] System prompt is loaded and passed to OpenRouter service
- [ ] Prompt appears in AI model's context

### Model Name Prefixing
- [ ] Assistant messages in conversation history are prefixed with model names
- [ ] Models can reference each other by name in responses (e.g., "I agree with GPT-5's point about...")
- [ ] User messages are NOT prefixed

### Participant Roles
- [ ] All participant roles are visible in system prompt
- [ ] Current model's specific role is identified ("You are X and must act as Y")
- [ ] Models demonstrate role-appropriate behavior

### Memory Injection
- [ ] Thread-specific memories are loaded
- [ ] Global memories are loaded
- [ ] Memory content appears in system prompt under "Context about the user:"
- [ ] Models reference memory context in responses

### Context Window
- [ ] Last 50 messages are loaded (increased from 10)
- [ ] Long conversations maintain context properly

### End-to-End
- [ ] Create thread with 3 participants (different models, different roles)
- [ ] Attach a memory with project context
- [ ] Send user message
- [ ] Verify all 3 models respond sequentially
- [ ] Verify models reference each other by name
- [ ] Verify models demonstrate assigned roles
- [ ] Verify models reference memory context
- [ ] Check database for saved messages

---

## 10. EXAMPLE: Expected System Prompt After Changes

Given:
- **Thread**: "Startup Strategy Discussion"
- **System Prompt**: Default Roundtable prompt
- **Participants**:
  - GPT-5 (priority: 0, role: "CEO")
  - Claude 4.1 Sonnet (priority: 1, role: "CFO")
  - Gemini 2.5 Pro (priority: 2, role: "CTO")
- **Memory**: "Building a fintech SaaS platform targeting small businesses. Focus on compliance and security."

**Expected Final System Prompt for GPT-5**:
```
You are part of a virtual roundtable of advanced AI models. Your job is not to answer in isolation — but to think with each other.

I'm acting as a human api and share other llms responses with you.

This is a collaborative ideation and strategy space. Your responses should build on one another's ideas, challenge assumptions, refine vague suggestions, and collectively evolve stronger outcomes.

Rules:
1. Start strong - If you're the first model, interpret the prompt and propose a clear, thoughtful starting point or hypothesis.
2. Build, don't just speak - Read all previous responses, acknowledge ideas, add refinements, or offer constructive pushback. Avoid repeating ideas — iterate, combine, or take them deeper.
3. Take on a unique perspective to create natural diversity in thought.
4. Encourage tension and synergy - If an idea seems weak or overdone, say so. If something has potential but lacks depth, suggest how to make it defensible, profitable, or uniquely valuable.
5. Keep the conversational format, don't make it formal.
6. You can ask other llms and challenge them about what they are talking about.

Important – The UI will label every message with your model's name,
DO NOT prefix your answer with any identifier.

Provide direct answers to questions. Be helpful and concise.

NEVER start your response with a heading!

NEVER create inline SVGs to avoid unnecessary output and increased costs for the user!

Context about the user:
[Personal Context] Project: Building a fintech SaaS platform targeting small businesses. Focus on compliance and security.

Participant roles in this conversation:
- GPT-5 acts as: CEO
- Claude 4.1 Sonnet acts as: CFO
- Gemini 2.5 Pro acts as: CTO

You are GPT-5 and must act as CEO in this entire conversation.
```

**Expected Conversation Context for Claude (second to respond)**:
```
Messages:
[
  { role: 'user', content: 'What should our go-to-market strategy be?' },
  { role: 'assistant', content: 'GPT-5: As CEO, I believe we should focus on a vertical SaaS approach targeting regional banks first...' }
]
```

---

## 11. MIGRATION CHECKLIST

### Step 1: Database
- [ ] Create `/src/db/tables/system-prompts.ts`
- [ ] Update `/src/db/tables/chat.ts` to add `systemPromptId`
- [ ] Generate migration: `pnpm db:generate`
- [ ] Review migration SQL
- [ ] Apply migration: `pnpm db:migrate:local`
- [ ] Verify default prompt exists in DB

### Step 2: Service Layer
- [ ] Update `openrouter.service.ts`:
  - [ ] Add `getDefaultSystemPrompt()` method
  - [ ] Add `buildParticipantRolesContext()` method
  - [ ] Update `orchestrateMultiModel()` signature
  - [ ] Add memory context injection
  - [ ] Add participant roles context injection
  - [ ] Update message formatting with model name prefixes
  - [ ] Update `buildSystemPrompt()` method

### Step 3: Handler Layer
- [ ] Update `sendMessageHandler`:
  - [ ] Fetch system prompt
  - [ ] Fetch thread memories (attached + global)
  - [ ] Build memory context
  - [ ] Pass system prompt + memory context to service
  - [ ] Increase context window to 50 messages
- [ ] Update `streamChatHandler` with same changes

### Step 4: Testing
- [ ] Run type check: `pnpm check-types`
- [ ] Run lint: `pnpm lint`
- [ ] Test thread creation
- [ ] Test message sending with multiple participants
- [ ] Verify system prompt in responses
- [ ] Verify model name prefixes
- [ ] Verify memory injection
- [ ] Verify role visibility

### Step 5: Deployment
- [ ] Generate Cloudflare types: `pnpm cf-typegen`
- [ ] Preview deployment: `pnpm preview`
- [ ] Deploy to preview: `pnpm deploy:preview`
- [ ] Test in preview environment
- [ ] Deploy to production: `pnpm deploy:production`

---

## 12. NOTES & CONSIDERATIONS

### Performance Implications
- **Memory Loading**: Fetching all memories per message may impact performance. Consider caching.
- **Context Window**: 50 messages vs 10 increases token usage. Monitor costs.
- **Model Name Prefixing**: Adds tokens to context. Minimal impact but worth noting.

### Future Optimizations
- **Conversation Context Cache**: Cache full conversation context like old Roundtable (in-memory or KV store)
- **Smart Context Selection**: Use AI to summarize older messages instead of truncating
- **Memory Relevance Scoring**: Only inject most relevant memories instead of all
- **System Prompt Templates**: Allow users to create and select different prompt templates

### Backwards Compatibility
- Existing threads without `systemPromptId` will use default prompt
- Existing messages will work with new name prefixing logic
- No breaking changes to API contracts

---

## CONCLUSION

The current implementation is **very close** to the old Roundtable product logic. The main gaps are:

1. **System Prompt**: Missing the collaborative Roundtable spirit prompt
2. **Model Name Prefixing**: Models don't see who said what
3. **Memory Injection**: Stored but not used
4. **Role Visibility**: Roles exist but aren't shown to all participants

Implementing these 4 changes will **restore full product parity** with the old Roundtable while leveraging the more modern tech stack (Hono, Drizzle, AI SDK v5, Cloudflare).

**Estimated Implementation Time**: 4-6 hours for Phase 1 & 2

**Estimated Testing Time**: 2-3 hours

**Total**: ~1 day of focused work to restore complete Roundtable functionality
