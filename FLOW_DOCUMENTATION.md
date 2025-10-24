# Roundtable Application Flow Documentation

## Overview
Roundtable is a collaborative AI brainstorming platform where multiple AI models work together to solve problems. This document describes the complete flow of conversations, rounds, analyses, and regeneration.

## Application Premise

This is the complete flow of the Roundtable application, explained step-by-step.

**1. Overview Screen (/chat) - Initial Setup & Round 1**:
   - User lands on overview screen (empty state)
   - User selects **conversation mode**: Brainstorming, Debating, Analyzing, or Solving
   - User selects **participants** (AI models) with:
     - Custom roles (user-defined)
     - Optional roles (suggested)
     - Given roles (pre-defined)
     - Or no roles at all
   - User can **reorder participants** (determines response order)
   - User can **change mode at any time** during the chat journey

   **First Round Execution (on Overview Screen)**:
   - User sends first message → **Round 1 begins**
   - Thread created in background, URL dynamically updates from `/chat` to `/chat/[threadId]` **WITHOUT full page refresh**
   - Each participant streams response in configured order
   - **LAST participant completes** → triggers analysis stream
   - Analysis streams using AI SDK streamObject()
   - Analysis completes → **router push navigates user to thread page** (`/chat/[threadId]`)

**2. Thread Page (/chat/[threadId]) - All Subsequent Rounds**:
   - **🚨 CRITICAL: LOCAL STATE ONLY from this point forward**
   - Initial data loaded ONCE from server (queries enabled on mount)
   - After initial load: `hasInitiallyLoaded = true` → **ALL queries disabled permanently**
   - **NO query refetches** during session (unless full page refresh)
   - All state changes are **client-side only** in local state

   **User Capabilities Between Rounds**:
   - Add participants
   - Remove participants
   - Change participant roles
   - Reorder participants
   - Change conversation mode
   - **All changes saved to LOCAL STATE immediately**
   - Changes trigger **changelog creation** (PUT request to backend)
   - Changelog appears as **accordion/card** before the next round

   **Subsequent Round Execution**:
   - User sends new message → **Round N begins**
   - Participants stream responses using **latest configuration from LOCAL STATE**
   - Each participant responds in configured order
   - **LAST participant completes** → triggers analysis stream for Round N
   - Analysis streams and appears under Round N

   **Round Feedback (Per Round, Not Per Message)**:
   - Like/dislike buttons appear after each round
   - Feedback applies to **entire round** (user question + all participant responses + analysis)
   - Can be toggled: like → dislike → none (null)
   - Stored in LOCAL STATE, mutations fire-and-forget to backend

   **Round Regeneration (Last Round Only)**:
   - Re-generate button **ONLY available on LAST round**
   - Clicking regenerate:
     - Deletes previous analysis for that round
     - Deletes all participant responses for that round
     - Completely re-executes the round from ground up
     - All participants generate fresh responses
     - LAST participant triggers new analysis
     - **Replaces all previous data** for that round

**3. Key Architectural Principles**:
   - **Round-Centric**: Everything scoped to rounds (question → responses → analysis)
   - **LOCAL STATE First**: Thread page relies exclusively on local state after initial load
   - **LAST Participant Trigger**: Analysis always triggered by last participant completion
   - **Changelog on Change**: Changelog only appears when actual changes occur between rounds
   - **Per-Round Feedback**: Feedback for entire round, not individual messages
   - **Last Round Regeneration**: Only the most recent round can be regenerated

---

## Core Concepts

### 1. **Rounds**
- A "round" is a complete cycle of: **User Question** → **Participant Responses** → **Moderator Analysis**
- Each round is identified by a `roundNumber` (1-indexed)
- Rounds increment with each new user message

### 2. **Participants**
- AI models that respond to user questions
- Users can select multiple participants (1-N)
- Each participant has a priority order
- Participants can have assigned roles (optional)

### 3. **Conversation Modes**
- **Brainstorming**: Collaborative ideation
- **Debating**: Contrasting viewpoints
- **Analyzing**: In-depth analysis
- **Solving**: Problem-solving focus

### 4. **Analyses**
- Moderator AI analyzes each round after all participants respond
- Includes: leaderboard, skills comparison, participant evaluations, summary
- Streams in real-time using AI SDK v5 `experimental_useObject`

### 5. **Changelog**
- Tracks changes to participants or mode between rounds
- Only created when actual changes occur
- Shows what changed and why

---

## Complete Application Flow

### Phase 1: Overview Screen - Initial Conversation (Round 1)

