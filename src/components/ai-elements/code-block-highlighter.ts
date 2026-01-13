/**
 * Lazy-loaded syntax highlighter
 * Uses shiki/bundle/web for smaller bundle size (~1MB vs ~3.6MB)
 * Only loads languages on-demand
 */

import type { BundledLanguage, ShikiTransformer } from 'shiki';

// Common languages to support (reduced set for smaller bundle)
const SUPPORTED_LANGUAGES = new Set([
  'javascript',
  'typescript',
  'jsx',
  'tsx',
  'python',
  'java',
  'go',
  'rust',
  'ruby',
  'php',
  'c',
  'cpp',
  'csharp',
  'html',
  'css',
  'scss',
  'json',
  'xml',
  'yaml',
  'bash',
  'shell',
  'sql',
  'dockerfile',
  'markdown',
  'swift',
  'kotlin',
  'graphql',
]);

const lineNumberTransformer: ShikiTransformer = {
  name: 'line-numbers',
  line(node, line) {
    node.children.unshift({
      type: 'element',
      tagName: 'span',
      properties: {
        className: [
          'inline-block',
          'min-w-10',
          'mr-4',
          'text-right',
          'select-none',
          'text-muted-foreground',
        ],
      },
      children: [{ type: 'text', value: String(line) }],
    });
  },
};

function isSupportedLanguage(lang: string): lang is BundledLanguage {
  return SUPPORTED_LANGUAGES.has(lang.toLowerCase());
}

// Cache the highlighter to avoid re-creating it
let highlighterPromise: Promise<Awaited<ReturnType<typeof import('shiki')['createHighlighter']>>> | null = null;

async function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then(async ({ createHighlighter }) => {
      return createHighlighter({
        themes: ['one-light', 'one-dark-pro'],
        langs: [], // Load languages on-demand
      });
    });
  }
  return highlighterPromise;
}

async function highlightCode(
  code: string,
  language: BundledLanguage | string,
  showLineNumbers = false,
): Promise<[string, string]> {
  const transformers: ShikiTransformer[] = showLineNumbers ? [lineNumberTransformer] : [];

  const escapeHtml = (text: string): string =>
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  try {
    const highlighter = await getHighlighter();
    const lang = isSupportedLanguage(language) ? language : 'text';

    // Load language on-demand if not already loaded
    if (lang !== 'text') {
      const loadedLangs = highlighter.getLoadedLanguages();
      if (!loadedLangs.includes(lang)) {
        await highlighter.loadLanguage(lang as BundledLanguage);
      }
    }

    const [light, dark] = await Promise.all([
      highlighter.codeToHtml(code, {
        lang,
        theme: 'one-light',
        transformers,
      }),
      highlighter.codeToHtml(code, {
        lang,
        theme: 'one-dark-pro',
        transformers,
      }),
    ]);
    return [light, dark];
  } catch {
    const fallbackHtml = `<pre><code>${escapeHtml(code)}</code></pre>`;
    return [fallbackHtml, fallbackHtml];
  }
}

export { highlightCode };
export type { BundledLanguage };
