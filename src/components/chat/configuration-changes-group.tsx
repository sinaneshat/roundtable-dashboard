'use client';

import { ArrowRight, Clock, Minus, Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ChatThreadChangelog } from '@/api/routes/chat/schema';
import {
  parseModeChangeData,
  parseParticipantAddedData,
  parseParticipantRemovedData,
  parseParticipantsReorderedData,
  parseParticipantUpdatedData,
} from '@/api/routes/chat/schema';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
} from '@/components/ai-elements/chain-of-thought';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useModelsQuery } from '@/hooks/queries/models';
import { formatRelativeTime } from '@/lib/format/date';
import { cn } from '@/lib/ui/cn';
import { getProviderIcon } from '@/lib/utils/ai-display';

type ConfigurationChangesGroupProps = {
  group: {
    timestamp: Date;
    changes: (ChatThreadChangelog | (Omit<ChatThreadChangelog, 'createdAt'> & { createdAt: string | Date }))[];
  };
  className?: string;
};

// ============================================================================
// Simple inline categorization - no separate file needed
// ============================================================================

type ChangeAction = 'added' | 'modified' | 'removed';

function getChangeAction(changeType: ChatThreadChangelog['changeType']): ChangeAction {
  switch (changeType) {
    case 'participant_added':
      return 'added';
    case 'participant_removed':
      return 'removed';
    case 'participant_updated':
    case 'participants_reordered':
    case 'mode_change':
      return 'modified';
    default:
      return 'modified';
  }
}

/**
 * Action configuration for consistent icons and colors
 * Note: labels are now provided via translation hooks in the component
 */
const actionConfig: Record<ChangeAction, { icon: typeof Plus; color: string }> = {
  added: {
    icon: Plus,
    color: 'text-green-500',
  },
  modified: {
    icon: Pencil,
    color: 'text-blue-500',
  },
  removed: {
    icon: Minus,
    color: 'text-red-500',
  },
};

/**
 * Configuration Changes Group
 *
 * Displays multiple configuration changes that occurred together,
 * grouped by action type (Added, Modified, Removed) for better organization.
 */
export function ConfigurationChangesGroup({ group, className }: ConfigurationChangesGroupProps) {
  const t = useTranslations('chat.configuration');
  const tActionSummary = useTranslations('chat.configuration.actionSummary');

  // Group changes by action type for organized display - simple inline logic
  const changesByAction = group.changes.reduce(
    (acc, change) => {
      const action = getChangeAction(change.changeType);
      if (!acc[action]) {
        acc[action] = [];
      }
      acc[action].push(change);
      return acc;
    },
    {} as Record<ChangeAction, (ChatThreadChangelog | (Omit<ChatThreadChangelog, 'createdAt'> & { createdAt: string | Date }))[]>,
  );

  // Sort by action order: added -> modified -> removed
  const actionOrder: ChangeAction[] = ['added', 'modified', 'removed'];
  const sortedActions = actionOrder.filter(action => changesByAction[action]);

  // Create summary text for header
  const actionSummaries: string[] = [];
  if (changesByAction.added?.length) {
    actionSummaries.push(`${changesByAction.added.length} ${tActionSummary('added')}`);
  }
  if (changesByAction.modified?.length) {
    actionSummaries.push(`${changesByAction.modified.length} ${tActionSummary('modified')}`);
  }
  if (changesByAction.removed?.length) {
    actionSummaries.push(`${changesByAction.removed.length} ${tActionSummary('removed')}`);
  }

  return (
    <div className={cn('py-2', className)}>
      <ChainOfThought defaultOpen={false}>
        <ChainOfThoughtHeader>
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm">{t('configurationChanged')}</span>
            {/* Show detailed info only on desktop */}
            <span className="hidden md:inline text-xs text-muted-foreground">•</span>
            <span className="hidden md:inline text-xs text-muted-foreground truncate">
              {actionSummaries.join(', ')}
            </span>
            <span className="hidden md:inline text-xs text-muted-foreground flex-shrink-0">•</span>
            <span className="hidden md:inline text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
              {formatRelativeTime(group.timestamp)}
            </span>
          </div>
        </ChainOfThoughtHeader>
        <ChainOfThoughtContent>
          <div className="space-y-4">
            {/* Render each action group */}
            {sortedActions.map((action) => {
              const changes = changesByAction[action];
              const config = actionConfig[action];
              const Icon = config.icon;

              return (
                <div key={action} className="space-y-2">
                  {/* Action header */}
                  <div className="flex items-center gap-2 px-1">
                    <Icon className={cn('size-4', config.color)} />
                    <span className={cn('text-sm font-medium', config.color)}>
                      {t(action)}
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
            })}
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
function ChangeItem({ change }: { change: ChatThreadChangelog | (Omit<ChatThreadChangelog, 'createdAt'> & { createdAt: string | Date }) }) {
  // ✅ SINGLE SOURCE OF TRUTH: Fetch models from backend
  const { data: modelsData } = useModelsQuery();
  const allModels = modelsData?.data?.items || [];

  // ✅ ZOD PATTERN: Parse changeData using type-safe schemas (no inline casting)
  const participantAddedData = parseParticipantAddedData(change.changeData);
  const participantRemovedData = parseParticipantRemovedData(change.changeData);
  const participantUpdatedData = parseParticipantUpdatedData(change.changeData);
  const participantsReorderedData = parseParticipantsReorderedData(change.changeData);
  const modeChangeData = parseModeChangeData(change.changeData);

  // ✅ SINGLE SOURCE OF TRUTH: Find model from backend data
  const modelId = participantAddedData?.modelId || participantRemovedData?.modelId || participantUpdatedData?.modelId;
  const role = participantAddedData?.role || participantRemovedData?.role;
  const model = modelId ? allModels.find(m => m.id === modelId) : undefined;

  // Extract data for participant_updated (role changes)
  // Note: The service stores modelId, oldRole, newRole (not separate before/after objects)
  const oldRole = participantUpdatedData?.oldRole;
  const newRole = participantUpdatedData?.newRole;

  // Extract participants data for reordering
  const participants = participantsReorderedData?.participants;

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
            <AvatarImage src={getProviderIcon(model.provider)} alt={model.name} />
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
            <AvatarImage src={getProviderIcon(model.provider)} alt={model.name} />
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

      {/* Participants Reordered - Show all participants in new priority order */}
      {change.changeType === 'participants_reordered' && participants && participants.length > 0 && (
        <>
          {participants
            .sort((a: { priority: number }, b: { priority: number }) => a.priority - b.priority)
            .map((p: { id: string; modelId: string; role: string | null; priority: number }, index: number) => {
              const pModel = allModels.find(m => m.id === p.modelId);
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
                    <AvatarImage src={getProviderIcon(pModel.provider)} alt={pModel.name} />
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
    </>
  );
}
