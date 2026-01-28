import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useTranslations } from '@/lib/i18n';
import type { MessagePart } from '@/lib/schemas';
import { cn } from '@/lib/ui/cn';

type ToolCallPartProps = {
  part: Extract<MessagePart, { type: 'tool-call' }>;
  className?: string;
};

export function ToolCallPart({ className, part }: ToolCallPartProps) {
  const t = useTranslations();

  return (
    <Card className={cn('border-primary/20 bg-primary/5', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span className="text-primary">
            🛠️
          </span>
          <Badge variant="outline" className="font-mono text-xs">
            {part.toolName}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {t('chat.tools.calling')}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pb-3">
        <div className="text-xs text-muted-foreground font-mono">
          {t('chat.tools.id')}
          :
          {' '}
          {part.toolCallId}
        </div>
        <div className="space-y-1">
          <div className="text-xs font-medium text-foreground/80">
            {t('chat.tools.arguments')}
            :
          </div>
          <pre className="text-xs bg-background/50 p-2 rounded border border-border/50 overflow-x-auto">
            {JSON.stringify(part.args, null, 2)}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
