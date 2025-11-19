'use client';

import {
  ArrowLeft,
  Briefcase,
  Check,
  CircleX,
  GraduationCap,
  Hammer,
  Lightbulb,
  MessageSquare,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/ui/cn';
import { getRoleColors, NO_ROLE_COLOR } from '@/lib/utils/role-colors';
import type { ListCustomRolesResponse } from '@/services/api/chat-roles';

type CustomRole = NonNullable<
  Extract<ListCustomRolesResponse, { success: true }>['data']
>['items'][number];

// Predefined roles with icons - colors assigned dynamically via getRoleColors()
const PREDEFINED_ROLES = [
  {
    name: null, // No role option
    icon: CircleX,
    description: 'No role assigned',
  },
  {
    name: 'The Ideator',
    icon: Lightbulb,
    description: 'Generate creative ideas and innovative solutions',
  },
  {
    name: 'Devil\'s Advocate',
    icon: MessageSquare,
    description: 'Challenge assumptions and identify potential issues',
  },
  {
    name: 'Builder',
    icon: Hammer,
    description: 'Focus on practical implementation and execution',
  },
  {
    name: 'Practical Evaluator',
    icon: Target,
    description: 'Assess feasibility and real-world applicability',
  },
  {
    name: 'Visionary Thinker',
    icon: Sparkles,
    description: 'Think big picture and long-term strategy',
  },
  {
    name: 'Domain Expert',
    icon: GraduationCap,
    description: 'Provide deep domain-specific knowledge',
  },
  {
    name: 'User Advocate',
    icon: Users,
    description: 'Champion user needs and experience',
  },
  {
    name: 'Implementation Strategist',
    icon: Briefcase,
    description: 'Plan execution strategy and implementation',
  },
  {
    name: 'The Data Analyst',
    icon: TrendingUp,
    description: 'Analyze data and provide insights',
  },
] as const;

export type RoleAssignmentPanelProps = {
  /** Whether the panel is visible */
  isOpen: boolean;
  /** Model name for the panel title */
  modelName: string;
  /** Current role value */
  currentRole?: string;
  /** Custom roles available */
  customRoles: CustomRole[];
  /** Callback when a role is selected */
  onRoleSelect: (role: string, customRoleId?: string) => void;
  /** Callback when panel should close */
  onClose: () => void;
  /** Loading state for creating custom roles */
  isCreatingRole?: boolean;
  /** Callback to create a custom role */
  onCreateCustomRole?: (roleName: string) => Promise<void>;
};

/**
 * RoleAssignmentPanel Component
 *
 * Slide-in panel for assigning roles to AI models.
 * Features:
 * - Framer Motion slide-in animation
 * - Predefined roles with icons and colors
 * - Sticky footer with custom role input
 * - Accessible keyboard navigation
 * - Responsive design for mobile and desktop
 *
 * Following patterns from:
 * - /docs/frontend-patterns.md:component-architecture
 * - /src/components/chat/model-selection-modal.tsx
 */
export function RoleAssignmentPanel({
  isOpen,
  modelName,
  currentRole,
  customRoles,
  onRoleSelect,
  onClose,
  isCreatingRole = false,
  onCreateCustomRole,
}: RoleAssignmentPanelProps) {
  const [customRoleInput, setCustomRoleInput] = useState('');

  const handlePredefinedRoleSelect = (roleName: string) => {
    onRoleSelect(roleName);
    onClose();
  };

  const handleCustomRoleCreate = async () => {
    const trimmedRole = customRoleInput.trim();
    if (!trimmedRole)
      return;

    if (onCreateCustomRole) {
      await onCreateCustomRole(trimmedRole);
    } else {
      onRoleSelect(trimmedRole);
    }
    setCustomRoleInput('');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 30,
          }}
          className="absolute inset-0 z-50 bg-card flex flex-col"
        >
          {/* Header with back button */}
          <div className="shrink-0 px-6 py-4 border-b border-border">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
              <ArrowLeft className="h-5 w-5" />
              <span className="text-sm font-medium">Back</span>
            </button>
            <div>
              <h2 className="text-xl font-semibold mb-1">
                Set Role for
                {' '}
                {modelName}
              </h2>
              <p className="text-sm text-muted-foreground">
                Select a role or enter a custom one
              </p>
            </div>
          </div>

          {/* Scrollable content - NO padding */}
          <ScrollArea className="flex-1">
            <div className="flex flex-col">
              {/* Predefined roles */}
              {PREDEFINED_ROLES.map((role) => {
                const Icon = role.icon;
                const isSelected = role.name === null
                  ? !currentRole
                  : currentRole === role.name;
                const colors = role.name === null ? NO_ROLE_COLOR : getRoleColors(role.name);

                return (
                  <button
                    type="button"
                    key={role.name ?? 'no-role'}
                    onClick={() => {
                      if (role.name === null) {
                        onRoleSelect('');
                      } else {
                        handlePredefinedRoleSelect(role.name);
                      }
                    }}
                    className={cn(
                      'group relative p-4 transition-all text-left w-full',
                      'hover:bg-muted',
                      isSelected && 'bg-muted',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex size-10 shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: colors.bgColor }}
                      >
                        <Icon className="size-6" style={{ color: colors.iconColor }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-base font-semibold">{role.name ?? 'No role'}</h4>
                      </div>
                      {isSelected && (
                        <Check className="h-5 w-5 text-primary shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })}

              {/* Custom roles from database */}
              {customRoles.map((role) => {
                const isSelected = currentRole === role.name;
                const colors = getRoleColors(role.name);

                return (
                  <button
                    type="button"
                    key={role.id}
                    onClick={() => {
                      onRoleSelect(role.name, role.id);
                      onClose();
                    }}
                    className={cn(
                      'group relative p-4 transition-all text-left w-full',
                      'hover:bg-muted',
                      isSelected && 'bg-muted',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex size-10 shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: colors.bgColor }}
                      >
                        <span className="font-semibold text-sm" style={{ color: colors.iconColor }}>
                          {role.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-base font-semibold">{role.name}</h4>
                      </div>
                      {isSelected && (
                        <Check className="h-5 w-5 text-primary shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>

          {/* Sticky Footer */}
          <div className="shrink-0 py-4">
            <div className="flex">
              <Input
                placeholder="Enter custom role name..."
                value={customRoleInput}
                onChange={e => setCustomRoleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customRoleInput.trim()) {
                    handleCustomRoleCreate();
                  }
                }}
                className="flex-1"
              />
              <Button
                onClick={handleCustomRoleCreate}
                disabled={!customRoleInput.trim() || isCreatingRole}
                loading={isCreatingRole}
              >
                Save
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
