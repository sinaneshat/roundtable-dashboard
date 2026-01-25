import type { ProjectColor, ProjectIcon } from '@roundtable/shared';
import { PROJECT_COLORS, PROJECT_ICONS } from '@roundtable/shared';

import { PROJECT_COLOR_CLASSES } from '@/components/projects/project-color-constants';
import { getProjectIconComponent } from '@/components/projects/project-icon-constants';
import { cn } from '@/lib/ui/cn';

type ProjectIconColorPickerProps = {
  icon: ProjectIcon;
  color: ProjectColor;
  onIconChange: (icon: ProjectIcon) => void;
  onColorChange: (color: ProjectColor) => void;
};

export function ProjectIconColorPicker({
  icon,
  color,
  onIconChange,
  onColorChange,
}: ProjectIconColorPickerProps) {
  return (
    <div className="space-y-4">
      {/* Color picker - 6 columns */}
      <div className="grid grid-cols-6 gap-2 justify-items-center">
        {PROJECT_COLORS.map(c => (
          <button
            key={c}
            type="button"
            className={cn(
              'size-9 rounded-lg p-1 transition-all duration-150 flex items-center justify-center',
              'hover:scale-105 hover:ring-2 hover:ring-white/30 hover:ring-offset-1 hover:ring-offset-background',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              color === c && 'ring-2 ring-offset-2 ring-offset-background ring-primary scale-105',
            )}
            onClick={() => onColorChange(c)}
          >
            <span
              className={cn(
                'size-full rounded-md',
                PROJECT_COLOR_CLASSES[c],
              )}
            />
            <span className="sr-only">{c}</span>
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Icon picker grid - 6 columns */}
      <div className="grid grid-cols-6 gap-2 justify-items-center">
        {PROJECT_ICONS.map((i) => {
          const IconComponent = getProjectIconComponent(i);
          return (
            <button
              key={i}
              type="button"
              className={cn(
                'size-9 rounded-lg p-0 transition-all duration-150 flex items-center justify-center',
                'text-muted-foreground hover:text-foreground hover:bg-accent/80',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                icon === i && 'ring-2 ring-offset-2 ring-offset-background ring-primary bg-accent text-foreground',
              )}
              onClick={() => onIconChange(i)}
            >
              <IconComponent className="size-5" />
              <span className="sr-only">{i}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type ProjectIconBadgeProps = {
  icon: ProjectIcon;
  color: ProjectColor;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  iconClassName?: string;
};

export function ProjectIconBadge({ icon, color, size = 'md', className, iconClassName }: ProjectIconBadgeProps) {
  const IconComponent = getProjectIconComponent(icon);
  const sizeClasses = {
    sm: 'size-5 rounded', // 20px - sidebar
    md: 'size-6 rounded-md', // 24px - default
    lg: 'size-8 rounded-md', // 32px - medium displays
    xl: 'size-12 rounded-lg', // 48px - page headers
  };
  const iconSizeClasses = {
    sm: 'size-3', // 12px
    md: 'size-3.5', // 14px
    lg: 'size-4', // 16px
    xl: 'size-6', // 24px
  };

  return (
    <span
      className={cn(
        'flex items-center justify-center shrink-0',
        sizeClasses[size],
        PROJECT_COLOR_CLASSES[color],
        className,
      )}
    >
      <IconComponent className={cn(iconSizeClasses[size], 'text-white', iconClassName)} />
    </span>
  );
}
