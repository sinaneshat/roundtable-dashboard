'use client';
import { ArrowRight, Clock, Globe, Minus, Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ChangelogType } from '@/api/core/enums';
import { ChangelogTypes } from '@/api/core/enums';
import type { ChatThreadChangelog } from '@/api/routes/chat/schema';
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

// No conversion needed - changeType IS the action
function getChangeAction(changeType: ChatThreadChangelog['changeType']): ChangelogType {
  return changeType;
}
const actionConfig: Record<ChangelogType, { icon: typeof Plus; color: string }> = {
  [ChangelogTypes.ADDED]: {
    icon: Plus,
    color: 'text-green-500',
  },
  [ChangelogTypes.MODIFIED]: {
    icon: Pencil,
    color: 'text-blue-500',
  },
  [ChangelogTypes.REMOVED]: {
    icon: Minus,
    color: 'text-red-500',
  },
};
export function ConfigurationChangesGroup({ group, className }: ConfigurationChangesGroupProps) {
  const t = useTranslations('chat.configuration');
  const tActionSummary = useTranslations('chat.configuration.actionSummary');
  if (!group.changes || group.changes.length === 0) {
    return null;
  }
  const changesByAction = group.changes.reduce(
    (acc, change) => {
      const action = getChangeAction(change.changeType);
      if (!acc[action]) {
        acc[action] = [];
      }
      acc[action].push(change);
      return acc;
    },
    {} as Record<ChangelogType, (ChatThreadChangelog | (Omit<ChatThreadChangelog, 'createdAt'> & { createdAt: string | Date }))[]>,
  );
  const actionOrder: ChangelogType[] = [ChangelogTypes.ADDED, ChangelogTypes.MODIFIED, ChangelogTypes.REMOVED];
  const sortedActions = actionOrder.filter(action => changesByAction[action]);
  const actionSummaries: string[] = [];
  if (changesByAction[ChangelogTypes.ADDED]?.length) {
    actionSummaries.push(`${changesByAction[ChangelogTypes.ADDED].length} ${tActionSummary('added')}`);
  }
  if (changesByAction[ChangelogTypes.MODIFIED]?.length) {
    actionSummaries.push(`${changesByAction[ChangelogTypes.MODIFIED].length} ${tActionSummary('modified')}`);
  }
  if (changesByAction[ChangelogTypes.REMOVED]?.length) {
    actionSummaries.push(`${changesByAction[ChangelogTypes.REMOVED].length} ${tActionSummary('removed')}`);
  }
  return (
    <div className={cn('py-2', className)}>
      <ChainOfThought defaultOpen={false}>
        <ChainOfThoughtHeader>
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm">{t('configurationChanged')}</span>
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
            {sortedActions.map((action) => {
              const changes = changesByAction[action];
              const config = actionConfig[action];
              const Icon = config.icon;
              return (
                <div key={action} className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <Icon className={cn('size-4', config.color)} />
                    <span className={cn('text-sm font-medium', config.color)}>
                      {t(action)}
                    </span>
                  </div>
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
// Simplified change data structure - discriminated by 'type' field
type ChangeDataBase = {
  type: 'participant' | 'participant_role' | 'mode_change' | 'web_search';
};

type ParticipantChangeData = ChangeDataBase & {
  type: 'participant';
  modelId: string;
  role?: string | null;
  participantId?: string;
};

type ParticipantRoleChangeData = ChangeDataBase & {
  type: 'participant_role';
  modelId: string;
  oldRole?: string | null;
  newRole?: string | null;
  participantId?: string;
};

type ModeChangeData = ChangeDataBase & {
  type: 'mode_change';
  oldMode: string;
  newMode: string;
};

type WebSearchChangeData = ChangeDataBase & {
  type: 'web_search';
  enabled: boolean;
};

type ChangeData = ParticipantChangeData | ParticipantRoleChangeData | ModeChangeData | WebSearchChangeData;

function ChangeItem({ change }: { change: ChatThreadChangelog | (Omit<ChatThreadChangelog, 'createdAt'> & { createdAt: string | Date }) }) {
  const t = useTranslations('chat.configuration');
  const { data: modelsData } = useModelsQuery();
  const allModels = modelsData?.data?.items || [];

  // Parse changeData with type discrimination
  const changeData = change.changeData as ChangeData | null;

  if (!changeData?.type) {
    return null; // Invalid data
  }

  // Extract relevant data based on type
  const isParticipant = changeData.type === 'participant';
  const isParticipantRole = changeData.type === 'participant_role';
  const isModeChange = changeData.type === 'mode_change';
  const isWebSearchChange = changeData.type === 'web_search';

  const modelId = (isParticipant || isParticipantRole) ? (changeData as ParticipantChangeData | ParticipantRoleChangeData).modelId : undefined;
  const role = isParticipant ? (changeData as ParticipantChangeData).role : undefined;
  const oldRole = isParticipantRole ? (changeData as ParticipantRoleChangeData).oldRole : undefined;
  const newRole = isParticipantRole ? (changeData as ParticipantRoleChangeData).newRole : undefined;
  const oldMode = isModeChange ? (changeData as ModeChangeData).oldMode : undefined;
  const newMode = isModeChange ? (changeData as ModeChangeData).newMode : undefined;
  const enabled = isWebSearchChange ? (changeData as WebSearchChangeData).enabled : undefined;

  const model = modelId ? allModels.find(m => m.id === modelId) : undefined;
  const showMissingModelFallback = (change.changeType === ChangelogTypes.ADDED || change.changeType === ChangelogTypes.REMOVED) && modelId && !model;
  // Simplified rendering - single pattern for participants, simpler mode display
  return (
    <>
      {/* Missing model fallback */}
      {showMissingModelFallback && (
        <div
          className={cn(
            'relative flex items-center gap-2 px-2.5 py-1.5 shrink-0',
            'backdrop-blur-md border rounded-lg shadow-md',
            'bg-background/10 border-white/30 dark:border-white/20 opacity-60',
          )}
        >
          <div className="text-xs text-muted-foreground italic">
            Model no longer available (
            {modelId?.slice(0, 8)}
            ...)
          </div>
        </div>
      )}

      {/* Participant changes (added/removed) */}
      {isParticipant && model && (
        <div
          className={cn(
            'relative flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 sm:py-1.5 shrink-0',
            'backdrop-blur-md border rounded-lg shadow-md',
            'bg-background/10 border-white/30 dark:border-white/20',
            change.changeType === ChangelogTypes.REMOVED && 'opacity-60',
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
              change.changeType === ChangelogTypes.REMOVED && 'line-through',
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

      {/* Participant role changes */}
      {isParticipantRole && model && (oldRole || newRole) && (
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

      {/* Mode changes */}
      {isModeChange && (oldMode || newMode) && (
        <div
          className={cn(
            'flex items-center gap-2 px-2 sm:px-2.5 py-1 sm:py-1.5 shrink-0',
            'backdrop-blur-md border rounded-lg shadow-md',
            'bg-background/10 border-white/30 dark:border-white/20',
          )}
        >
          {oldMode && (
            <span className="text-[10px] sm:text-xs opacity-60">{oldMode}</span>
          )}
          <ArrowRight className="size-3 text-muted-foreground shrink-0" />
          {newMode && (
            <span className="text-[10px] sm:text-xs font-medium">{newMode}</span>
          )}
        </div>
      )}

      {/* Web search toggle changes */}
      {isWebSearchChange && enabled !== undefined && (
        <div
          className={cn(
            'flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 sm:py-1.5 shrink-0',
            'backdrop-blur-md border rounded-lg shadow-md',
            'bg-background/10 border-white/30 dark:border-white/20',
          )}
        >
          <Globe className="size-3.5 sm:size-4 text-muted-foreground shrink-0" />
          <span className="text-[10px] sm:text-xs font-medium">
            {enabled ? t('webSearchEnabled') : t('webSearchDisabled')}
          </span>
        </div>
      )}
    </>
  );
}
