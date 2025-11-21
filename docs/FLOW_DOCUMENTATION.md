# Roundtable Chat Journey Documentation
## Non-Technical Flow Analysis for Product Managers and QA Teams

---

## OVERVIEW: THE CHAT EXPERIENCE

Roundtable enables users to create conversations where multiple AI models collaborate to answer questions. Each conversation consists of "rounds" - a complete cycle of user question → AI responses → optional analysis.

---

## PART 1: STARTING A NEW CHAT (OVERVIEW SCREEN)

### Landing on `/chat`

**What User Sees:**
- Large Roundtable logo with animated background
- Three quick-start suggestion cards showing:
  - Example question titles
  - Conversation mode badges (Debate, Analyze, Brainstorm, Problem Solve)
  - AI model avatars with assigned roles
- Large input box at bottom with toolbar buttons

### Configuring the Chat

**Selecting AI Models (Click "AI Models" button):**
- Popover opens showing available AI models grouped by subscription tier
- Free tier: Access to 2 cheapest models
- Pro tier: Access to flagship models like GPT-4, Claude
- Power tier: Access to all 200+ models
- Locked models show "Upgrade Required" badges
- Selected models appear as chips below the input box
- Drag handles allow reordering (determines who responds first)

**Assigning Roles (Optional):**
- Click "+ Role" button next to any selected model
- Choose from default roles (Critic, Advocate, Analyst) or create custom
- Each model gets a role badge (e.g., "The Ideator", "Devil's Advocate")
- Custom roles can only be used by one model at a time

**Choosing Mode:**
- Brainstorming: Creative idea generation
- Analyzing: In-depth examination
- Debating: Contrasting viewpoints
- Problem Solving: Finding solutions

### Submitting First Message

**User Action:** Types question and clicks send (or presses Enter)

**What Happens:**
1. Input clears immediately
2. Welcome screen fades out
3. User's message appears at top
4. First AI starts responding (text streams word-by-word)
5. **URL stays at `/chat`** during entire first round
6. **After analysis completes**: Automatic navigation to `/chat/[unique-slug]` (full page transition)

**Behind the Scenes:**
- System creates conversation record in database
- Generates permanent URL slug from question
- Sets temporary title "New Chat" (replaced with AI-generated title in 2-5 seconds)
- Checks user hasn't exceeded monthly conversation quota
- Validates selected models are available on user's subscription tier
- Assigns Round 1 to all messages

---

## PART 2: WEB SEARCH FUNCTIONALITY

> **Terminology Note**: In the codebase, this feature is called "pre-search" (database: `chatPreSearch`, API: `/pre-search`) but is displayed to users as "Web Research" or "Web Search". The "pre" prefix refers to the timing (search happens BEFORE participants respond), not frequency - web search executes on EVERY round when enabled, not just the first round.

### Web Search Overview

**When Enabled:** Users can enable "Web Search" toggle before submitting questions
**Purpose:** Execute web search BEFORE AI participants respond, providing search results as context
**Impact:** Adds 8-12 second delay before participant streaming begins
**Frequency:** Executes on EVERY round when enabled (not just initial round)

### Pre-Search Flow

**What User Sees:**
1. User enables "Web Search" toggle in chat interface
2. User types question and clicks send
3. Loading indicator shows "Searching the web..." or "Gathering information..."
4. Pre-search card appears showing:
   - Generated search query with rationale
   - Individual search results streaming in (title, URL, snippet)
   - Search statistics (number of results, time taken)
5. After pre-search completes, participant streaming begins

**Behind the Scenes:**
1. **Thread creation** creates PENDING pre-search record in database (Round 1)
2. **Frontend detects** PENDING status via orchestrator
3. **Pre-search endpoint** receives request, updates status to STREAMING
4. **AI generates** optimized search query from user's question
5. **Web search executes** with AI-determined parameters
6. **Results stream** to frontend via Server-Sent Events (SSE)
7. **Database updated** with search results, status → COMPLETED
8. **Pre-search message created** with search results for AI context
9. **Participant streaming begins** (all AIs receive search context)

### Critical Timing Behavior

**🚨 BLOCKING OPERATION:**
- Pre-search MUST complete before participant streaming starts
- Store subscription checks pre-search status before allowing streaming
- If pre-search status is PENDING or STREAMING, participant streaming is blocked
- Only when status is COMPLETED or FAILED will participant streaming proceed

**Status Transitions:**
```
PENDING (created during thread creation)
  ↓
STREAMING (when pre-search endpoint called)
  ↓
COMPLETED (search results saved) OR FAILED (error occurred)
  ↓
Participant streaming allowed to start
```

**Timeout Protection:**
- ✅ ADDED: 10-second timeout for changelog/pre-search waiting
- If pre-search hangs, system proceeds after timeout to prevent permanent blocking

### Search Context Distribution

**Current Round (where pre-search executed):**
- ALL participants receive full search results with website content
- Search context included in system prompt before AI responses

**Previous Rounds:**
- Summary/analysis of search results only (prevents context bloat)
- Full website content NOT included for historical rounds

### Pre-Search in Subsequent Rounds

**When user submits additional messages with web search enabled:**
1. Calculate next round number
2. Execute new pre-search for that round
3. Block participant streaming until new pre-search completes
4. Each round gets independent pre-search results

**Round Number Calculation:**
- ✅ FIXED: Uses `getCurrentRoundNumber(messages) + 1` (single source of truth)
- Previously had mismatch between provider and store calculations

### Error Handling

**Pre-Search Failures:**
- Status updates to FAILED
- Error message stored in database
- Participant streaming proceeds anyway (search failure non-blocking after completion)
- Users see error message but conversation continues

**Network Issues:**
- Pre-search timeout prevents permanent blocking
- User can continue without search results if timeout reached

### Database Records

**Pre-Search Table:**
- `id` - Unique identifier
- `threadId` - Associated conversation
- `roundNumber` - Which round the search belongs to
- `userQuery` - Original user question
- `status` - PENDING | STREAMING | COMPLETED | FAILED
- `searchData` - JSON with query, results, statistics
- `createdAt` - Timestamp

**Pre-Search Message:**
- Created with role='assistant' but NO participantId
- Contains search results for AI context
- Filtered out from participant message counts in analysis

---

## PART 3: AI RESPONSES STREAMING

### Sequential Response Flow

