# Roundtable Migration Guide: Product Logic Alignment

**Version**: 2.0
**Date**: 2025-10-04
**Purpose**: Strategic planning to align current backend with original Roundtable collaborative AI orchestration

---

## Executive Summary

### Current Implementation Status

Your current backend has **85% of the infrastructure** needed for the old Roundtable experience. The architecture is sound, the database schema is comprehensive, and the multi-model orchestration framework is in place. However, the **collaborative spirit** that made Roundtable unique is missing due to a few critical gaps in how AI models interact with each other.

### What Works Well ✅

**Multi-Model Orchestration** (`src/api/services/openrouter.service.ts:292-400`)
- Sequential model execution based on priority
- Each model receives accumulated context from previous models
- Clean response aggregation and error handling
- Proper usage tracking and quota enforcement

**Database Architecture** (`src/db/tables/chat.ts`)
- Comprehensive schema: threads, participants, messages, memories, custom roles
- Proper relations and cascade deletes
- Junction tables for many-to-many relationships (thread-memory linking)
- Metadata storage for model configurations

**API Layer** (`src/api/routes/chat/`)
- 21 fully-implemented endpoints for all chat operations
- Thread management, participants, messages, memories, custom roles
- Public sharing capability via slug-based URLs
- Cursor-based pagination for performance

**Service Integration**
- OpenRouter integration via AI SDK v5
- Streaming support (SSE) for real-time responses
- Proper authentication and authorization
- Rate limiting and CSRF protection

### Critical Gaps ❌

**1. The Collaborative System Prompt**
- Old Roundtable uses a specific prompt that instructs models to "think with each other"
- Current system uses generic mode-based prompts (analyzing/brainstorming/debating/solving)
- The original prompt is not stored or used anywhere

**2. Model Attribution in Context**
- When Model B reads Model A's response, it should see "GPT-5: [response text]"
- Current system passes responses without model name prefixes
- Models cannot reference each other by name ("As GPT-5 mentioned...")

**3. Participant Role Transparency**
- All models should see: "GPT-5 acts as CEO, Claude acts as CFO, Gemini acts as CTO"
- Current system has role guidance but doesn't show the full participant roster
- Models don't know what roles other participants are playing

**4. Memory Injection Pipeline**
- Memories are stored in database but never passed to AI models
- Old Roundtable appends "Context about the user: [memory content]" to prompts
- Critical for maintaining project context across conversations

**5. Context Window Management**
- Current: Hardcoded 10 messages
- Old Roundtable: Loads full conversation history (relies on OpenRouter compression)
- May cause models to "forget" important earlier context

---

## Understanding the Old Roundtable Product Logic

### The Collaborative Roundtable Philosophy

**Core Concept**: Multiple AI models don't just answer the same question independently—they collaborate, build on each other's ideas, challenge assumptions, and collectively arrive at better solutions.

**How It Works**:
1. User asks a question
2. First model (by priority) receives the question and responds
3. Second model receives: user's question + first model's full response (with model name)
4. Second model can reference first model by name: "I agree with GPT-5 that we should..."
5. Third model sees both previous responses and can synthesize or add new perspectives
6. Result: A true discussion, not parallel monologues

**Old Project Location**: `/Users/avabagherzadeh/Desktop/projects/deadpixel/roundtable1`

### The Five Pillars of Roundtable Collaboration

#### Pillar 1: The System Prompt (The Foundation)

**What It Is**: A carefully crafted prompt that sets expectations for collaboration

**Key Phrases** (from `roundtable1/.bolt/supabase_discarded_migrations/20250511152748_steep_union.sql:87-112`):
- "Your job is not to answer in isolation — but to think with each other"
- "Build on one another's ideas, challenge assumptions, refine vague suggestions"
- "Read all previous responses, acknowledge ideas, add refinements, or offer constructive pushback"
- "Avoid repeating ideas — iterate, combine, or take them deeper"
- "You can ask other llms and challenge them about what they are talking about"

**Why It Matters**: Without this prompt, models default to independent analysis mode. This prompt creates the collaborative mindset.

**Current State**: Not implemented. Current system uses mode-specific prompts that don't emphasize collaboration.

#### Pillar 2: Model Name Attribution (Participant Awareness)

**What It Is**: Every assistant message in conversation history is prefixed with the model's name

**Format** (from `roundtable1/src/services/openrouter.ts:194`):
- User messages: "What's the best approach?"
- GPT-5's response in context: "GPT-5: I think we should start with research..."
- Claude's response in context: "Claude 4.1 Sonnet: I disagree with GPT-5. We should..."

**Why It Matters**:
- Models can reference each other by name
- Creates natural dialogue: "As GPT-5 mentioned..." or "I challenge Claude's assumption that..."
- Makes each model aware they're part of a team, not working in isolation

**Current State**: Messages passed without model name prefixes

#### Pillar 3: Role Roster Visibility (Team Composition)

**What It Is**: Each model sees a list of all participants and their assigned roles

**Format** (from `roundtable1/src/services/openrouter.ts:154-183`):
```
Participant roles in this conversation:
- GPT-5 acts as: CEO
- Claude 4.1 Sonnet acts as: CFO
- Gemini 2.5 Pro acts as: CTO

You are GPT-5 and must act as CEO in this entire conversation.
```

**Why It Matters**:
- Models understand the team dynamics
- Can address specific roles: "As CFO, what's your financial perspective?"
- Enables role-based debates: "The CTO's technical concerns vs the CEO's business priorities"

**Current State**: Partially implemented. Roles exist and are loaded, but the full roster isn't shown to each model.

