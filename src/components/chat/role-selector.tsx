'use client';
import type { UseMutationResult } from '@tanstack/react-query';
import { Check, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useCreateCustomRoleMutation, useDeleteCustomRoleMutation } from '@/hooks/mutations/chat-mutations';
import { createRoleSystemPrompt } from '@/lib/ai/prompts';
import { toastManager } from '@/lib/toast/toast-manager';
import { cn } from '@/lib/ui/cn';
import { DEFAULT_ROLES } from '@/lib/utils/ai-display';
import { getApiErrorMessage } from '@/lib/utils/error-handling';
import type {
  CreateCustomRoleRequest,
  CreateCustomRoleResponse,
  DeleteCustomRoleRequest,
  DeleteCustomRoleResponse,
  ListCustomRolesResponse,
} from '@/services/api/chat-roles';

type CustomRole = NonNullable<Extract<ListCustomRolesResponse, { success: true }>['data']>['items'][number];
export type RoleSelectorProps = {
  participant: ParticipantConfig | null;
  allParticipants: ParticipantConfig[];
  customRoles: CustomRole[];
  onRoleChange: (role: string, customRoleId?: string) => void;
  onClearRole: () => void;
  onRequestSelection?: () => void;
};
export function RoleSelector({
  participant,
  allParticipants,
  customRoles,
  onRoleChange,
  onClearRole,
  onRequestSelection,
}: RoleSelectorProps) {
  const t = useTranslations('chat.roles');
  const [rolePopoverOpen, setRolePopoverOpen] = useState(false);
  const [roleSearchQuery, setRoleSearchQuery] = useState('');
  const createRoleMutation = useCreateCustomRoleMutation();
  const deleteRoleMutation = useDeleteCustomRoleMutation();
  const hasRole = Boolean(participant?.role);
  const handleOpenChange = (open: boolean) => {
    if (open && !participant && onRequestSelection) {
      onRequestSelection();
      // AI SDK v5 Pattern: Use requestAnimationFrame instead of setTimeout
      // This ensures popover opens after participant selection completes rendering
      requestAnimationFrame(() => setRolePopoverOpen(true));
      return;
    }
    setRolePopoverOpen(open);
  };
  const customRolesInUseByOthers = new Set(
    allParticipants
      .filter(p => p.customRoleId && p.id !== participant?.id)
      .map(p => p.customRoleId)
      .filter((id): id is string => Boolean(id)),
  );
  const availableCustomRoles = customRoles.filter(
    role => !customRolesInUseByOthers.has(role.id),
  );
  const allRoles = [
    ...DEFAULT_ROLES,
    ...customRoles.map(r => r.name),
  ];
  const isNewRole = Boolean(
    roleSearchQuery.trim()
    && !allRoles.some(role => role.toLowerCase() === roleSearchQuery.trim().toLowerCase()),
  );
  const handleSelectRole = (roleName: string, customRoleId?: string) => {
    onRoleChange(roleName, customRoleId);
    setRolePopoverOpen(false);
    setRoleSearchQuery('');
  };
  const handleCreateRole = async (roleName: string) => {
    try {
      const result = await createRoleMutation.mutateAsync({
        json: {
          name: roleName,
          description: null,
          systemPrompt: createRoleSystemPrompt(roleName),
        },
      });
      if (result.success && result.data?.customRole) {
        handleSelectRole(result.data.customRole.name, result.data.customRole.id);
        setRoleSearchQuery('');
      }
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, 'Failed to create custom role');
      toastManager.error('Failed to create role', errorMessage);
    }
  };
  const handleDeleteRole = async (roleId: string, roleName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const result = await deleteRoleMutation.mutateAsync({ param: { id: roleId } });
      if (result.success) {
        if (participant?.customRoleId === roleId || participant?.role === roleName) {
          onClearRole();
        }
      }
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, 'Failed to delete custom role');
      toastManager.error('Failed to delete role', errorMessage);
    }
  };
  if (!hasRole) {
    return (
      <Popover open={rolePopoverOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2 text-muted-foreground hover:text-foreground rounded-lg"
          >
            {t('addRole')}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[calc(100vw-2rem)] max-w-[320px] sm:w-64 p-0" align="start" side="bottom" sideOffset={4}>
          <RoleSelectorContent
            participant={participant}
            availableCustomRoles={availableCustomRoles}
            roleSearchQuery={roleSearchQuery}
            setRoleSearchQuery={setRoleSearchQuery}
            isNewRole={isNewRole}
            handleSelectRole={handleSelectRole}
            handleCreateRole={handleCreateRole}
            handleDeleteRole={handleDeleteRole}
            createRoleMutation={createRoleMutation}
            deleteRoleMutation={deleteRoleMutation}
            t={t}
          />
        </PopoverContent>
      </Popover>
    );
  }
  if (!participant)
    return null;
  return (
    <div className="flex items-center gap-1">
      <Popover open={rolePopoverOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <div
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 h-6 text-xs px-2 pr-1 rounded-lg gap-1 cursor-pointer"
          >
            <span>{participant.role}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClearRole();
              }}
              className="ml-0.5 rounded-full hover:bg-destructive/10 hover:text-destructive p-0.5 transition-colors"
            >
              <Plus className="size-3 rotate-45" />
            </button>
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-[calc(100vw-2rem)] max-w-[320px] sm:w-64 p-0" align="start" side="bottom" sideOffset={4}>
          <RoleSelectorContent
            participant={participant}
            availableCustomRoles={availableCustomRoles}
            roleSearchQuery={roleSearchQuery}
            setRoleSearchQuery={setRoleSearchQuery}
            isNewRole={isNewRole}
            handleSelectRole={handleSelectRole}
            handleCreateRole={handleCreateRole}
            handleDeleteRole={handleDeleteRole}
            createRoleMutation={createRoleMutation}
            deleteRoleMutation={deleteRoleMutation}
            t={t}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
function RoleSelectorContent({
  participant,
  availableCustomRoles,
  roleSearchQuery,
  setRoleSearchQuery,
  isNewRole,
  handleSelectRole,
  handleCreateRole,
  handleDeleteRole,
  createRoleMutation,
  deleteRoleMutation,
  t,
}: {
  participant: ParticipantConfig | null;
  availableCustomRoles: CustomRole[];
  roleSearchQuery: string;
  setRoleSearchQuery: (query: string) => void;
  isNewRole: boolean;
  handleSelectRole: (roleName: string, customRoleId?: string) => void;
  handleCreateRole: (roleName: string) => void;
  handleDeleteRole: (roleId: string, roleName: string, e: React.MouseEvent) => void;
  createRoleMutation: UseMutationResult<CreateCustomRoleResponse, Error, CreateCustomRoleRequest>;
  deleteRoleMutation: UseMutationResult<DeleteCustomRoleResponse, Error, DeleteCustomRoleRequest>;
  t: (key: string) => string;
}) {
  return (
    <Command>
      <CommandInput
        placeholder={t('searchOrCreateRole')}
        className="h-9"
        value={roleSearchQuery}
        onValueChange={setRoleSearchQuery}
      />
      <CommandList>
        <CommandGroup>
          <CommandItem
            onSelect={() => setRoleSearchQuery('')}
            className="gap-2 text-primary font-medium"
          >
            <Plus className="size-4" />
            <span>{t('createCustomRole')}</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading={t('defaultRoles')}>
          {DEFAULT_ROLES.map(role => (
            <CommandItem
              key={role}
              value={role}
              onSelect={() => handleSelectRole(role, undefined)}
            >
              <Check
                className={cn(
                  'mr-2 h-4 w-4',
                  participant?.role === role ? 'opacity-100' : 'opacity-0',
                )}
              />
              {role}
            </CommandItem>
          ))}
        </CommandGroup>
        {availableCustomRoles.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t('customRoles')}>
              {availableCustomRoles.map(role => (
                <CommandItem
                  key={role.id}
                  value={role.name}
                  onSelect={() => handleSelectRole(role.name, role.id)}
                  className="group"
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4 flex-shrink-0',
                      participant?.customRoleId === role.id ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{role.name}</span>
                    </div>
                    {role.description && (
                      <span className="text-xs text-muted-foreground line-clamp-1">
                        {role.description}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={e => handleDeleteRole(role.id, role.name, e)}
                    disabled={deleteRoleMutation.isPending}
                    className="ml-2 opacity-60 sm:opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-sm hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 flex-shrink-0"
                    aria-label={t('deleteCustomRole')}
                  >
                    {deleteRoleMutation.isPending
                      ? (
                          <div className="size-4 animate-spin rounded-full border-2 border-destructive border-t-transparent" />
                        )
                      : (
                          <Trash2 className="size-4" />
                        )}
                  </button>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {isNewRole && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t('create')}>
              <CommandItem
                value={roleSearchQuery}
                onSelect={() => handleCreateRole(roleSearchQuery.trim())}
                className="gap-2 text-primary"
                disabled={createRoleMutation.isPending}
              >
                {createRoleMutation.isPending
                  ? (
                      <>
                        <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        <span>{t('creating')}</span>
                      </>
                    )
                  : (
                      <>
                        <Plus className="size-4" />
                        <span>
                          Create "
                          {roleSearchQuery.trim()}
                          "
                        </span>
                      </>
                    )}
              </CommandItem>
            </CommandGroup>
          </>
        )}
        <CommandEmpty>{t('noRolesFound')}</CommandEmpty>
      </CommandList>
    </Command>
  );
}
