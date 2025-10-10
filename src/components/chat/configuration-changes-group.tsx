'use client';

import { ArrowRight, Clock, ListPlus, Minus, Pencil, Plus } from 'lucide-react';

import type { ChatThreadChangelog } from '@/api/routes/chat/schema';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
} from '@/components/ai-elements/chain-of-thought';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { ChangeAction, ChangeGroup } from '@/lib/ai/changelog-helpers';
import { sortChangesByAction } from '@/lib/ai/changelog-helpers';
import {
  parseMemoryAddedData,
  parseMemoryRemovedData,
  parseModeChangeData,
  parseParticipantAddedData,
  parseParticipantRemovedData,
  parseParticipantsReorderedData,
  parseParticipantUpdatedData,
} from '@/lib/ai/changelog-schemas';
import { getModelById } from '@/lib/ai/models-config';
import { formatRelativeTime } from '@/lib/format/date';
import { cn } from '@/lib/ui/cn';

type ConfigurationChangesGroupProps = {
  group: ChangeGroup;
  className?: string;
};

/**
 * Action configuration for consistent icons and colors
 */
const actionConfig: Record<ChangeAction, { icon: typeof Plus; color: string; label: string }> = {
  added: {
    icon: Plus,
    color: 'text-green-500',
    label: 'Added',
  },
  modified: {
    icon: Pencil,
    color: 'text-blue-500',
    label: 'Modified',
  },
  removed: {
    icon: Minus,
    color: 'text-red-500',
    label: 'Removed',
  },
};

/**
 * Configuration Changes Group
 *
 * Displays multiple configuration changes that occurred together,
 * grouped by action type (Added, Modified, Removed) for better organization.
 */
