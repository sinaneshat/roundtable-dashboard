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
    sm: 'size-5',
    md: 'size-7',
  };

  const textSizeClasses = {
    sm: 'text-[7px]',
    md: 'text-[9px]',
  };

  const ringClasses = {
    sm: 'ring-2',
    md: 'ring-2',
  };

  const visibleParticipants = participants
    .sort((a, b) => a.priority - b.priority)
    .slice(0, maxVisible);

  const remainingCount = participants.length - maxVisible;

  const overlapOffset = size === 'sm' ? -6 : -8;

  return (
    <div className={cn('flex items-center', className)}>
      {visibleParticipants.map((participant, index) => {
        const model = allModels.find(m => m.id === participant.modelId);
        if (!model)
          return null;

        return (
          <Avatar
            key={participant.id}
            className={cn(
              sizeClasses[size],
              ringClasses[size],
              'relative ring-black bg-black transition-transform hover:scale-110 hover:z-50',
            )}
            style={{
              zIndex: visibleParticipants.length - index,
              marginLeft: index === 0 ? 0 : overlapOffset,
            }}
          >
            <AvatarImage
              src={getProviderIcon(model.provider)}
              alt={model.name}
              className="object-contain p-0.5"
            />
            <AvatarFallback className={cn(textSizeClasses[size], 'bg-muted font-semibold')}>
              {model.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
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
