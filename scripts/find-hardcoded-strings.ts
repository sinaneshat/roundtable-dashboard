#!/usr/bin/env tsx
/**
 * Find Hardcoded Strings Script
 * 
 * Scans user-facing components to find hardcoded strings that should
 * be moved to translation files.
 */

import { glob } from 'glob';
import fs from 'node:fs';
import path from 'node:path';

const SOURCE_DIRS = ['apps/web/src/components', 'apps/web/src/routes', 'apps/web/src/containers'];

interface HardcodedString {
  file: string;
  line: number;
  column: number;
  string: string;
  context: string;
}

interface HardcodedStringsResult {
  totalFiles: number;
  filesWithIssues: number;
  hardcodedStrings: HardcodedString[];
}

async function getAllComponentFiles(): Promise<string[]> {
  const patterns = SOURCE_DIRS.map(dir => `${dir}/**/*.{tsx,jsx}`);
  const files: string[] = [];
  
  for (const pattern of patterns) {
    const matches = await glob(pattern, { 
      cwd: process.cwd(),
      ignore: ['**/node_modules/**', '**/.next/**', '**/dist/**']
    });
    files.push(...matches);
  }
  
  return files;
}

function isLikelyUserFacingString(str: string): boolean {
  // Filter out strings that are likely NOT user-facing
  
  // Too short (likely technical)
  if (str.length < 3) return false;
  
  // Contains only special characters or numbers
  if (!/[a-zA-Z]/.test(str)) return false;
  
  // Technical patterns to exclude
  const technicalPatterns = [
    /^[a-z]+[A-Z]/,  // camelCase (likely prop names)
    /^[A-Z][a-z]+[A-Z]/,  // PascalCase (likely component names)
    /^(https?|ftp|file):\/\//,  // URLs
    /^\/[a-z-/]+$/,  // Paths like /auth/signin
    /^\.[a-z]+$/,  // File extensions
    /^#[0-9a-f]{3,6}$/i,  // Hex colors
    /^rgb\(/,  // RGB colors
    /^[A-Z_]+$/,  // CONSTANT_CASE
    /^data-/,  // data attributes
    /^aria-/,  // aria attributes
    /^on[A-Z]/,  // event handlers
    /^(src|href|alt|id|class|className|style|width|height|viewBox|xmlns|fill|stroke|d)$/,  // HTML/SVG attributes
    /^\{.*\}$/,  // Template syntax
    /^\$\{/,  // Template literals
    /^@\//,  // Import paths
    /^\.\.\//,  // Relative imports
    /^[0-9]+$/,  // Pure numbers
    /^[0-9]+(\.[0-9]+)?(px|em|rem|%|vh|vw|ms|s)$/,  // CSS units
  ];
  
  return !technicalPatterns.some(pattern => pattern.test(str));
}

function findHardcodedStringsInFile(filePath: string): HardcodedString[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const hardcoded: HardcodedString[] = [];
  
  // Skip files that don't import useTranslations (likely not user-facing)
  if (!content.includes('useTranslations') && !content.includes('next-intl')) {
    return hardcoded;
  }
  
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    
    // Skip import statements
    if (line.trim().startsWith('import ')) continue;
    
    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('*')) continue;
    
    // Find string literals in JSX context (between > and <)
    // Pattern for strings in JSX: >text< or >"text"< or >'text'<
    const jsxTextPattern = />([^<]+)</g;
    let match;
    
    while ((match = jsxTextPattern.exec(line)) !== null) {
      const text = match[1].trim();
      if (text && isLikelyUserFacingString(text) && !text.includes('{') && !text.includes('t(')) {
        hardcoded.push({
          file: path.relative(process.cwd(), filePath),
          line: lineNum + 1,
          column: match.index,
          string: text,
          context: line.trim(),
        });
      }
    }
    
    // Find string literals in quotes that look like user-facing text
    const stringPattern = /["']([^"']+)["']/g;
    
    while ((match = stringPattern.exec(line)) !== null) {
      const str = match[1];
      
      // Skip if it's in a t() call
      const beforeMatch = line.substring(0, match.index);
      if (beforeMatch.endsWith('t(') || beforeMatch.endsWith('t (')) continue;
      
      // Skip if it's an object key
      if (/:$/.test(beforeMatch.trim())) continue;
      
      // Check if it looks like user-facing text
      if (str.length > 10 && isLikelyUserFacingString(str) && /\s/.test(str)) {
        hardcoded.push({
          file: path.relative(process.cwd(), filePath),
          line: lineNum + 1,
          column: match.index,
          string: str,
          context: line.trim(),
        });
      }
    }
  }
  
  return hardcoded;
}

async function findHardcodedStrings(): Promise<HardcodedStringsResult> {
  const files = await getAllComponentFiles();
  
  const allHardcoded: HardcodedString[] = [];
  const filesWithIssues = new Set<string>();
  
  for (const file of files) {
    const filePath = path.join(process.cwd(), file);
    const hardcoded = findHardcodedStringsInFile(filePath);
    
    if (hardcoded.length > 0) {
      allHardcoded.push(...hardcoded);
      filesWithIssues.add(file);
    }
  }
  
  return {
    totalFiles: files.length,
    filesWithIssues: filesWithIssues.size,
    hardcodedStrings: allHardcoded,
  };
}

findHardcodedStrings().catch(error => {
  process.exit(1);
});