#### Pillar 4: Persistent Memory (Project Context)

**What It Is**: User-created notes/memories that provide background context

**Format** (from `roundtable1/src/services/openrouter.ts:64-90`):
```
Context about the user:
[Memory content about user's project, preferences, constraints]
```

**Examples**:
- "Building a fintech SaaS platform. Must comply with SOC 2 and PCI-DSS."
- "Team of 5 engineers, $2M runway, 12-month timeline to revenue."
- "Previous failed attempt used microservices—caused too much complexity."

**Why It Matters**:
- Models don't have to re-learn project context every conversation
- Ensures consistency across discussions
- Allows for informed, context-aware recommendations

**Current State**: Database storage complete, but memories are never injected into prompts

#### Pillar 5: Sequential Context Accumulation (Building on Ideas)

**What It Is**: Each model receives the full conversation including all previous models' responses in the current round

**Flow** (from `roundtable1/src/services/openrouter.ts:137-408`):
1. User sends message
2. Model 1 responds → saved to `responses` array
3. Model 2 receives: conversation history + Model 1's new response
4. Model 2 responds → added to `responses` array
5. Model 3 receives: conversation history + Model 1's response + Model 2's response
6. And so on...

**Why It Matters**:
- Later models can synthesize earlier ideas
- Can identify patterns or contradictions
- Enables true collaborative problem-solving

**Current State**: ✅ Implemented correctly in `orchestrateMultiModel()`

---

## Detailed Comparison: Old vs Current

### System Prompt Construction

#### Old Roundtable (`roundtable1/src/services/openrouter.ts:61-90`)

**Loading Process**:
1. Fetch base system prompt from `system_prompts` table (stored in database)
2. If user selected a memory/note, append: "\n\nContext about the user:\n[memory content]"
3. Build participant roles list showing all models and their roles
4. Add specific role instruction: "You are [ModelName] and must act as [Role]"
5. Optionally append custom prompt from participant settings

**Storage**:
- System prompts stored in database table
- Default prompt has ID: `5a99c322-e933-4952-a879-2de4e38546f6`
- Loaded via React Context and available globally
- Can audit which prompt was used for any conversation

#### Current System (`src/api/services/openrouter.service.ts:408-468`)

**Construction Process**:
1. Build role context: "You are '[role]' in a collaborative AI discussion"
2. Add mode-specific context based on thread mode (analyzing/brainstorming/etc)
3. Add pre-defined role guidance if role matches known patterns ("The Ideator", etc)
4. Optionally append custom prompt from participant settings

**Storage**:
- No database storage for system prompts
- Prompts built dynamically on every request
- No audit trail of what prompt was used
- Cannot reproduce exact context for debugging

**Gap**: Need to create `system_prompt` table, store the original Roundtable prompt, and load it instead of building prompts dynamically.

### Message Context Building

#### Old Roundtable (`roundtable1/src/services/aiSdkService.ts:165-183`)

**Conversation History Format**:
- User messages: `{ role: 'user', content: 'user text' }`
- Assistant messages: `{ role: 'assistant', content: 'ModelName: response text' }`

**Current Round Responses**:
- As each model responds, append: `ModelName: response`
- Next model sees all previous responses with names

**Example Context Passed to Model 3**:
```
[
  { role: 'user', content: 'What database should we use?' },
  { role: 'assistant', content: 'GPT-5: I recommend PostgreSQL for...' },
  { role: 'assistant', content: 'Claude 4.1 Sonnet: While GPT-5 makes good points, I suggest...' }
]
```

#### Current System (`src/api/services/openrouter.service.ts:336-375`)

**Conversation History Format**:
- User messages: `{ role: 'user', content: 'user text' }`
- Assistant messages: `{ role: 'assistant', content: 'response text' }` (no model name)

**Current Round Responses**:
- Prefixed with role: `[RoleName]: response`
- But uses role name ("CEO"), not model name ("GPT-5")

**Example Context**:
```
[
  { role: 'user', content: 'What database should we use?' },
  { role: 'assistant', content: '[CEO]: I recommend PostgreSQL for...' },
  { role: 'assistant', content: '[CFO]: While the CEO makes good points...' }
]
```

**Gap**: Model names need to replace or supplement role names for better attribution.

### Memory System

#### Old Roundtable (`roundtable1/src/hooks/useNotes.ts` + `roundtable1/src/services/openrouter.ts:64-90`)

**Memory Structure**:
- Table: `user_notes` with columns: id, user_id, name, description, content
- One memory per conversation
- Selected BEFORE conversation starts
- Stored in conversation record as `note_id`

**Injection Process**:
1. Load conversation with `note_id` reference
2. Fetch note content from database
3. Append to system prompt: "\n\nContext about the user:\n[content]"
4. All models receive same memory context

**Lifecycle**:
- Created by user in separate UI
- Selected when starting new conversation
- Cannot change mid-conversation
- Reusable across multiple conversations

#### Current System (`src/db/tables/chat.ts:172-226`)

**Memory Structure**:
- Table: `chat_memory` with: id, user_id, thread_id, type, title, content, is_global
- Junction table: `chat_thread_memory` for many-to-many relationship
- Multiple memories per thread
- Can be global (auto-apply to all threads) or thread-specific

**Current State**:
- ✅ Database tables exist
- ✅ CRUD endpoints fully implemented (`src/api/routes/chat/handler.ts:955-1125`)
- ✅ Memories can be attached to threads
- ✅ Memories fetched and returned in API responses
- ❌ Memories NEVER injected into AI prompts
- ❌ No logic to fetch global memories
- ❌ Service layer doesn't receive memory content

