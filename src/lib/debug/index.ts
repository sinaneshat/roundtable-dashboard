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

// Expose to window for debugging
if (typeof window !== 'undefined') {
  // @ts-expect-error - debug utilities on window
  window.__printTimeline = () => import('./conversation-tracer').then(m => m.printTimelineSummary());
  // @ts-expect-error - debug utilities on window
  window.__exportTimeline = () => import('./conversation-tracer').then(m => m.exportTimeline());
  // @ts-expect-error - debug utilities on window
  window.__getTimeline = () => import('./conversation-tracer').then(m => m.getTimeline());
}
