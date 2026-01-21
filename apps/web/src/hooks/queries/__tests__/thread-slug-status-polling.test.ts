/**
 * Thread Slug Status Polling Tests
 *
 * Verifies useThreadSlugStatusQuery polling behavior:
 * - Polls every 2 seconds until isAiGeneratedTitle is true
 * - Pauses in background tabs via refetchIntervalInBackground: false
 * - Uses function form for refetchInterval to check conditions on each poll
 * - Updates sidebar cache when title is ready
 */

import { describe, expect, it } from 'vitest';

describe('threadSlugStatusQuery polling configuration', () => {
  describe('interval requirements', () => {
    it('should use centralized POLLING_INTERVALS.slugStatus constant', async () => {
      // Read the actual source file to verify interval constant usage
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');

      const sourcePath = resolve(__dirname, '../chat/threads.ts');
      const sourceCode = readFileSync(sourcePath, 'utf-8');

      // Find the useThreadSlugStatusQuery function
      const hookMatch = sourceCode.match(/export\s+function\s+useThreadSlugStatusQuery[\s\S]*?(?=export\s+function|$)/);
      expect(hookMatch).not.toBeNull();
      const hookCode = hookMatch?.[0] ?? '';

      // Verify it uses the centralized constant (not hardcoded value)
      expect(hookCode).toContain('POLLING_INTERVALS.slugStatus');

      // Verify imports include POLLING_INTERVALS
      expect(sourceCode).toContain('POLLING_INTERVALS');

      // Verify it does NOT use hardcoded values (anti-pattern)
      expect(hookCode).not.toMatch(/return\s+2\s*\*\s*1000/);
      expect(hookCode).not.toMatch(/return\s+2000/);
      expect(hookCode).not.toMatch(/return\s+10\s*\*\s*1000/);
    });

    it('should pause polling when tab is in background via refetchIntervalInBackground', async () => {
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');

      const sourcePath = resolve(__dirname, '../chat/threads.ts');
      const sourceCode = readFileSync(sourcePath, 'utf-8');

      // Find the useThreadSlugStatusQuery function
      const hookMatch = sourceCode.match(/export\s+function\s+useThreadSlugStatusQuery[\s\S]*?(?=export\s+function|$)/);
      expect(hookMatch).not.toBeNull();
      const hookCode = hookMatch?.[0] ?? '';

      // Verify refetchIntervalInBackground is set to false (TanStack Query handles tab visibility)
      expect(hookCode).toMatch(/refetchIntervalInBackground:\s*false/);
    });

    it('should enable polling only when authenticated and threadId exists', async () => {
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');

      const sourcePath = resolve(__dirname, '../chat/threads.ts');
      const sourceCode = readFileSync(sourcePath, 'utf-8');

      // Find the useThreadSlugStatusQuery function
      const hookMatch = sourceCode.match(/export\s+function\s+useThreadSlugStatusQuery[\s\S]*?(?=export\s+function|$)/);
      expect(hookMatch).not.toBeNull();

      const hookCode = hookMatch?.[0] ?? '';

      // Verify enabled condition includes isAuthenticated
      expect(hookCode).toContain('isAuthenticated');

      // Verify enabled condition uses queryEnabled (which includes threadId check)
      expect(hookCode).toMatch(/enabled:\s*queryEnabled/);
    });

    it('should use function form for refetchInterval to ensure continuous polling', async () => {
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');

      const sourcePath = resolve(__dirname, '../chat/threads.ts');
      const sourceCode = readFileSync(sourcePath, 'utf-8');

      // Find the useThreadSlugStatusQuery function
      const hookMatch = sourceCode.match(/export\s+function\s+useThreadSlugStatusQuery[\s\S]*?(?=export\s+function|$)/);
      expect(hookMatch).not.toBeNull();

      const hookCode = hookMatch?.[0] ?? '';

      // Verify refetchInterval uses function form (query) => { ... }
      // This ensures conditions are checked on EACH poll cycle, not just once at setup
      expect(hookCode).toMatch(/refetchInterval:\s*\(query\)\s*=>/);

      // Verify it checks isAiGeneratedTitle to stop polling when title is ready
      expect(hookCode).toContain('isAiGeneratedTitle');
    });
  });

  describe('polling behavior specification', () => {
    it('should poll for slug status changes', async () => {
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');

      const sourcePath = resolve(__dirname, '../chat/threads.ts');
      const sourceCode = readFileSync(sourcePath, 'utf-8');

      // Verify query key includes slugStatus
      expect(sourceCode).toContain('queryKeys.threads.slugStatus');

      // Verify it calls the correct service
      expect(sourceCode).toContain('getThreadSlugStatusService');
    });

    it('should have staleTime of 0 for always-fresh data', async () => {
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');

      const sourcePath = resolve(__dirname, '../chat/threads.ts');
      const sourceCode = readFileSync(sourcePath, 'utf-8');

      // Find the useThreadSlugStatusQuery function
      const hookMatch = sourceCode.match(/export\s+function\s+useThreadSlugStatusQuery[\s\S]*?(?=export\s+function|$)/);
      const hookCode = hookMatch?.[0] ?? '';

      // Verify staleTime is 0 for polling to work correctly
      expect(hookCode).toMatch(/staleTime:\s*0/);
    });
  });

  describe('documentation alignment', () => {
    it('should have POLLING_INTERVALS.slugStatus set to 2000ms', async () => {
      // Import and verify the centralized constant value
      const { POLLING_INTERVALS } = await import('@/lib/data/stale-times');
      expect(POLLING_INTERVALS.slugStatus).toBe(2000);
    });

    it('should provide clear comment explaining polling purpose', async () => {
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');

      const sourcePath = resolve(__dirname, '../chat/threads.ts');
      const sourceCode = readFileSync(sourcePath, 'utf-8');

      // Find comments near useThreadSlugStatusQuery
      const hookMatch = sourceCode.match(/\/\*\*[\s\S]*?\*\/\s*export\s+function\s+useThreadSlugStatusQuery/);
      expect(hookMatch).not.toBeNull();

      const docComment = hookMatch?.[0] ?? '';

      // Should mention polling
      expect(docComment.toLowerCase()).toContain('poll');

      // Should mention AI title generation
      expect(docComment.toLowerCase()).toMatch(/ai.*title|title.*generation/);
    });
  });
});

