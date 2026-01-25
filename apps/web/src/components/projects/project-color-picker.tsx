import type { ProjectColor } from '@roundtable/shared';
import { PROJECT_COLORS } from '@roundtable/shared';

import { PROJECT_COLOR_CLASSES } from '@/components/projects/project-color-constants';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/ui/cn';

type ProjectColorPickerProps = {
  value: ProjectColor;
  onChange: (color: ProjectColor) => void;
};

export function ProjectColorPicker({ value, onChange }: ProjectColorPickerProps) {
  return (
    <div className="grid grid-cols-9 gap-1.5">
      {PROJECT_COLORS.map(color => (
        <Button
          key={color}
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'size-6 rounded-full p-0 transition-all',
            value === color && 'ring-2 ring-offset-2 ring-offset-background ring-primary',
          )}
          onClick={() => onChange(color)}
        >
          <span
            className={cn(
              'size-4 rounded-full',
              PROJECT_COLOR_CLASSES[color],
            )}
          />
          <span className="sr-only">{color}</span>
        </Button>
      ))}
    </div>
  );
}
