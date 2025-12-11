import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { cn } from '@/lib/ui/cn';
import { getProviderIcon } from '@/lib/utils/ai-display';
import { sortByPriority } from '@/lib/utils/participant';

type AvatarGroupProps = {
  participants: ParticipantConfig[];
  allModels: Array<{ id: string; name: string; provider: string }>;
  maxVisible?: number;
  size?: 'sm' | 'md';
  className?: string;
};

export function AvatarGroup({
  participants,
  allModels,
  maxVisible = 3,
  size = 'sm',
  className,
}: AvatarGroupProps) {
  const sizeClasses = {
    sm: 'size-6',
    md: 'size-10',
  };

  const textSizeClasses = {
    sm: 'text-[10px]',
    md: 'text-xs',
  };

  // ✅ REFACTOR: Use sortByPriority (single source of truth for priority sorting)
  const visibleParticipants = sortByPriority(participants).slice(0, maxVisible);

  const totalCount = participants.length;
  const overlapOffset = size === 'sm' ? -8 : -12;

  return (
    <div className={cn('flex items-center', className)}>
      {visibleParticipants.map((participant, index) => {
        const model = allModels.find(m => m.id === participant.modelId);
        if (!model)
          return null;

        return (
          <div
            key={participant.id}
            className="relative"
            style={{
              zIndex: visibleParticipants.length - index,
              marginLeft: index === 0 ? '0px' : `${overlapOffset}px`,
            }}
          >
            <Avatar
              className={cn(
                sizeClasses[size],
                'relative bg-card border-2 border-card transition-transform hover:scale-110 hover:z-50',
              )}
            >
              <AvatarImage
                src={getProviderIcon(model.provider)}
                alt={model.name}
                className="object-contain p-0.5 relative z-10"
              />
              <AvatarFallback className={cn(textSizeClasses[size], 'bg-card font-semibold relative z-10')}>
                {model.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
        );
      })}
      {/* Total count badge */}
      <div
        className={cn(
          sizeClasses[size],
          'flex items-center justify-center rounded-full bg-white text-black font-bold border-2 border-card',
          size === 'sm' ? 'ml-2' : 'ml-3',
        )}
      >
        <span className={cn(textSizeClasses[size], 'tabular-nums')}>
          {totalCount}
        </span>
      </div>
    </div>
  );
}
