'use client';

/**
 * ToolResultPart Component - Renders tool execution result UI
 *
 * ✅ AI SDK v5 ALIGNMENT: Displays tool-result message parts
 * Shows the result returned from tool execution (success or error)
 *
 * @see /src/lib/schemas/message-schemas.ts - Tool message part types
 * @see Analysis Agent 5 findings - Tool rendering patterns
 */

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { MessagePart } from '@/lib/schemas/message-schemas';

type ToolResultPartProps = {
  /**
   * Tool result message part containing execution result data
   */
  part: Extract<MessagePart, { type: 'tool-result' }>;

  /**
   * Optional className for styling
   */
  className?: string;
};

/**
 * ToolResultPart - Display tool execution result
 *
 * Shows:
 * - Tool name badge
 * - Success/Error status
 * - Tool call ID (for debugging)
 * - Result data (formatted JSON)
 *
 * Styling adapts based on success/error state:
 * - Success: Green accent
 * - Error: Red accent
 *
 * @example
 * // Successful result
 * <ToolResultPart
 *   part={{
 *     type: 'tool-result',
 *     toolCallId: 'call_123',
 *     toolName: 'search_web',
 *     result: { results: [...] },
 *     isError: false
 *   }}
 * />
 *
 * // Error result
 * <ToolResultPart
 *   part={{
 *     type: 'tool-result',
 *     toolCallId: 'call_123',
 *     toolName: 'search_web',
 *     result: { error: 'Network timeout' },
 *     isError: true
 *   }}
 * />
 */
export function ToolResultPart({ part, className }: ToolResultPartProps) {
  const isError = part.isError ?? false;
  const statusColor = isError ? 'destructive' : 'success';
  const bgColor = isError ? 'bg-destructive/5' : 'bg-green-500/5';
  const borderColor = isError ? 'border-destructive/20' : 'border-green-500/20';
  const statusText = isError ? 'Error' : 'Success';

  return (
    <Card className={`${borderColor} ${bgColor} ${className || ''}`}>
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
        {/* Tool Call ID (for debugging/tracking) */}
        <div className="text-xs text-muted-foreground font-mono">
          ID:
          {' '}
          {part.toolCallId}
        </div>

        {/* Tool Result */}
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
