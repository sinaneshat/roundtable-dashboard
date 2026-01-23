import type { ProjectColor } from '@roundtable/shared';
import { PROJECT_COLORS } from '@roundtable/shared';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/ui/cn';

const PROJECT_COLOR_CLASSES: Record<ProjectColor, string> = {
  gray: 'bg-gray-500',
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  amber: 'bg-amber-500',
  yellow: 'bg-yellow-500',
  lime: 'bg-lime-500',
  green: 'bg-green-500',
  emerald: 'bg-emerald-500',
  teal: 'bg-teal-500',
  cyan: 'bg-cyan-500',
  sky: 'bg-sky-500',
  blue: 'bg-blue-500',
  indigo: 'bg-indigo-500',
  violet: 'bg-violet-500',
  purple: 'bg-purple-500',
  fuchsia: 'bg-fuchsia-500',
  pink: 'bg-pink-500',
  rose: 'bg-rose-500',
};

export function getProjectColorClass(color: ProjectColor): string {
  return PROJECT_COLOR_CLASSES[color] ?? PROJECT_COLOR_CLASSES.blue;
}

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
