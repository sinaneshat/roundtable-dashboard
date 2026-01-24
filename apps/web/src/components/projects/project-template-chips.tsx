import type { ProjectColor, ProjectIcon } from '@roundtable/shared';

import { ProjectIconBadge } from '@/components/projects/project-icon-color-picker';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';

type Template = {
  key: string;
  name: string;
  icon: ProjectIcon;
  color: ProjectColor;
};

const TEMPLATES: Template[] = [
  { key: 'investing', name: 'Investing', icon: 'coins', color: 'amber' },
  { key: 'research', name: 'Research', icon: 'graduationCap', color: 'blue' },
  { key: 'writing', name: 'Writing', icon: 'pencil', color: 'violet' },
  { key: 'travel', name: 'Travel', icon: 'globe', color: 'orange' },
];

type ProjectTemplateChipsProps = {
  onSelect: (template: { name: string; icon: ProjectIcon; color: ProjectColor }) => void;
};

export function ProjectTemplateChips({ onSelect }: ProjectTemplateChipsProps) {
  const t = useTranslations();

  return (
    <div className="flex flex-wrap gap-2">
      {TEMPLATES.map(template => (
        <button
          key={template.key}
          type="button"
          onClick={() => onSelect({
            name: t(`projects.templates.${template.key}` as never),
            icon: template.icon,
            color: template.color,
          })}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-full',
            'text-sm font-medium',
            'bg-muted/80 hover:bg-muted border border-border',
            'transition-colors duration-150',
          )}
        >
          <ProjectIconBadge
            icon={template.icon}
            color={template.color}
            size="sm"
          />
          <span>{t(`projects.templates.${template.key}` as never)}</span>
        </button>
      ))}
    </div>
  );
}