```
1. User Arrives at Overview Screen (/chat)
   ├─ Empty state displayed
   ├─ Mode selector: Brainstorming, Debating, Analyzing, Solving
   ├─ Participant selection interface
   │  ├─ Add/remove AI model participants
   │  ├─ Assign roles: custom, optional, given, or none
   │  └─ Reorder participants (determines response sequence)
   └─ Input field for first message

2. User Configures Conversation
   ├─ Selects mode (e.g., "Brainstorming")
   ├─ Selects participants (e.g., Claude, GPT-4, Gemini)
   ├─ Assigns roles to participants (optional, can be custom or pre-defined)
   └─ Orders participants (determines who responds first, second, etc.)

3. User Sends First Message → Round 1 Begins
   ├─ Backend creates thread
   ├─ User message saved with roundNumber: 1
   ├─ **URL dynamically updates: /chat → /chat/[threadId] WITHOUT full page refresh**
   │  └─ User stays on overview screen but URL changes in address bar
   └─ Participant streaming begins immediately

4. Participant Response Streaming (Round 1)
   ├─ Participant 1 streams response (based on configured order)
   ├─ Participant 2 streams response
   ├─ Participant 3 streams response (if applicable)
   ├─ ... (all participants stream in configured order)
   └─ **LAST participant completes → triggers analysis stream**

5. Analysis Streaming (Round 1 on Overview Screen)
   ├─ Last participant completion triggers POST /api/v1/chat/threads/{id}/rounds/1/analyze
   ├─ Backend streams analysis using AI SDK streamObject()
   ├─ Frontend consumes stream with experimental_useObject()
   ├─ Analysis accordion appears under Round 1 messages
   ├─ Progressive UI updates: leaderboard → skills → participant evaluations → summary
   └─ Analysis completes

6. Navigation to Thread Page
   ├─ Analysis completion triggers router.push()
   ├─ Navigate from /chat to /chat/[threadId]
   └─ User lands on dedicated thread page (Round 1 already complete)
```

### Phase 2: Thread Page Initial Load (Server-Side Rendering)

**CRITICAL**: Thread page uses LOCAL STATE ONLY after initial load.

```
Server Components fetch and prefetch data:
   ├─ Thread metadata (mode, participants, title)
   ├─ Initial messages (all rounds)
   ├─ Participants configuration
   └─ Server-side props passed to client components

Client-Side Queries (enabled ONCE on mount):
   ├─ Changelog query (useThreadChangelogQuery)
   │  └─ Loads participant/mode change history
   ├─ Feedback query (useThreadFeedbackQuery)
   │  └─ Loads like/dislike for each round
   └─ Analyses query (useThreadAnalysesQuery)
      └─ Loads completed/pending analyses for all rounds

Initial State Hydration (ONE-TIME ONLY):
   ├─ clientChangelog ← changelog data (from query)
   ├─ clientFeedback ← Map<roundNumber, 'like'|'dislike'|null> (from query)
   └─ analyses ← all analyses (from query)

After data loads:
   └─ hasInitiallyLoaded = true
      └─ 🚨 ALL queries now DISABLED permanently (enabled: false)
         └─ 🚨 LOCAL STATE is SINGLE SOURCE OF TRUTH
            └─ 🚨 FULL PAGE REFRESH is ONLY way to re-sync with server
```

**ONE-WAY DATA FLOW PRINCIPLE**:
- Queries fetch data ONCE on mount
- After `hasInitiallyLoaded = true`, queries are DISABLED FOREVER
- ALL subsequent state changes are CLIENT-SIDE ONLY
- NO query invalidations (would trigger refetches)
- NO server polling (except for streaming)
- Full page refresh is ONLY way to sync with server again

### Phase 3: Subsequent Rounds (Thread Page)

**CRITICAL**: All rounds after Round 1 happen on thread page. Everything relies on LOCAL STATE.

```
ROUND N: User Sends Next Question

1. User Message Sent
   ├─ Message saved with roundNumber: N
   ├─ **Uses LATEST participant configuration from LOCAL STATE**
   │  └─ Reflects any add/remove/reorder/role changes made between rounds
   ├─ roundManager.handleRoundComplete() NOT triggered yet
   └─ Participant streaming begins

2. Participant Streaming (Sequential, in configured order from LOCAL STATE)
   ├─ Participant 1 streams response (based on LATEST order from LOCAL STATE)
   ├─ Participant 2 streams response
   ├─ Participant 3 streams response (if applicable)
   ├─ ... (all participants stream in LATEST configured order)
   └─ **LAST participant completes**

3. LAST Participant Completion
   ├─ onFinish callback triggers
   ├─ roundManager.handleRoundComplete() called
   ├─ Pending analysis created in LOCAL STATE (client-side only)
   ├─ Added to analyses array in LOCAL STATE
   └─ Analysis streaming begins IMMEDIATELY

4. Analysis Streaming (Triggered by LAST Participant)
   ├─ ModeratorAnalysisStream detects pending status
   ├─ POST /api/v1/chat/threads/{id}/rounds/{N}/analyze
   ├─ Backend streams analysis using AI SDK streamObject()
   ├─ Frontend consumes with experimental_useObject()
   ├─ UI updates progressively:
   │   ├─ Leaderboard appears and updates
   │   ├─ Skills comparison chart renders
   │   ├─ Participant evaluations display
   │   └─ Overall summary and conclusion appear
   └─ Analysis marked as completed in LOCAL STATE

5. Round N Complete ✅
   ├─ UI displays: User message → All participant responses → Analysis accordion
   ├─ Analysis accordion positioned UNDER this specific round
   └─ Ready for next round or participant configuration changes

**Key Principles**:
- **LAST participant** (not "all participants") triggers analysis
- **LATEST configuration from LOCAL STATE** used for each round
- All state updates are **CLIENT-SIDE ONLY** (no query refetches)
- Participant order from **LOCAL STATE** determines response sequence
- Analysis accordion appears **under its specific round**
- If user made changes between rounds, those changes are reflected in this round
```

