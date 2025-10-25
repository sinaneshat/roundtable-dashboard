'use client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { MessagePart } from '@/lib/schemas/message-schemas';

type ToolCallPartProps = {
  part: Extract<MessagePart, { type: 'tool-call' }>;
  className?: string;
};
export function ToolCallPart({ part, className }: ToolCallPartProps) {
  return (
    <Card className={`border-primary/20 bg-primary/5 ${className || ''}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span className="text-primary" aria-label="Tool">
            🛠️
          </span>
          <Badge variant="outline" className="font-mono text-xs">
            {part.toolName}
          </Badge>
          <span className="text-xs text-muted-foreground">
            Calling tool...
          </span>
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
            Arguments:
          </div>
          <pre className="text-xs bg-background/50 p-2 rounded border border-border/50 overflow-x-auto">
            {JSON.stringify(part.args, null, 2)}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
