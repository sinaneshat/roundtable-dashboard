# Eager UI Rendering Analysis & Implementation Plan

## Executive Summary

After thorough code analysis, the current architecture ALREADY supports loading states in components. The issue is that components don't render until data arrives from the server because store arrays (`preSearches`, `analyses`) are empty.

## Current State Analysis

### What Already Works

1. **PreSearchCard** (`src/components/chat/pre-search-card.tsx`):
   - ✅ Handles PENDING status with "Searching" badge (line 170-174)
   - ✅ Handles STREAMING status with spinner and partial data
   - ✅ Handles FAILED status with error message
   - **Issue**: Only renders when `preSearches` array has items

2. **RoundAnalysisCard** (`src/components/chat/moderator/round-analysis-card.tsx`):
   - ✅ Handles PENDING/STREAMING with ModeratorAnalysisStream
   - ✅ Shows status badges (lines 45-62)
   - ✅ Handles FAILED status with error display
   - **Issue**: Only renders when `analyses[0]` exists (line 672 in ChatOverviewScreen)

3. **UnifiedLoadingIndicator** (`src/components/chat/unified-loading-indicator.tsx`):
   - ✅ Shows contextual loading messages
   - ✅ Cycles through appropriate messages for each phase
   - ✅ Positioned at bottom-left
   - **Works well, keep as is**

### The Problem

Components check for array existence before rendering:

```typescript
// ChatOverviewScreen.tsx:672
{createdThreadId && analyses[0] && (() => {
  // Only renders when analyses[0] exists
})()}
```

The arrays are populated AFTER server responds, not when the request starts.

## Solution: Store-Level Eager Population

### Approach

Modify store actions to create placeholder items with PENDING status when operations start, not when they complete.

### Implementation Steps

#### 1. Pre-Search Eager Creation

**Location**: `src/stores/chat/actions/pre-search-orchestrator.ts` or overview-actions

**Change**: When user submits message with web search enabled, immediately create a PENDING pre-search item:

```typescript
// BEFORE (current):
// Wait for server response, then add to store

// AFTER (eager):
const pendingPreSearch: StoredPreSearch = {
  id: `temp-${threadId}-${roundNumber}`,
  threadId,
  roundNumber,
  userQuery: inputValue, // User's query
  status: AnalysisStatuses.PENDING,
  searchData: null,
  errorMessage: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// Add immediately to store
addPreSearch(pendingPreSearch);
```

#### 2. Analysis Eager Creation  

**Location**: Store action that triggers analysis creation

**Change**: Create PENDING analysis item when round completes, not when analysis starts:

```typescript
// AFTER round completes:
const pendingAnalysis: StoredModeratorAnalysis = {
  id: `temp-${threadId}-${roundNumber}`,
  threadId,
  roundNumber,
  mode: selectedMode,
  userQuestion: inputValue,
  participantMessageIds: [], // Fill from completed messages
  status: AnalysisStatuses.PENDING,
  analysisData: null,
  errorMessage: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

createPendingAnalysis(pendingAnalysis);
```

#### 3. Participant Message Cards Eager Creation

**Current**: Messages only render after AI SDK returns chunks
**Proposed**: Create placeholder message with PENDING status for each participant when round starts

```typescript
// When starting participant streaming:
contextParticipants.forEach((participant, index) => {
  const placeholderMessage: UIMessage = {
    id: `pending-${participant.id}-${roundNumber}`,
    role: 'assistant',
    content: '', // Empty initially
    metadata: {
      role: 'assistant',
      roundNumber,
      participantId: participant.id,
      participantIndex: index,
      model: participant.modelId,
      // ... other required fields
    },
  };
  
  // Add to messages array
  messages.push(placeholderMessage);
});
```

## Modified Files

### Core Store Actions
1. `src/stores/chat/actions/overview-actions.ts` - Add pre-search placeholder creation
2. `src/stores/chat/actions/flow-controller.ts` - Add analysis placeholder creation
3. `src/stores/chat/store.ts` - Ensure `createPendingAnalysis` action exists

