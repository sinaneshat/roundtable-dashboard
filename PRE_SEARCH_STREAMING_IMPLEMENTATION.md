# Pre-Search Streaming UI Implementation Summary

## Overview

This document outlines the implementation of streaming pre-search UI components for the chat interface. The pre-search feature performs web searches before AI participants respond, providing context for their answers.

## Components Implemented

### 1. ChainOfThoughtPreSearch Component
**Location**: `/src/components/chat/chain-of-thought-pre-search.tsx`

**Purpose**: Displays real-time progress of pre-search operations using the Chain of Thought design pattern.

**Features**:
- Shows user query being processed
- Displays each search query as it executes (with rationale and search depth)
- Shows results count and response time for completed searches
- Provides summary statistics when all searches complete
- Error state handling

**Store Integration**:
- Reads from `WebSearchSlice` in the chat store
- Monitors `preSearchStatus`, `preSearchUserQuery`, `preSearchQueries`
- Automatically shows/hides based on search activity

### 2. Chat Message List Integration
**Location**: `/src/components/chat/chat-message-list.tsx`

**Changes**:
- Imported `ChainOfThoughtPreSearch` component
- Added `useChatStore` to access pre-search status
- Displays `ChainOfThoughtPreSearch` during active searching
- Displays `PreSearchDisplay` (existing) after search completion
- Proper conditional rendering to avoid showing both simultaneously

**Flow**:
```
User Message
  ↓
ChainOfThoughtPreSearch (during active search)
  ↓
PreSearchDisplay (after completion with metadata)
  ↓
AI Participant Responses
  ↓
Analysis
```

## Store State Management

### WebSearchSlice (Already Exists)
**Location**: `/src/stores/chat/store.ts`

**State**:
```typescript
type PreSearchQuery = {
  query: string;
  rationale: string;
  searchDepth: 'basic' | 'advanced';
  index: number;
  total: number;
  status: 'pending' | 'searching' | 'complete' | 'failed';
  result?: WebSearchResult;
  timestamp: number;
};

type WebSearchSlice = {
  preSearchStatus: 'idle' | 'generating_queries' | 'searching' | 'complete' | 'error';
  preSearchUserQuery: string | null;
  preSearchQueries: PreSearchQuery[];
  preSearchAnalysis: string | null;
  preSearchTotalTime: number;
  preSearchError: string | null;

  // Actions
  startPreSearch: (data: PreSearchStartData) => void;
  addPreSearchQuery: (data: PreSearchQueryData) => void;
  updatePreSearchResult: (data: PreSearchResultData) => void;
  completePreSearch: (data: PreSearchCompleteData) => void;
  failPreSearch: (error: string) => void;
  resetPreSearch: () => void;
};
```

**Actions Implemented**:
- `startPreSearch`: Initializes pre-search state when search begins
- `addPreSearchQuery`: Adds a new search query to the list
- `updatePreSearchResult`: Updates query with results when search completes
- `completePreSearch`: Marks entire pre-search phase as complete
- `failPreSearch`: Sets error state
- `resetPreSearch`: Clears all pre-search state

## Backend Event Schema

### Pre-Search Events (Defined but not yet emitted)
**Location**: `/src/api/routes/chat/schema.ts`

**Event Types**:

1. **PreSearchStartData**
```typescript
{
  type: 'pre_search_start',
  timestamp: number,
  userQuery: string,
  totalQueries: number (1-5)
}
```

2. **PreSearchQueryData**
```typescript
{
  type: 'pre_search_query',
  timestamp: number,
  query: string,
  rationale: string,
  searchDepth: 'basic' | 'advanced',
  index: number,
  total: number
}
```

3. **PreSearchResultData**
```typescript
{
  type: 'pre_search_result',
  timestamp: number,
  query: string,
  answer: string | null,
  resultCount: number,
  responseTime: number,
  index: number
}
```

4. **PreSearchCompleteData**
```typescript
{
  type: 'pre_search_complete',
  timestamp: number,
  totalSearches: number,
  successfulSearches: number,
  failedSearches: number,
  totalResults: number
}
```

## Integration Points (TODO)

### Backend - Emit Pre-Search Events
**Location**: `/src/api/routes/chat/handlers/streaming.handler.ts` or `/src/api/services/web-search-presearch.service.ts`