export function ConfigurationChangesGroup({ group, className }: ConfigurationChangesGroupProps) {
  // Sort changes by action type: added -> modified -> removed
  const sortedChanges = sortChangesByAction(group.changes);

  // Group changes by action type for organized display
  const changesByAction = sortedChanges.reduce(
    (acc, change) => {
      if (!acc[change.action]) {
        acc[change.action] = [];
      }
      acc[change.action].push(change.change);
      return acc;
    },
    {} as Record<ChangeAction, ChatThreadChangelog[]>,
  );

  // Create summary text for header
  const actionSummaries: string[] = [];
  if (changesByAction.added?.length) {
    actionSummaries.push(`${changesByAction.added.length} added`);
  }
  if (changesByAction.modified?.length) {
    actionSummaries.push(`${changesByAction.modified.length} modified`);
  }
  if (changesByAction.removed?.length) {
    actionSummaries.push(`${changesByAction.removed.length} removed`);
  }

  return (
    <div className={cn('py-2', className)}>
      <ChainOfThought defaultOpen={false}>
        <ChainOfThoughtHeader>
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm">Configuration updated</span>
            {/* Show detailed info only on desktop */}
            <span className="hidden md:inline text-xs text-muted-foreground">•</span>
            <span className="hidden md:inline text-xs text-muted-foreground truncate">
              {actionSummaries.join(', ')}
            </span>
            <span className="text-xs text-muted-foreground flex-shrink-0">•</span>
            <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
              {formatRelativeTime(group.timestamp)}
            </span>
          </div>
        </ChainOfThoughtHeader>
        <ChainOfThoughtContent>
          <div className="space-y-4">
            {/* Render each action group */}
            {(Object.entries(changesByAction) as [ChangeAction, ChatThreadChangelog[]][]).map(
              ([action, changes]) => {
                const config = actionConfig[action];
                const Icon = config.icon;

                return (
                  <div key={action} className="space-y-2">
                    {/* Action header */}
                    <div className="flex items-center gap-2 px-1">
                      <Icon className={cn('size-4', config.color)} />
                      <span className={cn('text-sm font-medium', config.color)}>
                        {config.label}
                      </span>
                    </div>

                    {/* Changes for this action - Responsive: horizontal scroll on desktop, vertical stack on mobile */}
                    <div className="w-full overflow-x-auto md:overflow-x-auto">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 pb-2 pl-6">
                        {changes.map(change => (
                          <ChangeItem key={change.id} change={change} />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              },
            )}
          </div>
        </ChainOfThoughtContent>
      </ChainOfThought>
    </div>
  );
}

/**
 * Individual change item renderer with glassmorphism style
 * Matches the ParticipantsPreview badge design
 */
function ChangeItem({ change }: { change: ChatThreadChangelog }) {
  // ✅ ZOD PATTERN: Parse changeData using type-safe schemas (no inline casting)
  const participantAddedData = parseParticipantAddedData(change.changeData);
  const participantRemovedData = parseParticipantRemovedData(change.changeData);
  const participantUpdatedData = parseParticipantUpdatedData(change.changeData);
  const participantsReorderedData = parseParticipantsReorderedData(change.changeData);
  const memoryAddedData = parseMemoryAddedData(change.changeData);
  const memoryRemovedData = parseMemoryRemovedData(change.changeData);
  const modeChangeData = parseModeChangeData(change.changeData);

  // Extract model information from changeData for participant changes
  const modelId = participantAddedData?.modelId || participantRemovedData?.modelId || participantUpdatedData?.modelId;
  const role = participantAddedData?.role || participantRemovedData?.role;
  const model = modelId ? getModelById(modelId) : undefined;

  // Extract data for participant_updated (role changes)
  // Note: The service stores modelId, oldRole, newRole (not separate before/after objects)
  const oldRole = participantUpdatedData?.oldRole;
  const newRole = participantUpdatedData?.newRole;

  // Extract participants data for reordering
  const participants = participantsReorderedData?.participants;

  // Extract memory details
  const memoryTitle = memoryAddedData?.title || memoryRemovedData?.title;
  const memoryType = memoryAddedData?.type || memoryRemovedData?.type;
  const memoryDescription = memoryAddedData?.description;

  // Extract mode change details
  const previousMode = modeChangeData?.previousMode;
  const newMode = modeChangeData?.newMode;

  return (
    <>
      {/* Participant Added/Removed - Glassmorphism badge style */}
      {(change.changeType === 'participant_added' || change.changeType === 'participant_removed') && model && (
        <div
          className={cn(
            'relative flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 sm:py-1.5 shrink-0',
            'backdrop-blur-md border rounded-lg shadow-md',
            'bg-background/10 border-white/30 dark:border-white/20',
            change.changeType === 'participant_removed' && 'opacity-60',
          )}
        >
          <Avatar className="size-4 sm:size-5 shrink-0">
            <AvatarImage src={model.metadata.icon} alt={model.name} />
            <AvatarFallback className="text-[8px] sm:text-[10px]">
              {model.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className={cn(
              'text-[10px] sm:text-xs font-medium truncate whitespace-nowrap text-foreground/90',
              change.changeType === 'participant_removed' && 'line-through',
            )}
            >
              {model.name}
            </span>
            {role && (
              <span className="text-[9px] sm:text-[10px] text-muted-foreground/70 truncate whitespace-nowrap">
                {role}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Participant Updated - Show role change with before → after */}
      {change.changeType === 'participant_updated' && model && (oldRole || newRole) && (
        <div
          className={cn(
            'relative flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 sm:py-1.5 shrink-0',
            'backdrop-blur-md border rounded-lg shadow-md',
            'bg-background/10 border-white/30 dark:border-white/20',
          )}
        >
          <Avatar className="size-4 sm:size-5 shrink-0">
            <AvatarImage src={model.metadata.icon} alt={model.name} />
            <AvatarFallback className="text-[8px] sm:text-[10px]">
              {model.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[10px] sm:text-xs font-medium truncate whitespace-nowrap text-foreground/90">
              {model.name}
            </span>
            <div className="flex items-center gap-1">
              {oldRole && (
                <span className="text-[9px] sm:text-[10px] text-muted-foreground/50 truncate whitespace-nowrap line-through">
                  {oldRole}
                </span>
              )}
              {oldRole && newRole && (
                <ArrowRight className="size-2 sm:size-2.5 text-muted-foreground/50 shrink-0" />
              )}
              {newRole && (
                <span className="text-[9px] sm:text-[10px] text-muted-foreground/70 truncate whitespace-nowrap">
                  {newRole}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Participants Reordered - Show all participants in new order */}
      {change.changeType === 'participants_reordered' && participants && participants.length > 0 && (
        <>
          {participants
            .sort((a, b) => a.order - b.order)
            .map((p, index) => {
              const pModel = getModelById(p.modelId);
              if (!pModel)
                return null;

              return (
                <div
                  key={p.id}
                  className={cn(
                    'relative flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 sm:py-1.5 shrink-0',
                    'backdrop-blur-md border rounded-lg shadow-md',
                    'bg-background/10 border-white/30 dark:border-white/20',
                  )}
                >
                  {/* Order number badge */}
                  <div className="flex items-center justify-center size-4 sm:size-5 shrink-0 rounded-full bg-primary/20 text-primary">
                    <span className="text-[8px] sm:text-[10px] font-bold">{index + 1}</span>
                  </div>
                  <Avatar className="size-4 sm:size-5 shrink-0">
                    <AvatarImage src={pModel.metadata.icon} alt={pModel.name} />
                    <AvatarFallback className="text-[8px] sm:text-[10px]">
                      {pModel.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[10px] sm:text-xs font-medium truncate whitespace-nowrap text-foreground/90">
                      {pModel.name}
                    </span>
                    {p.role && (
                      <span className="text-[9px] sm:text-[10px] text-muted-foreground/70 truncate whitespace-nowrap">
                        {p.role}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
        </>
      )}

      {/* Mode Change */}
      {change.changeType === 'mode_change' && (previousMode || newMode) && (
        <div
          className={cn(
            'flex items-center gap-2 px-2 sm:px-2.5 py-1 sm:py-1.5 shrink-0',
            'backdrop-blur-md border rounded-lg shadow-md',
            'bg-background/10 border-white/30 dark:border-white/20',
          )}
        >
          {previousMode && (
            <span className="text-[10px] sm:text-xs opacity-60">{previousMode}</span>
          )}
          <ArrowRight className="size-3 text-muted-foreground shrink-0" />
          {newMode && (
            <span className="text-[10px] sm:text-xs font-medium">{newMode}</span>
          )}
        </div>
      )}

      {/* Memory Added/Removed */}
      {(change.changeType === 'memory_added' || change.changeType === 'memory_removed') && memoryTitle && (
        <div
          className={cn(
            'relative flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 sm:py-1.5 shrink-0',
            'backdrop-blur-md border rounded-lg shadow-md',
            'bg-background/10 border-white/30 dark:border-white/20',
            change.changeType === 'memory_removed' && 'opacity-60',
          )}
        >
          <ListPlus className="size-3 sm:size-4 shrink-0 text-muted-foreground" />
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className={cn(
              'text-[10px] sm:text-xs font-medium truncate whitespace-nowrap text-foreground/90',
              change.changeType === 'memory_removed' && 'line-through',
            )}
            >
              {memoryTitle}
            </span>
            {memoryDescription && (
              <span className="text-[9px] sm:text-[10px] text-muted-foreground/70 truncate whitespace-nowrap">
                {memoryDescription}
              </span>
            )}
            {memoryType && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 capitalize w-fit">
                {memoryType}
              </Badge>
            )}
          </div>
        </div>
      )}
    </>
  );
}
