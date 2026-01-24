# Roundtable Product Video Script (30s)

## Video Specs
- **Duration**: 30 seconds (900 frames @ 30fps)
- **Resolution**: 1920x1080 (16:9)
- **Style**: 3D depth effects, cinematic camera movements, glassmorphism
- **Music**: Upbeat electronic/ambient (cuts synced to transitions)

---

## SCENE BREAKDOWN

### SCENE 1: EPIC INTRO (0-2s, frames 0-60)
**Camera**: Zoom out from abstract particle cloud revealing Roundtable logo
**3D Effect**: Logo emerges from depth with parallax blur layers
**Text Animation**:
- Logo scales from 0.5 → 1.0 with spring bounce
- Tagline fades in from below: "One question. Every perspective."
**Music**: Beat drop on logo reveal

---

### SCENE 2: HOMEPAGE HERO (2-4s, frames 60-120)
**Camera**: Slow dolly right across homepage
**Content**: Actual homepage hero section with gradient mesh background
**3D Effect**: Floating UI cards at different z-depths with blur
**Text Animation**:
- "Meet the AI Council" types in
- Subtitle fades: "Multiple AI models. One conversation."
**Transition**: Zoom into chat interface

---

### SCENE 3: SIDEBAR & NAVIGATION (4-5.5s, frames 120-165)
**Camera**: Pan from sidebar to main content
**Content**:
- Sidebar with thread list (actual SidebarThreadItem components)
- Project folders (actual ProjectItem components)
- User avatar and settings
**3D Effect**: Sidebar slides in from left with depth shadow
**Text Animation**: "Organize your conversations" floats in
**Transition**: Focus shifts to chat input

---

### SCENE 4: CHAT INPUT - TYPING (5.5-7s, frames 165-210)
**Camera**: Close-up on chat input, slight tilt
**Content**:
- Empty input → cursor blink → text appears character by character
- "What's the best approach for launching a SaaS product?"
**3D Effect**: Input box has subtle float/hover effect
**Text Animation**: Typewriter effect with cursor
**Transition**: Pan up to show mode toggle

---

### SCENE 5: AUTO MODE (7-8.5s, frames 210-255)
**Camera**: Focus on toolbar, slight zoom
**Content**:
- Auto mode toggle (VideoAutoModeToggle)
- Toggle animates from Manual → Auto
- Purple gradient glow effect
**Text Animation**:
- "Auto Mode" label appears
- "AI picks the best models for your question"
**Transition**: Slide to model selection

---

### SCENE 6: MODEL SELECTION BUTTON (8.5-9.5s, frames 255-285)
**Camera**: Track the model selection button
**Content**:
- VideoModelSelectionButton with 4 model avatars
- Avatars animate in one by one
- Click effect → expands to modal
**Text Animation**: "Choose your council"
**Transition**: Modal expands from button

---

### SCENE 7: MODEL SELECTION MODAL (9.5-12s, frames 285-360)
**Camera**: Center on modal, slight perspective tilt
**Content**:
- Full modal with model list
- VideoModelItem components with:
  - Provider icons (Claude, GPT-4, Gemini, DeepSeek)
  - Toggle switches animating on/off
  - Drag handles visible
**Sub-animations**:
- 9.5-10.5s: Models appear with stagger
- 10.5-11s: First model gets "Moderator" badge
- 11-12s: Drag reorder animation (swap positions)
**Text Animation**: "Select. Assign roles. Reorder."
**Transition**: Modal collapses, focus to conversation mode

---

### SCENE 8: CONVERSATION MODES (12-13.5s, frames 360-405)
**Camera**: Slide to mode selector
**Content**:
- Mode selection pills/tabs
- "Brainstorm", "Debate", "Research", "Creative"
- Active mode pulses
**Text Animation**: "Pick your style"
**Transition**: Zoom out to show full input

---

### SCENE 9: FILE ATTACHMENTS (13.5-15s, frames 405-450)
**Camera**: Focus on attachment area
**Content**:
- VideoFileChip components appearing
- PDF chip slides in
- Image chip slides in
- Code file chip slides in
**Text Animation**: "Add context with files"
**Transition**: Input sends message

---

### SCENE 10: VOICE RECORDING (15-16.5s, frames 450-495)
**Camera**: Close-up on voice button
**Content**:
- Microphone button pulses
- Recording indicator appears
- Waveform animation
- Voice transcribes to text
**Text Animation**: "Or just speak"
**Transition**: Message sends

---

### SCENE 11: USER MESSAGE SENT (16.5-17.5s, frames 495-525)
**Camera**: Track message bubble rising
**Content**:
- VideoUserMessage component
- Right-aligned bubble with user text
- Send animation (slide up + fade in)
**3D Effect**: Message has depth shadow
**Text Animation**: None (message is the content)
**Transition**: Pan down to AI responses

---

### SCENE 12: AI PARTICIPANTS STREAMING (17.5-21s, frames 525-630)
**Camera**: Wide shot showing multiple responses, slight orbit
**Content**:
- 3 VideoParticipantMessage components
- Each streams in with typewriter effect
- Provider icons with glow
- Streaming indicators pulse
**Sub-animations**:
- 17.5-18.5s: Claude responds (anthropic icon)
- 18.5-19.5s: GPT-4o responds (openai icon)
- 19.5-20.5s: Gemini responds (google icon)
- 20.5-21s: All visible together
**Text Animation**: "Multiple perspectives. Real-time."
**Transition**: Moderator synthesis appears

---

