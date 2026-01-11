/**
 * Lazy-loaded syntax highlighter
 * Defers 3.6MB shiki package until code highlighting is actually needed
 */

import type { BundledLanguage, ShikiTransformer } from 'shiki';

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

function isBundledLanguage(lang: string): lang is BundledLanguage {
  const bundledLanguages = [
    'javascript',
    'typescript',
    'jsx',
    'tsx',
    'python',
    'java',
    'c',
    'cpp',
    'csharp',
    'go',
    'rust',
    'ruby',
    'php',
    'swift',
    'kotlin',
    'scala',
    'r',
    'sql',
    'html',
    'css',
    'scss',
    'sass',
    'less',
    'json',
    'xml',
    'yaml',
    'markdown',
    'bash',
    'shell',
    'powershell',
    'dockerfile',
    'graphql',
    'lua',
    'perl',
    'haskell',
    'elixir',
    'clojure',
  ];
  return bundledLanguages.includes(lang.toLowerCase());
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
    const { codeToHtml } = await import('shiki');

    const lang = isBundledLanguage(language) ? language : 'text';

    const [light, dark] = await Promise.all([
      codeToHtml(code, {
        lang,
        theme: 'one-light',
        transformers,
      }),
      codeToHtml(code, {
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
