import { getRoleCategoryMetadata, getShortRoleName, ROLE_CATEGORY_METADATA } from '@roundtable/shared/enums';
import randomColor from 'randomcolor';

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

function hexToRgba(hexColor: string, alpha: number): string {
  const hex = hexColor.replace('#', '');
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function lightenColor(hexColor: string, percent: number): string {
  const hex = hexColor.replace('#', '');
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);

  const newR = Math.min(255, Math.round(r + (255 - r) * percent));
  const newG = Math.min(255, Math.round(g + (255 - g) * percent));
  const newB = Math.min(255, Math.round(b + (255 - b) * percent));

  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

export function getRoleColors(roleName: string): {
  bgColor: string;
  iconColor: string;
} {
  const categoryMetadata = getRoleCategoryMetadata(roleName);
  const shortRole = getShortRoleName(roleName);

  if (shortRole in ROLE_CATEGORY_METADATA) {
    return {
      bgColor: categoryMetadata.bgColor,
      iconColor: categoryMetadata.iconColor,
    };
  }

  const seed = hashString(roleName);
  const hexColor = randomColor({
    luminosity: 'bright',
    seed,
    format: 'hex',
  });

  return {
    bgColor: hexToRgba(hexColor, 0.2),
    iconColor: hexColor,
  };
}

export const NO_ROLE_COLOR = {
  bgColor: 'rgba(100, 116, 139, 0.2)',
  iconColor: '#94a3b8',
} as const;

export function getRoleBadgeStyle(roleName: string): {
  backgroundColor: string;
  color: string;
  borderColor: string;
} {
  const colors = getRoleColors(roleName);
  const baseColor = colors.iconColor;

  return {
    backgroundColor: colors.bgColor,
    color: lightenColor(baseColor, 0.2),
    borderColor: hexToRgba(baseColor, 0.3),
  };
}