### Phase 4: Participant and Mode Changes (Between Rounds)

**CRITICAL**: Users can modify configuration at any time between rounds. Changes are saved to LOCAL STATE and create changelog.

```
User Makes Changes Between Rounds:

1. Available Changes (Thread Page)
   User can modify conversation configuration at any point:
   ├─ **Change mode**: Brainstorming ↔ Debating ↔ Analyzing ↔ Solving
   ├─ **Add participants**: Bring new AI models into the conversation
   ├─ **Remove participants**: Remove AI models from future rounds
   ├─ **Reorder participants**: Change who responds first, second, etc.
   ├─ **Change roles**: Add, modify, or remove participant roles
   └─ **All changes saved to LOCAL STATE immediately**

2. Backend Synchronization & Changelog Creation
   ├─ Frontend fires PUT /api/v1/chat/threads/{id} (updates thread configuration)
   ├─ Backend creates changelog entry for roundNumber: N+1 (next round)
   ├─ Changelog details what changed:
   │   ├─ Mode: { old: "Brainstorming", new: "Debating" }
   │   ├─ Participants added: [{ name, role }]
   │   ├─ Participants removed: [{ name, role }]
   │   ├─ Participants reordered: [{ oldOrder, newOrder }]
   │   └─ Roles changed: [{ participant, oldRole, newRole }]
   ├─ Frontend adds changelog to clientChangelog (LOCAL STATE)
   └─ **No query refetch - LOCAL STATE is source of truth**

3. Next Round Execution (Uses Latest Configuration from LOCAL STATE)
   ├─ User sends message for Round N+1
   ├─ **Changelog accordion/card appears BEFORE Round N+1 messages**
   │  └─ Shows exactly what changed since previous round
   ├─ Participants stream based on **NEW configuration from LOCAL STATE**
   │  └─ New participants included, removed ones excluded, new order respected
   ├─ LAST participant triggers analysis
   └─ Analysis reflects **NEW mode and NEW participants**

4. UI Order Examples With and Without Changelog:

   Round 1:
   ├─ User message
   ├─ Participant responses (initial config)
   └─ Analysis

   Round 2 (NO changes):
   ├─ User message
   ├─ Participant responses (same config as Round 1)
   └─ Analysis

   Round 3 (WITH changes):
   ├─ **Changelog Accordion** ← shows mode change or participant changes
   ├─ User message
   ├─ Participant responses (NEW config)
   └─ Analysis (reflects NEW config)

   Round 4 (NO changes):
   ├─ User message
   ├─ Participant responses (same config as Round 3)
   └─ Analysis

   Round 5 (WITH changes):
   ├─ **Changelog Accordion** ← shows what changed from Round 4 to Round 5
   ├─ User message
   ├─ Participant responses (NEWEST config)
   └─ Analysis (reflects NEWEST config)
```

**Key Principles**:
- **Changes saved to LOCAL STATE immediately** (no delay)
- **Changelog ONLY appears when changes actually occur** between rounds
- Changelog positioned **BEFORE the round** that uses new configuration
- **Next round uses LATEST configuration from LOCAL STATE**
- No changelog = no changes between those rounds
- Changes can happen at **any time** during the chat thread journey

### Phase 5: Regeneration (Retry) - LAST ROUND ONLY

**CRITICAL**: Regeneration is ONLY available on the LAST round. It completely DELETES and REPLACES the entire round.

```
REGENERATION: User Wants to Retry Last Round

1. User Clicks "Re-generate" Button
   ├─ 🚨 Button ONLY visible and functional on LAST round
   ├─ 🚨 Previous rounds do NOT have this button (cannot regenerate history)
   ├─ retryRound() called from ChatContext
   └─ setOnRetry callback triggered

2. Immediate LOCAL STATE Updates
   ├─ Old analysis removed from LOCAL STATE immediately
   ├─ Round marked as "regenerating" in LOCAL STATE
   ├─ Old analysis accordion disappears from UI
   ├─ Old participant messages remain visible temporarily
   └─ Loading indicator appears

3. Backend Deletion Operations
   ├─ **DELETE all participant message responses for that round**
   ├─ **DELETE analysis for that round**
   ├─ Database cleanup completes
   ├─ Only user's original question remains
   └─ reload() called to restart participant streaming

4. Complete Round Re-execution from Ground Up
   ├─ Uses **LATEST participant configuration from LOCAL STATE**
   │  └─ If user changed participants before retry, new config is used
   ├─ **ALL participants generate completely fresh responses**
   ├─ Each participant streams in configured order
   ├─ **LAST participant completes → triggers new analysis stream**
   ├─ New analysis streams and completes
   └─ UI shows completely new content (responses + analysis)

5. Round Replacement Complete ✅
   ├─ **Old round data completely deleted and replaced**
   ├─ New participant responses visible
   ├─ New analysis accordion visible under round
   ├─ **Retry button remains available** (user can retry again if desired)
   └─ Round number unchanged (still Round N, just regenerated)

**Key Principles**:
- 🚨 **Retry button ONLY on LAST round** (never on previous rounds)
- **Complete deletion and replacement** of round data (not incremental)
- Regeneration includes **ALL participants + analysis** (not per-message)
- Uses **LATEST configuration from LOCAL STATE** for regeneration
- All updates in **LOCAL STATE** (no query refetches)
- User can **retry multiple times** on the same round
- **Previous round data is permanently replaced** (not versioned)
```

