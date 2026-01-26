import type { ProjectColor, ProjectIcon, ProjectTemplateKey } from '@roundtable/shared';
import { ComponentVariants, PROJECT_TEMPLATES } from '@roundtable/shared';

import { ProjectIconBadge } from '@/components/projects/project-icon-color-picker';
import { Button } from '@/components/ui/button';
import { useTranslations } from '@/lib/i18n';

function getTemplateTranslationKey(key: ProjectTemplateKey): string {
  return `projects.templates.${key}`;
}

type ProjectTemplateChipsProps = {
  onSelect: (template: { name: string; icon: ProjectIcon; color: ProjectColor }) => void;
};

export function ProjectTemplateChips({ onSelect }: ProjectTemplateChipsProps) {
  const t = useTranslations();

  return (
    <div className="flex flex-wrap gap-2">
      {PROJECT_TEMPLATES.map(template => (
        <Button
          key={template.key}
          type="button"
          variant={ComponentVariants.OUTLINE}
          onClick={() => onSelect({
            color: template.color,
            icon: template.icon,
            name: t(getTemplateTranslationKey(template.key)),
          })}
          className="h-auto px-3 py-1.5 rounded-full bg-muted/80 hover:bg-muted"
          startIcon={(
            <ProjectIconBadge
              icon={template.icon}
              color={template.color}
              size="sm"
            />
          )}
        >
          {t(getTemplateTranslationKey(template.key))}
        </Button>
      ))}
    </div>
  );
}