**Gap**: Need to fetch memories in handler, build context string, and pass to service for injection.

### Role System

#### Old Roundtable (`roundtable1/src/store/modelRolesStore.ts` + Migration files)

**Architecture**:
- Roles stored in Zustand store with localStorage persistence
- When conversation created, roles saved to `conversation_model_configs.config.model_roles`
- Database table `model_roles` exists but not actively used in generation flow

**Available Roles** (`roundtable1/src/components/model-selection/ModelRoleDialog.tsx:7-17`):
1. The Ideator
2. Devil's Advocate
3. Builder
4. Practical Evaluator
5. Visionary Thinker
6. Domain Expert
7. User Advocate
8. Implementation Strategist
9. The Data Analyst

**Role Usage**:
- Set at conversation creation
- Cannot be changed mid-conversation
- All participants see all roles in system prompt
- Each model told: "You are [ModelName] and must act as [Role]"

#### Current System (`src/db/tables/chat.ts:57-117`)

**Architecture**:
- Table: `chat_custom_role` for reusable role templates
- Each role has: name, description, system_prompt
- Participants reference `custom_role_id` OR have inline role name
- Role guidance in service for pre-defined roles

**Available Pre-Defined Roles** (`src/lib/ai/models-config.ts:438-448`):
- Same 9 roles as old Roundtable
- Guidance patterns in `getRoleGuidance()` method (`src/api/services/openrouter.service.ts:453-468`)

**Current Usage**:
- ✅ Custom roles loaded during participant creation
- ✅ System prompt extracted from custom role if referenced
- ✅ Role guidance applied for known role names
- ❌ Full roster not shown to each model
- ❌ No explicit "You are [ModelName] and must act as [Role]" instruction

**Gap**: Need to show participant roster and add explicit model identity + role instruction.

### Conversation History Context Window

#### Old Roundtable (`roundtable1/src/services/messageService.ts:682-728`)

**Context Loading**:
- Loads ALL messages for conversation (no limit)
- Relies on OpenRouter's "middle-out" compression for long contexts
- Caches conversation context for 5 minutes (LRU cache, max 50 conversations)

**Cache Structure**:
```
{
  messages: Message[],           // ALL messages
  systemPrompt: { ... },          // Selected prompt
  userNote: { ... },             // Selected memory
  modelConfig: { ... },          // Participant config
  lastUpdated: timestamp
}
```

**Rationale**: Full context allows models to reference any part of discussion

#### Current System (`src/api/routes/chat/handler.ts:755-759`)

**Context Loading**:
- Hardcoded limit: 10 messages
- No caching (direct database queries)
- No token counting or intelligent truncation

**Rationale**: Likely performance/cost optimization, but may cause context loss

**Gap**: Increase limit to at least 50 messages, consider implementing caching layer.

---

## Migration Strategy: What Needs to Change

### Phase 1: Foundation - System Prompts (CRITICAL)

**Objective**: Store and use the original Roundtable collaborative system prompt

#### Database Changes

**Create Table**: `src/db/tables/system-prompts.ts`
- Fields: id, name, description, content, is_active, is_default, created_by_id, timestamps
- Indexes on: name, is_active, is_default
- Relations to `user` table

**Modify Table**: `src/db/tables/chat.ts` - `chatThread`
- Add column: `system_prompt_id` (nullable FK to system_prompt table)
- Default to null (will use default prompt)

**Migration File**: Create new migration
- Create `system_prompt` table with indexes
- Alter `chat_thread` to add `system_prompt_id` column
- Insert default Roundtable prompt with exact text from old project
- Set id: 'default-roundtable-v1', is_default: true, is_active: true

**Commands**:
```bash
# After creating schema file
pnpm db:generate        # Generate migration
pnpm db:migrate:local   # Apply to local database
```

#### Service Layer Changes

**File**: `src/api/services/openrouter.service.ts`

**Add Method**: `getDefaultSystemPrompt()` (around line 520)
- Returns the exact Roundtable prompt text as a string
- Used as fallback when no database prompt available

**Modify Method**: `orchestrateMultiModel()` (around line 292)
- Add parameter: `systemPrompt?: string`
- Replace mode-based context with provided system prompt
- If no systemPrompt provided, call `getDefaultSystemPrompt()`

**Modify Method**: `buildSystemPrompt()` (around line 408)
- Change signature to accept `basePrompt: string` parameter
- Remove mode context generation (now in base prompt)
- Keep role guidance and custom prompt appending

#### Handler Changes

**File**: `src/api/routes/chat/handler.ts`

**Method**: `sendMessageHandler` (around line 735)
- After fetching thread, fetch associated system prompt
- If thread has `system_prompt_id`, load that prompt from database
- If no thread prompt, load default prompt (where `is_default = true`)
- Extract prompt content as string

**Method**: `sendMessageHandler` (around line 820)
- Pass `systemPrompt: systemPromptContent` to `orchestrateMultiModel()` call

**Method**: `streamChatHandler` (around line 926)
- Apply same system prompt loading logic
- Pass to `streamUIMessages()` call

**Schema Changes**: `src/api/routes/chat/schema.ts`
- Add optional `systemPromptId` to thread creation schema
- Validate as UUID if provided

#### Testing Checklist

- [ ] Migration creates table and inserts default prompt
- [ ] Can query default prompt from database
- [ ] New threads without systemPromptId use default prompt
- [ ] Threads with custom systemPromptId use that prompt
- [ ] Inactive prompts are not loaded
- [ ] System prompt appears in model context (check AI responses for collaboration language)