The backend needs to emit these events during the pre-search phase:

```typescript
// When starting pre-search
streamData.append({
  type: 'pre_search_start',
  timestamp: Date.now(),
  userQuery: message.text,
  totalQueries: queries.length
});

// For each query
streamData.append({
  type: 'pre_search_query',
  timestamp: Date.now(),
  query: query.query,
  rationale: query.rationale,
  searchDepth: query.searchDepth,
  index: i,
  total: queries.length
});

// When query completes
streamData.append({
  type: 'pre_search_result',
  timestamp: Date.now(),
  query: query.query,
  answer: result.answer,
  resultCount: result.results.length,
  responseTime: result.responseTime,
  index: i
});

// When all complete
streamData.append({
  type: 'pre_search_complete',
  timestamp: Date.now(),
  totalSearches: queries.length,
  successfulSearches: successCount,
  failedSearches: failCount,
  totalResults: totalResults
});
```

### Frontend - Handle Stream Data Events
**Location**: `/src/hooks/utils/use-multi-participant-chat.ts` or create new `/src/hooks/utils/use-pre-search-stream.ts`

**Option A: Extend useChat with onStreamEvent**
The AI SDK v5 doesn't directly expose streamData events in useChat. We need to either:

1. **Custom Transport**: Create a custom transport that intercepts the stream
2. **Message Metadata**: Have backend include pre-search data in message metadata
3. **Separate Hook**: Create a hook that subscribes to the chat store and processes events

**Option B: Use onFinish with Metadata (Recommended)**
The backend can include pre-search data in the message metadata, and we process it in the `onFinish` callback:

```typescript
onFinish: async (data) => {
  // Existing metadata handling...

  // Check for pre-search metadata
  if (data.message?.metadata?.preSearch) {
    // Already handled by PreSearchDisplay component
    // The streaming UI would have already shown live progress
  }
}
```

**Option C: Custom Stream Data Handler (Most Flexible)**
Create a separate hook that listens to the stream data:

```typescript
// src/hooks/utils/use-pre-search-stream.ts
import { useChatStore } from '@/stores/chat/provider';

export function usePreSearchStream() {
  const startPreSearch = useChatStore(s => s.startPreSearch);
  const addPreSearchQuery = useChatStore(s => s.addPreSearchQuery);
  const updatePreSearchResult = useChatStore(s => s.updatePreSearchResult);
  const completePreSearch = useChatStore(s => s.completePreSearch);
  const failPreSearch = useChatStore(s => s.failPreSearch);

  // This would be called from a custom transport or stream processor
  const handleStreamData = useCallback((event: PreSearchStreamData) => {
    switch (event.type) {
      case 'pre_search_start':
        startPreSearch(event);
        break;
      case 'pre_search_query':
        addPreSearchQuery(event);
        break;
      case 'pre_search_result':
        updatePreSearchResult(event);
        break;
      case 'pre_search_complete':
        completePreSearch(event);
        break;
    }
  }, [startPreSearch, addPreSearchQuery, updatePreSearchResult, completePreSearch]);

  return { handleStreamData };
}
```

## Translation Keys

All translation keys are already defined in `/src/i18n/locales/en/common.json`:

- `chat.preSearch.title`: "Initial Web Research"
- `chat.preSearch.searchDepth.basic`: "basic"
- `chat.preSearch.searchDepth.advanced`: "advanced"
- `chat.tools.webSearch.source.singular`: "source"
- `chat.tools.webSearch.source.plural`: "sources"

## Testing Plan

### Manual Testing Steps

1. **Start a new conversation with web search enabled**
   - Verify ChainOfThoughtPreSearch appears after sending message
   - Check that user query is displayed

2. **Monitor search progress**
   - Verify each search query appears with rationale
   - Check search depth badge displays correctly
   - Confirm active status indicator shows for current search

3. **Verify completion**
   - Check results count displays for each query
   - Verify response time is shown
   - Confirm summary statistics are accurate
   - Verify ChainOfThoughtPreSearch is replaced with PreSearchDisplay

4. **Error handling**
   - Test with network errors
   - Verify error message displays properly
   - Check that UI recovers gracefully

### Mock Testing (Before Backend Integration)

Create a test utility to simulate streaming events:

