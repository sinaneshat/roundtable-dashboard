# Roundtable Application Flow Documentation

## Overview
Roundtable is a collaborative AI brainstorming platform where multiple AI models work together to solve problems. This document describes the complete flow of conversations, rounds, analyses, and regeneration.

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

### Phase 1: Initialization

```
1. User visits /chat (Overview Screen)
   ├─ Empty state with mode selector
   ├─ Participant selection dropdown
   └─ Input field for first question

2. User selects:
   ├─ Mode (e.g., "Brainstorming")
   ├─ Participants (e.g., GPT-4, Claude, Gemini)
   └─ Optional: Participant roles and priorities

3. User enters question and presses Enter
   ├─ Thread created (if not exists)
   ├─ Question saved with roundNumber: 1
   └─ Navigate to thread page OR stay on overview

### Phase 1b: Thread Page Initial Load (Server-Side Rendering)

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

Initial State Hydration:
   ├─ clientChangelog ← changelog data (once)
   ├─ clientFeedback ← Map<roundNumber, 'like'|'dislike'|null> (once)
   └─ analyses ← all analyses from cache (once)

After data loads:
   └─ hasInitiallyLoaded = true
      └─ ALL queries now disabled (enabled: false)
         └─ Client state is source of truth from this point forward
```

### Phase 2: Round Execution

```
ROUND 1: First Question

1. User Message Sent
   ├─ Message saved with roundNumber: 1
   ├─ roundManager.handleRoundComplete() NOT triggered yet
   └─ Streaming begins

2. Participant Streaming (Sequential)
   ├─ Participant 1 responds (streams via AI SDK useChat)
   ├─ Participant 2 responds
   └─ Participant N responds

3. All Participants Complete
   ├─ onFinish callback triggers
   ├─ roundManager.handleRoundComplete() called
   ├─ Pending analysis created in cache
   └─ Analysis streaming begins

4. Analysis Streaming
   ├─ ModeratorAnalysisStream detects pending status
   ├─ POST /analyze endpoint called
   ├─ AI SDK streamObject() streams analysis
   ├─ UI updates progressively:
   │   ├─ Leaderboard appears
   │   ├─ Skills comparison chart
   │   ├─ Participant evaluations
   │   └─ Overall summary and conclusion
   └─ Analysis marked as completed

5. Round 1 Complete ✅
   └─ UI shows: User message → Participant responses → Analysis accordion
```

### Phase 3: Subsequent Rounds

```
ROUND 2+: Next Question

1. User Changes (Optional)
   ├─ Changes mode: "Brainstorming" → "Debating"
   ├─ Changes participants: Add/remove/reorder
   └─ Changelog entry created BEFORE round starts

2. User Sends Next Message
   ├─ Message saved with roundNumber: 2
   ├─ Changelog positioned BEFORE round 2 messages
   └─ Round 2 execution (same as Phase 2)

3. UI Order Per Round:
   Round 1:
   ├─ Messages (user + participants)
   └─ Analysis

   Round 2:
   ├─ Changelog (shows what changed)
   ├─ Messages (user + participants)
   └─ Analysis

   Round N:
   ├─ Changelog (if changes occurred)
   ├─ Messages
   └─ Analysis
```

### Phase 4: Regeneration (Retry)

```
REGENERATION: User Wants to Retry Last Round

1. User Clicks "Retry" Button
   ├─ Button only shown on LAST round
   ├─ retryRound() called from context
   └─ setOnRetry callback triggered

2. Immediate UI Updates
   ├─ Old analysis removed from cache
   ├─ Round marked as "regenerating"
   ├─ Old analysis accordion disappears
   └─ Loader appears

3. Backend Operations
   ├─ DELETE all participant messages for round
   ├─ DELETE analysis for round
   ├─ Reload() called to restart chat
   └─ Round re-executes from step 1

4. New Round Execution
   ├─ Same participants respond (fresh responses)
   ├─ New analysis generated
   └─ UI shows new content replacing old

Note: Regeneration REPLACES the entire round, not just one message!
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

### 3. Round Feedback Scope

**Critical**: Feedback applies to ENTIRE round, not individual messages

**Implementation**:
```typescript
// Feedback stored by roundNumber
const feedbackByRound = new Map<number, 'like' | 'dislike'>();

// Handler scoped to round
const handleFeedbackChange = (
  roundNumber: number,
  feedbackType: 'like' | 'dislike' | null
) => {
  setRoundFeedbackMutation.mutate({
    threadId,
    roundNumber, // Backend stores by round
    feedbackType
  });
};

// UI shows one set of buttons per round
<RoundFeedback
  roundNumber={roundNumber}
  currentFeedback={feedbackByRound.get(roundNumber)}
  onFeedbackChange={handler}
/>
```

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

### ✅ Scenario 1: First Round in Overview Screen
1. Select mode + participants
2. Enter question
3. All participants respond
4. Analysis triggers and streams
5. Navigation to thread page (optional)

**Expected**:
- Round 1 messages appear
- Analysis accordion shows under messages
- Loader visible during analysis
- All components render without duplicates

### ✅ Scenario 2: Multiple Rounds in Thread
1. Send first question (Round 1)
2. Wait for analysis
3. Send second question (Round 2)
4. Wait for analysis

**Expected**:
- Round 1: Messages + Analysis
- Round 2: Messages + Analysis
- No duplicates
- Each analysis under its round

### ✅ Scenario 3: Mode/Participant Changes
1. Complete Round 1
2. Change mode (Brainstorming → Debating)
3. Send Round 2 question

**Expected**:
- Changelog appears BEFORE Round 2 messages
- Shows "Mode changed"
- Round 2 uses new mode
- Analysis reflects new mode

### ✅ Scenario 4: Regeneration
1. Complete Round 1
2. Click Retry button

**Expected**:
- Old analysis disappears immediately
- Loader appears
- New participant responses generated
- New analysis generated
- UI shows fresh content only

### ✅ Scenario 5: Round Feedback
1. Complete Round 1
2. Click "like" button

**Expected During Session**:
- Like button immediately highlighted (optimistic update)
- clientFeedback Map updated: `Map.set(1, 'like')`
- Mutation fires (fire-and-forget)
- NO query invalidation
- NO GET request
- Feedback persists for remainder of session

**Expected After Page Refresh**:
- Thread page loads
- Feedback query fetches all feedback
- clientFeedback Map hydrated with server data
- Like button shows highlighted state
- Applies to entire round (not individual messages)

### ✅ Scenario 6: Page Refresh During Analysis
1. Start round
2. Refresh during analysis streaming

**Expected**:
- Analysis continues (backend handles streaming)
- Query polling detects completion
- UI shows completed analysis
- No duplicate analyses

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

The Roundtable application implements a robust, streaming-first architecture for multi-participant AI conversations. The key to understanding the system is the **round-centric** model:

- Everything is scoped to rounds
- Rounds are complete cycles (question → responses → analysis)
- State management ensures analyses always appear under their round
- Regeneration replaces entire rounds, not individual messages
- Feedback applies to entire rounds
- Changelog shows changes between rounds

The architecture prioritizes:
- **Simplicity**: Clear data flow, no circular dependencies
- **Reliability**: Analysis always triggers, no missing data
- **Performance**: Memoization, deduplication, efficient rendering
- **Type Safety**: Full TypeScript + Zod validation
- **Streaming**: Progressive UI updates, real-time feedback

This documentation should serve as the definitive reference for understanding and maintaining the application flow.