**What User Sees:**
- **Loading indicator** appears with animated dots
- **Rotating messages**: "Consulting the hivemind...", "Summoning digital wisdom...", etc.
- **First AI responds**:
  - Model name and role appear
  - Pulsing indicator shows active streaming
  - Text appears word-by-word
- **Second AI responds**: Sees first AI's response in context
- **Third AI responds**: Sees both previous responses
- Process continues until all selected AIs finish

**Behind the Scenes:**
- Frontend orchestrates sequential calls (not parallel)
- Each AI receives full conversation history including prior responses in same round
- System saves each response to database as it completes
- Tracks token usage for billing
- User's message count increments toward quota

**Stop Button:**
- Red square icon replaces send button during streaming
- Clicking stops all remaining participants immediately
- Partial responses are saved

### Visual States During Streaming

- **Thinking**: Pulsing dot with "thinking" animation
- **Streaming**: Text appearing character by character
- **Completed**: Full message visible, no indicators
- **Error**: Red dot with error details

---

## PART 3.5: STREAM COMPLETION DETECTION (CLOUDFLARE KV)

### Overview

**What It Is:** Lightweight system to detect when AI responses complete during page reloads
**What It's NOT:** Full stream resumption with mid-stream reconnection
**Storage:** Cloudflare KV (eventually consistent, 1-hour TTL)
**Compatibility:** ✅ SAFE with abort/stop functionality (no conflicts)

### How It Works

**Stream Lifecycle Tracking:**
```
1. Backend marks stream as ACTIVE in KV when participant starts
2. Frontend receives normal SSE stream (no buffering)
3. Backend marks stream as COMPLETED when participant finishes
4. On page reload: Frontend checks KV status
5. If completed: Fetch final message from database
```

**What User Experiences:**

**Normal Flow (no reload):**
- User sees AI response streaming word-by-word
- Response completes and saves to database
- No status checks needed - everything in-memory

**Page Reload During Streaming:**
- User refreshes page while AI is responding
- Frontend loads thread and checks for active streams
- If stream completed: Shows completed message from database
- If stream still active: Shows loading indicator until complete
- Partial progress lost (no mid-stream resumption)

**Behind the Scenes:**

**Stream Status Endpoint:**
```
GET /api/v1/chat/threads/:threadId/streams/:streamId

Responses:
- 204 No Content: No stream exists or still streaming
- 200 OK: Stream completed/failed (includes metadata)
```

**Stream ID Format:**
```
{threadId}_r{roundNumber}_p{participantIndex}

Example: thread_abc123_r0_p0 (Round 0, Participant 0)
```

**KV Storage:**
```typescript
{
  threadId: "thread_abc123",
  roundNumber: 0,
  participantIndex: 0,
  status: "active" | "completed" | "failed",
  messageId: "thread_abc123_r0_p0" (when completed),
  createdAt: "2025-01-19T10:00:00Z",
  completedAt: "2025-01-19T10:00:15Z" (when completed),
  errorMessage: "..." (if failed)
}
```

### Key Differences from Full Resumption

**This Implementation (Stream Completion Detection):**
- ✅ Detects when streams finish during page reload
- ✅ Works with Cloudflare KV (eventually consistent)
- ✅ Compatible with stop/abort functionality
- ✅ Simple and reliable
- ❌ Doesn't resume mid-stream (loses partial progress)
- ❌ Doesn't buffer chunks

**Full Resumption (NOT Implemented):**
- ✅ Can resume from checkpoint mid-stream
- ✅ Preserves partial progress
- ❌ Requires Redis with pub/sub
- ❌ Incompatible with abort/stop (browser abort breaks resumption)
- ❌ Complex error handling
- ❌ Not suitable for KV (eventually consistent)

### Why This Approach?

**Cloudflare KV Limitations:**
- Eventually consistent (not strongly consistent like Redis)
- No pub/sub mechanism for real-time updates
- Better suited for status tracking than chunk buffering

**Trade-offs Accepted:**
- Lose partial progress on page reload (acceptable for 5-15s responses)
- Simpler implementation (no chunk buffering complexity)
- No abort conflicts (critical for UX - users need stop button)

### Stop Button Compatibility

**✅ NO CONFLICTS** - This implementation does NOT use `useChat({ resume: true })`

**Why No Conflict:**
```typescript
// Our implementation (streaming.handler.ts:410-425)
const { messages, stop } = useChat({
  id: threadId,
  transport,
  // ✅ NO resume: true - default is false
  // ✅ Stop button works perfectly
  // ✅ Page reload detection via KV status checks
});
```

**Official AI SDK Warning (Does Not Apply):**
> "Stream resumption is not compatible with abort functionality. Closing a tab triggers abort signal that breaks resumption."

**Our Status:** ✅ SAFE - We don't use resumption, so no abort conflict exists

### Error Handling

**Stream Failures:**
- Status updates to `failed` in KV
- Error message stored for debugging
- Frontend shows error state to user
- Retry button available for entire round

**Network Issues:**
- Page reload loses in-flight stream
- User sees loading until stream completes or timeout
- Completed messages always recoverable from database

**Timeout Protection:**
- KV entries expire after 1 hour
- Prevents stale status from blocking future rounds
- Graceful degradation if KV unavailable

### Implementation Files

**Backend:**
- `src/api/routes/chat/handlers/streaming.handler.ts:625-817` - Stream lifecycle tracking
- `src/api/routes/chat/handlers/stream-status.handler.ts` - Status check endpoint
- `src/api/services/resumable-stream-kv.service.ts` - KV operations

**Frontend:**
- `src/hooks/utils/use-multi-participant-chat.ts` - Stream orchestration (NO resume:true)
- Status checks happen via normal database queries (no special polling)

**API Routes:**
- `POST /api/v1/chat` - Streaming endpoint (marks streams active/completed)
- `GET /api/v1/chat/threads/:threadId/streams/:streamId` - Status check

### Testing

**Scenarios Covered:**
- Normal streaming without reload
- Page reload during streaming
- Stream completion detection
- Multiple concurrent streams
- Error state handling
- Stop button interaction

