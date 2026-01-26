import type { AutomatedJobStatus, BadgeVariant } from '@roundtable/shared/enums';
import { getJobStatusBadgeVariant } from '@roundtable/shared/enums';
import type { LucideIcon } from 'lucide-react';

import { Icons } from '@/components/icons';

export const JOB_STATUS_ICONS: Record<AutomatedJobStatus, LucideIcon> = {
  completed: Icons.checkCircle,
  failed: Icons.alertCircle,
  pending: Icons.clock,
  running: Icons.loader,
};

export type JobStatusConfig = {
  icon: LucideIcon;
  variant: BadgeVariant;
  isAnimated: boolean;
};

export function getJobStatusConfig(status: AutomatedJobStatus): JobStatusConfig {
  return {
    icon: JOB_STATUS_ICONS[status],
    isAnimated: status === 'running',
    variant: getJobStatusBadgeVariant(status),
  };
}
