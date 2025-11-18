import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/ui/cn';
import { getProviderIcon } from '@/lib/utils/ai-display';

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

  const visibleParticipants = participants
    .sort((a, b) => a.priority - b.priority)
    .slice(0, maxVisible);

  const remainingCount = participants.length - maxVisible;

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
      {remainingCount > 0 && (
        <span className={cn(textSizeClasses[size], 'font-bold text-muted-foreground ml-2 tabular-nums')}>
          +
          {remainingCount}
        </span>
      )}
    </div>
  );
}
