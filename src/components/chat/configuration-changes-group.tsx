'use client';
import { useTranslations } from 'next-intl';

import type { ChangelogType } from '@/api/core/enums';
import { ChangelogTypes } from '@/api/core/enums';
import type {
  ChatThreadChangelogFlexible,
  ConfigurationChangesGroupProps,
} from '@/api/routes/chat/schema';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
} from '@/components/ai-elements/chain-of-thought';
import { Icons } from '@/components/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { DbChangelogData } from '@/db/schemas/chat-metadata';
import {
  isModeChange,
  isParticipantChange,
  isParticipantRoleChange,
  isWebSearchChange,
  safeParseChangelogData,
} from '@/db/schemas/chat-metadata';
import { useModelLookup } from '@/hooks/utils/use-model-lookup';
import { formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/ui/cn';
import { getProviderIcon } from '@/lib/utils';

function getChangeAction(changeType: ChatThreadChangelogFlexible['changeType']): ChangelogType {
  return changeType;
}
const actionConfig: Record<ChangelogType, { icon: typeof Icons.plus; color: string }> = {
  [ChangelogTypes.ADDED]: {
    icon: Icons.plus,
    color: 'text-green-500',
  },
  [ChangelogTypes.MODIFIED]: {
    icon: Icons.pencil,
    color: 'text-blue-500',
  },
  [ChangelogTypes.REMOVED]: {
    icon: Icons.minus,
    color: 'text-red-500',
  },
};

type ConfigurationChangesGroupExtendedProps = ConfigurationChangesGroupProps & {
  /** Skip models API call (for public/read-only pages) */
  isReadOnly?: boolean;
};

type ChangeItemProps = {
  change: ChatThreadChangelogFlexible;
  isReadOnly?: boolean;
};

export function ConfigurationChangesGroup({ group, className, isReadOnly }: ConfigurationChangesGroupExtendedProps) {
  const t = useTranslations();
  if (!group.changes || group.changes.length === 0) {
    return null;
  }
  const changesByAction = group.changes.reduce<Partial<Record<ChangelogType, ChatThreadChangelogFlexible[]>>>(
    (acc, change) => {
      const action = getChangeAction(change.changeType);
      if (!acc[action]) {
        acc[action] = [];
      }
      acc[action].push(change);
      return acc;
    },
    {},
  );
  const actionOrder: ChangelogType[] = [ChangelogTypes.ADDED, ChangelogTypes.MODIFIED, ChangelogTypes.REMOVED];
  const sortedActions = actionOrder.filter(action => changesByAction[action]);
  const addedChanges = changesByAction[ChangelogTypes.ADDED];
  const modifiedChanges = changesByAction[ChangelogTypes.MODIFIED];
  const removedChanges = changesByAction[ChangelogTypes.REMOVED];

  const actionSummaries: string[] = [];
  if (addedChanges?.length) {
    actionSummaries.push(`${addedChanges.length} ${t('chat.configuration.actionSummary.added')}`);
  }
  if (modifiedChanges?.length) {
    actionSummaries.push(`${modifiedChanges.length} ${t('chat.configuration.actionSummary.modified')}`);
  }
  if (removedChanges?.length) {
    actionSummaries.push(`${removedChanges.length} ${t('chat.configuration.actionSummary.removed')}`);
  }
  return (
    <div className={cn('py-2', className)}>
      <ChainOfThought defaultOpen={false}>
        <ChainOfThoughtHeader>
          <div className="flex items-center gap-2">
            <Icons.clock className="size-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm">{t('chat.configuration.configurationChanged')}</span>
            <span className="hidden md:inline text-xs text-muted-foreground">•</span>
            <span className="hidden md:inline text-xs text-muted-foreground truncate">
              {actionSummaries.join(', ')}
            </span>
            <span className="hidden md:inline text-xs text-muted-foreground flex-shrink-0">•</span>
            <span
              className="hidden md:inline text-xs text-muted-foreground whitespace-nowrap flex-shrink-0"

            >
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

              if (!changes || changes.length === 0) {
                return null;
              }

              return (
                <div key={action} className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <Icon className={cn('size-4', config.color)} />
                    <span className={cn('text-sm font-medium', config.color)}>
                      {t(`chat.configuration.${action}`)}
                    </span>
                  </div>
                  <div className="w-full overflow-x-auto md:overflow-x-auto">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 pb-2 pl-6">
                      {changes.map(change => (
                        <ChangeItem key={change.id} change={change} isReadOnly={isReadOnly} />
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

function ChangeItem({ change, isReadOnly }: ChangeItemProps) {
  const t = useTranslations();
  const { findModel } = useModelLookup({ enabled: !isReadOnly });

  const changeData: DbChangelogData | undefined = safeParseChangelogData(change.changeData);

  if (!changeData) {
    return null;
  }

  const modelId = isParticipantChange(changeData) || isParticipantRoleChange(changeData)
    ? changeData.modelId
    : undefined;
  const role = isParticipantChange(changeData) ? changeData.role : undefined;
  const oldRole = isParticipantRoleChange(changeData) ? changeData.oldRole : undefined;
  const newRole = isParticipantRoleChange(changeData) ? changeData.newRole : undefined;
  const oldMode = isModeChange(changeData) ? changeData.oldMode : undefined;
  const newMode = isModeChange(changeData) ? changeData.newMode : undefined;
  const enabled = isWebSearchChange(changeData) ? changeData.enabled : undefined;

  const model = findModel(modelId);
  const showMissingModelFallback = (change.changeType === ChangelogTypes.ADDED || change.changeType === ChangelogTypes.REMOVED) && modelId && !model;

  const isParticipantType = isParticipantChange(changeData);
  const isParticipantRoleType = isParticipantRoleChange(changeData);
  const isModeChangeType = isModeChange(changeData);
  const isWebSearchChangeType = isWebSearchChange(changeData);

  return (
    <>
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

      {isParticipantType && model && (
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

      {isParticipantRoleType && model && (oldRole || newRole) && (
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
                <Icons.arrowRight className="size-2 sm:size-2.5 text-muted-foreground/50 shrink-0" />
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

      {isModeChangeType && (oldMode || newMode) && (
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
          <Icons.arrowRight className="size-3 text-muted-foreground shrink-0" />
          {newMode && (
            <span className="text-[10px] sm:text-xs font-medium">{newMode}</span>
          )}
        </div>
      )}

      {isWebSearchChangeType && enabled !== undefined && (
        <div
          className={cn(
            'flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 sm:py-1.5 shrink-0',
            'backdrop-blur-md border rounded-lg shadow-md',
            'bg-background/10 border-white/30 dark:border-white/20',
          )}
        >
          <Icons.globe className="size-3.5 sm:size-4 text-muted-foreground shrink-0" />
          <span className="text-[10px] sm:text-xs font-medium">
            {enabled ? t('chat.configuration.webSearchEnabled') : t('chat.configuration.webSearchDisabled')}
          </span>
        </div>
      )}
    </>
  );
}
