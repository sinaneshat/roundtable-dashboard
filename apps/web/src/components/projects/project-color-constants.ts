import type { ProjectColor } from '@roundtable/shared';

export const PROJECT_COLOR_CLASSES: Record<ProjectColor, string> = {
  amber: 'bg-amber-500',
  blue: 'bg-blue-500',
  cyan: 'bg-cyan-500',
  emerald: 'bg-emerald-500',
  fuchsia: 'bg-fuchsia-500',
  gray: 'bg-gray-500',
  green: 'bg-green-500',
  indigo: 'bg-indigo-500',
  lime: 'bg-lime-500',
  orange: 'bg-orange-500',
  pink: 'bg-pink-500',
  purple: 'bg-purple-500',
  red: 'bg-red-500',
  rose: 'bg-rose-500',
  sky: 'bg-sky-500',
  teal: 'bg-teal-500',
  violet: 'bg-violet-500',
  yellow: 'bg-yellow-500',
};

export function getProjectColorClass(color: ProjectColor): string {
  return PROJECT_COLOR_CLASSES[color] ?? PROJECT_COLOR_CLASSES.blue;
}
