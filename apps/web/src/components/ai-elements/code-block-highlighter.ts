/**
 * Optimized syntax highlighter
 *
 * PERFORMANCE: Uses shiki/core + JavaScript engine + individual imports.
 * This avoids bundling:
 * - All 200+ language grammars (~4MB)
 * - Oniguruma WASM engine (~600KB)
 *
 * Only loads 16 common languages on demand (~200KB total).
 * Uses JavaScript regex engine (smaller, no WASM needed).
 */

import type { HighlighterCore, ShikiTransformer } from 'shiki/core';

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

let highlighterPromise: Promise<HighlighterCore> | null = null;

async function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      // Dynamic imports for fine-grained bundling
      const [
        { createHighlighterCore },
        { createJavaScriptRegexEngine },
        // Themes
        oneDarkPro,
        oneLight,
        // Languages - only load what we need
        javascript,
        typescript,
        jsx,
        tsx,
        json,
        yaml,
        markdown,
        bash,
        shellscript,
        python,
        go,
        rust,
        html,
        css,
        sql,
        diff,
      ] = await Promise.all([
        import('shiki/core'),
        import('shiki/engine/javascript'),
        // Themes - use shiki's dist paths
        import('shiki/dist/themes/one-dark-pro.mjs'),
        import('shiki/dist/themes/one-light.mjs'),
        // Languages - use shiki's dist paths
        import('shiki/dist/langs/javascript.mjs'),
        import('shiki/dist/langs/typescript.mjs'),
        import('shiki/dist/langs/jsx.mjs'),
        import('shiki/dist/langs/tsx.mjs'),
        import('shiki/dist/langs/json.mjs'),
        import('shiki/dist/langs/yaml.mjs'),
        import('shiki/dist/langs/markdown.mjs'),
        import('shiki/dist/langs/bash.mjs'),
        import('shiki/dist/langs/shellscript.mjs'),
        import('shiki/dist/langs/python.mjs'),
        import('shiki/dist/langs/go.mjs'),
        import('shiki/dist/langs/rust.mjs'),
        import('shiki/dist/langs/html.mjs'),
        import('shiki/dist/langs/css.mjs'),
        import('shiki/dist/langs/sql.mjs'),
        import('shiki/dist/langs/diff.mjs'),
      ]);

      return createHighlighterCore({
        engine: createJavaScriptRegexEngine(),
        themes: [
          oneDarkPro.default,
          oneLight.default,
        ],
        langs: [
          javascript.default,
          typescript.default,
          jsx.default,
          tsx.default,
          json.default,
          yaml.default,
          markdown.default,
          bash.default,
          shellscript.default,
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
  language: string,
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
    // Map 'shell' to 'shellscript' (shiki's name for shell)
    let lang = language.toLowerCase();
    if (lang === 'shell')
      lang = 'shellscript';
    if (!isSupportedLanguage(lang) && lang !== 'shellscript')
      lang = 'text';

    const [light, dark] = await Promise.all([
      highlighter.codeToHtml(code, {
        lang: lang as CoreLanguage,
        theme: 'one-light',
        transformers,
      }),
      highlighter.codeToHtml(code, {
        lang: lang as CoreLanguage,
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

// Re-export type for consumers
export type { BundledLanguage } from 'shiki';
