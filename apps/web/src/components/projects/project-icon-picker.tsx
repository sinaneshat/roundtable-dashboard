import type { ProjectIcon } from '@roundtable/shared';
import { PROJECT_ICONS } from '@roundtable/shared';

import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/ui/cn';

const ICON_COMPONENTS: Record<ProjectIcon, keyof typeof Icons> = {
  briefcase: 'briefcase',
  code: 'code',
  book: 'book',
  globe: 'globe',
  graduationCap: 'graduationCap',
  coins: 'coins',
  pencil: 'pencil',
  image: 'image',
  gift: 'gift',
  clock: 'clock',
  lightbulb: 'lightbulb',
  fileText: 'fileText',
  layers: 'layers',
  scale: 'scale',
  wrench: 'wrench',
  users: 'users',
  target: 'target',
  zap: 'zap',
  database: 'database',
  mail: 'mail',
  lock: 'lock',
  key: 'key',
  home: 'home',
  brain: 'brain',
  sparkles: 'sparkles',
  messageSquare: 'messageSquare',
  calendar: 'calendar',
  package: 'package',
  hammer: 'hammer',
  search: 'search',
};

export function getProjectIconComponent(icon: ProjectIcon) {
  const iconKey = ICON_COMPONENTS[icon] ?? 'briefcase';
  return Icons[iconKey];
}

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
