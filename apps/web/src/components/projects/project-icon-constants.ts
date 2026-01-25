import type { ProjectIcon } from '@roundtable/shared';

import { Icons } from '@/components/icons';

export const ICON_COMPONENTS: Record<ProjectIcon, keyof typeof Icons> = {
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
