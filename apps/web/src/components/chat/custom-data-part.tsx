import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DataPart } from '@/lib/schemas/data-part-schema';
import { cn } from '@/lib/ui/cn';

type CustomDataPartProps = {
  part: DataPart;
  className?: string;
};
export function CustomDataPart({ className, part }: CustomDataPartProps) {
  const customType = part.type.startsWith('data-')
    ? part.type.substring(5)
    : part.type;
  const displayType = customType.charAt(0).toUpperCase() + customType.slice(1);
  return (
    <Card className={cn('border-blue-500/20 bg-blue-500/5', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <span className="text-blue-500">
            📊
          </span>
          <span className="font-medium text-blue-600 dark:text-blue-400">
            {displayType}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pb-3">
        <div className="space-y-1">
          <pre className="text-xs bg-background/50 p-2 rounded border border-border/50 overflow-x-auto max-h-60 overflow-y-auto">
            {JSON.stringify(part.data, null, 2)}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
