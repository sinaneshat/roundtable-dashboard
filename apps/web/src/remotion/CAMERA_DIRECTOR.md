# Roundtable Showcase - Camera Director Script

## Visual Philosophy

**Core principle:** Clean, professional cinematography. No gimmicks, no 3D spinning, no dramatic zooms. Let the product speak for itself.

**Tone:** Confident, calm, polished. Like a high-end Apple product video - minimal camera movement, deliberate focus, smooth transitions.

**Color:** Neutral gray theme. No colored lighting that tints the scene.

---

## Global Camera Rules

1. **NO 3D spinning/rotating** - Camera stays level
2. **NO flying through/zooming through** - Simple cuts or fades between scenes
3. **NO extreme zooms** - Subtle scale changes only (0.96x to 1.0x max)
4. **Transitions:** Simple fade() only - no depth effects, no camera orbits
5. **Logo/text:** Static presentation, no 3D animation

---

## Scene Breakdown

### Scene 01: Intro (0-3s, 90 frames)

**Shot type:** Static wide
**Camera position:** Center frame, eye level
**Movement:** None (static hold)

| Time | Action | Camera |
|------|--------|--------|
| 0-30 | Logo fades in, scales from 0.3x to 1.0x | Static |
| 30-50 | Tagline slides up | Static |
| 50-80 | Hold | Static |
| 80-90 | Fade to black | Static |

**Notes:**
- Logo reveal: simple scale + opacity animation
- No Y-rotation flip (remove `rotateY`)
- Rainbow border rotation: slow, subtle (270deg over 90 frames)

---

### Scene 02: Homepage (3-6s, 90 frames)

**Shot type:** Wide establishing shot
**Camera position:** Center, slight breathing motion
**Movement:** Subtle breathing (3px amplitude)

| Time | Action | Camera |
|------|--------|--------|
| 0-25 | Browser frame fades in, scales from 0.96x to 1.0x | Static with breathing |
| 25-80 | Hold on homepage hero | Breathing only |
| 80-90 | Fade out | Static |

---

### Scene 03: Sidebar (6-8.5s, 75 frames)

**Shot type:** Wide
**Camera position:** Center
**Movement:** Subtle breathing only

| Time | Action | Camera |
|------|--------|--------|
| 0-20 | Browser frame entrance (scale 0.96x to 1.0x) | Static |
| 20-65 | Thread list items animate in | Breathing only |
| 65-75 | Fade out | Static |

---

### Scene 04: Chat Input (8.5-18.5s, 300 frames)

**Shot type:** Medium shot of input area
**Camera position:** Center, subtle breathing
**Movement:** NO feature zooms, NO tilts

| Time | Action | Camera |
|------|--------|--------|
| 0-30 | Input appears | Scale entrance 0.96x to 1.0x |
| 30-70 | Model button shown | Static |
| 70-100 | Switch to Auto mode | Static |
| 100-125 | Drag overlay | Static |
| 125-170 | File chips animate in | Static |
| 170-210 | Voice recording | Static |
| 210-260 | Text types | Static |
| 260-300 | Send button pulses | Static, fade out |

**Notes:**
- Remove all `featureZoom` logic
- Remove camera tilt (no `rotateX`)
- Keep only subtle breathing motion

---

### Scene 05: Model Modal (18.5-28.5s, 300 frames)

**Shot type:** Medium shot of modal
**Camera position:** Center
**Movement:** Breathing only, NO zooms

| Time | Action | Camera |
|------|--------|--------|
| 0-30 | Modal fades in | Scale entrance |
| 30-90 | Presets tab | Static |
| 90-120 | Tab switches to Custom | Static |
| 120-200 | Custom models appear | Static |
| 200-240 | Drag reorder | Static |
| 240-270 | Role chip assigned | Static |
| 270-300 | Modal closes | Fade out |

---

### Scene 06: Chat Thread (28.5-52.5s, 720 frames) - CORE SCENE

**Shot type:** Medium shot following conversation
**Camera position:** Center
**Movement:** Gentle vertical scroll tracking

#### Camera Behavior During Streaming:

