/**
 * Stream Logger - Backend flow logging utility
 * Matches frontend rlog patterns for easy correlation
 */
export const slog = {
  phase: (tag: string, msg: string) => console.log(`[PHASE] ${tag}: ${msg}`),
  stream: (tag: string, msg: string) => console.log(`[STREAM] ${tag}: ${msg}`),
  handoff: (tag: string, msg: string) => console.log(`[HANDOFF] ${tag}: ${msg}`),
  race: (tag: string, msg: string) => console.warn(`[RACE] ${tag}: ${msg}`),
  presearch: (tag: string, msg: string) => console.log(`[PRESRCH] ${tag}: ${msg}`),
  moderator: (tag: string, msg: string) => console.log(`[MOD] ${tag}: ${msg}`),
};
