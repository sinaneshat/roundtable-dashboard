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
5. **URL updates**: `/chat` → `/chat/[unique-slug]` after moderator analysis completes (without page refresh)

**Behind the Scenes:**
- System creates conversation record in database
- Generates permanent URL slug from question
- Sets temporary title "New Chat" (replaced with AI-generated title in 2-5 seconds)
- Checks user hasn't exceeded monthly conversation quota
- Validates selected models are available on user's subscription tier
- Assigns Round 1 to all messages

---

## PART 2: AI RESPONSES STREAMING

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

## PART 3: ROUND ANALYSIS

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

**No navigation required** - the URL has already updated to `/chat/[slug]` after the moderator analysis completed (see Part 1). The user remains on the thread detail page and can immediately continue the conversation by typing another message.

---

## PART 4: THREAD DETAIL PAGE (CONTINUING CONVERSATION)

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

## PART 5: CONFIGURATION CHANGES MID-CONVERSATION

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

## PART 6: REGENERATING A ROUND

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

## PART 7: KEY BEHAVIORAL PATTERNS

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

## PART 8: TIMING AND PERFORMANCE

### Typical Round Duration
- Each AI response: 5-15 seconds
- Analysis generation: 8-12 seconds
- Full round (3 participants + analysis): ~20-40 seconds

### Response Behavior
- First token: ~800ms, then real-time streaming
- Transitions between participants: 200ms pause
- Analysis sections: 100ms stagger for smooth visual display

---

## PART 9: ERROR HANDLING USERS SEE

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

## PART 10: SUBSCRIPTION TIER IMPACTS

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

## PART 11: URL PATTERNS

### URL Transitions During Chat Journey

```
1. User lands on overview: /chat

2. User submits first message: /chat → /chat/[slug]
   (URL changes WITHOUT page refresh)

3. Analysis completes: /chat/[slug] (stays same)
   (Auto-navigation to thread detail page)

4. Subsequent rounds: /chat/[slug] (stays same)
   (All activity on same persistent page)
```

**Slug Format:** Permanent URL created from first message keywords
**Example:** "product-strategy-discussion-2024"

---

## PART 12: MOBILE VS DESKTOP

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
1. Land on `/chat` overview screen
2. Select 2-3 AI models with roles
3. Choose conversation mode
4. Submit first message
5. Verify URL changes to `/chat/[slug]`
6. Verify all participants respond sequentially
7. Verify analysis generates after last participant
8. Verify navigation to thread detail page

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

## VERSION HISTORY

**Version 2.0** - Focused Chat Journey Documentation
**Last Updated:** January 2025
**Contributors:** 10 specialized analysis agents (5 frontend + 5 backend)
**Scope:** Chat creation through round management flows only

---

This documentation describes the complete Roundtable chat experience from a user's perspective, explaining what they see, when they see it, and what's happening behind the scenes - all without technical code references.