---

## State Management Architecture

### ONE-WAY DATA FLOW Pattern (ChatThreadScreen)

**Purpose**: Load data ONCE on initial page load, then ALL state is client-side only

**State Tracking Flag**:
```typescript
const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false);
```

**Query Pattern** (All queries follow this pattern):
```typescript
// ✅ Query enabled ONLY before initial load
const { data: changelogResponse } = useThreadChangelogQuery(
  thread.id,
  !hasInitiallyLoaded // disabled after first load
);

const { data: feedbackData } = useThreadFeedbackQuery(
  thread.id,
  !hasInitiallyLoaded // disabled after first load
);

const { analyses } = useChatAnalysis({
  threadId: thread.id,
  mode: thread.mode,
  enabled: !hasInitiallyLoaded, // disabled after first load
});
```

**Client-Side State** (Source of truth after initial load):
```typescript
// Changelog state
const [clientChangelog, setClientChangelog] = useState<ChangelogItem[]>([]);

// Feedback state (Map for O(1) lookups by round number)
const [clientFeedback, setClientFeedback] = useState<
  Map<number, 'like' | 'dislike' | null>
>(new Map());

// Analyses managed via React Query cache manipulation
// (no separate state - cache IS the state)
```

**Initial Load Hydration**:
```typescript
// Changelog hydration
useEffect(() => {
  if (!hasInitiallyLoaded && changelogResponse?.success) {
    setClientChangelog(changelogResponse.data.items);
  }
}, [changelogResponse, hasInitiallyLoaded]);

// Feedback hydration
useEffect(() => {
  if (!hasInitiallyLoaded && feedbackData && Array.isArray(feedbackData)) {
    const initialFeedback = new Map(
      feedbackData.map(f => [f.roundNumber, f.feedbackType] as const)
    );
    setClientFeedback(initialFeedback);
  }
}, [feedbackData, hasInitiallyLoaded]);

// Analyses hydration (automatic via React Query)
// No manual hydration needed - query returns analyses directly

// Mark as loaded (disables all queries permanently)
useEffect(() => {
  if (!hasInitiallyLoaded && changelogResponse && feedbackData !== undefined) {
    setHasInitiallyLoaded(true); // ← Queries now disabled forever
  }
}, [changelogResponse, feedbackData, hasInitiallyLoaded]);
```

**Critical Principles**:
- Queries fetch data ONCE on mount
- After `hasInitiallyLoaded = true`, queries are disabled
- ALL subsequent state changes are client-side only
- NO query invalidations (would trigger refetches)
- Full page refresh is ONLY way to sync with server again

### Shared Context: `ChatContext`

**Purpose**: Manage chat streaming, participant state, and round callbacks

**Key State**:
```typescript
{
  messages,              // All UI messages
  isStreaming,          // True during participant streaming
  participants,         // Active participants for current thread
  currentParticipantIndex, // Which participant is currently responding
  sendMessage(),        // Send new user message
  retryRound(),         // Regenerate last round
  setOnRoundComplete(), // Callback when all participants finish
  setOnRetry(),         // Callback when retry is triggered
}
```

### Message Grouping: `groupMessagesByRound()`

**Purpose**: Group messages by round number for display

**Algorithm**:
1. **First Pass**: Extract explicit round numbers from user messages
2. **Second Pass**: Fill in missing round numbers (inferred)
3. **Third Pass**: Group all messages by determined round
4. **Deduplication**: Remove duplicate messages by ID

**Stability**: Uses message IDs and explicit metadata to maintain grouping during:
- Streaming updates
- Participant changes
- Mode changes
- Page refreshes

---

## UI Component Hierarchy

