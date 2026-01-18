/**
 * Optimized syntax highlighter
 * Bundles only commonly used languages (~2MB vs ~8MB with all languages)
 * Languages are imported directly to ensure they're bundled upfront
 */

import type { BundledLanguage, ShikiTransformer } from 'shiki';

const CORE_LANGUAGES = [
  'javascript',
  'typescript',
  'jsx',
  'tsx',
  'json',
  'yaml',
  'markdown',
  'bash',
  'shell',
  'python',
  'go',
  'rust',
  'html',
  'css',
  'sql',
  'diff',
] as const;

type CoreLanguage = typeof CORE_LANGUAGES[number];

const SUPPORTED_LANGUAGES = new Set<string>(CORE_LANGUAGES);

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

function isSupportedLanguage(lang: string): lang is CoreLanguage {
  return SUPPORTED_LANGUAGES.has(lang.toLowerCase());
}

let highlighterPromise: Promise<Awaited<ReturnType<typeof import('shiki')['createHighlighter']>>> | null = null;

async function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const [
        { createHighlighter },
        javascript,
        typescript,
        jsx,
        tsx,
        json,
        yaml,
        markdown,
        bash,
        shell,
        python,
        go,
        rust,
        html,
        css,
        sql,
        diff,
      ] = await Promise.all([
        import('shiki'),
        import('shiki/langs/javascript.mjs'),
        import('shiki/langs/typescript.mjs'),
        import('shiki/langs/jsx.mjs'),
        import('shiki/langs/tsx.mjs'),
        import('shiki/langs/json.mjs'),
        import('shiki/langs/yaml.mjs'),
        import('shiki/langs/markdown.mjs'),
        import('shiki/langs/bash.mjs'),
        import('shiki/langs/shell.mjs'),
        import('shiki/langs/python.mjs'),
        import('shiki/langs/go.mjs'),
        import('shiki/langs/rust.mjs'),
        import('shiki/langs/html.mjs'),
        import('shiki/langs/css.mjs'),
        import('shiki/langs/sql.mjs'),
        import('shiki/langs/diff.mjs'),
      ]);

      return createHighlighter({
        themes: ['one-light', 'one-dark-pro'],
        langs: [
          javascript.default,
          typescript.default,
          jsx.default,
          tsx.default,
          json.default,
          yaml.default,
          markdown.default,
          bash.default,
          shell.default,
          python.default,
          go.default,
          rust.default,
          html.default,
          css.default,
          sql.default,
          diff.default,
        ],
      });
    })();
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
