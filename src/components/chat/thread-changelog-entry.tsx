'use client';

import type { VariantProps } from 'class-variance-authority';
import { format } from 'date-fns';
import { Brain, BrainCircuit, Clock, GitBranch, UserCog, UserMinus, UserPlus } from 'lucide-react';
import { motion } from 'motion/react';

import type { ChatThreadChangelog } from '@/api/routes/chat/schema';
import type { badgeVariants } from '@/components/ui/badge';
import { Badge } from '@/components/ui/badge';

// ============================================================================
// Types
// ============================================================================

type ThreadChangelogEntryProps = {
  entry: ChatThreadChangelog;
};

type ChangeTypeConfig = {
  icon: typeof GitBranch;
  variant: VariantProps<typeof badgeVariants>['variant'];
  label: string;
};

// ============================================================================
// Configuration
// ============================================================================

const CHANGE_TYPE_CONFIG: Record<ChatThreadChangelog['changeType'], ChangeTypeConfig> = {
  mode_change: {
    icon: GitBranch,
    variant: 'outline',
    label: 'Mode changed',
  },
  participant_added: {
    icon: UserPlus,
    variant: 'success',
    label: 'Participant added',
  },
  participant_removed: {
    icon: UserMinus,
    variant: 'warning',
    label: 'Participant removed',
  },
  participant_updated: {
    icon: UserCog,
    variant: 'secondary',
    label: 'Participant updated',
  },
  memory_added: {
    icon: Brain,
    variant: 'default',
    label: 'Memory added',
  },
  memory_removed: {
    icon: BrainCircuit,
    variant: 'destructive',
    label: 'Memory removed',
  },
} as const;

// ============================================================================
// Component
// ============================================================================

/**
 * ThreadChangelogEntry Component
 *
 * Displays a configuration change entry in the chat timeline
 * Shows between messages when settings change (mode, participants, memories)
 *
 * Following frontend patterns from docs/frontend-patterns.md
 * Uses shadcn Badge component for consistent design system integration
 * Includes proper accessibility attributes and semantic HTML
 */
export function ThreadChangelogEntry({ entry }: ThreadChangelogEntryProps) {
  const config = CHANGE_TYPE_CONFIG[entry.changeType];
  const Icon = config.icon;
  const timestamp = format(new Date(entry.createdAt), 'h:mm a');

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      role="status"
      aria-label={`${config.label}: ${entry.changeSummary}`}
      className="flex items-center justify-center py-6"
    >
      <div className="flex items-center gap-3">
        {/* Decorative separator line */}
        <div className="h-px w-12 bg-border" />

        {/* Change notification badge */}
        <Badge variant={config.variant} className="gap-2 px-4 py-2 text-sm">
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span className="font-medium">{entry.changeSummary}</span>
          <time
            dateTime={entry.createdAt}
            className="ml-1 flex items-center gap-1 text-xs opacity-75"
          >
            <Clock className="h-3 w-3" aria-hidden="true" />
            <span>{timestamp}</span>
          </time>
        </Badge>

        {/* Decorative separator line */}
        <div className="h-px w-12 bg-border" />
      </div>
    </motion.div>
  );
}