describe('flowController title polling integration', () => {
  describe('trigger conditions', () => {
    it('should only be active on OVERVIEW screen mode', async () => {
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');

      const controllerPath = resolve(__dirname, '../../../stores/chat/actions/flow-controller.ts');
      const sourceCode = readFileSync(controllerPath, 'utf-8');

      // Verify isActive condition requires OVERVIEW screen mode
      expect(sourceCode).toContain('ScreenModes.OVERVIEW');

      // Verify controller is controlled based on screen mode
      expect(sourceCode).toContain('isActive');
    });

    it('should stop polling when AI title is received', async () => {
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');

      const controllerPath = resolve(__dirname, '../../../stores/chat/actions/flow-controller.ts');
      const sourceCode = readFileSync(controllerPath, 'utf-8');

      // Verify polling stops when isAiGeneratedTitle is true
      expect(sourceCode).toContain('isAiGeneratedTitle');

      // Verify it updates cache when title is ready
      expect(sourceCode).toContain('setQueryData');
    });
  });

  describe('continuous polling fix', () => {
    it('should use ref-based tracking to prevent re-entry', async () => {
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');

      const controllerPath = resolve(__dirname, '../../../stores/chat/actions/flow-controller.ts');
      const sourceCode = readFileSync(controllerPath, 'utf-8');

      // Verify ref-based tracking exists for preventing re-entry
      expect(sourceCode).toContain('hasUpdatedUrlRef');

      // Verify ref is used to control URL update
      expect(sourceCode).toMatch(/hasUpdatedUrlRef\.current/);
    });

    it('should reset refs when showInitialUI is true', async () => {
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');

      const controllerPath = resolve(__dirname, '../../../stores/chat/actions/flow-controller.ts');
      const sourceCode = readFileSync(controllerPath, 'utf-8');

      // Find the effect that resets refs when showInitialUI is true
      const resetMatch = sourceCode.match(/if\s*\(streamingState\.showInitialUI\)\s*\{[\s\S]*?hasUpdatedUrlRef\.current\s*=\s*false/);
      expect(resetMatch).not.toBeNull();
    });

    it('should use refetchInterval instead of enabled for polling control in query hook', async () => {
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');

      const sourcePath = resolve(__dirname, '../chat/threads.ts');
      const sourceCode = readFileSync(sourcePath, 'utf-8');

      // Find the useThreadSlugStatusQuery function
      const hookMatch = sourceCode.match(/export\s+function\s+useThreadSlugStatusQuery[\s\S]*?(?=export\s+function|$)/);
      expect(hookMatch).not.toBeNull();
      const hookCode = hookMatch?.[0] ?? '';

      // Verify enabled is based on queryEnabled (auth + threadId), NOT shouldPoll
      expect(hookCode).toMatch(/enabled:\s*queryEnabled/);

      // Verify shouldPoll is checked in refetchInterval
      expect(hookCode).toMatch(/refetchInterval:[\s\S]*?shouldPoll/);
    });

    it('should keep query enabled when threadId exists regardless of shouldPoll state', async () => {
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');

      const sourcePath = resolve(__dirname, '../chat/threads.ts');
      const sourceCode = readFileSync(sourcePath, 'utf-8');

      // Find the useThreadSlugStatusQuery function
      const hookMatch = sourceCode.match(/export\s+function\s+useThreadSlugStatusQuery[\s\S]*?(?=export\s+function|$)/);
      expect(hookMatch).not.toBeNull();
      const hookCode = hookMatch?.[0] ?? '';

      // Verify queryEnabled is defined as isAuthenticated && !!threadId
      // This ensures the query stays enabled as long as we have a valid threadId
      expect(hookCode).toMatch(/queryEnabled\s*=\s*isAuthenticated\s*&&\s*!!threadId/);
    });
  });
});
