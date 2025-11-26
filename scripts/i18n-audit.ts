#!/usr/bin/env tsx
/**
 * Comprehensive i18n Audit Script
 * 
 * Runs all translation checks and generates a comprehensive report:
 * 1. Validates translation file structure
 * 2. Finds unused translation keys
 * 3. Finds hardcoded strings in components
 * 4. Checks for missing translations
 * 
 * Generates a detailed report with actionable recommendations.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPORT_FILE = path.join(process.cwd(), 'i18n-audit-report.md');

interface AuditResults {
  timestamp: string;
  validation: ValidationResult;
  unusedKeys: UnusedKeysResult;
  hardcodedStrings: HardcodedStringsResult;
  missingKeys: MissingKeysResult;
  recommendations: string[];
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  totalKeys: number;
}

interface UnusedKeysResult {
  count: number;
  keys: string[];
}

interface HardcodedStringsResult {
  count: number;
  filesAffected: number;
}

interface MissingKeysResult {
  count: number;
  keys: string[];
}

async function runValidation(): Promise<ValidationResult> {
  try {
    execSync('tsx scripts/validate-translations.ts', { stdio: 'inherit' });
    return { isValid: true, errors: [], warnings: [], totalKeys: 0 };
  } catch {
    return { isValid: false, errors: ['Validation failed'], warnings: [], totalKeys: 0 };
  }
}

async function runUnusedKeysCheck(): Promise<UnusedKeysResult> {
  try {
    execSync('tsx scripts/find-unused-keys.ts', { stdio: 'inherit' });
    return { count: 0, keys: [] };
  } catch {
    return { count: 0, keys: [] };
  }
}

async function runHardcodedStringsCheck(): Promise<HardcodedStringsResult> {
  try {
    execSync('tsx scripts/find-hardcoded-strings.ts', { stdio: 'inherit' });
    return { count: 0, filesAffected: 0 };
  } catch {
    return { count: 0, filesAffected: 0 };
  }
}

async function runMissingKeysCheck(): Promise<MissingKeysResult> {
  try {
    execSync('tsx scripts/check-missing-translations.ts', { stdio: 'inherit' });
    return { count: 0, keys: [] };
  } catch {
    return { count: 0, keys: [] };
  }
}

function generateRecommendations(results: Partial<AuditResults>): string[] {
  const recommendations: string[] = [];
  
  if (results.validation && !results.validation.isValid) {
    recommendations.push('🔴 CRITICAL: Fix validation errors in translation file before proceeding');
  }
  
  if (results.missingKeys && results.missingKeys.count > 0) {
    recommendations.push(`🔴 HIGH PRIORITY: Add ${results.missingKeys.count} missing translation keys to prevent runtime errors`);
  }
  
  if (results.hardcodedStrings && results.hardcodedStrings.count > 0) {
    recommendations.push(`🟡 MEDIUM PRIORITY: Replace ${results.hardcodedStrings.count} hardcoded strings with translation keys`);
  }
  
  if (results.unusedKeys && results.unusedKeys.count > 0) {
    recommendations.push(`🟢 LOW PRIORITY: Remove ${results.unusedKeys.count} unused translation keys to reduce file size`);
  }
  
  if (recommendations.length === 0) {
    recommendations.push('✅ Everything looks good! No action items.');
  }
  
  return recommendations;
}

function generateMarkdownReport(results: AuditResults): string {
  const lines: string[] = [];
  
  lines.push('# i18n Translation Audit Report');
  lines.push('');
  lines.push(`**Generated:** ${results.timestamp}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  
  // Executive Summary
  lines.push('## 📊 Executive Summary');
  lines.push('');
  lines.push(`- **Total Translation Keys:** ${results.validation.totalKeys}`);
  lines.push(`- **Unused Keys:** ${results.unusedKeys.count}`);
  lines.push(`- **Missing Keys:** ${results.missingKeys.count}`);
  lines.push(`- **Hardcoded Strings:** ${results.hardcodedStrings.count}`);
  lines.push(`- **Files with Hardcoded Strings:** ${results.hardcodedStrings.filesAffected}`);
  lines.push('');
  
  // Health Score
  const totalIssues = results.unusedKeys.count + results.missingKeys.count + results.hardcodedStrings.count;
  const healthScore = Math.max(0, 100 - (totalIssues * 2));
  lines.push(`### Health Score: ${healthScore}/100`);
  lines.push('');
  
  if (healthScore >= 90) {
    lines.push('✅ **Excellent** - Your translation system is in great shape!');
  } else if (healthScore >= 70) {
    lines.push('🟡 **Good** - Some issues to address, but manageable.');
  } else if (healthScore >= 50) {
    lines.push('🟠 **Fair** - Several issues need attention.');
  } else {
    lines.push('🔴 **Needs Work** - Significant issues require immediate attention.');
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  
  // Recommendations
  lines.push('## 🎯 Recommendations');
  lines.push('');
  results.recommendations.forEach(rec => {
    lines.push(`- ${rec}`);
  });
  lines.push('');
  lines.push('---');
  lines.push('');
  
  // Detailed Findings
  lines.push('## 🔍 Detailed Findings');
  lines.push('');
  
  // Validation
  lines.push('### 1. Translation File Validation');
  lines.push('');
  if (results.validation.isValid) {
    lines.push('✅ Translation file is valid');
  } else {
    lines.push('❌ Translation file has errors:');
    results.validation.errors.forEach(err => {
      lines.push(`- ${err}`);
    });
  }
  if (results.validation.warnings.length > 0) {
    lines.push('');
    lines.push('⚠️  Warnings:');
    results.validation.warnings.forEach(warn => {
      lines.push(`- ${warn}`);
    });
  }
  lines.push('');
  
  // Missing Keys
  lines.push('### 2. Missing Translation Keys');
  lines.push('');
  if (results.missingKeys.count === 0) {
    lines.push('✅ No missing keys');
  } else {
    lines.push(`❌ Found ${results.missingKeys.count} keys used in code but not defined:`);
    lines.push('');
    results.missingKeys.keys.slice(0, 20).forEach(key => {
      lines.push(`- \`${key}\``);
    });
    if (results.missingKeys.keys.length > 20) {
      lines.push(`- ... and ${results.missingKeys.keys.length - 20} more`);
    }
  }
  lines.push('');
  
  // Hardcoded Strings
  lines.push('### 3. Hardcoded Strings');
  lines.push('');
  if (results.hardcodedStrings.count === 0) {
    lines.push('✅ No hardcoded strings found');
  } else {
    lines.push(`⚠️  Found ${results.hardcodedStrings.count} hardcoded strings in ${results.hardcodedStrings.filesAffected} files`);
    lines.push('');
    lines.push('Run `pnpm i18n:find-hardcoded` for detailed list');
  }
  lines.push('');
  
  // Unused Keys
  lines.push('### 4. Unused Translation Keys');
  lines.push('');
  if (results.unusedKeys.count === 0) {
    lines.push('✅ All translation keys are being used');
  } else {
    lines.push(`ℹ️  Found ${results.unusedKeys.count} unused keys (can be removed):`);
    lines.push('');
    results.unusedKeys.keys.slice(0, 20).forEach(key => {
      lines.push(`- \`${key}\``);
    });
    if (results.unusedKeys.keys.length > 20) {
      lines.push(`- ... and ${results.unusedKeys.keys.length - 20} more`);
    }
  }
  lines.push('');
  
  // Action Items
  lines.push('---');
  lines.push('');
  lines.push('## ✅ Action Items');
  lines.push('');
  lines.push('### High Priority');
  if (results.missingKeys.count > 0) {
    lines.push('- [ ] Add missing translation keys to `src/i18n/locales/en/common.json`');
  }
  if (results.validation.errors.length > 0) {
    lines.push('- [ ] Fix validation errors in translation file');
  }
  lines.push('');
  lines.push('### Medium Priority');
  if (results.hardcodedStrings.count > 0) {
    lines.push('- [ ] Replace hardcoded strings with translation keys');
  }
  lines.push('');
  lines.push('### Low Priority');
  if (results.unusedKeys.count > 0) {
    lines.push('- [ ] Remove unused translation keys');
  }
  lines.push('');
  
  // Commands
  lines.push('---');
  lines.push('');
  lines.push('## 🛠️ Useful Commands');
  lines.push('');
  lines.push('```bash');
  lines.push('# Run full audit');
  lines.push('pnpm i18n:audit');
  lines.push('');
  lines.push('# Individual checks');
  lines.push('pnpm i18n:validate');
  lines.push('pnpm i18n:check-unused');
  lines.push('pnpm i18n:find-hardcoded');
  lines.push('pnpm i18n:check-missing');
  lines.push('```');
  lines.push('');
  
  return lines.join('\n');
}

async function runAudit() {
  const validation = await runValidation();
  const unusedKeys = await runUnusedKeysCheck();
  const hardcodedStrings = await runHardcodedStringsCheck();
  const missingKeys = await runMissingKeysCheck();

  const partialResults: Partial<AuditResults> = {
    timestamp: new Date().toISOString(),
    validation,
    unusedKeys,
    hardcodedStrings,
    missingKeys,
  };

  const recommendations = generateRecommendations(partialResults);

  const results: AuditResults = {
    timestamp: new Date().toISOString(),
    validation,
    unusedKeys,
    hardcodedStrings,
    missingKeys,
    recommendations,
  };

  const report = generateMarkdownReport(results);
  fs.writeFileSync(REPORT_FILE, report, 'utf-8');
}

runAudit().catch(error => {
  process.exit(1);
});
