/**
 * Moderator UI Utility Functions
 *
 * **SINGLE SOURCE OF TRUTH**: Reusable UI utilities for Multi-AI Deliberation Framework
 * following enum-based patterns from docs/type-inference-patterns.md
 *
 * Centralizes duplicate color mapping, icon selection, and label logic across moderator components.
 * All mappings based on enums from @/api/core/enums
 */

import { AlertTriangle, Check, Flame, ThumbsDown, ThumbsUp, X } from 'lucide-react';

import type { AgreementStatus, EvidenceStrength, VoteType } from '@/api/core/enums';
import { AgreementStatuses, EvidenceStrengths, VoteTypes } from '@/api/core/enums';

// ============================================================================
// VOTE TYPE UTILITIES
// ============================================================================

/**
 * Get vote icon based on VoteType enum
 * Following established enum pattern with centralized mapping
 */
export function getVoteIcon(vote: VoteType | null) {
  switch (vote) {
    case VoteTypes.APPROVE:
      return <ThumbsUp className="size-4 text-green-500" />;
    case VoteTypes.CAUTION:
      return <Flame className="size-4 text-orange-500" />;
    case VoteTypes.REJECT:
      return <ThumbsDown className="size-4 text-red-500" />;
    default:
      return null;
  }
}

/**
 * Get card background color based on VoteType enum
 * Following established enum pattern with centralized styling
 * Using subtle glass-like backgrounds without borders for coherent design
 */
export function getVoteCardColor(vote: VoteType | null): string {
  switch (vote) {
    case VoteTypes.APPROVE:
      return 'bg-green-500/5';
    case VoteTypes.CAUTION:
      return 'bg-orange-500/5';
    case VoteTypes.REJECT:
      return 'bg-red-500/5';
    default:
      return 'bg-white/[0.02]';
  }
}

// ============================================================================
// AGREEMENT STATUS UTILITIES
// ============================================================================

/**
 * Get agreement status icon based on AgreementStatus enum
 * Following established enum pattern with centralized mapping
 */
export function getAgreementIcon(status: AgreementStatus) {
  switch (status) {
    case AgreementStatuses.AGREE:
      return <Check className="size-4 text-green-500" />;
    case AgreementStatuses.CAUTION:
      return <AlertTriangle className="size-4 text-orange-500" />;
    case AgreementStatuses.DISAGREE:
      return <X className="size-4 text-red-500" />;
    default:
      return <span className="size-4 text-muted-foreground">—</span>;
  }
}

/**
 * Get badge color based on AgreementStatus enum
 * Following established enum pattern with centralized styling
 */
export function getAgreementBadgeColor(status: AgreementStatus): string {
  switch (status) {
    case AgreementStatuses.AGREE:
      return 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/50';
    case AgreementStatuses.CAUTION:
      return 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/50';
    case AgreementStatuses.DISAGREE:
      return 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/50';
    default:
      return '';
  }
}

// ============================================================================
// EVIDENCE STRENGTH UTILITIES
// ============================================================================

/**
 * Get badge color based on EvidenceStrength enum
 * Following established enum pattern with centralized styling
 */
export function getEvidenceStrengthBadgeColor(strength: EvidenceStrength): string {
  switch (strength) {
    case EvidenceStrengths.STRONG:
      return 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/50';
    case EvidenceStrengths.MODERATE:
      return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/50';
    case EvidenceStrengths.WEAK:
      return 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/50';
    default:
      return '';
  }
}

/**
 * Get progress bar colors based on EvidenceStrength enum
 * Returns inline style colors to avoid Tailwind purging
 */
export function getEvidenceStrengthProgressColors(strength: EvidenceStrength): { bg: string; indicator: string } {
  switch (strength) {
    case EvidenceStrengths.STRONG:
      return { bg: 'rgba(16, 185, 129, 0.2)', indicator: '#10b981' }; // emerald
    case EvidenceStrengths.MODERATE:
      return { bg: 'rgba(59, 130, 246, 0.2)', indicator: '#3b82f6' }; // blue
    case EvidenceStrengths.WEAK:
      return { bg: 'rgba(245, 158, 11, 0.2)', indicator: '#f59e0b' }; // amber
    default:
      return { bg: 'rgba(255, 255, 255, 0.1)', indicator: '#ffffff' };
  }
}

// ============================================================================
// CONFIDENCE LEVEL UTILITIES (percentage-based)
// ============================================================================

/**
 * Get confidence level label based on percentage threshold
 * Reusable across components with percentage-based confidence
 */
export function getConfidenceLabel(confidence: number, t: (key: string) => string): string {
  if (confidence >= 80) {
    return t('alternatives.highConfidence');
  }
  if (confidence >= 60) {
    return t('alternatives.mediumConfidence');
  }
  return t('alternatives.lowConfidence');
}

/**
 * Get badge color based on confidence percentage
 * Reusable across components with percentage-based confidence
 */
export function getConfidenceBadgeColor(confidence: number): string {
  if (confidence >= 80) {
    return 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/50';
  }
  if (confidence >= 60) {
    return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/50';
  }
  return 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/50';
}

/**
 * Get progress bar colors based on confidence percentage
 * Returns inline style colors to avoid Tailwind purging
 */
export function getConfidenceProgressColors(confidence: number): { bg: string; indicator: string } {
  if (confidence >= 80) {
    return { bg: 'rgba(16, 185, 129, 0.2)', indicator: '#10b981' }; // emerald
  }
  if (confidence >= 60) {
    return { bg: 'rgba(59, 130, 246, 0.2)', indicator: '#3b82f6' }; // blue
  }
  return { bg: 'rgba(245, 158, 11, 0.2)', indicator: '#f59e0b' }; // amber
}
