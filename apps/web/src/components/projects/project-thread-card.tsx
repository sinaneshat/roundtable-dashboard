import { Link } from '@tanstack/react-router';

import { Icons } from '@/components/icons';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';
import type { ListThreadsResponse } from '@/services/api';

type ThreadItem = NonNullable<ListThreadsResponse['data']>['items'][number];

type ProjectThreadCardProps = {
  thread: ThreadItem;
  onDelete?: () => void;
};

export function ProjectThreadCard({ thread, onDelete }: ProjectThreadCardProps) {
  const t = useTranslations();

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border border-border/40 hover:bg-muted/60 transition-colors group">
      {/* ✅ FIX: Use preload="intent" for native prefetching - avoids shell data race */}
      <Link
        to="/chat/$slug"
        params={{ slug: thread.slug }}
        preload="intent"
        className="flex items-center gap-3 flex-1 min-w-0"
      >
        {/* Icon */}
        <div className="size-10 rounded-lg flex items-center justify-center shrink-0 bg-primary/10">
          <Icons.messageSquare className="size-4 text-primary" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{thread.title}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {new Date(thread.updatedAt).toLocaleDateString()}
          </p>
        </div>
      </Link>

      {/* Delete button - hover reveal */}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
          className={cn(
            'p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive',
            'opacity-0 group-hover:opacity-100 transition-opacity shrink-0',
          )}
          title={t('chat.deleteThread')}
        >
          <Icons.trash className="size-4" />
        </button>
      )}
    </div>
  );
}