### UI Components (Minimal Changes)
1. `src/containers/screens/chat/ChatOverviewScreen.tsx`:
   - Change line 672: Remove `analyses[0] &&` check, always render if `analyses.length > 0`
   - Always render PreSearchCard if `preSearches.length > 0`

### Component Loading UI Enhancements

#### PreSearchCard - Add Prominent Loading State

**Current**: Only shows badge when PENDING
**Enhance**: Show full loading UI with spinner and explanatory text

```typescript
// In PreSearchCard.tsx ChainOfThoughtContent:
{isStreamingOrPending && !preSearch.searchData && (
  <div className="flex flex-col items-center justify-center py-8 gap-4">
    <Spinner className="size-6 text-blue-500" />
    <div className="text-center">
      <p className="text-sm font-medium text-muted-foreground">
        {t('chat.preSearch.searching')}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        {t('chat.preSearch.generatingQueries')}
      </p>
    </div>
  </div>
)}
```

#### RoundAnalysisCard - Add Prominent Loading State

**Current**: Only shows badge when PENDING
**Enhance**: Show full loading UI in content area

```typescript
// In RoundAnalysisCard.tsx ChainOfThoughtContent:
{(status === AnalysisStatuses.PENDING && !analysisData) && (
  <div className="flex flex-col items-center justify-center py-8 gap-4">
    <Spinner className="size-6 text-primary" />
    <div className="text-center">
      <p className="text-sm font-medium text-muted-foreground">
        {t('moderator.analyzing')}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        {t('moderator.analyzingSubtext')}
      </p>
    </div>
  </div>
)}
```

#### ModelMessageCard - Already Has Loading State

**Current**: Shows pulsing dot indicator (line 127-129)
**Good as is**, but could enhance:

```typescript
// If status is PENDING and no content:
{status === MessageStatuses.PENDING && !parts.length && (
  <div className="flex items-center gap-2 text-muted-foreground">
    <Spinner className="size-4" />
    <span className="text-sm">{t('chat.participant.waiting')}</span>
  </div>
)}
```

## Benefits of This Approach

1. **Minimal Code Changes** - Components already handle PENDING status
2. **Store-First Pattern** - Follows existing architecture
3. **Type-Safe** - Uses existing `StoredPreSearch` and `StoredModeratorAnalysis` types
4. **Resilient** - Server updates replace placeholder items when data arrives
5. **User-Friendly** - Users see structure immediately, understand what's coming

## Testing Considerations

### Unit Tests
- Test placeholder creation in store actions
- Test component rendering with PENDING status
- Test transition from PENDING → STREAMING → COMPLETE

### Integration Tests
- Test multi-round conversations with eager rendering
- Test error scenarios (PENDING → FAILED)
- Test component visibility during each phase

## Translation Keys Needed

Add to `src/i18n/locales/en/common.json`:

```json
{
  "chat": {
    "preSearch": {
      "generatingQueries": "Generating search queries...",
      "searching": "Searching the web...",
      "gatheringInfo": "Gathering information..."
    },
    "participant": {
      "waiting": "Waiting for response...",
      "thinking": "Thinking..."
    }
  },
  "moderator": {
    "analyzingSubtext": "Synthesizing insights from all participants..."
  }
}
```

## Rollout Strategy

### Phase 1: Core Store Changes
1. Modify store actions to create placeholders
2. Test with existing components (they should "just work")

### Phase 2: Enhanced Loading UI
1. Add Spinner component (already done)
2. Enhance PreSearchCard loading state
3. Enhance RoundAnalysisCard loading state
4. Enhance ModelMessageCard loading state (optional)

### Phase 3: Testing & Polish
1. Update tests for new flow
2. Test multi-round scenarios
3. Test error recovery
4. Polish animations and transitions

## Conclusion

The architecture is already prepared for eager rendering. We just need to:
1. Create placeholder items in the store when operations start
2. Remove conditional rendering checks that wait for data
3. Add enhanced loading UI within existing components

This approach maintains the existing patterns while achieving the desired UX improvement.
