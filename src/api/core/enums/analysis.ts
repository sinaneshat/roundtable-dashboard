/**
 * Moderator Analysis and Deliberation Enums
 *
 * Enums for multi-AI deliberation, consensus analysis, and voting.
 * Note: Analysis uses MESSAGE_STATUSES from chat.ts (identical values)
 */

import { z } from '@hono/zod-openapi';

// Alias MESSAGE_STATUSES as ANALYSIS_STATUSES for semantic clarity
// Both have identical values: ['pending', 'streaming', 'complete', 'failed']
export {
  MESSAGE_STATUSES as ANALYSIS_STATUSES,
  type MessageStatus as AnalysisStatus,
  MessageStatuses as AnalysisStatuses,
  MessageStatusSchema as AnalysisStatusSchema,
} from './chat';

// ============================================================================
// VOTE TYPE
// ============================================================================

export const VOTE_TYPES = ['approve', 'caution', 'reject'] as const;

export const VoteTypeSchema = z.enum(VOTE_TYPES).openapi({
  description: 'AI contributor vote type in deliberation',
  example: 'approve',
});

export type VoteType = z.infer<typeof VoteTypeSchema>;

export const VoteTypes = {
  APPROVE: 'approve' as const,
  CAUTION: 'caution' as const,
  REJECT: 'reject' as const,
} as const;

// ============================================================================
// AGREEMENT STATUS
// ============================================================================

export const AGREEMENT_STATUSES = ['agree', 'caution', 'disagree', 'neutral'] as const;

export const AgreementStatusSchema = z.enum(AGREEMENT_STATUSES).catch('neutral').openapi({
  description: 'Agreement status in consensus analysis',
  example: 'agree',
});

export type AgreementStatus = z.infer<typeof AgreementStatusSchema>;

export const AgreementStatuses = {
  AGREE: 'agree' as const,
  CAUTION: 'caution' as const,
  DISAGREE: 'disagree' as const,
  NEUTRAL: 'neutral' as const,
} as const;

// ============================================================================
// EVIDENCE STRENGTH
// ============================================================================

export const EVIDENCE_STRENGTHS = ['strong', 'moderate', 'weak'] as const;

export const EvidenceStrengthSchema = z.enum(EVIDENCE_STRENGTHS).openapi({
  description: 'Evidence strength classification (strong: 75%+, moderate: 50-74%, weak: <50%)',
  example: 'strong',
});

export type EvidenceStrength = z.infer<typeof EvidenceStrengthSchema>;

export const EvidenceStrengths = {
  STRONG: 'strong' as const,
  MODERATE: 'moderate' as const,
  WEAK: 'weak' as const,
} as const;

// ============================================================================
// CONFIDENCE WEIGHTING
// ============================================================================

export const CONFIDENCE_WEIGHTINGS = ['balanced', 'evidence_heavy', 'consensus_heavy', 'expertise_weighted', 'direct', 'simple'] as const;

export const ConfidenceWeightingSchema = z.enum(CONFIDENCE_WEIGHTINGS).catch('balanced').openapi({
  description: 'Weighting method for calculating round confidence score',
  example: 'balanced',
});

export type ConfidenceWeighting = z.infer<typeof ConfidenceWeightingSchema>;

export const ConfidenceWeightings = {
  BALANCED: 'balanced' as const,
  EVIDENCE_HEAVY: 'evidence_heavy' as const,
  CONSENSUS_HEAVY: 'consensus_heavy' as const,
  EXPERTISE_WEIGHTED: 'expertise_weighted' as const,
  DIRECT: 'direct' as const,
  SIMPLE: 'simple' as const,
} as const;

// ============================================================================
// DEBATE PHASE
// ============================================================================

export const DEBATE_PHASES = ['opening', 'rebuttal', 'cross_exam', 'synthesis', 'final_vote'] as const;

export const DebatePhaseSchema = z.enum(DEBATE_PHASES).openapi({
  description: 'Phase of debate in multi-AI deliberation',
  example: 'synthesis',
});

export type DebatePhase = z.infer<typeof DebatePhaseSchema>;

export const DebatePhases = {
  OPENING: 'opening' as const,
  REBUTTAL: 'rebuttal' as const,
  CROSS_EXAM: 'cross_exam' as const,
  SYNTHESIS: 'synthesis' as const,
  FINAL_VOTE: 'final_vote' as const,
} as const;

// ============================================================================
// STANCE TYPE (Consensus Table Positions)
// ============================================================================

export const STANCE_TYPES = ['agree', 'disagree', 'nuanced'] as const;

export const DEFAULT_STANCE: StanceType = 'nuanced';

export const StanceTypeSchema = z.enum(STANCE_TYPES).openapi({
  description: 'Model stance in consensus table (agree, disagree, or nuanced)',
  example: 'agree',
});

export type StanceType = z.infer<typeof StanceTypeSchema>;

export const StanceTypes = {
  AGREE: 'agree' as const,
  DISAGREE: 'disagree' as const,
  NUANCED: 'nuanced' as const,
} as const;

// ============================================================================
// RESOLUTION TYPE (Consensus Table Resolution)
// ============================================================================

export const RESOLUTION_TYPES = ['consensus', 'majority', 'split', 'contested'] as const;

export const DEFAULT_RESOLUTION: ResolutionType = 'split';

export const ResolutionTypeSchema = z.enum(RESOLUTION_TYPES).openapi({
  description: 'Resolution status in consensus analysis (consensus=all agree, majority=most agree, split=50-50, contested=strong disagreement)',
  example: 'consensus',
});

export type ResolutionType = z.infer<typeof ResolutionTypeSchema>;

export const ResolutionTypes = {
  CONSENSUS: 'consensus' as const,
  MAJORITY: 'majority' as const,
  SPLIT: 'split' as const,
  CONTESTED: 'contested' as const,
} as const;
