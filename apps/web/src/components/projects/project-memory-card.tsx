import { Icons } from '@/components/icons';
import { useTranslations } from '@/lib/i18n';
import type { ListProjectMemoriesResponse } from '@/services/api';

import { ProjectItemCard } from './project-item-card';

type ProjectMemory = NonNullable<ListProjectMemoriesResponse['data']>['items'][number];

type ProjectMemoryCardProps = {
  memory: ProjectMemory;
  onDelete?: () => void;
};

export function ProjectMemoryCard({ memory, onDelete }: ProjectMemoryCardProps) {
  const t = useTranslations();

  const sourceLabel = t(`projects.memorySource.${memory.source}` as const);

  // For instruction memories, always show content (the actual instructions)
  // No truncation for instruction type
  const displayContent = memory.source === 'instruction'
    ? memory.content
    : (memory.summary || memory.content);

  const isInstruction = memory.source === 'instruction';

  return (
    <ProjectItemCard
      icon={<Icons.brain className="size-4 text-primary" />}
      iconBgClass="bg-primary/10"
      content={displayContent}
      contentThreshold={isInstruction ? 0 : 300}
      badges={[
        { label: sourceLabel },
        ...(memory.sourceThreadTitle
          ? [{ label: memory.sourceThreadTitle }]
          : []
        ),
      ]}
      subtitle={new Date(memory.createdAt).toLocaleDateString()}
      actions={!isInstruction && onDelete
        ? (
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              title={t('actions.remove')}
            >
              <Icons.x className="size-4" />
            </button>
          )
        : undefined}
    />
  );
}