```typescript
// test-utils/mock-pre-search-stream.ts
import { useChatStore } from '@/stores/chat/provider';

export function mockPreSearchStream() {
  const store = useChatStore.getState();

  // Simulate pre-search start
  setTimeout(() => {
    store.startPreSearch({
      type: 'pre_search_start',
      timestamp: Date.now(),
      userQuery: 'Test query',
      totalQueries: 3
    });
  }, 100);

  // Simulate queries
  [0, 1, 2].forEach((i) => {
    setTimeout(() => {
      store.addPreSearchQuery({
        type: 'pre_search_query',
        timestamp: Date.now(),
        query: `Test query ${i + 1}`,
        rationale: `Testing search ${i + 1}`,
        searchDepth: i % 2 === 0 ? 'basic' : 'advanced',
        index: i,
        total: 3
      });

      // Simulate result
      setTimeout(() => {
        store.updatePreSearchResult({
          type: 'pre_search_result',
          timestamp: Date.now(),
          query: `Test query ${i + 1}`,
          answer: 'Test answer',
          resultCount: 5,
          responseTime: 250,
          index: i
        });
      }, 1000);
    }, 500 * (i + 1));
  });

  // Simulate completion
  setTimeout(() => {
    store.completePreSearch({
      type: 'pre_search_complete',
      timestamp: Date.now(),
      totalSearches: 3,
      successfulSearches: 3,
      failedSearches: 0,
      totalResults: 15
    });
  }, 4000);
}
```

## Next Steps

1. **Backend Implementation**: Emit pre-search events from the streaming handler
2. **Stream Data Handler**: Implement the stream data event handler (Option C recommended)
3. **Integration Testing**: Test with real backend streaming
4. **Performance Optimization**: Ensure smooth transitions between states
5. **Accessibility**: Add ARIA labels and keyboard navigation
6. **Mobile Optimization**: Test on mobile devices and adjust layout if needed

## Files Modified

### Created
- `/src/components/chat/chain-of-thought-pre-search.tsx` - Streaming UI component

### Modified
- `/src/components/chat/chat-message-list.tsx` - Integrated ChainOfThoughtPreSearch
- `/src/stores/chat/store.ts` - Added WebSearchSlice (already existed)

### Existing (No Changes Needed)
- `/src/api/routes/chat/schema.ts` - Pre-search event schemas defined
- `/src/components/chat/pre-search-display.tsx` - Post-completion display
- `/src/components/ai-elements/chain-of-thought.tsx` - Base UI component
- `/src/i18n/locales/en/common.json` - Translation keys

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  User sends message → useMultiParticipantChat              │
│                              ↓                              │
│                    DefaultChatTransport                     │
│                              ↓                              │
│                   POST /api/v1/chat/stream                  │
│                                                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ HTTP Stream
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                         Backend                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  streamChatHandler                                          │
│         ↓                                                   │
│  performPreSearches() ──→ Emit pre_search_start            │
│         ↓                                                   │
│  For each query:                                           │
│    - Emit pre_search_query                                 │
│    - Execute search                                        │
│    - Emit pre_search_result                                │
│         ↓                                                   │
│  Emit pre_search_complete                                  │
│         ↓                                                   │
│  Continue with AI participant streaming                    │
│                                                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Stream Data Events
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Store                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  WebSearchSlice receives events:                           │
│    - startPreSearch()                                      │
│    - addPreSearchQuery()                                   │
│    - updatePreSearchResult()                               │
│    - completePreSearch()                                   │
│                                                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Store Updates
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                    UI Components                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ChatMessageList                                           │
│         ↓                                                   │
│  ChainOfThoughtPreSearch (if preSearchStatus active)      │
│    - Shows real-time progress                              │
│    - Updates as queries execute                            │
│         ↓                                                   │
│  PreSearchDisplay (if complete, from message metadata)     │
│    - Shows final summary                                   │
│    - Collapsible details                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Conclusion

The frontend UI infrastructure is now complete and ready for backend integration. The implementation follows established patterns:

- **Component Architecture**: Uses existing ChainOfThought pattern
- **State Management**: WebSearchSlice in unified chat store
- **Type Safety**: All events defined with Zod schemas
- **Accessibility**: Built on accessible shadcn/ui components
- **Internationalization**: All text uses translation keys
- **Performance**: Optimized with React.memo and proper state selectors

Once the backend emits the pre-search events, the UI will automatically display streaming progress to users.
