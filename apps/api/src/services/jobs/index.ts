/**
 * Automated Jobs Services
 *
 * Services for managing admin-created automated multi-round AI conversations.
 */

export {
  checkJobContinuation,
  completeAutomatedJob,
  continueAutomatedJob,
  startAutomatedJob,
} from './job-orchestration.service';
export { selectModelsForPrompt } from './model-selection.service';
export { analyzePromptForJob, analyzeRoundPrompt } from './prompt-analysis.service';
export { generateNextRoundPrompt } from './prompt-generation.service';
export { discoverTrends } from './trend-discovery.service';
