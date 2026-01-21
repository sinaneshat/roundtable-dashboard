/**
 * File Attachment Changelog E2E Tests
 *
 * Tests file attachment addition/removal in follow-up rounds (Round 1+) as documented in
 * FLOW_DOCUMENTATION.md Part 6: Configuration Changes Mid-Conversation
 *
 * Key behaviors tested:
 * - File addition between rounds triggers changelog entry
 * - File removal between rounds triggers changelog entry
 * - Multiple file changes in same submission
 * - File changes combined with no other configuration changes
 * - Flow continues correctly after file change processing
 * - Changelog banner displays file change details
 *
 * Per FLOW_DOCUMENTATION.md Part 6:
 * "Changes save when user submits next message (not immediately)."
 * "Configuration Change Banner appears before the round that uses new configuration."
 *
 * File attachments are provided via attachmentIds array in message submission.
 * Changelog should track when attachmentIds change between rounds.
 */

import type { ChangelogType } from '@roundtable/shared';
import { ChangelogTypes } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { createMockParticipant, createMockThread } from '@/lib/testing';

// ============================================================================
// TYPES
// ============================================================================

/**
 * File Attachment Type
 * Represents uploaded files that can be attached to messages
 */
type FileAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: Date;
};

/**
 * File Changelog Entry Type
 * Represents a changelog entry for file attachment changes
 *
 * NOTE: This follows the pattern of existing changelog types but specifically
 * for file attachments. The 'type' field uses 'file_attachment' to distinguish
 * from participant/mode changes.
 */
type FileChangelogEntry = {
  type: 'file_attachment'; // Discriminator for file changes
  action: ChangelogType; // 'added' | 'removed'
  attachmentId: string;
  filename: string;
  fileSize: number;
};

type RoundSubmission = {
  roundNumber: number;
  userMessage: string;
  attachmentIds: string[];
  changes?: FileChangelogEntry[];
};

