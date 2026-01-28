/**
 * Stream Logger - Backend flow logging utility
 * Matches frontend rlog patterns for easy correlation
 */
export const slog = {
  handoff: (tag: string, msg: string) => console.info(`[HANDOFF] ${tag}: ${msg}`),
  moderator: (tag: string, msg: string) => console.info(`[MOD] ${tag}: ${msg}`),
  phase: (tag: string, msg: string) => console.info(`[PHASE] ${tag}: ${msg}`),
  presearch: (tag: string, msg: string) => console.info(`[PRESRCH] ${tag}: ${msg}`),
  race: (tag: string, msg: string) => console.warn(`[RACE] ${tag}: ${msg}`),
  stream: (tag: string, msg: string) => console.info(`[STREAM] ${tag}: ${msg}`),
};
