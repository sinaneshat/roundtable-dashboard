/**
 * Showcase Scenes Index
 * Exports all 7 scenes for the streamlined RoundtableShowcase composition
 *
 * Scene Structure:
 * 01 Intro (3s)        - Logo reveal
 * 02 Homepage (3s)     - Hero section
 * 03 Sidebar (2.5s)    - Navigation
 * 04 ChatInput (10s)   - Unified: auto mode, models, files, voice, typing
 * 05 ModelModal (10s)  - Tabs, presets, custom, drag reorder
 * 06 ChatThread (14s)  - Unified: user msg → web search → placeholders → streaming → moderator
 * 07 Finale (5s)       - CTA
 */

// Core scenes
export { Scene01Intro } from './Scene01Intro';
export { Scene02Homepage } from './Scene02Homepage';
export { Scene03Sidebar } from './Scene03Sidebar';

// Finale
export { Scene17Finale } from './Scene17Finale';

// Unified feature scenes
export { SceneChatInput } from './SceneChatInput';
export { SceneChatThread } from './SceneChatThread';
export { SceneModelModal } from './SceneModelModal';
