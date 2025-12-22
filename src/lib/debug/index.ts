/**
 * Debug utilities
 *
 * Enable conversation tracing: localStorage.setItem('DEBUG_CONVERSATION', 'true')
 * View timeline summary: window.__printTimeline?.()
 * Export timeline: window.__exportTimeline?.()
 */

export {
  clearTimeline,
  exportTimeline,
  getTimeline,
  printTimelineSummary,
  setCurrentRound,
  trace,
  traceParticipantComplete,
  traceParticipantStart,
  traceRoundComplete,
  traceStart,
  traceState,
} from './conversation-tracer';

// Type-safe window augmentation for debug utilities
declare global {
  // eslint-disable-next-line ts/consistent-type-definitions
  interface Window {
    __printTimeline?: () => Promise<void>;
    __exportTimeline?: () => Promise<string>;
    __getTimeline?: () => Promise<unknown>;
  }
}

// Expose to window for debugging
if (typeof window !== 'undefined') {
  window.__printTimeline = () => import('./conversation-tracer').then(m => m.printTimelineSummary());
  window.__exportTimeline = () => import('./conversation-tracer').then(m => m.exportTimeline());
  window.__getTimeline = () => import('./conversation-tracer').then(m => m.getTimeline());
}
