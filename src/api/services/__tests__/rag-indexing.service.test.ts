/**
 * RAG Indexing Service Tests
 *
 * Tests indexing status management, R2 path utilities, and AI Search integration.
 */

import { describe, expect, it } from 'vitest';

import {
  extractProjectIdFromR2Key,
  generateProjectFileR2Key,
  isValidProjectFileKey,
} from '../rag-indexing.service';

describe('rag-indexing.service', () => {
  describe('generateProjectFileR2Key', () => {
    it('should generate correct R2 key for project files', () => {
      const projectId = 'proj_abc123';
      const filename = 'document.pdf';

      const key = generateProjectFileR2Key(projectId, filename);

      expect(key).toBe('projects/proj_abc123/document.pdf');
    });

    it('should handle filenames with spaces', () => {
      const key = generateProjectFileR2Key('proj_123', 'my document.pdf');

      expect(key).toBe('projects/proj_123/my document.pdf');
    });

    it('should handle filenames with special characters', () => {
      const key = generateProjectFileR2Key('proj_123', 'report-2024_final.pdf');

      expect(key).toBe('projects/proj_123/report-2024_final.pdf');
    });

    it('should handle nested folder filenames', () => {
      // If user uploads a file with path-like name, preserve it
      const key = generateProjectFileR2Key('proj_123', 'subfolder/file.txt');

      expect(key).toBe('projects/proj_123/subfolder/file.txt');
    });
  });

  describe('extractProjectIdFromR2Key', () => {
    it('should extract project ID from valid R2 key', () => {
      const key = 'projects/proj_abc123/document.pdf';

      const projectId = extractProjectIdFromR2Key(key);

      expect(projectId).toBe('proj_abc123');
    });

    it('should extract project ID from key with nested folders', () => {
      const key = 'projects/proj_xyz/subfolder/nested/file.txt';

      const projectId = extractProjectIdFromR2Key(key);

      expect(projectId).toBe('proj_xyz');
    });

    it('should return null for non-project keys', () => {
      const key = 'uploads/user123/file.pdf';

      const projectId = extractProjectIdFromR2Key(key);

      expect(projectId).toBeNull();
    });

    it('should return null for invalid format', () => {
      const key = 'random-file.pdf';

      const projectId = extractProjectIdFromR2Key(key);

      expect(projectId).toBeNull();
    });

    it('should return null for empty string', () => {
      const projectId = extractProjectIdFromR2Key('');

      expect(projectId).toBeNull();
    });

    it('should handle projects prefix without project ID', () => {
      const key = 'projects/';

      const projectId = extractProjectIdFromR2Key(key);

      expect(projectId).toBeNull();
    });
  });

  describe('isValidProjectFileKey', () => {
    it('should return true for valid project file key', () => {
      const key = 'projects/proj_abc123/document.pdf';
      const projectId = 'proj_abc123';

      const isValid = isValidProjectFileKey(key, projectId);

      expect(isValid).toBe(true);
    });

    it('should return false for different project ID', () => {
      const key = 'projects/proj_abc123/document.pdf';
      const projectId = 'proj_different';

      const isValid = isValidProjectFileKey(key, projectId);

      expect(isValid).toBe(false);
    });

    it('should return false for non-project key', () => {
      const key = 'uploads/user123/file.pdf';
      const projectId = 'proj_abc123';

      const isValid = isValidProjectFileKey(key, projectId);

      expect(isValid).toBe(false);
    });

    it('should return true for nested folder paths in same project', () => {
      const key = 'projects/proj_123/folder/subfolder/file.pdf';
      const projectId = 'proj_123';

      const isValid = isValidProjectFileKey(key, projectId);

      expect(isValid).toBe(true);
    });

    it('should handle project IDs with special characters', () => {
      const key = 'projects/proj-123_abc/file.pdf';
      const projectId = 'proj-123_abc';

      const isValid = isValidProjectFileKey(key, projectId);

      expect(isValid).toBe(true);
    });
  });

  describe('r2 folder path consistency', () => {
    it('should maintain round-trip consistency', () => {
      const originalProjectId = 'proj_abc123';
      const filename = 'test-file.pdf';

      // Generate key
      const key = generateProjectFileR2Key(originalProjectId, filename);

      // Extract project ID
      const extractedProjectId = extractProjectIdFromR2Key(key);

      // Validate key
      const isValid = isValidProjectFileKey(key, originalProjectId);

      expect(extractedProjectId).toBe(originalProjectId);
      expect(isValid).toBe(true);
    });

    it('should work with UUID-style project IDs', () => {
      const projectId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const filename = 'report.pdf';

      const key = generateProjectFileR2Key(projectId, filename);
      const extracted = extractProjectIdFromR2Key(key);
      const isValid = isValidProjectFileKey(key, projectId);

      expect(key).toBe(`projects/${projectId}/${filename}`);
      expect(extracted).toBe(projectId);
      expect(isValid).toBe(true);
    });
  });

  describe('aI Search multitenancy pattern', () => {
    /**
     * AI Search uses folder-based filtering for multitenancy.
     * Files must be in projects/{projectId}/ folder structure.
     *
     * Filter pattern (from Cloudflare docs):
     * - gt('projects/proj_123/') captures paths starting after '/'
     * - lte('projects/proj_123z') captures paths up to 'z' (after letters in ASCII)
     *
     * This test ensures our key generation follows this pattern.
     */
    it('should generate keys compatible with AI Search folder filters', () => {
      const projectId = 'proj_abc123';
      const filename = 'document.pdf';

      const key = generateProjectFileR2Key(projectId, filename);

      // Key should start with projects/{projectId}/
      expect(key.startsWith(`projects/${projectId}/`)).toBe(true);

      // Key should be captured by gt/lte filter pattern
      const filterPrefix = `projects/${projectId}/`;
      expect(key > filterPrefix).toBe(true);
      expect(key <= `projects/${projectId}z`).toBe(true);
    });

    it('should generate keys that pass multitenancy filter bounds', () => {
      const projectId = 'proj_test';
      const files = ['a.pdf', 'z.pdf', 'file.txt', '123.json'];

      for (const filename of files) {
        const key = generateProjectFileR2Key(projectId, filename);
        const filterLower = `projects/${projectId}/`;
        const filterUpper = `projects/${projectId}z`;

        // Simulate AI Search filter: folder > 'prefix/' AND folder <= 'prefixz'
        expect(key > filterLower).toBe(true);
        expect(key <= filterUpper).toBe(true);
      }
    });

    it('should NOT match keys from different projects', () => {
      const projectA = 'proj_aaa';
      const projectB = 'proj_bbb';
      const filename = 'shared-name.pdf';

      const keyA = generateProjectFileR2Key(projectA, filename);
      const keyB = generateProjectFileR2Key(projectB, filename);

      // Project A filter should NOT match project B key
      const filterALower = `projects/${projectA}/`;
      const filterAUpper = `projects/${projectA}z`;

      expect(keyB > filterALower && keyB <= filterAUpper).toBe(false);

      // Project B filter should NOT match project A key
      const filterBLower = `projects/${projectB}/`;
      const filterBUpper = `projects/${projectB}z`;

      expect(keyA > filterBLower && keyA <= filterBUpper).toBe(false);
    });
  });
});
