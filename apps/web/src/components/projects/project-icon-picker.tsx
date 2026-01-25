import type { ProjectIcon } from '@roundtable/shared';
import { PROJECT_ICONS } from '@roundtable/shared';

import { getProjectIconComponent } from '@/components/projects/project-icon-constants';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/ui/cn';

type ProjectIconPickerProps = {
  value: ProjectIcon;
  onChange: (icon: ProjectIcon) => void;
};

export function ProjectIconPicker({ value, onChange }: ProjectIconPickerProps) {
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {PROJECT_ICONS.map((icon) => {
        const IconComponent = getProjectIconComponent(icon);
        return (
          <Button
            key={icon}
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              'size-8 rounded-md p-0 transition-all',
              value === icon && 'ring-2 ring-offset-2 ring-offset-background ring-primary bg-accent',
            )}
            onClick={() => onChange(icon)}
          >
            <IconComponent className="size-4" />
            <span className="sr-only">{icon}</span>
          </Button>
        );
      })}
    </div>
  );
}
