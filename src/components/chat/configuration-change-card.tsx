'use client';

import { ArrowRight, ListPlus, ListX, Settings2, Sparkles, UserMinus, UserPlus } from 'lucide-react';

import type { ChatThreadChangelog } from '@/api/routes/chat/schema';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
} from '@/components/ai-elements/chain-of-thought';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { getModelById } from '@/lib/ai/models-config';
import { formatRelativeTime } from '@/lib/format/date';
import { cn } from '@/lib/ui/cn';

type ConfigurationChangeCardProps = {
  change: ChatThreadChangelog;
  className?: string;
};

/**
 * Configuration Change Card
 *
 * Displays a configuration change (mode, participant, memory) that occurred
 * during a conversation thread. Shows between messages as a collapsible
 * Chain of Thought component to indicate what changed.
 */
export function ConfigurationChangeCard({ change, className }: ConfigurationChangeCardProps) {
  // Map change types to icons and colors
  const changeConfig = {
    mode_change: {
      icon: Sparkles,
      color: 'text-purple-500',
      label: 'Mode Change',
    },
    participant_added: {
      icon: UserPlus,
      color: 'text-green-500',
      label: 'Participant Added',
    },
    participant_removed: {
      icon: UserMinus,
      color: 'text-red-500',
      label: 'Participant Removed',
    },
    participant_updated: {
      icon: ArrowRight,
      color: 'text-blue-500',
      label: 'Participant Updated',
    },
    memory_added: {
      icon: ListPlus,
      color: 'text-cyan-500',
      label: 'Memory Added',
    },
    memory_removed: {
      icon: ListX,
      color: 'text-orange-500',
      label: 'Memory Removed',
    },
  };

  const config = changeConfig[change.changeType] || {
    icon: Settings2,
    color: 'text-muted-foreground',
    label: 'Configuration Change',
  };

  const Icon = config.icon;

  // Extract model information from changeData for participant changes
  const modelId = (change.changeData && typeof change.changeData === 'object' && 'modelId' in change.changeData)
    ? change.changeData.modelId as string
    : undefined;
  const role = (change.changeData && typeof change.changeData === 'object' && 'role' in change.changeData)
    ? change.changeData.role as string
    : undefined;
  const model = modelId ? getModelById(modelId) : undefined;

  // Extract models for participant_updated (before/after)
  const beforeModelId = (change.changeData && typeof change.changeData === 'object' && 'before' in change.changeData && change.changeData.before && typeof change.changeData.before === 'object' && 'modelId' in change.changeData.before)
    ? change.changeData.before.modelId as string
    : undefined;
  const afterModelId = (change.changeData && typeof change.changeData === 'object' && 'after' in change.changeData && change.changeData.after && typeof change.changeData.after === 'object' && 'modelId' in change.changeData.after)
    ? change.changeData.after.modelId as string
    : undefined;
  const beforeModel = beforeModelId ? getModelById(beforeModelId) : undefined;
  const afterModel = afterModelId ? getModelById(afterModelId) : undefined;
  const beforeRole = (change.changeData && typeof change.changeData === 'object' && 'before' in change.changeData && change.changeData.before && typeof change.changeData.before === 'object' && 'role' in change.changeData.before)
    ? change.changeData.before.role as string
    : undefined;
  const afterRole = (change.changeData && typeof change.changeData === 'object' && 'after' in change.changeData && change.changeData.after && typeof change.changeData.after === 'object' && 'role' in change.changeData.after)
    ? change.changeData.after.role as string
    : undefined;

  // Extract memory details
  const memoryTitle = (change.changeData && typeof change.changeData === 'object' && 'title' in change.changeData)
    ? change.changeData.title as string
    : undefined;
  const memoryType = (change.changeData && typeof change.changeData === 'object' && 'type' in change.changeData)
    ? change.changeData.type as string
    : undefined;
  const memoryDescription = (change.changeData && typeof change.changeData === 'object' && 'description' in change.changeData)
    ? change.changeData.description as string
    : undefined;

  // Extract mode change details
  const previousMode = (change.changeData && typeof change.changeData === 'object' && 'previousMode' in change.changeData)
    ? change.changeData.previousMode as string
    : undefined;
  const newMode = (change.changeData && typeof change.changeData === 'object' && 'newMode' in change.changeData)
    ? change.changeData.newMode as string
    : undefined;

  return (
    <div className={cn('py-2', className)}>
      <ChainOfThought defaultOpen={false}>
        <ChainOfThoughtHeader>
          <div className="flex items-center gap-2">
            <Icon className={cn('size-4', config.color)} />
            <span>{change.changeSummary}</span>
            {change.createdAt && (
              <>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground">
                  {formatRelativeTime(new Date(change.createdAt))}
                </span>
              </>
            )}
          </div>
        </ChainOfThoughtHeader>
        <ChainOfThoughtContent>
          <ChainOfThoughtStep
            icon={Icon}
            label={config.label}
            description={change.changeSummary}
            status="complete"
          >
            {/* Participant Added */}
            {change.changeType === 'participant_added' && model && (
              <ChainOfThoughtSearchResults>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
                  <Avatar className="size-6">
                    <AvatarImage src={model.metadata.icon} alt={model.name} />
                    <AvatarFallback className="text-xs">
                      {model.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{model.name}</span>
                    {role && (
                      <Badge variant="secondary" className="text-xs">
                        {role}
                      </Badge>
                    )}
                  </div>
                </div>
              </ChainOfThoughtSearchResults>
            )}

            {/* Participant Removed */}
            {change.changeType === 'participant_removed' && model && (
              <ChainOfThoughtSearchResults>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 opacity-60">
                  <Avatar className="size-6">
                    <AvatarImage src={model.metadata.icon} alt={model.name} />
                    <AvatarFallback className="text-xs">
                      {model.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium line-through">{model.name}</span>
                    {role && (
                      <Badge variant="secondary" className="text-xs">
                        {role}
                      </Badge>
                    )}
                  </div>
                </div>
              </ChainOfThoughtSearchResults>
            )}

            {/* Participant Updated */}
            {change.changeType === 'participant_updated' && (beforeModel || afterModel) && (
              <ChainOfThoughtSearchResults>
                {beforeModel && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 opacity-60">
                    <Avatar className="size-6">
                      <AvatarImage src={beforeModel.metadata.icon} alt={beforeModel.name} />
                      <AvatarFallback className="text-xs">
                        {beforeModel.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{beforeModel.name}</span>
                    {beforeRole && (
                      <Badge variant="secondary" className="text-xs">
                        {beforeRole}
                      </Badge>
                    )}
                  </div>
                )}
                <ArrowRight className="size-4 text-muted-foreground" />
                {afterModel && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
                    <Avatar className="size-6">
                      <AvatarImage src={afterModel.metadata.icon} alt={afterModel.name} />
                      <AvatarFallback className="text-xs">
                        {afterModel.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{afterModel.name}</span>
                    {afterRole && (
                      <Badge variant="secondary" className="text-xs">
                        {afterRole}
                      </Badge>
                    )}
                  </div>
                )}
              </ChainOfThoughtSearchResults>
            )}

            {/* Mode Change */}
            {change.changeType === 'mode_change' && (previousMode || newMode) && (
              <ChainOfThoughtSearchResults>
                {previousMode && (
                  <ChainOfThoughtSearchResult variant="secondary" className="opacity-60">
                    {previousMode}
                  </ChainOfThoughtSearchResult>
                )}
                <ArrowRight className="size-3 text-muted-foreground" />
                {newMode && (
                  <ChainOfThoughtSearchResult variant="default">
                    {newMode}
                  </ChainOfThoughtSearchResult>
                )}
              </ChainOfThoughtSearchResults>
            )}

            {/* Memory Added/Removed */}
            {(change.changeType === 'memory_added' || change.changeType === 'memory_removed') && memoryTitle && (
              <ChainOfThoughtSearchResults>
                <div className="flex flex-col gap-1 px-3 py-2 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{memoryTitle}</span>
                    {memoryType && (
                      <Badge variant="outline" className="text-xs capitalize">
                        {memoryType}
                      </Badge>
                    )}
                  </div>
                  {memoryDescription && (
                    <span className="text-xs text-muted-foreground">
                      {memoryDescription}
                    </span>
                  )}
                </div>
              </ChainOfThoughtSearchResults>
            )}
          </ChainOfThoughtStep>
        </ChainOfThoughtContent>
      </ChainOfThought>
    </div>
  );
}
