'use client';

import { GripVertical, Lock } from 'lucide-react';
import { Reorder, useDragControls } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import type { SubscriptionTier } from '@/api/services/product-logic.service';
import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/ui/cn';
import { getProviderIcon } from '@/lib/utils/ai-display';
import type { ListCustomRolesResponse } from '@/services/api/chat-roles';

import { RoleSelector } from './role-selector';

/**
 * ModelItem - Individual model selection item with drag-and-drop
 *
 * A complex component that handles:
 * - Model selection via checkbox
 * - Drag-and-drop reordering
 * - Tier-based access control with upgrade prompts
 * - Inline role assignment
 * - Visual feedback for disabled states
 * - Responsive layout for mobile/desktop
 *
 * Extracted from ChatParticipantsList to reduce complexity.
 * Used in the AI model selector popover.
 *
 * @example
 * // Selected model (draggable)
 * <ModelItem
 *   orderedModel={orderedModel}
 *   allParticipants={participants}
 *   customRoles={customRoles}
 *   onToggle={() => handleToggle(model.id)}
 *   onRoleChange={(role, customRoleId) => handleRoleChange(model.id, role, customRoleId)}
 *   onClearRole={() => handleClearRole(model.id)}
 *   selectedCount={2}
 *   maxModels={3}
 *   userTierInfo={userTierInfo}
 * />
 *
 * // Unselected model (static)
 * <ModelItem
 *   orderedModel={orderedModel}
 *   allParticipants={participants}
 *   customRoles={customRoles}
 *   onToggle={() => handleToggle(model.id)}
 *   onRoleChange={(role, customRoleId) => {}}
 *   onClearRole={() => {}}
 *   selectedCount={2}
 *   maxModels={3}
 *   enableDrag={false}
 *   userTierInfo={userTierInfo}
 * />
 */

// RPC-inferred type from service response
type CustomRole = NonNullable<Extract<ListCustomRolesResponse, { success: true }>['data']>['items'][number];

export type OrderedModel = {
  model: EnhancedModelResponse;
  participant: ParticipantConfig | null;
  order: number;
};

export type ModelItemProps = {
  /** Model with participant state */
  orderedModel: OrderedModel;
  /** All participants (for custom role uniqueness check) */
  allParticipants: ParticipantConfig[];
  /** Available custom roles */
  customRoles: CustomRole[];
  /** Callback when model selection is toggled */
  onToggle: () => void;
  /** Callback when role is changed */
  onRoleChange: (role: string, customRoleId?: string) => void;
  /** Callback when role is cleared */
  onClearRole: () => void;
  /** Current number of selected models */
  selectedCount: number;
  /** Maximum allowed models per user tier */
  maxModels: number;
  /** Enable drag-and-drop (only for selected models) */
  enableDrag?: boolean;
  /** User tier information for access control */
  userTierInfo?: {
    tier_name: string;
    max_models: number;
    current_tier: SubscriptionTier;
    can_upgrade: boolean;
  };
};

