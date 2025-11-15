'use client';
import type { BaseModelResponse } from '@/api/routes/models/schema';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/ui/cn';
import { getProviderIcon } from '@/lib/utils/ai-display';

const EMPTY_MODELS: BaseModelResponse[] = [];

type AIModelsBadgeProps = {
  models: Array<{ modelId: string; provider?: string; name?: string }>;
  allModels?: BaseModelResponse[];
  className?: string;
  maxDisplay?: number;
  showCount?: boolean;
  size?: 'sm' | 'md' | 'lg';
};

export function AIModelsBadge({
  models,
  allModels = EMPTY_MODELS,
  className,
  maxDisplay = 3,
  showCount = true,
  size = 'md',
}: AIModelsBadgeProps) {
  const sizeConfig = {
    sm: { avatar: 'size-9', badge: 'h-5 min-w-[20px] text-[10px] px-1.5' },
    md: { avatar: 'size-10', badge: 'h-6 min-w-[24px] text-xs px-2' },
    lg: { avatar: 'size-11', badge: 'h-7 min-w-[28px] text-sm px-2' },
  };

  const config = sizeConfig[size];
  const displayedModels = models.slice(0, maxDisplay);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Overlapping Circular Avatars - shadcn pattern */}
      <div className="flex">
        {displayedModels.map((model, idx) => {
          const modelData = allModels.find(m => m.id === model.modelId);
          const provider = model.provider || modelData?.provider || model.modelId?.split('/')[0] || 'ai';
          const modelName = model.name || modelData?.name || model.modelId || 'AI';

          return (
            <div
              key={model.modelId}
              className="relative"
              style={{
                zIndex: displayedModels.length - idx,
                marginLeft: idx === 0 ? '0px' : '-14px',
              }}
            >
              <Avatar
                className={cn(config.avatar, 'ring-2 ring-black bg-black border-2 border-black relative')}
                style={{ backgroundColor: '#000000' }}
              >
                <div className="absolute inset-0 bg-black rounded-full" style={{ backgroundColor: '#000000' }} />
                <AvatarImage
                  src={getProviderIcon(provider)}
                  alt={modelName}
                  className="object-contain p-1 relative z-10 bg-black rounded-full"
                  style={{ backgroundColor: '#000000' }}
                />
                <AvatarFallback className="text-[8px] bg-black relative z-10" style={{ backgroundColor: '#000000' }}>
                  {modelName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
          );
        })}
      </div>

      {/* Count Badge */}
      {showCount && models.length > 0 && (
        <Badge
          variant="secondary"
          className={cn(
            'rounded-full font-semibold tabular-nums shrink-0',
            config.badge,
          )}
        >
          {models.length}
        </Badge>
      )}
    </div>
  );
}
