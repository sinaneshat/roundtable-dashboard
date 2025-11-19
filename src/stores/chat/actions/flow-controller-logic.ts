/**
 * Flow Controller - Extracted Testable Logic
 *
 * Pure functions extracted from flow-controller.ts for testing
 * These functions contain the core logic without React hook dependencies
 */

import { AnalysisStatuses } from '@/api/core/enums';
import type { StoredModeratorAnalysis } from '@/api/routes/chat/schema';

/**
 * Check if first analysis (round 0) is completed
 *
 * PRIMARY: Analysis status = 'complete'
 * FALLBACK 1: Analysis stuck at 'streaming' for >60s
 * FALLBACK 2: Analysis stuck at 'pending' for >60s (when not streaming)
 *
 * @param analysis - The analysis to check (should be round 0)
 * @param isStreaming - Whether chat is currently streaming
 * @returns true if analysis should be considered complete
 */
export function isFirstAnalysisComplete(
  analysis: StoredModeratorAnalysis | undefined,
  isStreaming: boolean,
): boolean {
  if (!analysis || analysis.roundNumber !== 0) {
    return false;
  }

  // PRIMARY: Analysis reached 'completed' status
  if (analysis.status === AnalysisStatuses.COMPLETE) {
    return true;
  }

  // SAFETY NET 1: Analysis stuck at 'streaming' for >60s
  if (
    analysis.status === AnalysisStatuses.STREAMING
    && analysis.createdAt
  ) {
    const SAFETY_TIMEOUT_MS = 60000; // 60 seconds
    const createdTime = analysis.createdAt instanceof Date
      ? analysis.createdAt.getTime()
      : new Date(analysis.createdAt).getTime();
    const elapsed = Date.now() - createdTime;

    if (elapsed > SAFETY_TIMEOUT_MS) {
      return true;
    }
  }

  // SAFETY NET 2: Analysis stuck at 'pending' for >60s (when not streaming)
  if (
    !isStreaming
    && analysis.status === AnalysisStatuses.PENDING
    && analysis.createdAt
  ) {
    const SAFETY_TIMEOUT_MS = 60000; // 60 seconds
    const createdTime = analysis.createdAt instanceof Date
      ? analysis.createdAt.getTime()
      : new Date(analysis.createdAt).getTime();
    const elapsed = Date.now() - createdTime;

    if (elapsed > SAFETY_TIMEOUT_MS) {
      return true;
    }
  }

  return false;
}

/**
 * Check if navigation can proceed without waiting for analysis
 * Defensive fallback: After 15s, if participants done + AI slug ready, proceed
 *
 * @param analysis - The analysis to check (should be round 0)
 * @param isStreaming - Whether chat is currently streaming
 * @param hasAiSlug - Whether AI-generated slug is ready
 * @returns true if navigation can proceed without analysis
 */
export function canNavigateWithoutAnalysis(
  analysis: StoredModeratorAnalysis | undefined,
  isStreaming: boolean,
  hasAiSlug: boolean,
): boolean {
  if (!analysis || analysis.roundNumber !== 0) {
    return false;
  }

  // After 15s, if participants done + AI slug ready, proceed
  if (analysis.createdAt) {
    const createdTime = analysis.createdAt instanceof Date
      ? analysis.createdAt.getTime()
      : new Date(analysis.createdAt).getTime();
    const elapsed = Date.now() - createdTime;

    if (elapsed > 15000 && !isStreaming && hasAiSlug) {
      return true;
    }
  }

  return false;
}

/**
 * Determine if navigation should proceed
 *
 * @param params - Navigation decision parameters
 * @param params.hasNavigated - Whether navigation has already occurred
 * @param params.hasUpdatedThread - Whether thread slug has been updated
 * @param params.analysisComplete - Whether first analysis is complete
 * @param params.canSkipAnalysis - Whether navigation can proceed without analysis
 * @param params.hasSlug - Whether AI-generated slug exists
 * @returns true if navigation should proceed
 */
export function shouldNavigateToThread(params: {
  hasNavigated: boolean;
  hasUpdatedThread: boolean;
  analysisComplete: boolean;
  canSkipAnalysis: boolean;
  hasSlug: boolean;
}): boolean {
  const { hasNavigated, hasUpdatedThread, analysisComplete, canSkipAnalysis, hasSlug } = params;

  // Early exits
  if (hasNavigated)
    return false;
  if (!hasUpdatedThread)
    return false;
  if (!hasSlug)
    return false;

  // Wait for analysis OR defensive timeout
  return analysisComplete || canSkipAnalysis;
}