```
┌─────────────────────────────────────────────────┐
│  When participant starts streaming:             │
│  1. Scale: 1.0x → 1.02x (subtle zoom in)        │
│  2. Focus: Other messages blur (2px)            │
│                                                 │
│  When participant finishes streaming:           │
│  1. Scale: 1.02x → 1.0x (zoom back)             │
│  2. Focus: All messages sharp (blur removed)   │
│                                                 │
│  NO pulse animation                             │
│  NO glow/boxShadow effects                      │
│  NO transform oscillation                       │
└─────────────────────────────────────────────────┘
```

| Time | Action | Camera |
|------|--------|--------|
| 0-30 | User message slides up | Static |
| 30-80 | Web search accordion | Static |
| 80-90 | Accordion collapses | Static |
| 90-130 | Placeholders appear | Static |
| 130-220 | Claude streams | Scale 1.02x, others blur |
| 220-230 | Claude done | Scale back to 1.0x, blur removed |
| 230-320 | GPT-4o streams | Scale 1.02x, others blur |
| 320-330 | GPT-4o done | Scale back to 1.0x |
| 330-420 | Gemini streams | Scale 1.02x, others blur |
| 420-430 | Gemini done | Scale back to 1.0x |
| 430-540 | Moderator streams | Scale 1.02x, others blur |
| 540-560 | Moderator done | Scale back to 1.0x |
| 560-710 | Hold on complete thread | Static |
| 710-720 | Fade out | Static |

**Key changes from current:**
- Remove `getStreamingPulse()` entirely
- Remove `getMessageEntrance3D()` boxShadow
- Simplify to: streaming = slight scale up + others blur
- No continuous animation during stream

---

### Scene 07: Finale (52.5-57.5s, 150 frames)

**Shot type:** Wide centered
**Camera position:** Center
**Movement:** Static

| Time | Action | Camera |
|------|--------|--------|
| 0-35 | Logo fades in, scales up | Static |
| 35-60 | CTA button enters | Static |
| 60-75 | Hold | Static |
| 75-90 | Fade to black | Static |

**Notes:**
- NO 3D letter animation (removed)
- NO rainbow gradient border (simplified)
- Simple dark container with subtle shadow
- Larger CTA button (28px font, 20px 56px padding)

---

## Transition Table

| From → To | Transition | Duration |
|-----------|------------|----------|
| Intro → Homepage | `fade()` | 24 frames |
| Homepage → Sidebar | `fade()` | 15 frames |
| Sidebar → ChatInput | `fade()` | 15 frames |
| ChatInput → ModelModal | `fade()` | 24 frames |
| ModelModal → ChatThread | `fade()` | 24 frames |
| ChatThread → Finale | `fade()` | 36 frames |

---

## Technical Specifications

### Removed Effects

1. **3D Transitions:** `depthFade`, `cameraOrbit`, `zoomThrough`, `chromaticZoom`
2. **Streaming effects:** `getStreamingPulse()`, `boxShadow` animations
3. **3D entrance:** `rotateX/Y/Z` transforms, `translateZ` depth
4. **Letter3D:** Rainbow 3D letters in finale
5. **Colored lighting:** Sky blue directional light

### Kept Effects

1. **Breathing motion:** Subtle 2-3px oscillation for life
2. **Depth particles:** Background ambient particles
3. **Edge vignette:** Cinematic darkening at edges
4. **Focus blur:** Non-streaming messages get 2px blur
5. **Scale entrance:** 0.96x → 1.0x for scene entrances

### Spring Configurations

```typescript
// Smooth entrance (no bounce)
const SMOOTH = { damping: 200 };

// Snappy UI response
const SNAPPY = { damping: 20, stiffness: 200 };

// Cinematic (slow, deliberate)
const CINEMATIC = { damping: 40, stiffness: 100, mass: 1.2 };
```

---

## Implementation Checklist

- [ ] Scene01Intro: Remove `rotateY` from logo
- [ ] SceneChatInput: Remove feature zooms and camera tilts
- [ ] SceneChatThread: Replace pulse/glow with simple scale + blur
- [ ] SceneModelModal: Remove 3D effects
- [ ] Scene17Finale: Remove Letter3D (already done)
- [ ] RoundtableShowcase: All transitions to `fade()` (already done)
- [ ] Browser3DMesh: Light color to white (already done)