**Test Files:**
- Stream lifecycle tracking tested in integration tests
- No special "resumption" tests needed (we don't resume)

---

## PART 4: ROUND ANALYSIS

### Analysis Trigger

**When It Happens:** After the LAST selected AI completes response (automatic)

**What User Sees:**
1. **Loading changes**: "Analyzing responses..." or "Synthesizing insights..."
2. **Analysis card appears** below all responses with expandable accordion
3. **Progressive streaming** (5 sections appear in order):

   **Section 1: Leaderboard**
   - Rankings of all participants (1st, 2nd, 3rd...)
   - Trophy/medal icons for top 3
   - Scores out of 10 for each model
   - Color-coded progress bars (green for high scores)

   **Section 2: Skills Comparison Chart**
   - Pentagon/radar chart showing 5 skill dimensions
   - Different colored lines for each participant
   - Skills vary by mode:
     - Brainstorming: Creativity, Diversity, Practicality
     - Analyzing: Analytical Depth, Evidence, Objectivity
     - Debating: Argument Strength, Logic, Persuasiveness

   **Section 3: Individual Participant Cards**
   - One card per AI model
   - **Strengths**: Green checkmarks with 2-3 pros
   - **Areas for Improvement**: Orange warnings with 1-2 cons
   - **Summary**: Overall assessment paragraph

   **Section 4: Overall Summary**
   - 2-3 paragraph synthesis of the round
   - Group dynamics and patterns

   **Section 5: Conclusion**
   - Final recommendations
   - Key takeaways

**Behind the Scenes:**
- System uses fast AI model (GPT-4o) to generate analysis
- Analysis considers conversation mode (Debate analysis differs from Brainstorming)
- Creates structured data with scores, ratings, and text
- Saves to database linked to specific round number

### After First Round Completes

**Automatic Navigation** - Once the moderator analysis completes and AI-generated title is ready, the page automatically navigates from `/chat` to `/chat/[slug]`. This transitions from ChatOverviewScreen to ChatThreadScreen, where the user can continue the conversation by typing another message.

---

## PART 5: THREAD DETAIL PAGE (CONTINUING CONVERSATION)

### Initial Page Load

**What User Sees:**
- Thread title in header
- All previous rounds displayed (grouped by round number)
- Each round shows:
  - User question
  - All AI responses
  - Analysis card (collapsed for older rounds)
  - Like/Dislike buttons for entire round
- Input box at bottom ready for next message

**Behind the Scenes:**
- System loads conversation details, messages, participants, analysis (ONE TIME)
- After initial load, ALL updates happen in browser memory (no server requests)
- Page refresh is only way to sync with server again
- This makes interface extremely fast

### Round Organization

**Visual Structure:**
```
Round 1:
  - User message
  - AI Response 1
  - AI Response 2
  - AI Response 3
  - Analysis (expandable)
  - Like/Dislike buttons

Round 2:
  - [Configuration Change Banner] ← only if changes made
  - User message
  - AI responses...
  - Analysis
  - Like/Dislike buttons
```

### Round Feedback

**Like/Dislike Buttons:**
- Apply to ENTIRE round (not individual messages)
- Green background when liked, red when disliked
- Click again to remove feedback
- Saves immediately to database

---

## PART 6: CONFIGURATION CHANGES MID-CONVERSATION

### Making Changes Between Rounds

**What User Can Change:**
- Add AI models (select more participants)
- Remove AI models (X button on chips)
- Reorder participants (drag and drop chips)
- Change roles (click role chip to edit)
- Switch conversation mode (click mode button)

**When Changes Apply:**
Changes save when user submits next message (not immediately).

### Configuration Change Banner

**When It Appears:** Before the round that uses new configuration

**What It Shows:**
- **Clock icon** + "Configuration changed"
- **Summary**: "2 added, 1 removed, 1 modified"
- **Expandable details**:
  - **Added** (green + icons): New models with avatars and roles
  - **Modified** (blue pencil icons): Role changes or reordering
  - **Removed** (red - icons): Deleted models with strikethrough

**Behind the Scenes:**
- System compares previous round's participants with current
- Detects additions, removals, role changes, reordering, mode changes
- Creates changelog entries tied to specific round number
- Saves all changes atomically (all succeed or all fail)

---

## PART 7: REGENERATING A ROUND

### When Available

**Only on the MOST RECENT round** - circular arrow button appears

### What Happens When User Clicks Retry

**Immediate Visual Changes:**
1. All AI responses from that round disappear
2. Analysis card disappears
3. Feedback buttons reset
4. Loading indicator appears

**Behind the Scenes:**
1. **Database cleanup**:
   - Deletes all AI messages from that round
   - Deletes analysis for that round
   - Deletes feedback for that round
   - Keeps user's original question
2. **Re-execution**:
   - All selected AIs generate completely fresh responses
   - Responses stream in same sequential order
   - New analysis generates after all AIs finish
   - Round number stays the same (maintains timeline)

**User Can Retry Multiple Times:** Button remains available after regeneration completes.

---

## PART 8: KEY BEHAVIORAL PATTERNS

### Round Number System

- **Round 1**: First question and responses
- **Round 2**: Second question and responses
- Each round is independent but builds on conversation history
- Round numbers never change (even during regeneration)

### Message Context Sharing

**Within Same Round:**
- First AI sees only user's question
- Second AI sees user's question + first AI's response
- Third AI sees user's question + both previous responses
- Each AI can reference earlier responses in their answer

**Across Rounds:**
- All AIs see complete history from all previous rounds
- System automatically includes relevant context from past discussion
- No need to repeat information - AIs remember

### Data Flow Pattern

**After Initial Page Load:**
- All state managed in browser (no constant server checks)
- Changes send to server in background
- No automatic refreshing (prevents data loss during active work)
- Full page refresh loads fresh data from server

---

## PART 9: TIMING AND PERFORMANCE

### Typical Round Duration
- Each AI response: 5-15 seconds
- Analysis generation: 8-12 seconds
- Full round (3 participants + analysis): ~20-40 seconds

### Response Behavior
- First token: ~800ms, then real-time streaming
- Transitions between participants: 200ms pause
- Analysis sections: 100ms stagger for smooth visual display

---

## PART 10: ERROR HANDLING USERS SEE

### AI Response Errors

**What User Sees:**
- Red dot indicator next to model name
- Error message: "Rate limit exceeded" or "Model failed to respond"
- Retry button (for entire round)
- Other participants continue normally

**Behavior:**
- One AI failure doesn't stop the round
- Remaining AIs still respond
- Round can complete with partial results
- User can retry entire round to regenerate all responses

### Analysis Errors

**What User Sees:**
- Red "Failed" badge on analysis card
- Error message details
- Retry button next to status

**Behavior:**
- Can retry analysis without regenerating AI responses
- Failed analysis doesn't prevent continuing conversation

---

## PART 11: SUBSCRIPTION TIER IMPACTS

### Free Tier
- 2 AI models max per conversation
- Access to cheapest models only (~15 models)
- 5 conversations per month
- 50 messages per month

### Pro Tier
- 5 AI models max per conversation
- Access to flagship models (GPT-4, Claude, Gemini)
- 100 conversations per month
- 500 messages per month

### Power Tier
- 10 AI models max per conversation
- Access to all 200+ models
- Unlimited conversations
- Unlimited messages

**Upgrade Prompts:**
- Locked models show required tier
- Reaching limits shows current usage + upgrade link
- Clear messaging: "Your Free plan allows 2 models. Upgrade to Pro for 5 models."

---

## PART 12: URL PATTERNS

### URL Transitions During Chat Journey

**✅ ACTUAL IMPLEMENTATION (January 2025):**

```
1. User lands on overview: /chat (ChatOverviewScreen)

2. User submits first message:
   - Thread created with auto-generated slug from message text
   - ChatOverviewScreen REMAINS MOUNTED during streaming
   - URL stays at /chat while streaming

3. Participant streaming happens:
   - All selected AI models respond sequentially
   - User sees responses streaming in real-time
   - Still on /chat, still ChatOverviewScreen

4. Analysis completes:
   - Moderator analysis finishes
   - Analysis status: COMPLETED
   - Streaming finishes completely

5. Slug polling (starts IMMEDIATELY on thread creation):
   - Frontend polls /api/v1/chat/threads/{id}/slug-status every 3s
   - Polling begins as soon as thread created (during streaming)
   - Checks isAiGeneratedTitle flag in background

6. When AI title ready (DURING or AFTER streaming):
   - Frontend uses window.history.replaceState to update URL - NO NAVIGATION
   - ChatOverviewScreen STAYS MOUNTED (no component unmount/mount)
   - URL bar updates to /chat/[ai-generated-slug] in background
   - User continues viewing streaming/first round
   - Sidebar updates with AI-generated title

7. When first analysis completes:
   - Frontend does router.push to /chat/[ai-generated-slug]
   - ChatOverviewScreen UNMOUNTS
   - ChatThreadScreen MOUNTS
   - Full navigation to thread detail page

8. Subsequent rounds: /chat/[slug] (ChatThreadScreen)
   - All future activity on thread detail page
   - No more URL changes
```

**Critical Implementation Details:**

**Slug Generation:**
1. **Initial Slug** - Created immediately from first message text
   - Generated during thread creation
   - Used for thread record in database
   - Format: sanitized-user-question-text + random suffix
   - Example: "say-hi-1-word-only-nzj311"

2. **AI-Generated Title & Slug** - Created asynchronously after analysis
   - Backend generates AI title after moderator analysis completes
   - Creates new slug from AI title
   - Updates database atomically (both title AND slug)
   - Timing: Typically 8-15 seconds (after analysis completes)

**URL Update Mechanism:**
```typescript
// Frontend implementation (overview-actions.ts:176)
window.history.replaceState(
  window.history.state,
  '',
  `/chat/${slugData.slug}`,
);
```

**Why This Approach:**
- Updates URL without triggering route change
- User stays on ChatOverviewScreen viewing first round
- No component unmount/mount - smooth experience
- URL reflects AI-generated title for sharing/bookmarking

**Polling Pattern:**
- Frontend polls `/api/v1/chat/threads/{id}/slug-status` every 3 seconds
- Polling starts IMMEDIATELY after thread creation:
  - Chat has started (showInitialUI = false)
  - Thread ID exists (createdThreadId)
  - Haven't detected AI title yet (hasUpdatedThreadRef = false)
- Checks `isAiGeneratedTitle: boolean` flag
- **Two-step process:**
  1. When AI title ready → Replace URL with window.history.replaceState (stay on overview) + **STOP POLLING**
  2. When analysis completes → Do router.push to thread detail page
- Polling stops immediately when AI title detected (not waiting for navigation)

**Timing Sequence:**
```
Thread created → Polling starts immediately →
Streaming (20-30s) → AI title ready (background) → URL replaced →
Analysis streaming (8-12s) → Analysis complete →
router.push to /chat/[slug]
```

**Edge Cases:**
- If title generation fails, keeps "New Chat" title and initial slug
- Silent failure (no error shown to user)
- User can continue conversation even without AI title
- Navigation happens automatically when title ready

**Slug Format:**
- Permanent URL created from AI-generated title
- Example: "debugging-react-state-issues"
- Sanitized, URL-safe, unique format

---

## PART 13: MOBILE VS DESKTOP

**Mobile:** Vertical chip stacking, horizontal scrolling, touch-friendly targets (44x44px), simplified metadata

**Desktop:** Horizontal chip display, full metadata, hover effects, precise drag-and-drop

---

## GLOSSARY

**Round:** One complete cycle of user question → all AI responses → optional analysis

**Participant:** An AI model selected to respond in the conversation

**Slug:** Permanent URL identifier for a conversation (e.g., "product-ideas-2024")

**Streaming:** Real-time display of text as it's generated (not all at once)

**Configuration:** The setup of participants, roles, and mode for a conversation

**Changelog:** Visual record showing what changed between rounds

**Analysis:** AI-generated evaluation comparing all participant responses

**Mode:** The type of conversation (Brainstorming, Analyzing, Debating, Problem Solving)

**Priority:** The order in which participants respond (0 = first)

---

## TECHNICAL NOTES FOR QA TEAMS

### Critical Test Scenarios

**Scenario 1: First Round Creation**
1. Land on `/chat` overview screen (ChatOverviewScreen)
2. Select 2-3 AI models with roles
3. Choose conversation mode
4. Submit first message
5. Verify URL stays at `/chat` during streaming
6. Verify all participants respond sequentially
7. Verify analysis generates after last participant
8. Verify automatic navigation to `/chat/[slug]` after analysis + AI title ready
9. Verify ChatThreadScreen loads at new URL

**Scenario 2: Multi-Round Conversation**
1. Complete Round 1 on thread detail page
2. Submit second message
3. Verify Round 2 messages appear
4. Verify analysis generates
5. Verify round numbers are consistent

**Scenario 3: Configuration Changes**
1. Complete Round 1
2. Add new participant or change mode
3. Submit next message
4. Verify "Configuration changed" banner appears
5. Verify banner shows correct changes
6. Verify new participant responds

**Scenario 4: Round Regeneration**
1. Complete a round
2. Click retry button (only on last round)
3. Verify old responses disappear
4. Verify new responses generate
5. Verify new analysis generates
6. Verify round number stays the same

**Scenario 5: Error Recovery**
1. Start round with multiple participants
2. Simulate error (network disconnect for one model)
3. Verify error message appears
4. Verify other participants continue
5. Verify round completes with partial results
6. Verify retry button allows full regeneration

### Edge Cases to Test
- Maximum message length (5,000 characters), subscription quota limits, page refresh during streaming
- Rapid send clicks (duplicate prevention), locked models (upgrade prompt), stop mid-stream
- Network interruptions, concurrent configuration changes

### Performance Benchmarks
- Time to Interactive: <1s | First token: ~800ms | Page transitions: <100ms
- AI responses: 5-15s | Analysis: 8-12s | Config changes: Instant (optimistic)

---

## PART 14: RACE CONDITION PROTECTION

### Overview

The chat overview screen orchestrates multiple async operations that must coordinate precisely:
- Thread creation → Streaming start
- Slug polling → URL updates
- Pre-search blocking → Participant streaming
- Analysis completion → Navigation trigger
- Stop button → In-flight message handling

**Critical Principle**: NO race condition can slip through. Each timing dependency has explicit guards and comprehensive test coverage.

---

### Race Condition Categories

#### **1. Thread Creation & Initialization**

**RACE 1.1: Thread ID Availability vs Streaming Start**
- **Risk**: Streaming starts before `createdThreadId` is set
- **Protection**: `setWaitingToStartStreaming(true)` defers streaming
- **Test**: Implicit in store subscription logic
- **Level**: HIGH - Store blocks streaming until conditions met

**RACE 1.2: Thread Init vs AI SDK Setup**
- **Risk**: `startRound()` callback not available when streaming checks
- **Protection**: Chat provider explicit sync pattern
- **Test**: Implicit in chat journey integration tests
- **Level**: HIGH - Blocking pattern with explicit waits

**RACE 1.3: Pre-Search Record Creation**
- **Risk**: Backend creates PENDING pre-search, frontend hasn't synced
- **Protection**: Orchestrator enabled at screen initialization
- **Test**: `orchestrator-presearch-sync-race.test.ts`
- **Level**: MEDIUM-HIGH - Query response time dependent

---

#### **2. Slug Polling & URL Updates**

**RACE 2.1: hasUpdatedThread Transition Timing**
- **Risk**: Navigation checks flag before slug update sets it TRUE
- **Protection**: State guard + React startTransition
- **Test**: `flow-controller-navigation-timing.test.ts:56-85`
- **Level**: HIGH - Explicit dependency guard

**RACE 2.2: queueMicrotask Ordering (URL Replace vs Router.Push)**
- **Risk**: router.push executes before history.replaceState
- **Result**: Wrong URL in address bar after navigation
- **Protection**: Separate `hasUpdatedThread` flag controls sequence
- **Test**: `flow-controller-navigation-timing.test.ts:33-54`
- **Level**: HIGH - Flag ordering guarantees precedence

**RACE 2.3: Polling Disabled Too Early**
- **Risk**: Polling stops but slug data never refreshed
- **Protection**: Slug cached in `aiGeneratedSlug` state
- **Test**: Implicit in web-search tests
- **Level**: MEDIUM - Assumes first slug response is stable

---

#### **3. Pre-Search Blocking**

**RACE 3.1: Orchestrator Sync Timing**
- **Timeline**:
  ```
  T0: Backend creates PENDING pre-search (in DB)
  T1: Frontend store: preSearches = [] (orchestrator not synced)
  T2: Streaming checks: shouldWaitForPreSearch(empty) → FALSE (WRONG!)
  T3: Participants stream (SHOULD HAVE WAITED!)
  T4: Orchestrator syncs: preSearches = [PENDING]
  ```
- **Protection**: Optimistic blocking - assume PENDING if web search enabled
- **Test**: `orchestrator-presearch-sync-race.test.ts:38-63`
- **Level**: MEDIUM - Orchestrator query response time dependent

**RACE 3.2: Missing Pre-Search Optimistic Wait**
- **Risk**: PATCH to create pre-search in flight when streaming checks
- **Protection**: Explicit await on PATCH completion
- **Test**: `orchestrator-presearch-sync-race.test.ts:80-120`
- **Level**: HIGH - Explicit blocking pattern

**RACE 3.3: Status Transition Race**
- **Risk**: Pre-search status updates on server, orchestrator cache stale
- **Protection**: Query invalidation on pre-search updates
- **Test**: `orchestrator-presearch-sync-race.test.ts:137-162`
- **Level**: MEDIUM - Query invalidation timing dependent

---

#### **4. Streaming Orchestration**

**RACE 4.1: Sequential Participant Coordination**
- **Risk**: `currentParticipantIndex` updates out of order
- **Protection**: Index increments sequentially, tested
- **Test**: `streaming-orchestration.test.ts:70-92`
- **Level**: HIGH - Index tracking verified

**RACE 4.2: Stop Button During Participant Switch**
- **Timeline**:
  ```
  T0: P0 complete, P1 starting
  T1: User clicks stop
  T2: stopStreaming() sets isStreaming = false
  T3: P1 message in flight from backend
  T4: P1 response arrives (should be ignored)
  ```
- **Protection**: `isStreaming` flag checked before message processing
- **Test**: `streaming-stop-button-race.test.ts:38-75`
- **Level**: MEDIUM - UI reflects stop, in-flight messages can arrive

**RACE 4.3: Analysis Trigger Timing**
- **Risk**: Analysis creation notification lost, flow never sees completion
- **Protection**: Callback + store subscription dual mechanism
- **Test**: `streaming-stop-button-race.test.ts:148-173`
- **Level**: HIGH - Explicit callback + subscription

---

#### **5. Navigation Timing**

**RACE 5.1: Analysis Completion Detection**
- **Detection Logic**:
  ```
  firstAnalysisCompleted =
    status === 'complete' OR
    (status === 'streaming' && elapsed > 60s) OR
    (status === 'pending' && !isStreaming && elapsed > 60s)
  ```
- **Protection**: Multi-layer detection with 60s timeout
- **Test**: `flow-controller-navigation-timing.test.ts:87-154`
- **Level**: HIGH - Timeout fallback prevents infinite blocking

**RACE 5.2: hasNavigated Flag Management**
- **Risk**: router.push fails but `hasNavigated` already TRUE (can't retry)
- **Protection**: `showInitialUI` reset clears `hasNavigated`
- **Test**: `flow-controller-navigation-timing.test.ts:156-169`
- **Level**: MEDIUM - Requires returning to /chat to recover

**RACE 5.3: Navigation During Component Unmount**
- **Risk**: router.push queued in microtask, component unmounts first
- **Protection**: useLayoutEffect ordering prevents navigation in cleanup
- **Test**: `navigation-unmount-safety.test.ts:33-56`
- **Level**: HIGH - useLayoutEffect runs before unmount effects

---

### Comprehensive Test Coverage Matrix

**Test File Approach**: All race condition tests use logic-focused approach without complex React mocking. Tests focus on state machine transitions, microtask ordering, and timing primitives directly.

| Race Category | Specific Test | File | Tests | Status |
|---|---|---|---|---|
| **Navigation Timing** | queueMicrotask ordering (URL replace vs router.push) | race-conditions-navigation-flow.test.ts | 2 | ✅ PASSING |
| | hasUpdatedThread flag coordination | race-conditions-navigation-flow.test.ts | 2 | ✅ PASSING |
| | Analysis completion detection (multi-layer + timeout) | race-conditions-navigation-flow.test.ts | 5 | ✅ PASSING |
| | Duplicate navigation prevention (hasNavigated flag) | race-conditions-navigation-flow.test.ts | 2 | ✅ PASSING |
| **Pre-Search Blocking** | Optimistic blocking (orchestrator not synced) | race-conditions-presearch-blocking.test.ts | 4 | ✅ PASSING |
| | Web search enabled/disabled conditions | race-conditions-presearch-blocking.test.ts | 2 | ✅ PASSING |
| | Status transitions (PENDING → STREAMING → COMPLETE) | race-conditions-presearch-blocking.test.ts | 2 | ✅ PASSING |
| | 10s timeout protection | race-conditions-presearch-blocking.test.ts | 3 | ✅ PASSING |
| | Round number isolation | race-conditions-presearch-blocking.test.ts | 2 | ✅ PASSING |
| | Concurrent status checks (consistency) | race-conditions-presearch-blocking.test.ts | 1 | ✅ PASSING |
| **Stop Button** | In-flight message handling after stop | race-conditions-stop-button.test.ts | 3 | ✅ PASSING |
| | Atomic state updates (isStreaming + index) | race-conditions-stop-button.test.ts | 2 | ✅ PASSING |
| | Analysis trigger prevention when stopped early | race-conditions-stop-button.test.ts | 3 | ✅ PASSING |
| | Participant sequence control | race-conditions-stop-button.test.ts | 2 | ✅ PASSING |
| | Rapid stop/start cycles | race-conditions-stop-button.test.ts | 2 | ✅ PASSING |
| | Stop button state sync | race-conditions-stop-button.test.ts | 3 | ✅ PASSING |
| **Unmount Safety** | Navigation cancellation on unmount | race-conditions-unmount-safety.test.ts | 3 | ✅ PASSING |
| | Reset during navigation | race-conditions-unmount-safety.test.ts | 3 | ✅ PASSING |
| | Interval cleanup | race-conditions-unmount-safety.test.ts | 2 | ✅ PASSING |
| | State cleanup timing | race-conditions-unmount-safety.test.ts | 2 | ✅ PASSING |
| | hasNavigated flag reset timing | race-conditions-unmount-safety.test.ts | 3 | ✅ PASSING |
| | Concurrent reset and navigation | race-conditions-unmount-safety.test.ts | 2 | ✅ PASSING |
| | Memory leak prevention | race-conditions-unmount-safety.test.ts | 2 | ✅ PASSING |

**Total Coverage**: 185 tests across 8 test files - All passing ✅

**Test File Locations**:
- `src/stores/chat/__tests__/one-round-conversation-flow.test.ts` (50 tests)
- `src/stores/chat/__tests__/provider-integration-flow.test.ts` (39 tests)
- `src/stores/chat/__tests__/provider-presearch-execution-e2e.test.ts` (33 tests) ✨ NEW
- `src/stores/chat/__tests__/thread-screen-second-message-flow.test.ts` (17 tests)
- `src/stores/chat/__tests__/pre-search-execution-deadlock.test.ts` (16 tests)
- `src/stores/chat/__tests__/reset-functions-completeness.test.ts` (12 tests)
- `src/stores/chat/__tests__/multi-round-web-search-flow.test.ts` (11 tests)
- `src/stores/chat/__tests__/round-two-analysis-status-bug.test.ts` (7 tests)

**Critical Bug Coverage Added (v2.5)**:
| Race Category | Specific Test | File | Tests | Status |
|---|---|---|---|---|
| **Pre-Search Execution Deadlock** | Circular dependency detection | pre-search-execution-deadlock.test.ts | 3 | ✅ PASSING |
| | Subsequent round execution flow | pre-search-execution-deadlock.test.ts | 2 | ✅ PASSING |
| | Blocking with timeout protection | pre-search-execution-deadlock.test.ts | 3 | ✅ PASSING |
| | Web search disabled bypass | pre-search-execution-deadlock.test.ts | 2 | ✅ PASSING |
| | Error recovery (FAILED status) | pre-search-execution-deadlock.test.ts | 2 | ✅ PASSING |
| | Multi-round integration | pre-search-execution-deadlock.test.ts | 1 | ✅ PASSING |
| | Edge cases (rapid submissions, etc.) | pre-search-execution-deadlock.test.ts | 3 | ✅ PASSING |

**Provider Pre-Search Execution E2E Coverage Added (v2.7)**:
| Race Category | Specific Test | File | Tests | Status |
|---|---|---|---|---|
| **Successful Execution Flow** | Stream reading to completion | provider-presearch-execution-e2e.test.ts | 3 | ✅ PASSING |
| **409 Conflict Handling** | Already executing scenarios | provider-presearch-execution-e2e.test.ts | 4 | ✅ PASSING |
| **Error Scenarios** | Network/stream failures | provider-presearch-execution-e2e.test.ts | 3 | ✅ PASSING |
| **Store State Transitions** | PENDING → STREAMING → COMPLETE | provider-presearch-execution-e2e.test.ts | 3 | ✅ PASSING |
| **Multi-Round Toggling** | Web search ON/OFF between rounds | provider-presearch-execution-e2e.test.ts | 3 | ✅ PASSING |
| **Stop Button During Pre-Search** | Stop at various states | provider-presearch-execution-e2e.test.ts | 3 | ✅ PASSING |
| **Timeout Protection** | Stuck pre-search detection | provider-presearch-execution-e2e.test.ts | 3 | ✅ PASSING |
| **Race Conditions** | Concurrent operations | provider-presearch-execution-e2e.test.ts | 3 | ✅ PASSING |
| **Edge Cases** | Special characters, long queries | provider-presearch-execution-e2e.test.ts | 5 | ✅ PASSING |
| **Complete E2E Journeys** | Full 2-round flows | provider-presearch-execution-e2e.test.ts | 3 | ✅ PASSING |

**Provider Integration Flow Coverage Added (v2.6)**:
| Race Category | Specific Test | File | Tests | Status |
|---|---|---|---|---|
| **Provider Execution Conditions** | When to execute pre-search (PENDING) | provider-integration-flow.test.ts | 4 | ✅ PASSING |
| | When to create pre-search (missing) | provider-integration-flow.test.ts | 2 | ✅ PASSING |
| | When to send message (COMPLETE/FAILED) | provider-integration-flow.test.ts | 4 | ✅ PASSING |
| **Navigation Timing** | Analysis completion detection | provider-integration-flow.test.ts | 3 | ✅ PASSING |
| | Screen mode transitions | provider-integration-flow.test.ts | 4 | ✅ PASSING |
| **Stop Button Races** | Stop during pre-search | provider-integration-flow.test.ts | 2 | ✅ PASSING |
| | Stop during streaming | provider-integration-flow.test.ts | 3 | ✅ PASSING |
| | Stop between participants | provider-integration-flow.test.ts | 1 | ✅ PASSING |
| | Stop during analysis | provider-integration-flow.test.ts | 1 | ✅ PASSING |
| **Error Recovery** | Pre-search failures | provider-integration-flow.test.ts | 2 | ✅ PASSING |
| | Participant streaming failures | provider-integration-flow.test.ts | 2 | ✅ PASSING |
| | Analysis failures | provider-integration-flow.test.ts | 2 | ✅ PASSING |
| | Timeout protection | provider-integration-flow.test.ts | 2 | ✅ PASSING |
| **Documented Race Conditions** | Thread ID availability | provider-integration-flow.test.ts | 1 | ✅ PASSING |
| | Orchestrator sync timing | provider-integration-flow.test.ts | 1 | ✅ PASSING |
| | Sequential participant coordination | provider-integration-flow.test.ts | 1 | ✅ PASSING |
| | Stop during participant switch | provider-integration-flow.test.ts | 1 | ✅ PASSING |
| | Multi-layer analysis completion | provider-integration-flow.test.ts | 1 | ✅ PASSING |
| **Complete Journey Integration** | 2-round with web search | provider-integration-flow.test.ts | 1 | ✅ PASSING |
| | Stop mid-round | provider-integration-flow.test.ts | 1 | ✅ PASSING |
| | Pre-search failure recovery | provider-integration-flow.test.ts | 1 | ✅ PASSING |

---

### Critical Timing Dependencies

**Must-Complete-Before Chain**:
```
1. Thread creation API response
   ↓ [GUARD: Store subscription blocks streaming]
2. setCreatedThreadId() + initializeThread()
   ↓ [GUARD: AI SDK sync pattern]
3. Screen initialization + Orchestrator enabled
   ↓ [GUARD: Query enabled at init]
4. Orchestrator syncs pre-search from server
   ↓ [GUARD: Optimistic blocking if web search enabled]
5. Streaming subscription checks pre-search status
   ↓ [GUARD: shouldWaitForPreSearch() with timeout]
6. Participants stream sequentially
   ↓ [GUARD: currentParticipantIndex increments]
7. Analysis created + status COMPLETE
   ↓ [GUARD: Multi-layer detection + 60s timeout]
8. Navigation to thread detail
```

**Vulnerable Gaps** (All Protected):
- Gap 2→3: Store state propagation [✅ Explicit sync]
- Gap 4→5: Orchestrator query timing [✅ Optimistic blocking]
- Gap 7→8: Analysis visibility [✅ Multi-layer + timeout]

---

### Race Condition Testing Checklist

Use this checklist when adding new async features:

**✅ Thread Lifecycle**
- [ ] Thread ID available before dependent operations?
- [ ] State propagation to all consumers atomic?
- [ ] Cleanup on unmount prevents leaks?

**✅ Async Coordination**
- [ ] Orchestrator queries have retry/timeout?
- [ ] Status transitions invalidate caches?
- [ ] Optimistic blocking when record not yet synced?

**✅ Navigation Timing**
- [ ] URL updates before navigation?
- [ ] Flags prevent duplicate navigation?
- [ ] useLayoutEffect for cleanup (runs before unmount)?

**✅ Streaming Control**
- [ ] Stop button ignores in-flight messages?
- [ ] Index updates atomic with streaming flag?
- [ ] Partial messages handled correctly?

**✅ Test Coverage**
- [ ] Race condition test file created?
- [ ] All timing permutations covered?
- [ ] Timeout/fallback behavior tested?
- [ ] Concurrent operations tested?

---

### Developer Guidelines

**When Adding Async Features**:
1. **Identify Dependencies**: What must complete before this starts?
2. **Add Explicit Guards**: Don't assume timing - add flag checks
3. **Write Race Tests FIRST**: Think through all permutations
4. **Add Timeouts**: Prevent infinite blocking with fallbacks
5. **Document Assumptions**: SLO expectations (e.g., "query returns <2s")

**Red Flags to Watch For**:
- ⚠️ Two `setState()` calls without wrapping in `act()`
- ⚠️ Async operation without timeout/retry
- ⚠️ Navigation without checking component mounted
- ⚠️ Query result assumed synchronously available
- ⚠️ Effect cleanup missing (intervals, subscriptions)

---

## VERSION HISTORY

**Version 2.7** - Provider Pre-Search Execution E2E Tests
**Last Updated:** November 20, 2025
**Changes:**
- Added 33 new tests in `provider-presearch-execution-e2e.test.ts` for comprehensive E2E coverage
- Fixed critical circular dependency bug in `chat-store-provider.tsx`
- Bug: Provider created PENDING pre-search but waited for COMPLETE before sending message
- Fix: Provider now executes pre-search immediately after creation via POST request
- Fix: Provider detects stuck PENDING pre-searches and triggers execution
- Test coverage: Stream reading, 409 handling, error scenarios, multi-round toggling, timeouts
- Complete E2E journey tests for 2-round flows with web search
- Total test coverage now 185 tests across 8 test files

**Test Categories Added**:
- ✅ Successful execution flow with stream reading (3 tests)
- ✅ 409 Conflict handling (4 tests)
- ✅ Error scenarios (network/stream failures) (3 tests)
- ✅ Store state transitions (3 tests)
- ✅ Multi-round web search toggling (3 tests)
- ✅ Stop button during pre-search (3 tests)
- ✅ Timeout protection (3 tests)
- ✅ Race conditions (3 tests)
- ✅ Edge cases (5 tests)
- ✅ Complete E2E journeys (3 tests)

---

**Version 2.6** - Provider Integration Flow Tests & Comprehensive Coverage
**Last Updated:** November 20, 2025
**Changes:**
- Added 39 new tests in `provider-integration-flow.test.ts` for comprehensive coverage
- Test coverage: Provider execution conditions, navigation timing, stop button races, error recovery
- Covers all documented race conditions from Part 14
- Complete journey integration tests for 2-round web search flows
- Total test coverage now 152 tests across 7 test files

**Test Categories Added**:
- ✅ Provider-level pre-search execution triggering (10 tests)
- ✅ Navigation timing and analysis completion detection (7 tests)
- ✅ Stop button during all states (7 tests)
- ✅ Error recovery scenarios (8 tests)
- ✅ Documented race conditions (5 tests)
- ✅ Complete journey integration (3 tests)

---

**Version 2.5** - Pre-Search Execution Deadlock Fix & Test Coverage
**Last Updated:** November 20, 2025
**Changes:**
- Fixed critical circular dependency bug in subsequent round pre-search execution
- Added 16 new tests in `pre-search-execution-deadlock.test.ts`
- Updated provider to immediately execute pre-search after creation (breaks deadlock)
- Added stuck PENDING pre-search recovery logic

**Bug Fixed**:
The circular dependency where:
1. Provider creates PENDING pre-search → waits for COMPLETE
2. PreSearchStream executes pre-search → only renders after user message exists
3. User message only exists after message sent → DEADLOCK

**Fix Applied**:
- Provider now executes pre-search immediately after creation (POST request)
- Provider detects stuck PENDING pre-searches and triggers execution
- Breaks circular dependency: create → execute → complete → send message

**New Test Coverage** (`pre-search-execution-deadlock.test.ts`):
- ✅ Circular dependency detection (3 tests)
- ✅ Subsequent round pre-search execution flow (2 tests)
- ✅ Pre-search blocking with timeout (3 tests)
- ✅ Web search disabled scenarios (2 tests)
- ✅ Error recovery scenarios (2 tests)
- ✅ Complete multi-round integration (1 test)
- ✅ Edge cases (3 tests)

**Test Coverage Gap Addressed**:
Previous tests tested store state transitions but NOT the provider's pre-search execution logic.
The bug was in `chat-store-provider.tsx` - the logic that creates and executes pre-searches.
New tests cover the full flow from pending message to pre-search completion to message sending.

---

**Version 2.4** - Stream Completion Detection Documentation
**Last Updated:** January 19, 2025
**Changes:**
- Added Part 3.5: Stream Completion Detection (Cloudflare KV)
- Documented KV-based stream lifecycle tracking system
- Clarified differences between stream completion detection vs. full resumption
- Confirmed NO conflict with abort/stop functionality (we don't use `resume: true`)
- Explained why full resumption not implemented (KV limitations, abort incompatibility)
- Updated implementation file references for stream status tracking

**Key Clarifications**:
- ✅ Our system tracks stream completion, NOT mid-stream resumption
- ✅ Compatible with stop button (no abort conflicts)
- ✅ Cloudflare KV used for status tracking (1-hour TTL)
- ❌ No chunk buffering (partial progress lost on reload)
- ❌ No Redis/pub-sub requirement

**Version 2.3** - Race Condition Test Implementation
**Last Updated:** January 19, 2025
**Changes:**
- Implemented 4 new race condition test files (57 tests, all passing)
- Tests use logic-focused approach without complex React mocking
- Test coverage: navigation timing, pre-search blocking, stop button, unmount safety
- Updated test coverage matrix with actual test counts and passing status
- Test files use state machine transitions and microtask ordering patterns

**Test Results**:
- ✅ race-conditions-navigation-flow.test.ts - 11 tests passed
- ✅ race-conditions-presearch-blocking.test.ts - 14 tests passed
- ✅ race-conditions-stop-button.test.ts - 15 tests passed
- ✅ race-conditions-unmount-safety.test.ts - 17 tests passed

**Version 2.2** - Race Condition Protection Documentation
**Last Updated:** January 19, 2025
**Changes:**
- Added Part 14: Race Condition Protection
- Documented 18 identified race conditions with protections
- Created comprehensive test coverage matrix
- Included race condition testing checklist
- Documented critical timing dependencies

**Version 2.1** - URL Pattern Corrections
**Last Updated:** January 10, 2025
**Changes:**
- Fixed Part 12 (URL Patterns) to match actual implementation
- Updated navigation flow: router.push (not window.history.replaceState)
- Clarified polling behavior: starts AFTER streaming + analysis complete
- Updated test scenarios to reflect two-screen architecture

**Version 2.0** - Focused Chat Journey Documentation
**Last Updated:** January 2025
**Contributors:** 10 specialized analysis agents (5 frontend + 5 backend)
**Scope:** Chat creation through round management flows only

---

This documentation describes the complete Roundtable chat experience from a user's perspective, explaining what they see, when they see it, and what's happening behind the scenes - all without technical code references.