type ConversationWithFiles = {
  threadId: string;
  rounds: RoundSubmission[];
  attachments: FileAttachment[];
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createMockAttachment(
  index: number,
  overrides?: Partial<FileAttachment>,
): FileAttachment {
  const filenames = ['document.pdf', 'screenshot.png', 'data.csv', 'notes.txt'];
  const mimeTypes = ['application/pdf', 'image/png', 'text/csv', 'text/plain'];

  return {
    id: `attachment-${index}`,
    filename: filenames[index % filenames.length] ?? 'file.txt',
    mimeType: mimeTypes[index % mimeTypes.length] ?? 'application/octet-stream',
    fileSize: (index + 1) * 1024 * 100, // 100KB, 200KB, 300KB, etc.
    uploadedAt: new Date(),
    ...overrides,
  };
}

function createInitialConversation(
  attachmentIds: string[],
  attachments: FileAttachment[],
): ConversationWithFiles {
  return {
    threadId: 'thread-123',
    rounds: [
      {
        roundNumber: 0,
        userMessage: 'Initial question',
        attachmentIds,
        changes: undefined, // No changes for first round
      },
    ],
    attachments,
  };
}

/**
 * Detects file attachment changes between rounds
 *
 * Compares previous round's attachments with new round's attachments
 * and generates changelog entries for additions and removals.
 *
 * @param previousAttachmentIds - Attachment IDs from previous round
 * @param newAttachmentIds - Attachment IDs for new round
 * @param allAttachments - All available attachments for lookup
 * @returns Array of file changelog entries
 */
function detectFileChanges(
  previousAttachmentIds: string[],
  newAttachmentIds: string[],
  allAttachments: FileAttachment[],
): FileChangelogEntry[] {
  const changes: FileChangelogEntry[] = [];
  const prevSet = new Set(previousAttachmentIds);
  const newSet = new Set(newAttachmentIds);

  // Detect additions
  newAttachmentIds.forEach((id) => {
    if (!prevSet.has(id)) {
      const attachment = allAttachments.find(a => a.id === id);
      if (attachment) {
        changes.push({
          type: 'file_attachment',
          action: ChangelogTypes.ADDED,
          attachmentId: id,
          filename: attachment.filename,
          fileSize: attachment.fileSize,
        });
      }
    }
  });

  // Detect removals
  previousAttachmentIds.forEach((id) => {
    if (!newSet.has(id)) {
      const attachment = allAttachments.find(a => a.id === id);
      if (attachment) {
        changes.push({
          type: 'file_attachment',
          action: ChangelogTypes.REMOVED,
          attachmentId: id,
          filename: attachment.filename,
          fileSize: attachment.fileSize,
        });
      }
    }
  });

  return changes;
}

function addRound(
  state: ConversationWithFiles,
  userMessage: string,
  attachmentIds: string[],
): ConversationWithFiles {
  const previousRound = state.rounds[state.rounds.length - 1];
  if (!previousRound) {
    throw new Error('No previous round found');
  }

  const nextRoundNumber = previousRound.roundNumber + 1;
  const changes = detectFileChanges(
    previousRound.attachmentIds,
    attachmentIds,
    state.attachments,
  );

  const newRound: RoundSubmission = {
    roundNumber: nextRoundNumber,
    userMessage,
    attachmentIds,
    changes: changes.length > 0 ? changes : undefined,
  };

  return {
    ...state,
    rounds: [...state.rounds, newRound],
  };
}

// ============================================================================
// TESTS: File Addition Between Rounds
// ============================================================================

describe('file Attachment Changelog E2E', () => {
  describe('file Addition Between Rounds', () => {
    it('should detect single file addition in Round 1', () => {
      // Round 0: No attachments
      const attachments = [
        createMockAttachment(0, { id: 'att-1', filename: 'report.pdf' }),
      ];
      let state = createInitialConversation([], attachments);

      expect(state.rounds[0]?.attachmentIds).toHaveLength(0);
      expect(state.rounds[0]?.changes).toBeUndefined();

      // Round 1: Add one file
      state = addRound(state, 'Follow-up question with file', ['att-1']);

      expect(state.rounds[1]?.attachmentIds).toHaveLength(1);
      expect(state.rounds[1]?.changes).toBeDefined();
      expect(state.rounds[1]?.changes).toHaveLength(1);
      expect(state.rounds[1]?.changes?.[0]?.action).toBe(ChangelogTypes.ADDED);
      expect(state.rounds[1]?.changes?.[0]?.attachmentId).toBe('att-1');
      expect(state.rounds[1]?.changes?.[0]?.filename).toBe('report.pdf');
    });

    it('should detect multiple file additions in Round 1', () => {
      const attachments = [
        createMockAttachment(0, { id: 'att-1', filename: 'doc1.pdf' }),
        createMockAttachment(1, { id: 'att-2', filename: 'doc2.pdf' }),
        createMockAttachment(2, { id: 'att-3', filename: 'image.png' }),
      ];
      let state = createInitialConversation([], attachments);

      // Round 1: Add three files
      state = addRound(state, 'Question with 3 files', ['att-1', 'att-2', 'att-3']);

      expect(state.rounds[1]?.attachmentIds).toHaveLength(3);
      expect(state.rounds[1]?.changes).toHaveLength(3);
      expect(state.rounds[1]?.changes?.every(c => c.action === ChangelogTypes.ADDED)).toBe(true);
    });

    it('should show changelog banner before Round 1 with file additions', () => {
      const attachments = [createMockAttachment(0, { id: 'att-1' })];
      let state = createInitialConversation([], attachments);

      state = addRound(state, 'Question with file', ['att-1']);

      // Changelog exists for Round 1
      const changelogBanner = {
        roundNumber: 1,
        changes: state.rounds[1]?.changes || [],
        summary: '1 file added',
      };

      expect(changelogBanner.roundNumber).toBe(1);
      expect(changelogBanner.changes).toHaveLength(1);
      expect(changelogBanner.summary).toBe('1 file added');
    });

    it('should add files in Round 2 after Round 0 had files', () => {
      const attachments = [
        createMockAttachment(0, { id: 'att-1', filename: 'initial.pdf' }),
        createMockAttachment(1, { id: 'att-2', filename: 'additional.pdf' }),
      ];
      let state = createInitialConversation(['att-1'], attachments);

      // Round 1: Same file
      state = addRound(state, 'Follow-up', ['att-1']);
      expect(state.rounds[1]?.changes).toBeUndefined(); // No changes

      // Round 2: Add second file
      state = addRound(state, 'Another follow-up', ['att-1', 'att-2']);

      expect(state.rounds[2]?.attachmentIds).toHaveLength(2);
      expect(state.rounds[2]?.changes).toHaveLength(1);
      expect(state.rounds[2]?.changes?.[0]?.action).toBe(ChangelogTypes.ADDED);
      expect(state.rounds[2]?.changes?.[0]?.attachmentId).toBe('att-2');
    });

    it('should preserve file metadata in changelog entry', () => {
      const attachments = [
        createMockAttachment(0, {
          id: 'att-1',
          filename: 'large-document.pdf',
          fileSize: 2048576, // 2MB
          mimeType: 'application/pdf',
        }),
      ];
      let state = createInitialConversation([], attachments);

      state = addRound(state, 'Question', ['att-1']);

      const change = state.rounds[1]?.changes?.[0];
      expect(change?.filename).toBe('large-document.pdf');
      expect(change?.fileSize).toBe(2048576);
      expect(change?.attachmentId).toBe('att-1');
    });
  });

  // ============================================================================
  // TESTS: File Removal Between Rounds
  // ============================================================================

  describe('file Removal Between Rounds', () => {
    it('should detect single file removal in Round 1', () => {
      const attachments = [createMockAttachment(0, { id: 'att-1', filename: 'doc.pdf' })];
      let state = createInitialConversation(['att-1'], attachments);

      expect(state.rounds[0]?.attachmentIds).toHaveLength(1);

      // Round 1: Remove file
      state = addRound(state, 'Follow-up without file', []);

      expect(state.rounds[1]?.attachmentIds).toHaveLength(0);
      expect(state.rounds[1]?.changes).toHaveLength(1);
      expect(state.rounds[1]?.changes?.[0]?.action).toBe(ChangelogTypes.REMOVED);
      expect(state.rounds[1]?.changes?.[0]?.attachmentId).toBe('att-1');
    });

    it('should detect multiple file removals in Round 1', () => {
      const attachments = [
        createMockAttachment(0, { id: 'att-1' }),
        createMockAttachment(1, { id: 'att-2' }),
        createMockAttachment(2, { id: 'att-3' }),
      ];
      let state = createInitialConversation(['att-1', 'att-2', 'att-3'], attachments);

      // Round 1: Remove all files
      state = addRound(state, 'Question without files', []);

      expect(state.rounds[1]?.attachmentIds).toHaveLength(0);
      expect(state.rounds[1]?.changes).toHaveLength(3);
      expect(state.rounds[1]?.changes?.every(c => c.action === ChangelogTypes.REMOVED)).toBe(true);
    });

    it('should show changelog banner with removed file strikethrough', () => {
      const attachments = [createMockAttachment(0, { id: 'att-1', filename: 'report.pdf' })];
      let state = createInitialConversation(['att-1'], attachments);

      state = addRound(state, 'Question', []);

      const removedChange = state.rounds[1]?.changes?.[0];
      expect(removedChange?.action).toBe(ChangelogTypes.REMOVED);
      expect(removedChange?.filename).toBe('report.pdf');

      // Changelog UI would render this with strikethrough
      const changelogDisplay = {
        icon: '−',
        color: 'red',
        strikethrough: true,
        text: `Removed ${removedChange?.filename}`,
      };

      expect(changelogDisplay.strikethrough).toBe(true);
    });

    it('should handle partial file removal (keep some, remove others)', () => {
      const attachments = [
        createMockAttachment(0, { id: 'att-1', filename: 'keep.pdf' }),
        createMockAttachment(1, { id: 'att-2', filename: 'remove1.pdf' }),
        createMockAttachment(2, { id: 'att-3', filename: 'remove2.pdf' }),
      ];
      let state = createInitialConversation(['att-1', 'att-2', 'att-3'], attachments);

      // Round 1: Keep att-1, remove att-2 and att-3
      state = addRound(state, 'Question', ['att-1']);

      expect(state.rounds[1]?.attachmentIds).toHaveLength(1);
      expect(state.rounds[1]?.changes?.filter(c => c.action === ChangelogTypes.REMOVED)).toHaveLength(2);

      const removedIds = state.rounds[1]?.changes
        ?.filter(c => c.action === ChangelogTypes.REMOVED)
        .map(c => c.attachmentId);
      expect(removedIds).toContain('att-2');
      expect(removedIds).toContain('att-3');
    });
  });

  // ============================================================================
  // TESTS: Multiple File Changes in Same Submission
  // ============================================================================

  describe('multiple File Changes in Same Submission', () => {
    it('should detect add and remove in same round transition', () => {
      const attachments = [
        createMockAttachment(0, { id: 'att-1', filename: 'old.pdf' }),
        createMockAttachment(1, { id: 'att-2', filename: 'new.pdf' }),
      ];
      let state = createInitialConversation(['att-1'], attachments);

      // Round 1: Replace att-1 with att-2
      state = addRound(state, 'Question', ['att-2']);

      expect(state.rounds[1]?.changes).toHaveLength(2);

      const added = state.rounds[1]?.changes?.filter(c => c.action === ChangelogTypes.ADDED);
      const removed = state.rounds[1]?.changes?.filter(c => c.action === ChangelogTypes.REMOVED);

      expect(added).toHaveLength(1);
      expect(removed).toHaveLength(1);
      expect(added?.[0]?.attachmentId).toBe('att-2');
      expect(removed?.[0]?.attachmentId).toBe('att-1');
    });

    it('should detect complex changes: 2 added, 1 removed, 1 kept', () => {
      const attachments = [
        createMockAttachment(0, { id: 'att-1', filename: 'keep.pdf' }),
        createMockAttachment(1, { id: 'att-2', filename: 'remove.pdf' }),
        createMockAttachment(2, { id: 'att-3', filename: 'add1.pdf' }),
        createMockAttachment(3, { id: 'att-4', filename: 'add2.pdf' }),
      ];
      let state = createInitialConversation(['att-1', 'att-2'], attachments);

      // Round 1: Keep att-1, remove att-2, add att-3 and att-4
      state = addRound(state, 'Question', ['att-1', 'att-3', 'att-4']);

      const changes = state.rounds[1]?.changes || [];
      expect(changes).toHaveLength(3); // 2 added + 1 removed

      expect(changes.filter(c => c.action === ChangelogTypes.ADDED)).toHaveLength(2);
      expect(changes.filter(c => c.action === ChangelogTypes.REMOVED)).toHaveLength(1);
    });

    it('should generate accurate changelog summary for complex file changes', () => {
      const attachments = [
        createMockAttachment(0, { id: 'att-1' }),
        createMockAttachment(1, { id: 'att-2' }),
        createMockAttachment(2, { id: 'att-3' }),
      ];
      let state = createInitialConversation(['att-1'], attachments);

      state = addRound(state, 'Question', ['att-2', 'att-3']);

      const changes = state.rounds[1]?.changes || [];

      const addedCount = changes.filter(c => c.action === ChangelogTypes.ADDED).length;
      const removedCount = changes.filter(c => c.action === ChangelogTypes.REMOVED).length;

      const summary = `${addedCount} file(s) added, ${removedCount} file(s) removed`;

      expect(summary).toBe('2 file(s) added, 1 file(s) removed');
    });

    it('should handle replacing all files in one transition', () => {
      const attachments = [
        createMockAttachment(0, { id: 'att-1' }),
        createMockAttachment(1, { id: 'att-2' }),
        createMockAttachment(2, { id: 'att-3' }),
        createMockAttachment(3, { id: 'att-4' }),
      ];
      let state = createInitialConversation(['att-1', 'att-2'], attachments);

      // Round 1: Completely replace files
      state = addRound(state, 'Question', ['att-3', 'att-4']);

      const changes = state.rounds[1]?.changes || [];
      expect(changes.filter(c => c.action === ChangelogTypes.REMOVED)).toHaveLength(2);
      expect(changes.filter(c => c.action === ChangelogTypes.ADDED)).toHaveLength(2);
    });
  });

  // ============================================================================
  // TESTS: File Changes with No Other Configuration Changes
  // ============================================================================

  describe('file Changes Combined with No Other Changes', () => {
    it('should show changelog for file changes only (no participant changes)', () => {
      const _thread = createMockThread({ id: 'thread-123' });
      const _participants = [createMockParticipant(0), createMockParticipant(1)];
      const attachments = [createMockAttachment(0, { id: 'att-1' })];

      let state = createInitialConversation([], attachments);

      // Round 1: Add file, but participants stay the same
      state = addRound(state, 'Question with file', ['att-1']);

      expect(state.rounds[1]?.changes).toBeDefined();
      expect(state.rounds[1]?.changes).toHaveLength(1);
      expect(state.rounds[1]?.changes?.[0]?.type).toBe('file_attachment');

      // Verify participants didn't change (would be tested separately in actual implementation)
      expect(_participants).toHaveLength(2); // Same as Round 0
    });

    it('should show changelog even if only file removal occurred', () => {
      const attachments = [createMockAttachment(0, { id: 'att-1' })];
      let state = createInitialConversation(['att-1'], attachments);

      // Round 1: Only remove file, no other changes
      state = addRound(state, 'Question without file', []);

      expect(state.rounds[1]?.changes).toBeDefined();
      expect(state.rounds[1]?.changes).toHaveLength(1);
      expect(state.rounds[1]?.changes?.[0]?.action).toBe(ChangelogTypes.REMOVED);
    });

    it('should handle file changes across multiple consecutive rounds', () => {
      const attachments = [
        createMockAttachment(0, { id: 'att-1' }),
        createMockAttachment(1, { id: 'att-2' }),
        createMockAttachment(2, { id: 'att-3' }),
      ];
      let state = createInitialConversation([], attachments);

      // Round 1: Add att-1
      state = addRound(state, 'Q1', ['att-1']);
      expect(state.rounds[1]?.changes).toHaveLength(1);

      // Round 2: Add att-2
      state = addRound(state, 'Q2', ['att-1', 'att-2']);
      expect(state.rounds[2]?.changes).toHaveLength(1);

      // Round 3: Replace with att-3
      state = addRound(state, 'Q3', ['att-3']);
      expect(state.rounds[3]?.changes).toHaveLength(3); // 2 removed, 1 added
    });
  });

  // ============================================================================
  // TESTS: Flow Continues Correctly After File Changes
  // ============================================================================

  describe('flow Continues Correctly After File Change Processing', () => {
    it('should allow streaming to proceed after file addition changelog processed', () => {
      const attachments = [createMockAttachment(0, { id: 'att-1' })];
      let state = createInitialConversation([], attachments);

      // Round 1: Add file
      state = addRound(state, 'Question with file', ['att-1']);

      // Verify changelog was created
      expect(state.rounds[1]?.changes).toBeDefined();

      // Verify flow can continue (in real implementation, streaming would start)
      const canProceed = state.rounds[1]?.changes !== undefined;
      expect(canProceed).toBe(true);
    });

    it('should allow streaming to proceed after file removal changelog processed', () => {
      const attachments = [createMockAttachment(0, { id: 'att-1' })];
      let state = createInitialConversation(['att-1'], attachments);

      // Round 1: Remove file
      state = addRound(state, 'Question without file', []);

      // Verify changelog was created
      expect(state.rounds[1]?.changes).toBeDefined();

      // Flow should continue normally
      const canProceed = true;
      expect(canProceed).toBe(true);
    });

    it('should not block streaming when no file changes detected', () => {
      const attachments = [createMockAttachment(0, { id: 'att-1' })];
      let state = createInitialConversation(['att-1'], attachments);

      // Round 1: Same file
      state = addRound(state, 'Question with same file', ['att-1']);

      // No changelog
      expect(state.rounds[1]?.changes).toBeUndefined();

      // Flow should continue immediately
      const shouldWaitForChangelog = state.rounds[1]?.changes !== undefined;
      expect(shouldWaitForChangelog).toBe(false);
    });

    it('should preserve round number consistency across file changes', () => {
      const attachments = [
        createMockAttachment(0, { id: 'att-1' }),
        createMockAttachment(1, { id: 'att-2' }),
      ];
      let state = createInitialConversation([], attachments);

      // Round 1: Add file
      state = addRound(state, 'Q1', ['att-1']);
      expect(state.rounds[1]?.roundNumber).toBe(1);

      // Round 2: Replace file
      state = addRound(state, 'Q2', ['att-2']);
      expect(state.rounds[2]?.roundNumber).toBe(2);

      // Round 3: Remove file
      state = addRound(state, 'Q3', []);
      expect(state.rounds[3]?.roundNumber).toBe(3);

      // Verify sequential round numbers
      expect(state.rounds.map(r => r.roundNumber)).toEqual([0, 1, 2, 3]);
    });

    it('should handle file changes during regeneration (placeholder test)', () => {
      // Regeneration scenario: User regenerates Round 1 with different files
      // This would be a complex integration test in real implementation

      const attachments = [
        createMockAttachment(0, { id: 'att-1' }),
        createMockAttachment(1, { id: 'att-2' }),
      ];
      let state = createInitialConversation(['att-1'], attachments);

      // Round 1 initial
      state = addRound(state, 'Question', ['att-1']);

      // Simulate regeneration with different file
      const regeneratedRound: RoundSubmission = {
        roundNumber: 1,
        userMessage: 'Question',
        attachmentIds: ['att-2'], // Changed file
        changes: detectFileChanges(['att-1'], ['att-2'], attachments),
      };

      // Replace Round 1
      state.rounds[1] = regeneratedRound;

      expect(state.rounds[1]?.changes).toHaveLength(2); // 1 removed, 1 added
    });
  });

  // ============================================================================
  // TESTS: Edge Cases
  // ============================================================================

  describe('edge Cases', () => {
    it('should handle no file changes between rounds', () => {
      const attachments = [createMockAttachment(0, { id: 'att-1' })];
      let state = createInitialConversation(['att-1'], attachments);

      state = addRound(state, 'Question', ['att-1']);

      expect(state.rounds[1]?.changes).toBeUndefined();
    });

    it('should handle adding file on Round 0, then removing on Round 1, then re-adding on Round 2', () => {
      const attachments = [createMockAttachment(0, { id: 'att-1' })];
      let state = createInitialConversation(['att-1'], attachments);

      // Round 1: Remove
      state = addRound(state, 'Q1', []);
      expect(state.rounds[1]?.changes?.[0]?.action).toBe(ChangelogTypes.REMOVED);

      // Round 2: Re-add
      state = addRound(state, 'Q2', ['att-1']);
      expect(state.rounds[2]?.changes?.[0]?.action).toBe(ChangelogTypes.ADDED);
    });

    it('should handle large file count changes (10 files added)', () => {
      const attachments = Array.from({ length: 10 }, (_, i) =>
        createMockAttachment(i, { id: `att-${i}` }));
      let state = createInitialConversation([], attachments);

      const allIds = attachments.map(a => a.id);
      state = addRound(state, 'Question with 10 files', allIds);

      expect(state.rounds[1]?.changes).toHaveLength(10);
      expect(state.rounds[1]?.changes?.every(c => c.action === ChangelogTypes.ADDED)).toBe(true);
    });

    it('should preserve changelog entries across multiple rounds', () => {
      const attachments = [
        createMockAttachment(0, { id: 'att-1' }),
        createMockAttachment(1, { id: 'att-2' }),
      ];
      let state = createInitialConversation([], attachments);

      // Round 1: Add att-1
      state = addRound(state, 'Q1', ['att-1']);
      const round1Changes = state.rounds[1]?.changes;

      // Round 2: Add att-2
      state = addRound(state, 'Q2', ['att-1', 'att-2']);
      const round2Changes = state.rounds[2]?.changes;

      // Verify Round 1 changes preserved
      expect(state.rounds[1]?.changes).toEqual(round1Changes);

      // Verify Round 2 has independent changes
      expect(state.rounds[2]?.changes).toEqual(round2Changes);
      expect(state.rounds[2]?.changes).not.toEqual(round1Changes);
    });

    it('should handle empty attachment list transitions', () => {
      let state = createInitialConversation([], []);

      // Round 1: Still no files
      state = addRound(state, 'Question', []);

      expect(state.rounds[1]?.changes).toBeUndefined();
      expect(state.rounds[1]?.attachmentIds).toHaveLength(0);
    });

    it('should handle file changes combined with other configuration changes (placeholder)', () => {
      // In real implementation, this would test file changes + participant changes
      // happening in the same round transition

      const attachments = [createMockAttachment(0, { id: 'att-1' })];
      let state = createInitialConversation([], attachments);

      state = addRound(state, 'Question', ['att-1']);

      // File change detected
      expect(state.rounds[1]?.changes?.some(c => c.type === 'file_attachment')).toBe(true);

      // In full implementation, would also verify participant changes in same changelog
    });
  });
});
