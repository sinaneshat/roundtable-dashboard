/**
 * Mermaid diagram fallback
 *
 * PERFORMANCE: Instead of loading mermaid (~451KB) + cytoscape (~441KB),
 * we show the diagram source code. This saves ~900KB for the rare case
 * where AI responses include mermaid diagrams.
 *
 * If mermaid support is needed, install mermaid and uncomment the
 * dynamic import version below.
 */

import { memo } from 'react';

import { cn } from '@/lib/ui/cn';

type LazyMermaidProps = {
  chart: string;
  className?: string;
};

function LazyMermaidComponent({ chart, className }: LazyMermaidProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-muted/30 overflow-hidden', className)}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/50">
        <span className="text-xs font-medium text-muted-foreground">Mermaid Diagram</span>
      </div>
      <pre className="p-4 overflow-auto text-sm font-mono text-muted-foreground">
        <code>{chart}</code>
      </pre>
    </div>
  );
}

export default memo(LazyMermaidComponent);