```
ChatThreadScreen / ChatOverviewScreen
├─ ChatInput (user question entry)
├─ StreamingParticipantsLoader (shows during streaming + analysis)
│   └─ Displays: "Claude is thinking..." or "Analyzing responses..."
└─ messagesWithAnalysesAndChangelog (main content)
    └─ For each round:
        ├─ ChangelogCard (if changes occurred before this round)
        │   └─ Shows: mode changes, participant changes
        ├─ ChatMessageList (round messages)
        │   ├─ User message (question)
        │   └─ Participant responses (1-N messages)
        │       └─ Each with participant avatar, name, response
        ├─ Actions (feedback + retry)
        │   ├─ RoundFeedback (like/dislike entire round)
        │   └─ Retry button (only on last round)
        └─ RoundAnalysisCard (analysis accordion)
            ├─ Header: "Round N Analysis" + status badge
            └─ ModeratorAnalysisStream
                ├─ Leaderboard (rankings)
                ├─ SkillsComparisonChart
                ├─ ParticipantAnalysisCard (per participant)
                └─ Summary + Conclusion
```

---

## Data Flow Diagrams

### Round Completion Flow

```
User sends message
    ↓
Backend creates message (roundNumber: N)
    ↓
useChat.onFinish() callback
    ↓
setOnRoundComplete() callback
    ↓
roundManager.handleRoundComplete()
    ↓
    ├─ Extract participant message IDs
    ├─ Create pending analysis object
    ├─ Add to React Query cache
    └─ Update state directly (analyses array)
    ↓
State update triggers re-render
    ↓
RoundAnalysisCard renders
    ↓
ModeratorAnalysisStream detects pending status
    ↓
POST /api/v1/chat/threads/{id}/rounds/{n}/analyze
    ↓
Backend streams analysis via AI SDK streamObject()
    ↓
Frontend consumes via experimental_useObject()
    ↓
Progressive UI updates (leaderboard → skills → participants)
    ↓
Analysis completes
    ↓
Cache automatically updated by React Query
    ↓
Round complete ✅
```

### Regeneration Flow

```
User clicks Retry button (last round only)
    ↓
retryRound() called from context
    ↓
setOnRetry() callback triggered
    ↓
    ├─ Mark round as "regenerating"
    ├─ Remove old analysis from cache
    └─ Old analysis disappears from UI
    ↓
Backend: DELETE messages for round
Backend: DELETE analysis for round
    ↓
reload() called (restarts chat stream)
    ↓
Round re-executes from beginning
    ↓
New participants stream responses
    ↓
New analysis generated
    ↓
UI shows fresh content ✅
```

### Changelog Flow

```
User changes mode or participants
    ↓
updateThreadMutation.mutate({ mode, participants })
    ↓
Backend creates changelog entry
    {
      roundNumber: N,  // Next round
      changes: {
        mode: { old, new },
        participants: { added, removed, reordered }
      }
    }
    ↓
Frontend refetches changelog
    ↓
messagesWithAnalysesAndChangelog updated
    ↓
Changelog positioned BEFORE round N
    ↓
User sees: "Mode changed from X to Y" + "Participants updated"
```

---

## Critical Implementation Details

### 1. Analysis Triggering

**Problem**: Analysis must ALWAYS trigger after round completion

**Solution**:
```typescript
// In useChatRoundManager.handleRoundComplete()

// 1. Create pending analysis
const pendingAnalysis = {
  status: 'pending',
  roundNumber,
  participantMessageIds, // Critical for backend
  // ...
};

// 2. Add to cache
addPendingAnalysis(pendingAnalysis);

// 3. Update state DIRECTLY (no invalidation)
setState(prev => ({
  ...prev,
  analyses: [...prev.analyses, pendingAnalysis]
}));

// 4. RoundAnalysisCard renders
// 5. ModeratorAnalysisStream sees pending status
// 6. Automatically triggers POST /analyze
```

**Why Direct State Update?**
- Query invalidation causes infinite loops
- Direct update ensures immediate UI response
- Ref flag prevents sync conflicts

### 2. Preventing Infinite Loops

**Problem**: State updates can trigger re-renders → re-syncs → more updates

**Solution**:
```typescript
// In useChatRoundManager

const isAddingPendingRef = useRef(false);

useEffect(() => {
  // Skip sync if actively adding pending
  if (isAddingPendingRef.current) return;

  // Sync from query response
  setState({ analyses: items });
}, [analysesResponse]);

// In handleRoundComplete
isAddingPendingRef.current = true;
setState({ analyses: [...prev, pendingAnalysis] });
setTimeout(() => {
  isAddingPendingRef.current = false;
}, 1000);
```

### 3. Round Feedback Scope - PER ROUND, NOT PER MESSAGE

**CRITICAL**: Feedback applies to ENTIRE round (all participants + analysis), NOT individual messages.

**Implementation**:
```typescript
// Feedback stored by roundNumber in LOCAL STATE
const [clientFeedback, setClientFeedback] = useState<
  Map<number, 'like' | 'dislike' | null>
>(new Map());

// Handler scoped to round (affects entire round)
const handleFeedbackChange = (
  roundNumber: number,
  feedbackType: 'like' | 'dislike' | null
) => {
  // Update LOCAL STATE immediately (optimistic update)
  setClientFeedback(prev => {
    const updated = new Map(prev);
    updated.set(roundNumber, feedbackType);
    return updated;
  });

  // Fire-and-forget mutation to backend
  setRoundFeedbackMutation.mutate({
    threadId,
    roundNumber, // Backend stores by round
    feedbackType
  });
  // 🚨 NO query invalidation - LOCAL STATE is source of truth
};

// UI shows ONE set of buttons per round (not per message)
<RoundFeedback
  roundNumber={roundNumber}
  currentFeedback={clientFeedback.get(roundNumber)}
  onFeedbackChange={handleFeedbackChange}
/>
```

