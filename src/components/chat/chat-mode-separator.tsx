'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/ui/cn';

// ============================================================================
// Constants
// ============================================================================

const MODE_CONFIG = {
  brainstorming: { label: 'Brainstorming', icon: '💡', color: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20' },
  analyzing: { label: 'Analyzing', icon: '🔍', color: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20' },
  debating: { label: 'Debating', icon: '⚖️', color: 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20' },
  solving: { label: 'Problem Solving', icon: '🎯', color: 'bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20' },
} as const;

// ============================================================================
// Component Props
// ============================================================================

type ChatModeSeparatorProps = {
  mode: 'analyzing' | 'brainstorming' | 'debating' | 'solving';
  className?: string;
};

// ============================================================================
// Component
// ============================================================================

/**
 * Chat Mode Separator Component
 *
 * Displays a badge separator between message groups to indicate mode changes
 * Shows when the conversation mode was changed during the thread
 *
 * Following patterns from /docs/frontend-patterns.md
 */
export function ChatModeSeparator({ mode, className }: ChatModeSeparatorProps) {
  const modeConfig = MODE_CONFIG[mode];

  return (
    <div className={cn('flex items-center justify-center py-6', className)}>
      <div className="flex items-center gap-3">
        {/* Decorative line */}
        <div className="h-px w-12 bg-border" />

        {/* Mode badge */}
        <Badge
          variant="outline"
          className={cn(
            'gap-1.5 text-sm px-3 py-1.5 font-medium',
            modeConfig.color,
          )}
        >
          <span>{modeConfig.icon}</span>
          <span>{modeConfig.label}</span>
        </Badge>

        {/* Decorative line */}
        <div className="h-px w-12 bg-border" />
      </div>
    </div>
  );
}