---

### Phase 2: Model Attribution (CRITICAL)

**Objective**: Prefix assistant messages with model names so models can reference each other

#### Service Layer Changes

**File**: `src/api/services/openrouter.service.ts`

**Modify**: Message context building in `orchestrateMultiModel()` (around line 340)
- When converting conversation history to messages array:
  - User messages: keep as-is
  - Assistant messages: prefix content with model name
- Need participant metadata to lookup model names
- Format: `"ModelName: original content"`

**Implementation Approach**:
1. Accept conversation history with `participantId` field
2. For each assistant message, find corresponding participant
3. Lookup participant's `modelId` in participant array
4. Get model display name from `AI_MODELS` config (`src/lib/ai/models-config.ts`)
5. Prefix message content: `${modelName}: ${content}`

**Modify**: Current round response accumulation (around line 365-375)
- When adding participant response to conversation context
- Prefix with model name, not role name
- Format: `${modelName}: ${responseContent}`

**Import Required**: `AI_MODELS` from `src/lib/ai/models-config.ts`

#### Handler Changes

**File**: `src/api/routes/chat/handler.ts`

**Method**: `sendMessageHandler` (around line 755-787)
- When fetching previous messages, include participant data
- Transform messages to include `participantId` field
- Pass to service with participant ID for attribution

**Ensure**: Messages include participant relation when queried
- Already present in schema: `with: { participant: true }` (line 758)
- Pass participant info to service

#### Expected Behavior

**Before**:
```
Messages sent to Model 2:
[
  { role: 'user', content: 'What technology stack?' },
  { role: 'assistant', content: 'I recommend Next.js and PostgreSQL' }
]
```

**After**:
```
Messages sent to Model 2:
[
  { role: 'user', content: 'What technology stack?' },
  { role: 'assistant', content: 'GPT-5: I recommend Next.js and PostgreSQL' }
]
```

**Result**: Model 2 can now respond: "I agree with GPT-5's suggestion of Next.js, but..."

#### Testing Checklist

- [ ] Assistant messages in context show model names
- [ ] User messages don't have prefixes
- [ ] Multiple models can reference each other by name
- [ ] Model names are display names, not IDs (e.g., "GPT-5" not "openai/gpt-5")
- [ ] Database messages remain unprefixed (prefix only in AI context)

---

### Phase 3: Role Roster Visibility (CRITICAL)

**Objective**: Show all participants and their roles to each model

#### Service Layer Changes

**File**: `src/api/services/openrouter.service.ts`

**Add Method**: `buildParticipantRolesContext()` (around line 520)
- Input: Array of participants with modelId and role
- Output: Formatted string listing all participants
- Format:
  ```
  Participant roles in this conversation:
  - GPT-5 acts as: CEO
  - Claude 4.1 Sonnet acts as: CFO
  - Gemini 2.5 Pro acts as: CTO
  ```
- Lookup model display names from `AI_MODELS` config

**Modify Method**: `orchestrateMultiModel()` (around line 330-350)
- After loading base system prompt
- Build participant roles context using new method
- Store as variable for use in participant loop

**Modify Method**: `buildSystemPrompt()` (around line 408)
- Add parameters:
  - `participantRolesContext?: string` - the full roster
  - `currentModelName?: string` - this model's display name
- Inject participant roster after base prompt
- Add specific role instruction: "You are [ModelName] and must act as [Role] in this entire conversation."
- Structure:
  1. Base system prompt
  2. Participant roles context
  3. Current model identity + role
  4. Role guidance (if pre-defined role)
  5. Custom prompt (if provided)

**Modify**: Participant loop in `orchestrateMultiModel()` (around line 365)
- For each participant, resolve their model display name
- Pass `participantRolesContext`, `currentModelName`, and `role` to `buildSystemPrompt()`

#### Expected Result

**System Prompt for GPT-5 in 3-participant thread**:
```
[Original Roundtable collaborative prompt]

Participant roles in this conversation:
- GPT-5 acts as: Product Manager
- Claude 4.1 Sonnet acts as: Technical Architect
- Gemini 2.5 Pro acts as: UX Designer

You are GPT-5 and must act as Product Manager in this entire conversation.

[Optional custom prompt]
```

**Benefits**:
- Models understand team composition
- Can address specific roles: "As the Technical Architect, what's your take?"
- Creates organizational dynamics in discussions

#### Testing Checklist

- [ ] All participant roles visible in each model's system prompt
- [ ] Current model's specific role clearly identified
- [ ] Model names are display names, not IDs
- [ ] System prompt includes both roster and specific identity
- [ ] Works with 1, 2, 3+ participants

---

### Phase 4: Memory Injection (HIGH PRIORITY)

**Objective**: Inject thread memories into system prompts

#### Handler Changes

**File**: `src/api/routes/chat/handler.ts`

**Add Helper Function**: `buildMemoryContext()` (around line 700)
- Input: Array of memory objects
- Output: Formatted string with all memory content
- Format:
  ```
  Context about the user:
  [Personal Context] Project Name: Project description content here
  [Topic Context] Technical Constraints: Constraint content here
  [Instruction] Coding Style: Instruction content here
  ```
- Type prefixes: personal, topic, instruction, fact
- Return undefined if no memories

**Method**: `sendMessageHandler` (around line 735)
- After fetching thread data
- Fetch thread-specific memories:
  - Query `chat_thread_memory` where `thread_id = threadId`
  - Include related `memory` object
- Fetch global memories:
  - Query `chat_memory` where `user_id = userId` AND `is_global = true`