export function ModelItem({
  orderedModel,
  allParticipants,
  customRoles,
  onToggle,
  onRoleChange,
  onClearRole,
  selectedCount,
  maxModels,
  enableDrag = true,
  userTierInfo,
}: ModelItemProps) {
  const controls = useDragControls();
  const tModels = useTranslations('chat.models');
  const { model, participant } = orderedModel;
  const isSelected = participant !== null;

  // Backend-computed access control
  const isAccessible = model.is_accessible_to_user ?? isSelected;

  // Disable reasons (checked in order of priority)
  const isDisabledDueToTier = !isSelected && !isAccessible;
  const isDisabledDueToLimit = !isSelected && selectedCount >= maxModels;
  const isDisabled = isDisabledDueToTier || isDisabledDueToLimit;

  // Create upgrade tooltip content
  let upgradeTooltipContent: string | undefined;
  if (isDisabledDueToTier) {
    const requiredTierName = model.required_tier_name || model.required_tier || 'free';
    upgradeTooltipContent = `Upgrade to ${requiredTierName} to unlock this model`;
  } else if (isDisabledDueToLimit) {
    upgradeTooltipContent = `Your ${userTierInfo?.tier_name || 'current'} plan allows up to ${maxModels} models per conversation. Upgrade to select more models.`;
  }

  const itemContent = (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <div
          role="button"
          tabIndex={isDisabled ? -1 : 0}
          className={cn(
            'px-2 py-2 border-b last:border-0',
            !isDisabled && 'hover:bg-accent/50 cursor-pointer transition-colors',
            isDisabled && 'opacity-50 cursor-not-allowed',
          )}
          onClick={isDisabled ? undefined : () => onToggle()}
          onKeyDown={
            isDisabled
              ? undefined
              : (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggle();
                  }
                }
          }
        >
          <div className="flex items-center gap-2">
            {/* Drag Handle - Only shown for selected models */}
            {enableDrag && (
              <div
                className={cn(
                  'flex-shrink-0 text-muted-foreground p-0.5',
                  !isDisabled && 'cursor-grab active:cursor-grabbing hover:text-foreground touch-none',
                  isDisabled && 'cursor-not-allowed opacity-30',
                )}
                onPointerDown={isDisabled ? undefined : e => controls.start(e)}
                style={isDisabled ? undefined : { touchAction: 'none' }}
                aria-label={isDisabled ? tModels('dragDisabled') : tModels('dragToReorder')}
                onClick={e => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (!isDisabled && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                  }
                }}
                role="button"
                tabIndex={isDisabled ? -1 : 0}
              >
                <GripVertical className="size-4" />
              </div>
            )}

            {/* Checkbox for Selection */}
            <Checkbox
              checked={isSelected}
              onCheckedChange={isDisabled ? undefined : onToggle}
              disabled={isDisabled}
              className="size-4 flex-shrink-0"
              onClick={e => e.stopPropagation()}
            />

            {/* Model Avatar and Name */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Avatar className="size-8 flex-shrink-0">
                <AvatarImage src={getProviderIcon(model.provider)} alt={model.name} />
                <AvatarFallback className="text-xs">
                  {model.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate flex items-center gap-2">
                  {model.name}
                  {isDisabledDueToTier && (
                    <>
                      <Lock className="size-3 text-muted-foreground flex-shrink-0" />
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-medium bg-primary/10 text-primary border-primary/20">
                        {model.required_tier_name || model.required_tier || 'free'}
                        {' '}
                        Required
                      </Badge>
                    </>
                  )}
                  {isDisabledDueToLimit && !isDisabledDueToTier && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-warning/50 text-warning">
                      {tModels('limitReached')}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                  <span className="truncate">{model.description}</span>
                  {model.pricing_display && (
                    <span className="text-[10px] shrink-0">
                      •
                      {' '}
                      {model.pricing_display.input}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Role Selector - shown for selected models or enabled unselected models */}
            {(isSelected || !isDisabled) && (
              <div
                onClick={e => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                  }
                }}
                role="presentation"
              >
                <RoleSelector
                  participant={participant}
                  allParticipants={allParticipants}
                  customRoles={customRoles}
                  onRoleChange={onRoleChange}
                  onClearRole={onClearRole}
                  onRequestSelection={!participant ? onToggle : undefined}
                />
              </div>
            )}
          </div>
        </div>
      </TooltipTrigger>
      {upgradeTooltipContent && (
        <TooltipContent side="right" className="max-w-xs">
          <div className="flex items-start gap-2">
            <Lock className="size-4 text-primary flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">{upgradeTooltipContent}</p>
              <p className="text-xs text-muted-foreground">
                Upgrade to
                {' '}
                {isDisabledDueToTier ? (model.required_tier_name || model.required_tier || 'free') : 'a higher tier'}
                {' '}
                to unlock this model
              </p>
              <Link
                href="/chat/pricing"
                className="text-xs text-primary font-medium mt-2 inline-block hover:underline"
              >
                View Pricing Plans →
              </Link>
            </div>
          </div>
        </TooltipContent>
      )}
    </Tooltip>
  );

  if (enableDrag) {
    return (
      <Reorder.Item
        value={orderedModel}
        dragListener={false}
        dragControls={controls}
        className="relative"
      >
        {itemContent}
      </Reorder.Item>
    );
  }

  return <div className="relative">{itemContent}</div>;
}
