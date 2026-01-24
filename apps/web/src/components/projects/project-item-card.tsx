import type { ReactNode } from 'react';

import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { SmartImage } from '@/components/ui/smart-image';
import { useBoolean } from '@/hooks/utils';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';

type Badge = {
  label: string;
  icon?: ReactNode;
};

type Thumbnail = {
  src: string | null;
  alt: string;
  isLoading?: boolean;
};

type ProjectItemCardProps = {
  // Visual
  icon: ReactNode;
  iconBgClass?: string;
  thumbnail?: Thumbnail;

  // Content
  title?: string;
  content?: string;
  contentThreshold?: number;

  // Metadata
  badges?: Badge[];
  subtitle?: string;

  // Actions
  actions?: ReactNode;
  showActionsOnHover?: boolean;

  // Behavior
  onClick?: () => void;
  className?: string;
  children?: ReactNode;
};

const DEFAULT_CONTENT_THRESHOLD = 300;

export function ProjectItemCard({
  icon,
  iconBgClass = 'bg-primary/10',
  thumbnail,
  title,
  content,
  contentThreshold = DEFAULT_CONTENT_THRESHOLD,
  badges,
  subtitle,
  actions,
  showActionsOnHover = false,
  onClick,
  className,
  children,
}: ProjectItemCardProps) {
  const t = useTranslations();
  const isExpanded = useBoolean(false);

  const isLongContent = content && contentThreshold > 0 && content.length > contentThreshold;
  const shouldTruncate = isLongContent && !isExpanded.value;

  const cardContent = (
    <>
      {/* Icon or Thumbnail */}
      <div
        className={cn(
          'size-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden',
          !thumbnail && iconBgClass,
        )}
      >
        {thumbnail
          ? (
              thumbnail.isLoading
                ? <Icons.loader className="size-4 text-muted-foreground animate-spin" />
                : thumbnail.src
                  ? (
                      <SmartImage
                        src={thumbnail.src}
                        alt={thumbnail.alt}
                        fill
                        sizes="40px"
                        unoptimized
                        containerClassName="size-full"
                        fallback={(
                          <div className={cn('size-full flex items-center justify-center', iconBgClass)}>
                            {icon}
                          </div>
                        )}
                      />
                    )
                  : (
                      <div className={cn('size-full flex items-center justify-center', iconBgClass)}>
                        {icon}
                      </div>
                    )
            )
          : icon}
      </div>

      {/* Main content area */}
      <div className="flex-1 min-w-0">
        {/* Title and badges row */}
        {(title || badges) && (
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {badges?.map((badge, index) => (
              <span
                // eslint-disable-next-line react/no-array-index-key -- badges are static per render
                key={index}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-muted text-muted-foreground"
              >
                {badge.icon}
                {badge.label}
              </span>
            ))}
            {title && (
              <p className="text-sm font-medium truncate">{title}</p>
            )}
          </div>
        )}

        {/* Content with expand/collapse */}
        {content && (
          <Collapsible open={isExpanded.value} onOpenChange={isExpanded.setValue}>
            <p className={cn(
              'text-sm text-foreground/90 whitespace-pre-wrap break-words',
              shouldTruncate && 'line-clamp-3',
            )}
            >
              {content}
            </p>
            {isLongContent && (
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-0 h-5 text-xs mt-1 text-primary/70 hover:text-primary hover:bg-transparent"
                  startIcon={<Icons.chevronDown className={cn('transition-transform', isExpanded.value && 'rotate-180')} />}
                >
                  {isExpanded.value ? t('projects.collapseLess') : t('projects.expandMore')}
                </Button>
              </CollapsibleTrigger>
            )}
            <CollapsibleContent />
          </Collapsible>
        )}

        {/* Custom children */}
        {children}

        {/* Subtitle (date, size, etc.) */}
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">
            {subtitle}
          </p>
        )}
      </div>

      {/* Actions */}
      {actions && (
        <div className={cn(
          'flex items-center gap-1 shrink-0',
          showActionsOnHover && 'opacity-0 group-hover:opacity-100 transition-opacity',
        )}
        >
          {actions}
        </div>
      )}
    </>
  );

  const containerClasses = cn(
    'flex items-start gap-3 p-3 rounded-lg bg-muted/40 border border-border/40 hover:bg-muted/60 transition-colors group',
    onClick && 'cursor-pointer',
    className,
  );

  if (onClick) {
    return (
      <div
        className={containerClasses}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
        role="button"
        tabIndex={0}
      >
        {cardContent}
      </div>
    );
  }

  return (
    <div className={containerClasses}>
      {cardContent}
    </div>
  );
}

// Skeleton variant for loading states
export function ProjectItemCardSkeleton() {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border border-border/40">
      <Skeleton className="size-10 rounded-lg shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}