**Key Principles**:
- 🚨 Feedback is for ENTIRE round (user question + all participant responses + analysis)
- NOT per-message (no individual participant feedback)
- Can be toggled: like → dislike → none (null)
- Optimistic update in LOCAL STATE immediately
- Backend sync fire-and-forget (no query refetch)
- On page refresh, hydrated from server via initial query

### 4. Message Deduplication

**Problem**: Streaming can cause duplicate UI elements

**Solution**:
```typescript
// In groupMessagesByRound()
const seenMessageIds = new Set<string>();

messages.forEach(message => {
  if (seenMessageIds.has(message.id)) return; // Skip duplicates
  seenMessageIds.add(message.id);

  // ... group message
});
```

### 5. Streaming State Synchronization

**Problem**: Initial load shows different state than streaming

**Solution**: Both use same `groupMessagesByRound()` utility
- Initial load: Groups persisted messages from database
- Streaming: Groups messages as they arrive
- Same algorithm ensures consistent grouping

**Key**: Message `id` is set immediately when created, before streaming

---

## Testing Scenarios

### ✅ Scenario 1: First Round on Overview Screen
1. User visits /chat (overview screen)
2. Selects mode + participants (with optional roles and ordering)
3. Enters first question
4. All participants respond in order
5. LAST participant triggers analysis stream
6. Analysis completes
7. Auto-navigation to thread page

**Expected**:
- Round 1 messages appear on overview screen
- URL dynamically changes from /chat to /chat/[threadId] WITHOUT full refresh
- Analysis accordion shows under Round 1 messages
- Loader visible during analysis
- After analysis completes, router push to /chat/[threadId]
- No duplicates

### ✅ Scenario 2: Multiple Rounds in Thread Page
1. User lands on thread page (after Scenario 1)
2. Thread page loads with Round 1 already complete
3. Initial queries fetch changelog, feedback, analyses (ONCE)
4. hasInitiallyLoaded = true (queries disabled forever)
5. Send second question (Round 2)
6. All participants respond
7. LAST participant triggers analysis
8. Send third question (Round 3)

**Expected**:
- Initial load: One-time query fetch, then disabled
- Round 1: Messages + Analysis (already there)
- Round 2: Messages + Analysis (streamed, LOCAL STATE only)
- Round 3: Messages + Analysis (streamed, LOCAL STATE only)
- No query refetches after initial load
- No duplicates
- Each analysis under its round

### ✅ Scenario 3: Mode/Participant Changes Between Rounds
1. Complete Round 1 on thread page
2. Change mode (Brainstorming → Debating)
3. Add/remove participants or change roles
4. Reorder participants
5. Send Round 2 question

**Expected**:
- Changes saved to LOCAL STATE immediately
- PUT /api/v1/chat/threads/{id} updates backend
- Changelog added to clientChangelog (LOCAL STATE)
- Changelog card appears BEFORE Round 2 messages
- Shows: "Mode changed from Brainstorming to Debating"
- Shows: Participants added/removed/reordered
- Round 2 uses NEW configuration (mode, participants, roles, order)
- Analysis reflects new mode and participants
- NO query refetch

### ✅ Scenario 4: Regeneration (Last Round Only)
1. Complete Rounds 1, 2, 3 on thread page
2. Retry button ONLY visible on Round 3 (last round)
3. Click Retry button on Round 3

**Expected**:
- Old Round 3 analysis disappears immediately (LOCAL STATE)
- Loader appears
- DELETE backend call for Round 3 messages + analysis
- ALL participants regenerate responses (fresh)
- LAST participant triggers NEW analysis
- New analysis streams and completes
- UI shows completely new Round 3 content
- Retry button remains (for further retries)
- Rounds 1 and 2 unchanged (no retry button on them)

### ✅ Scenario 5: Round Feedback (Per Round, Not Per Message)
1. Complete Round 1 on thread page
2. Click "like" button on Round 1

**Expected During Session (LOCAL STATE)**:
- Like button immediately highlighted (optimistic update)
- clientFeedback Map updated: `Map.set(1, 'like')`
- Mutation fires to backend (fire-and-forget)
- NO query invalidation
- NO GET request
- Feedback persists in LOCAL STATE for remainder of session

3. Complete Round 2
4. Click "dislike" on Round 2
5. Click "like" again on Round 1 (toggle off)

**Expected**:
- Round 1 feedback cleared (toggled off)
- Round 2 feedback set to "dislike"
- Both updates in LOCAL STATE
- Both mutations fire-and-forget
- NO query refetches