- Combine both arrays
- Build memory context string using helper function

**Method**: `sendMessageHandler` (around line 820)
- Pass `memoryContext` to `orchestrateMultiModel()` call
- Add as parameter alongside systemPrompt

**Schema Changes**: `src/api/routes/chat/schema.ts`
- Thread creation schema already supports `memoryIds?: string[]`
- No changes needed

#### Service Layer Changes

**File**: `src/api/services/openrouter.service.ts`

**Modify Method**: `orchestrateMultiModel()` (around line 292)
- Add parameter: `memoryContext?: string`

**Modify**: System prompt construction (around line 330)
- After loading base system prompt
- If `memoryContext` provided, append: `${baseSystemPrompt}\n\n${memoryContext}`
- Memory context goes AFTER base prompt, BEFORE participant roles

#### Database Queries

**Thread Memories**:
```
Location: src/api/routes/chat/handler.ts (around line 735)
Query: chat_thread_memory with memory relation
Filter: threadId = current thread
Result: Array of memory objects
```

**Global Memories**:
```
Location: Same as above
Query: chat_memory table
Filter: userId = current user AND isGlobal = true
Result: Array of memory objects
```

#### Expected Prompt Structure

```
[Base Roundtable Prompt]

Context about the user:
[Personal Context] SaaS Project: Building a B2B platform for healthcare compliance...
[Instruction] Code Style: Always use TypeScript strict mode and functional patterns...

Participant roles in this conversation:
- GPT-5 acts as: CEO
- Claude 4.1 Sonnet acts as: CFO

You are GPT-5 and must act as CEO in this entire conversation.
```

#### Testing Checklist

- [ ] Thread-specific memories loaded when attached
- [ ] Global memories loaded for all threads
- [ ] Memory content appears in system prompt
- [ ] Multiple memories formatted correctly
- [ ] Type prefixes shown (Personal Context, Topic Context, etc.)
- [ ] Models reference memory context in responses
- [ ] Threads without memories work normally

---

### Phase 5: Context Window Expansion (MEDIUM PRIORITY)

**Objective**: Increase conversation history from 10 to 50+ messages

#### Handler Changes

**File**: `src/api/routes/chat/handler.ts`

**Add Configuration Constant** (top of file, around line 50):
```
CONTEXT_WINDOW_SIZE = 50  // Or make configurable per model based on context limits
```

**Method**: `sendMessageHandler` (around line 755)
- Change `limit: 10` to `limit: CONTEXT_WINDOW_SIZE`
- Same for `streamChatHandler`

**Method**: `sendMessageHandler` (around line 765)
- Update message fetching query
- Ensure proper ordering (oldest to newest)

#### Optional Enhancement: Smart Context Selection

**Future Consideration**: Instead of hard limit, use token-aware selection
- Calculate token budget based on model's context window
- Fetch all messages
- Intelligently truncate or summarize older messages
- Keep recent messages intact

**Implementation Notes**:
- Would require token counting utility
- Different models have different context limits (see `src/lib/ai/models-config.ts:metadata.contextWindow`)
- Could prioritize messages based on importance (user messages > assistant messages)

#### Testing Checklist

- [ ] Threads with 50+ messages maintain context
- [ ] No performance degradation with larger context
- [ ] Ordering preserved (oldest to newest)
- [ ] Both sendMessage and stream endpoints updated
- [ ] Monitor token usage and costs

---

## Complete System Prompt Example

**Scenario**:
- Thread: "Product Strategy Discussion"
- Participants:
  - GPT-5 (priority: 0, role: "CEO")
  - Claude 4.1 Sonnet (priority: 1, role: "CTO")
  - Gemini 2.5 Pro (priority: 2, role: "Designer")
- Memories:
  - Personal: "Building a healthcare SaaS platform. $5M Series A raised. 18-month runway."
  - Topic: "Must comply with HIPAA and SOC 2. Patient data encryption required."
- System Prompt: Default Roundtable prompt

**Expected Final Prompt for GPT-5**:

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
[Personal Context] Healthcare SaaS: Building a healthcare SaaS platform. $5M Series A raised. 18-month runway.
[Topic Context] Compliance: Must comply with HIPAA and SOC 2. Patient data encryption required.

Participant roles in this conversation:
- GPT-5 acts as: CEO
- Claude 4.1 Sonnet acts as: CTO
- Gemini 2.5 Pro acts as: Designer