### SCENE 13: MODERATOR SYNTHESIS (21-23s, frames 630-690)
**Camera**: Focus on moderator message, hero lighting
**Content**:
- VideoParticipantMessage with isModerator=true
- Roundtable logo as avatar
- "Council Moderator" name
- Synthesis text streams in
**3D Effect**: Glow behind moderator message
**Text Animation**: "Synthesized insight"
**Transition**: UI elements slide to reveal changelog

---

### SCENE 14: CHANGELOG ACCORDION (23-24s, frames 690-720)
**Camera**: Zoom to changelog section
**Content**:
- Accordion component (collapsed → expanded)
- Shows round history
- Edit indicators
**Text Animation**: "Track every change"
**Transition**: Slide to search results

---

### SCENE 15: SEARCH RESULTS (24-25.5s, frames 720-765)
**Camera**: Pan to search results section
**Content**:
- Search accordion expanded
- Citation cards with sources
- Link icons
**Text Animation**: "Grounded in real sources"
**Transition**: Zoom out to full interface

---

### SCENE 16: PROJECT MEMORY (25.5-27s, frames 765-810)
**Camera**: Show project detail screen
**Content**:
- Project header
- Memory cards
- Thread list within project
**Text Animation**: "Projects that remember"
**Transition**: Pull back to hero shot

---

### SCENE 17: GRAND FINALE (27-30s, frames 810-900)
**Camera**: Epic zoom out, 3D rotation around interface
**Content**:
- Full interface visible
- Rainbow gradient border effect
- Logo center stage
**Text Animation**:
- "roundtable.now" (gradient text)
- "Start your council today" (fade in below)
- "Try Free" button pulses
**Music**: Final beat, reverb tail
**End**: Fade to black with logo

---

## MUSIC RECOMMENDATION

**Track**: "Dreamscape" by Scott Buckley (CC BY 4.0)
- Available: https://www.scottbuckley.com.au/library/dreamscape/
- BPM: ~100 (fits 30s pacing)
- Style: Cinematic ambient electronic
- License: Free for commercial use with attribution

**Alternative**: "Aspire" by Scott Buckley
- More upbeat, tech-forward

**Beat sync points**:
- 0s: Intro build
- 2s: First beat drop (logo reveal)
- 7s: Rhythm shift (mode toggle)
- 12s: Build (modal showcase)
- 17.5s: Peak (streaming responses)
- 27s: Final crescendo
- 30s: Reverb tail

---

## 3D DEPTH EFFECTS

All scenes use layered depth:
1. **Background layer**: Blur 20px, scale 0.95, opacity 0.3
2. **Mid layer**: Blur 4px, scale 0.98, opacity 0.7
3. **Focus layer**: Sharp, scale 1.0, opacity 1.0
4. **Foreground accents**: Subtle blur 2px, floating particles

**Camera movement vocabulary**:
- Dolly: Smooth horizontal/vertical track
- Orbit: Gentle rotation around focus point
- Zoom: Scale with parallax (layers move at different speeds)
- Tilt: Perspective shift

---

## TEXT STYLES

**Headlines**:
- Font: Noto Sans, 48-64px, Bold
- Color: #FFFFFF
- Animation: Spring slide-up + fade

**Subtitles**:
- Font: Noto Sans, 24-32px, Medium
- Color: #A3A3A3 (muted)
- Animation: Fade in, 0.3s delay after headline

**Labels**:
- Font: Noto Sans, 16-20px, Regular
- Color: #DEDEDE
- Animation: Type-in effect

---

## COMPONENTS TO EXTRACT

### Chat Input Components
1. `chat-input.tsx` - Full input container
2. `chat-auto-mode-toggle.tsx` - Auto/Manual toggle
3. `chat-input-toolbar-menu.tsx` - Toolbar with buttons
4. `chat-input-attachments.tsx` - File attachment chips
5. `chat-input-voice.tsx` - Voice recording button

### Model Selection
6. `model-selection-modal.tsx` - Full modal
7. `model-item.tsx` - Individual model row
8. `model-selection-button.tsx` - Trigger button

### Messages
9. `chat-message-list.tsx` - User message bubble
10. `model-message-card.tsx` - AI response card
11. `participant-header.tsx` - Avatar + name header

### Accordions
12. `changelog-accordion.tsx` - Round history
13. `search-results-accordion.tsx` - Citations

### Navigation
14. `app-sidebar.tsx` - Main sidebar
15. `sidebar-thread-item.tsx` - Thread list item
16. `project-item.tsx` - Project in sidebar

### Screens
17. Homepage hero section
18. `ProjectDetailScreen.tsx` - Project view

### Modes
19. Conversation mode selector (if exists)
20. Role assignment UI

---

## IMPLEMENTATION PLAN

### Phase 1: Component Extraction (9 parallel agents)
- Agent 1: Chat input + toolbar components
- Agent 2: Auto mode toggle + mode selectors
- Agent 3: Model selection modal + items
- Agent 4: File attachments + voice
- Agent 5: User message + streaming
- Agent 6: Participant messages + moderator
- Agent 7: Accordions (changelog, search)
- Agent 8: Sidebar + navigation
- Agent 9: Homepage + project screens

### Phase 2: Scene Implementation
Create 17 scene files in `compositions/scenes/`

### Phase 3: 3D Effects Layer
Add depth blur, parallax, camera movements

### Phase 4: Music Integration
Add audio track, sync cuts to beats

### Phase 5: Final Composition
Assemble all scenes with transitions
