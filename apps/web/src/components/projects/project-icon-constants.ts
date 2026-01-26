import type { ProjectIcon } from '@roundtable/shared';

import { Icons } from '@/components/icons';

export const ICON_COMPONENTS: Record<ProjectIcon, keyof typeof Icons> = {
  book: 'book',
  brain: 'brain',
  briefcase: 'briefcase',
  calendar: 'calendar',
  clock: 'clock',
  code: 'code',
  coins: 'coins',
  database: 'database',
  fileText: 'fileText',
  gift: 'gift',
  globe: 'globe',
  graduationCap: 'graduationCap',
  hammer: 'hammer',
  home: 'home',
  image: 'image',
  key: 'key',
  layers: 'layers',
  lightbulb: 'lightbulb',
  lock: 'lock',
  mail: 'mail',
  messageSquare: 'messageSquare',
  package: 'package',
  pencil: 'pencil',
  scale: 'scale',
  search: 'search',
  sparkles: 'sparkles',
  target: 'target',
  users: 'users',
  wrench: 'wrench',
  zap: 'zap',
};

export function getProjectIconComponent(icon: ProjectIcon) {
  const iconKey = ICON_COMPONENTS[icon] ?? 'briefcase';
  return Icons[iconKey];
}