You are GPT-5 and must act as CEO in this entire conversation.
```

**Expected Conversation Context for Claude (2nd to respond)**:

```
[
  { role: 'user', content: 'What's our go-to-market strategy for Q2?' },
  { role: 'assistant', content: 'GPT-5: As CEO, I believe we should focus on mid-sized hospitals first. They have the budget and the pain points we solve. I suggest a 90-day pilot program with 3-5 health systems to build case studies. We can leverage our Series A to fund white-glove onboarding.' }
]
```

**Claude's Response** (can now reference GPT-5):

```
Claude 4.1 Sonnet: I agree with GPT-5's focus on mid-sized hospitals, but from a technical perspective, we need to ensure our infrastructure can handle HIPAA-compliant data isolation before we onboard multiple health systems. I recommend we implement tenant isolation and get our SOC 2 Type II certification in parallel with the pilot program. This might delay the timeline by 30 days but reduces legal and reputational risk.
```

---

## Implementation Checklist

### Phase 1: System Prompts (Week 1)

**Database**
- [ ] Create `src/db/tables/system-prompts.ts` with schema
- [ ] Update `src/db/tables/chat.ts` to add `systemPromptId` to `chatThread`
- [ ] Run `pnpm db:generate` to create migration
- [ ] Review generated SQL migration file
- [ ] Run `pnpm db:migrate:local` to apply migration
- [ ] Verify default prompt exists in database: `SELECT * FROM system_prompt WHERE is_default = 1;`

**Service Layer**
- [ ] Add `getDefaultSystemPrompt()` method to `openrouter.service.ts`
- [ ] Update `orchestrateMultiModel()` to accept `systemPrompt` parameter
- [ ] Modify `buildSystemPrompt()` to use provided base prompt
- [ ] Remove or deprecate mode-based prompt generation

**Handler Layer**
- [ ] Add system prompt fetching logic in `sendMessageHandler` (after thread fetch)
- [ ] Load thread's system prompt OR default prompt
- [ ] Pass systemPrompt to `orchestrateMultiModel()` call
- [ ] Apply same changes to `streamChatHandler`

**Testing**
- [ ] Create test thread, verify default prompt is used
- [ ] Check AI responses use collaborative language
- [ ] Test with custom system prompt (create one in DB manually)
- [ ] Verify inactive prompts are not loaded

### Phase 2: Model Attribution (Week 1)

**Service Layer**
- [ ] Import `AI_MODELS` from `src/lib/ai/models-config.ts`
- [ ] Modify message context building in `orchestrateMultiModel()`
- [ ] Add logic to prefix assistant messages with model names
- [ ] Update current round response accumulation to use model names

**Handler Layer**
- [ ] Ensure messages fetched with participant relation
- [ ] Verify `participantId` is passed to service
- [ ] No schema changes needed (already has participant reference)

**Testing**
- [ ] Send message with 2 participants
- [ ] Check logs/debug output for message context
- [ ] Verify messages show "GPT-5: ..." format
- [ ] Test if models reference each other by name in responses

### Phase 3: Role Roster Visibility (Week 1)

**Service Layer**
- [ ] Add `buildParticipantRolesContext()` helper method
- [ ] Update `buildSystemPrompt()` signature to accept participant context
- [ ] Add current model name and role identity injection
- [ ] Modify participant loop to pass roster and identity

**Testing**
- [ ] Create thread with 3 participants, different roles
- [ ] Check system prompt includes full roster
- [ ] Verify each model sees "You are [ModelName] and must act as [Role]"
- [ ] Test role-based interactions (models referencing each other's roles)

### Phase 4: Memory Injection (Week 2)

**Handler Layer**
- [ ] Add `buildMemoryContext()` helper function
- [ ] Fetch thread-specific memories in `sendMessageHandler`
- [ ] Fetch global memories for user
- [ ] Combine memories and build context string
- [ ] Pass `memoryContext` to `orchestrateMultiModel()`
- [ ] Apply to `streamChatHandler`

**Service Layer**
- [ ] Update `orchestrateMultiModel()` to accept `memoryContext` parameter
- [ ] Inject memory context after base prompt, before roles

**Testing**
- [ ] Create test memories (1 personal, 1 topic)
- [ ] Attach to thread
- [ ] Send message, verify memories in system prompt
- [ ] Test global memories (should appear in all threads)
- [ ] Test thread without memories (should work normally)
- [ ] Verify models use memory context in responses

### Phase 5: Context Window (Week 2)

**Handler Layer**
- [ ] Add `CONTEXT_WINDOW_SIZE` constant (set to 50)
- [ ] Update message fetch limit in `sendMessageHandler`
- [ ] Update message fetch limit in `streamChatHandler`

**Testing**
- [ ] Create thread with 50+ messages
- [ ] Send new message
- [ ] Verify context includes up to 50 previous messages
- [ ] Monitor performance (query time, token usage)

### Final Validation (Week 2)

**End-to-End Test**
- [ ] Create thread with:
  - 3 participants (GPT-5 as CEO, Claude as CTO, Gemini as Designer)
  - 2 memories attached (project context + technical constraints)
  - Default Roundtable system prompt
- [ ] Send message: "What should our technical architecture look like?"
- [ ] Verify all 3 models respond sequentially
- [ ] Check GPT-5's response uses collaborative language
- [ ] Check Claude references GPT-5 by name
- [ ] Check Gemini synthesizes both previous responses
- [ ] Verify all models reference memory context (project/constraints)
- [ ] Verify all models demonstrate role-appropriate perspectives

**Code Quality**
- [ ] Run `pnpm check-types` - no errors
- [ ] Run `pnpm lint` - no errors
- [ ] Run `pnpm lint:fix` for auto-fixable issues

**Performance**
- [ ] Monitor API response times (should be <5s for 3-model orchestration)
- [ ] Check database query performance (use `EXPLAIN` for slow queries)
- [ ] Monitor token usage (memory injection will increase tokens)

**Documentation**
- [ ] Update API documentation with new systemPromptId field
- [ ] Document memory injection behavior
- [ ] Add examples to API docs showing collaborative responses

---

## File Reference Guide

### Files to Create

| File | Purpose |
|------|---------|
| `src/db/tables/system-prompts.ts` | System prompt schema definition |
| Migration file (auto-generated) | Database schema changes + default prompt insert |

### Files to Modify

| File | Location | Changes |
|------|----------|---------|
| `src/db/tables/chat.ts` | Line ~40-80 | Add `systemPromptId` column to `chatThread` |
| `src/api/services/openrouter.service.ts` | Line ~292-400 | Update `orchestrateMultiModel()` method |
| `src/api/services/openrouter.service.ts` | Line ~408-468 | Update `buildSystemPrompt()` method |
| `src/api/services/openrouter.service.ts` | Line ~520+ | Add helper methods (getDefaultSystemPrompt, buildParticipantRolesContext) |
| `src/api/services/openrouter.service.ts` | Line ~336-375 | Add model name prefixing to message context |
| `src/api/routes/chat/handler.ts` | Line ~700-750 | Add helper functions (buildMemoryContext) |
| `src/api/routes/chat/handler.ts` | Line ~735-790 | Update `sendMessageHandler` with fetching logic |
| `src/api/routes/chat/handler.ts` | Line ~820-830 | Update orchestration call with new parameters |
| `src/api/routes/chat/handler.ts` | Line ~854-949 | Update `streamChatHandler` with same changes |
| `src/lib/ai/models-config.ts` | Import only | Import `AI_MODELS` in service for name lookups |

### Files to Reference (No Changes)

| File | Purpose |
|------|---------|
| `src/lib/ai/models-config.ts` | Model display names, capabilities, metadata |
| `src/db/tables/chat.ts` | Memory schema, participant schema |
| `docs/backend-patterns.md` | Follow established patterns |

---

## Key Architectural Decisions

### Why Store System Prompts in Database?

**Benefits**:
- Audit trail: Know exactly what prompt was used for any message
- Versioning: Update prompts without code deployments
- A/B testing: Try different prompts for different user segments
- Customization: Allow users to create custom prompts (future feature)
- Reproducibility: Debug issues by seeing exact context

**Trade-off**: Adds database query overhead, but negligible compared to AI API calls

### Why Prefix with Model Names vs Role Names?

**Model Names Are Better Because**:
- Unique: "GPT-5" is clearer than "CEO" when you have multiple roles
- Recognizable: Users know model capabilities and can associate responses
- Enables meta-discussion: "GPT-5 tends to be more optimistic while Claude is more cautious"

**Role Names Alone**:
- Could cause confusion if multiple participants have same role
- Doesn't help users understand which AI provided which perspective

**Hybrid Approach**: Could use both: "GPT-5 (CEO): ..." but adds token overhead

### Why Inject Memories into Every Request?

**Alternative Considered**: Store memories in conversation history as system messages
- **Problem**: Would pollute message history
- **Problem**: Hard to update if memories change
- **Problem**: Token overhead compounds over time

**Chosen Approach**: Inject at system prompt level
- **Benefit**: Clean separation of concerns
- **Benefit**: Easy to update without changing history
- **Benefit**: Models always see latest memory content

### Why Increase Context Window to 50?

**Old Roundtable Used**: No limit (full conversation)

**Trade-offs**:
- More context = better model understanding
- More context = higher token costs
- More context = slower response times (more tokens to process)

**50 Messages Rationale**:
- Typical conversation: 20-30 messages
- 50 gives comfortable buffer for long discussions
- Most models have 128K+ context windows (50 messages ~= 10-20K tokens with overhead)
- Can optimize later with smart summarization

---

## Performance Considerations

### Token Usage Impact

**Before Changes**:
- System prompt: ~200 tokens (mode-based)
- Message context (10 messages): ~2,000 tokens
- Total per model: ~2,200 tokens

**After Changes**:
- System prompt base: ~350 tokens (Roundtable prompt)
- Memories: ~500 tokens (2 memories)
- Participant roles: ~100 tokens (3 participants)
- Message context (50 messages with model names): ~12,000 tokens
- Total per model: ~13,000 tokens

**Cost Increase**: ~6x token usage per request
- Mitigated by: Better results, fewer retry messages, higher user satisfaction
- Monitor: Usage tracking service already in place

### Database Query Optimization

**Current Queries Per Request**:
1. Fetch thread (with participants)
2. Fetch messages (limit 10)

**After Changes**:
1. Fetch thread (with participants)
2. Fetch system prompt
3. Fetch thread memories (with junction table join)
4. Fetch global memories
5. Fetch messages (limit 50)

**Optimization Strategies**:
- Use single query with multiple joins where possible
- Add database indexes on frequently queried fields (already in place)
- Consider caching system prompts (default prompt changes rarely)
- Consider caching global memories per user (invalidate on memory update)

### Caching Opportunities

**System Prompts**:
- Default prompt can be cached in-memory (changes extremely rarely)
- Custom prompts can use short TTL cache (user-specific)

**Memories**:
- Global memories per user can be cached with invalidation on update
- Thread-specific memories loaded per-thread (no caching needed)

**Model Configurations**:
- Already loaded from static config (`AI_MODELS`) - no database overhead

---

## Migration Risks & Mitigation

### Risk 1: Breaking Existing Threads

**Risk**: Old threads don't have systemPromptId, may break

**Mitigation**:
- Make `systemPromptId` nullable in schema
- Default to loading default prompt if null
- No changes to existing thread records needed
- Backwards compatible

### Risk 2: Memory Injection Performance

**Risk**: Fetching memories on every request may slow down API

**Mitigation**:
- Benchmark memory fetching queries
- Add indexes on `user_id`, `thread_id`, `is_global`
- Consider query result caching with short TTL
- Most threads will have 0-3 memories (fast query)

### Risk 3: Token Costs Spike

**Risk**: 6x token usage could significantly increase costs

**Mitigation**:
- Monitor usage metrics closely after deployment
- Can reduce context window if needed (50 → 30)
- Can truncate very long memories (implement max length)
- Quota system already enforces per-user limits

### Risk 4: Model Name Prefixing Confuses Models

**Risk**: Some models might interpret "GPT-5: " as part of response format

**Mitigation**:
- System prompt explicitly says: "DO NOT prefix your answer with any identifier"
- Test with all configured models after implementation
- Can adjust format if needed ("Response from GPT-5:" instead of "GPT-5:")

### Risk 5: Database Migration Failure

**Risk**: Migration fails on production database

**Mitigation**:
- Test migration thoroughly on local database
- Test on preview environment before production
- Migration is additive only (no data loss risk)
- Can rollback by dropping new table and column

---

## Success Metrics

### How to Know It's Working

**Qualitative Indicators**:
- [ ] Models explicitly reference each other: "As GPT-5 mentioned..."
- [ ] Models challenge each other's ideas: "I disagree with Claude's approach because..."
- [ ] Models synthesize previous responses: "Building on both GPT-5's and Gemini's points..."
- [ ] Models reference memory context: "Given your constraint of HIPAA compliance..."
- [ ] Conversations feel collaborative, not parallel

**Quantitative Metrics**:
- [ ] Cross-references per response: Target 30%+ of responses mention another model
- [ ] Memory context usage: Target 40%+ of responses reference memory when attached
- [ ] Role adherence: Models demonstrate role-appropriate perspectives
- [ ] User satisfaction: Survey users on collaboration quality
- [ ] Conversation depth: Average messages per thread (expect increase)

### Monitoring & Logging

**Add Logging**:
- Log system prompt used per message (for debugging)
- Log memory IDs attached per thread
- Log participant roster per orchestration
- Log token usage per model (already tracked)

**Dashboards**:
- Monitor average tokens per request (watch for unexpected spikes)
- Track memory attachment rate (% of threads with memories)
- Monitor API latency (should stay under 5s for 3 models)

---

## Future Enhancements (Post-Migration)

### Enhancement 1: System Prompt Templates

**Concept**: Allow users to create and select different system prompt templates
- "Formal Business Discussion"
- "Creative Brainstorming"
- "Technical Deep Dive"
- "Debate Mode"

**Implementation**:
- System prompts table supports custom prompts (created_by_id field)
- Add UI for prompt selection at thread creation
- Pre-populate with several templates beyond default Roundtable

### Enhancement 2: Smart Memory Relevance

**Concept**: Only inject most relevant memories instead of all
- Use embeddings to find relevant memories based on user message
- Reduce token overhead for users with many memories
- Still inject global memories always

**Implementation**:
- Add embeddings column to `chat_memory` table
- Generate embeddings on memory creation (OpenAI embedding API)
- Vector similarity search before message send
- Inject top 3 most relevant + all global

### Enhancement 3: Conversation Summaries

**Concept**: Automatically summarize conversations older than 30 messages
- Keep recent 30 messages intact
- Summarize older messages into concise context
- Reduces token usage while maintaining continuity

**Implementation**:
- When context > 30 messages, take first N-30 messages
- Generate summary using fast model (GPT-4o-mini)
- Inject as system message: "Previous conversation summary: ..."
- Keep last 30 messages as full context

### Enhancement 4: Dynamic Participant Management

**Concept**: Add/remove participants mid-conversation
- User adds new expert to discussion
- Participant can be disabled without deletion

**Current State**: Already supported! `is_enabled` field on participants
**Needed**: UI to toggle participants, update participant endpoint

### Enhancement 5: Conversation Branching

**Concept**: Allow users to branch conversations at any point
- Take conversation up to message X
- Create new branch with different participants or prompts
- Compare different approaches

**Implementation**:
- Add `parent_thread_id` to `chat_thread`
- Add `branched_from_message_id` to track branch point
- Copy messages up to branch point
- Continue with new configuration

---

## Conclusion

### What You're Building

You're not just adding features—you're restoring the **collaborative intelligence** that made Roundtable unique. The current system has all the right components; they just need to be connected in the right way.

**The Core Insight**: AI models are smarter together when they can actually "see" and reference each other, understand their roles in the team, and work with shared context about the user's goals.

### Implementation Timeline

**Week 1: Foundation**
- Database migration (system prompts table)
- System prompt loading and injection
- Model name prefixing
- Role roster visibility

**Week 2: Context & Polish**
- Memory injection pipeline
- Context window expansion
- End-to-end testing
- Performance optimization

**Total: 10-12 days** of focused development

### The Payoff

After these changes, your platform will create genuinely collaborative AI discussions where:
- Models build on each other's ideas naturally
- Users get multi-perspective analysis with organic synthesis
- Conversations maintain context across sessions through memories
- AI teams work together like human teams, with roles and collaboration

This is the unique value proposition that differentiates Roundtable from simple multi-model chat tools.

---

## Quick Reference: Key Changes Summary

| Component | Current State | Required Change | Priority |
|-----------|---------------|-----------------|----------|
| **System Prompt** | Generic mode-based | Original Roundtable collaborative prompt | CRITICAL |
| **Message Attribution** | No model names | Prefix with "ModelName: response" | CRITICAL |
| **Role Visibility** | Individual roles | Show full participant roster | CRITICAL |
| **Memory Injection** | Stored but unused | Inject into system prompts | HIGH |
| **Context Window** | 10 messages | 50 messages | MEDIUM |

**Total Estimated LOC Changes**: ~300 lines (mostly additions, minimal deletions)

**Files Modified**: 4 core files + 1 new schema file + 1 migration file

**Breaking Changes**: None (fully backwards compatible)

**Performance Impact**: 6x token usage, +2 database queries per request (acceptable for value gained)

---

*End of Migration Guide*
