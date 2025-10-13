'use client';

import { ArrowRight, Settings2, Sparkles, UserMinus, UserPlus } from 'lucide-react';

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
import { useModelsQuery } from '@/hooks/queries/models';
import {
  parseModeChangeData,
  parseParticipantAddedData,
  parseParticipantRemovedData,
  parseParticipantUpdatedData,
} from '@/lib/ai/changelog-schemas';
import { getProviderIcon } from '@/lib/ai/provider-icons';
import { formatRelativeTime } from '@/lib/format/date';
import { cn } from '@/lib/ui/cn';

// ✅ STABLE FILTER: Define outside component to prevent query key changes on re-render
const MODELS_QUERY_FILTERS = { includeAll: true } as const;

type ConfigurationChangeCardProps = {
  change: ChatThreadChangelog;
  className?: string;
};

/**
 * Configuration Change Card
 *
 * Displays a configuration change (mode, participant) that occurred
 * during a conversation thread. Shows between messages as a collapsible
 * Chain of Thought component to indicate what changed.
 */
export function ConfigurationChangeCard({ change, className }: ConfigurationChangeCardProps) {
  // ✅ SINGLE SOURCE OF TRUTH: Fetch models from backend
  const { data: modelsData } = useModelsQuery(MODELS_QUERY_FILTERS);
  const allModels = modelsData?.data?.models || [];

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
    participants_reordered: {
      icon: ArrowRight,
      color: 'text-blue-500',
      label: 'Participants Reordered',
    },
  };

  const config = changeConfig[change.changeType] || {
    icon: Settings2,
    color: 'text-muted-foreground',
    label: 'Configuration Change',
  };

  const Icon = config.icon;

  // ✅ ZOD PATTERN: Parse changeData using type-safe schemas (no inline casting)
  // Extract model information from changeData for participant changes
  const participantAddedData = parseParticipantAddedData(change.changeData);
  const participantRemovedData = parseParticipantRemovedData(change.changeData);
  const participantUpdatedData = parseParticipantUpdatedData(change.changeData);
  const modeChangeData = parseModeChangeData(change.changeData);

  // ✅ SINGLE SOURCE OF TRUTH: Find models from backend data
  const modelId = participantAddedData?.modelId || participantRemovedData?.modelId;
  const role = participantAddedData?.role || participantRemovedData?.role;
  const model = modelId ? allModels.find(m => m.id === modelId) : undefined;

  // Extract participant updated data (before/after)
  const beforeModelId = participantUpdatedData?.before?.modelId;
  const afterModelId = participantUpdatedData?.after?.modelId;
  const beforeModel = beforeModelId ? allModels.find(m => m.id === beforeModelId) : undefined;
  const afterModel = afterModelId ? allModels.find(m => m.id === afterModelId) : undefined;
  const beforeRole = participantUpdatedData?.before?.role;
  const afterRole = participantUpdatedData?.after?.role;

  // Extract mode change details
  const previousMode = modeChangeData?.previousMode;
  const newMode = modeChangeData?.newMode;

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
                    <AvatarImage src={getProviderIcon(model.provider)} alt={model.name} />
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
                    <AvatarImage src={getProviderIcon(model.provider)} alt={model.name} />
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
                      <AvatarImage src={getProviderIcon(beforeModel.provider)} alt={beforeModel.name} />
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
                      <AvatarImage src={getProviderIcon(afterModel.provider)} alt={afterModel.name} />
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
          </ChainOfThoughtStep>
        </ChainOfThoughtContent>
      </ChainOfThought>
    </div>
  );
}
