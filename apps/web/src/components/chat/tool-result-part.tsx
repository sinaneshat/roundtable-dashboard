import { ComponentVariants } from '@roundtable/shared';
import { z } from 'zod';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { MessagePart } from '@/lib/schemas/message-schemas';
import { cn } from '@/lib/ui/cn';
import dynamic from '@/lib/utils/dynamic';

// Simple schema for web search tool results validation
const WebSearchResultSchema = z.any();

// Lazy-loaded - only rendered when web_search tool results exist (~180 lines)
const WebSearchDisplay = dynamic(
  () => import('./web-search-display').then(m => ({ default: m.WebSearchDisplay })),
  { ssr: false },
);

type ToolResultPartProps = {
  part: Extract<MessagePart, { type: 'tool-result' }>;
  className?: string;
};

export function ToolResultPart({ part, className }: ToolResultPartProps) {
  const isError = part.isError ?? false;
  const statusColor = isError ? ComponentVariants.DESTRUCTIVE : ComponentVariants.SUCCESS;
  const bgColor = isError ? 'bg-destructive/5' : 'bg-green-500/5';
  const borderColor = isError ? 'border-destructive/20' : 'border-green-500/20';
  const statusText = isError ? 'Error' : 'Success';

  // Special handling for web_search tool results with Zod validation
  if (part.toolName === 'web_search' && !isError) {
    const parseResult = WebSearchResultSchema.safeParse(part.result);
    if (parseResult.success) {
      return (
        <WebSearchDisplay
          results={parseResult.data.results}
          meta={parseResult.data._meta}
          className={className}
        />
      );
    }
  }

  return (
    <Card className={cn(borderColor, bgColor, className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span aria-label={`Tool ${statusText}`}>
            {isError ? '❌' : '✅'}
          </span>
          <Badge variant="outline" className="font-mono text-xs">
            {part.toolName}
          </Badge>
          <Badge variant={statusColor} className="text-xs">
            {statusText}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pb-3">
        <div className="text-xs text-muted-foreground font-mono">
          ID:
          {' '}
          {part.toolCallId}
        </div>
        <div className="space-y-1">
          <div className="text-xs font-medium text-foreground/80">
            Result:
          </div>
          <pre className="text-xs bg-background/50 p-2 rounded border border-border/50 overflow-x-auto max-h-60 overflow-y-auto">
            {JSON.stringify(part.result, null, 2)}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