**Expected After Page Refresh**:
- Thread page loads
- Feedback query fetches all feedback (ONE-TIME)
- clientFeedback Map hydrated with server data
- Round 1: no feedback (was toggled off)
- Round 2: dislike highlighted
- hasInitiallyLoaded = true (queries disabled)
- Feedback applies to ENTIRE round (not individual participant messages)

### ✅ Scenario 6: Page Refresh During Streaming
1. Start Round 2 on thread page
2. Participants streaming responses
3. User refreshes page (F5 or Cmd+R)

**Expected**:
- Page reloads completely
- Server-side fetch gets all messages (including partial Round 2)
- Initial queries fetch changelog, feedback, analyses (ONCE)
- Streaming may resume or stop (depends on backend state)
- hasInitiallyLoaded = true after data loads
- No duplicate messages or analyses

### ✅ Scenario 7: Changelog Only Appears When Changes Occur
1. Complete Round 1
2. Send Round 2 (NO changes to mode or participants)
3. Change mode after Round 2
4. Send Round 3 (WITH mode change)
5. Send Round 4 (NO changes)

**Expected**:
- Round 1: Messages + Analysis (no changelog before Round 1)
- Round 2: Messages + Analysis (NO changelog - no changes occurred)
- Round 3: Changelog Card + Messages + Analysis (changelog shows mode change)
- Round 4: Messages + Analysis (NO changelog - no changes occurred)
- Changelog ONLY appears when actual changes happen

---

## Common Issues and Solutions

### Issue: Analysis not triggering
**Cause**: pendingAnalysis not added to state
**Fix**: Check `roundManager.handleRoundComplete()` is called

### Issue: Infinite loop / Maximum update depth
**Cause**: State update triggering more state updates
**Fix**: Use `isAddingPendingRef` flag to prevent sync conflicts

### Issue: Duplicate analyses
**Cause**: Multiple analyses for same round in state
**Fix**: Deduplication in `analyses` memo by roundNumber + createdAt

### Issue: Changelog in wrong position
**Cause**: Incorrect sorting or grouping
**Fix**: Ensure changelog has correct `roundNumber` (next round)

### Issue: Retry not replacing round
**Cause**: Old analysis not removed from cache
**Fix**: `setOnRetry` callback must remove from cache immediately

---

## File Reference

### Core Hooks
- `/src/hooks/utils/use-chat-round-manager.ts` - Round and analysis management
- `/src/hooks/utils/use-multi-participant-chat.ts` - Chat streaming with AI SDK v5
- `/src/contexts/chat-context.tsx` - Shared chat state and callbacks

### Utilities
- `/src/lib/utils/round-utils.ts` - Round number calculations and message grouping

### Screens
- `/src/containers/screens/chat/ChatOverviewScreen.tsx` - New chat (Round 1)
- `/src/containers/screens/chat/ChatThreadScreen.tsx` - Full thread view

### Components
- `/src/components/chat/round-analysis-card.tsx` - Analysis accordion
- `/src/components/chat/moderator/moderator-analysis-stream.tsx` - Streaming analysis UI
- `/src/components/chat/round-feedback.tsx` - Like/dislike buttons
- `/src/components/chat/changelog-card.tsx` - Participant/mode changes

---

## Architecture Principles

### 1. Single Source of Truth
- Round numbers calculated in one place (`round-utils.ts`)
- Analysis management in one hook (`useChatRoundManager`)
- Participant state in one context (`ChatContext`)

### 2. No Duplication
- Shared utilities for common logic
- Reusable hooks across screens
- Same grouping algorithm for initial load + streaming

### 3. Predictable State Flow
- State flows one direction: Backend → Query → Hook → UI
- No circular dependencies
- Clear ownership of state

### 4. Streaming-First
- All UI components handle streaming state
- Progressive rendering of partial data
- Graceful fallbacks for errors

### 5. Type Safety
- Full TypeScript coverage
- Zod schemas for validation
- Type inference from backend

---

## Performance Optimizations

### 1. Memoization
```typescript
// Expensive calculations memoized
const messagesByRound = useMemo(
  () => groupMessagesByRound(messages),
  [messages]
);

const maxRoundNumber = useMemo(
  () => getMaxRoundNumber(messages),
  [messages]
);
```

### 2. Stable Callbacks
```typescript
// useCallback prevents re-renders
const handleFeedbackChange = useCallback(
  (roundNumber, feedbackType) => { /* ... */ },
  [setRoundFeedbackMutation, thread.id]
);
```

### 3. Deduplication
- Message deduplication by ID
- Analysis deduplication by roundNumber
- Prevents duplicate UI renders

### 4. React Query Caching
- Analyses cached per thread
- Stale time: 30s (threads), 1min (analyses)
- Automatic background refetching

---

## Future Enhancements

### Potential Improvements
1. **Optimistic UI Updates**: Show feedback immediately before server confirms
2. **Analysis Retry**: Allow retry of failed analyses without regenerating round
3. **Partial Regeneration**: Regenerate only specific participants
4. **Analysis Editing**: Allow users to request analysis improvements
5. **Export**: Export rounds as markdown/PDF

### Scalability Considerations
1. **Virtualization**: Implement virtual scrolling for long threads
2. **Lazy Loading**: Load old rounds on demand
3. **Analysis Caching**: Cache expensive analysis operations
4. **Incremental Sync**: Sync only changed data, not full thread

---

## Conclusion

The Roundtable application implements a robust, streaming-first architecture for multi-participant AI conversations. The system is built on a **round-centric model with LOCAL STATE management** after initial data load.

### Core Principles Summary

**1. Two-Phase Flow Architecture**:
- **Phase 1 - Overview Screen** (`/chat`):
  - User configures mode, participants (with roles), and participant order
  - First message triggers Round 1 execution on overview screen
  - URL dynamically updates to `/chat/[threadId]` WITHOUT full page refresh
  - All participants stream responses, LAST participant triggers analysis
  - After analysis completes, user auto-navigated to thread page

- **Phase 2 - Thread Page** (`/chat/[threadId]`):
  - All subsequent rounds happen here
  - **LOCAL STATE ONLY** after initial data load (no query refetches)
  - User can modify configuration (mode, participants, roles, order) at any time
  - Changes saved to LOCAL STATE and create changelog for next round
  - Each round uses **LATEST configuration from LOCAL STATE**

**2. Round-Centric Model**:
- Every round = User question → All participants respond → LAST participant triggers analysis
- Analysis accordion appears under its specific round
- Feedback applies to **entire round** (not per-message)
- Regeneration replaces **entire round** (ONLY on last round)
- Changelog shows changes between rounds (only when changes actually occur)

**3. LOCAL STATE Pattern (Thread Page)**:
- 🚨 Initial queries fetch data **ONCE on mount** (changelog, feedback, analyses)
- 🚨 After `hasInitiallyLoaded = true`, **ALL queries DISABLED FOREVER**
- 🚨 **ALL subsequent state changes are CLIENT-SIDE ONLY**
- 🚨 **NO query invalidations or refetches** (except streaming)
- 🚨 **Full page refresh is ONLY way** to re-sync with server
- Participant changes, feedback, changelog, analyses all managed in LOCAL STATE

**4. Analysis Triggering**:
- **LAST participant** (not "all participants") triggers analysis
- Analysis streams immediately via AI SDK `streamObject()`
- Pending analysis created in LOCAL STATE first
- `ModeratorAnalysisStream` component consumes stream with `experimental_useObject()`
- Analysis accordion positioned directly under its specific round

**5. Participant Configuration & Changelog**:
- Users can change mode, add/remove participants, change roles, reorder at **any time**
- All changes saved to **LOCAL STATE immediately**
- PUT request to backend creates changelog entry for next round
- Changelog accordion appears **BEFORE the round** that uses new configuration
- **No changelog** means no changes occurred between those rounds
- Subsequent rounds always use **LATEST configuration from LOCAL STATE**

**6. Regeneration (Last Round Only)**:
- 🚨 **Retry button ONLY on LAST round** (never on previous rounds)
- **Completely DELETES and REPLACES entire round**:
  - Deletes all participant responses
  - Deletes analysis
  - Re-executes round from ground up with fresh responses
- Uses **LATEST configuration from LOCAL STATE** for regeneration
- User can retry multiple times on the same round

**7. Feedback System (Per Round)**:
- Like/dislike applies to **entire round** (user question + all responses + analysis)
- **NOT per-message** (one feedback per round)
- Can be toggled: like → dislike → none (null)
- Optimistic updates in LOCAL STATE, mutations fire-and-forget

### Architecture Priorities

- **Local-First**: LOCAL STATE is single source of truth after initial load (thread page)
- **Streaming-First**: Progressive UI updates, real-time feedback via AI SDK v5
- **Round-Centric**: Everything scoped to rounds (question → responses → analysis)
- **Simplicity**: Clear one-way data flow, no circular dependencies
- **Reliability**: Analysis always triggers via LAST participant, no missing data
- **Performance**: Memoization, deduplication, no unnecessary refetches
- **Type Safety**: Full TypeScript + Zod validation

### Critical Implementation Reminders

- **Overview Screen**: Round 1 happens here, URL updates dynamically WITHOUT refresh, then navigates to thread page
- **Thread Page**: LOCAL STATE ONLY after initial load - **this is non-negotiable**
- **Query Pattern**: One-time fetch on mount, then **disabled forever** (no invalidations)
- **Latest Configuration**: Each round uses **LATEST config from LOCAL STATE** (reflects all user changes)
- **LAST Participant**: Always triggers analysis (not "all participants")
- **Feedback**: Per-round, not per-message, stored in LOCAL STATE
- **Regeneration**: ONLY last round, completely deletes and replaces
- **Changelog**: ONLY when changes occur, positioned before affected round

This documentation serves as the **definitive reference** for understanding and maintaining the Roundtable application flow. Any implementation **MUST follow these patterns** to ensure consistency, reliability, and correct behavior.
