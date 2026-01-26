'use client';

import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

import { Icons } from '@/components/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAdminClearUserCacheMutation, useAdminSearchUsers } from '@/hooks';
import { useBoolean, useDebouncedValue } from '@/hooks/utils';
import { clearServiceWorkerCache, invalidateUserQueries } from '@/lib/auth';
import { authClient } from '@/lib/auth/client';
import { getAppBaseUrl } from '@/lib/config/base-urls';
import { useTranslations } from '@/lib/i18n';
import { showApiErrorToast } from '@/lib/toast';
import { cn } from '@/lib/ui/cn';

// User result type matching backend schema
type UserResult = {
  id: string;
  email: string;
  name: string;
  image: string | null;
};

export const Route = createFileRoute('/_protected/admin/impersonate')({
  component: ImpersonatePage,
});

function ImpersonatePage() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const isImpersonating = useBoolean(false);
  const isOpen = useBoolean(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null);
  const clearCacheMutation = useAdminClearUserCacheMutation();

  // Debounce search query by 300ms
  const debouncedQuery = useDebouncedValue(searchQuery, 300);

  // Fetch users when debounced query has 3+ chars
  const { data, isFetching } = useAdminSearchUsers(debouncedQuery, 5);
  const users = data?.data?.users ?? [];

  const handleSelectUser = (user: UserResult) => {
    setSelectedUser(user);
    setSearchQuery('');
    isOpen.onFalse();
  };

  const handleImpersonate = async () => {
    if (!selectedUser) {
      return;
    }

    isImpersonating.onTrue();
    const baseUrl = getAppBaseUrl();

    // Impersonate FIRST, then clear caches (correct order)
    // Better Auth handles session switching - saves admin session in admin_session cookie
    authClient.admin.impersonateUser({
      fetchOptions: {
        onError: (ctx) => {
          showApiErrorToast('Impersonation Failed', ctx.error);
          isImpersonating.onFalse();
        },
        onSuccess: () => {
          // Session changed - now clear server cache for target user
          clearCacheMutation.mutate(selectedUser.id, {
            onSettled: () => {
              // Invalidate all client queries and redirect
              invalidateUserQueries(queryClient);
              clearServiceWorkerCache();
              window.location.href = `${baseUrl}/chat`;
            },
          });
        },
      },
      userId: selectedUser.id,
    });
  };

  const getUserInitials = (user: UserResult) => {
    if (user.name) {
      return user.name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return user.email.charAt(0).toUpperCase() || '?';
  };

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icons.userCog className="size-5" />
            {t('admin.impersonate.title')}
          </CardTitle>
          <CardDescription>
            {t('admin.impersonate.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t('admin.impersonate.searchLabel')}
            </label>
            <Popover open={isOpen.value} onOpenChange={isOpen.setValue}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={isOpen.value}
                  className={cn(
                    'flex w-full [&>span]:flex [&>span]:w-full [&>span]:justify-between',
                    !selectedUser && 'text-muted-foreground',
                  )}
                  endIcon={<Icons.chevronsUpDown className="opacity-50" />}
                >
                  {selectedUser
                    ? (
                        <span className="flex items-center gap-2 truncate">
                          <Avatar className="size-5">
                            <AvatarImage src={selectedUser.image || undefined} />
                            <AvatarFallback className="text-xs">
                              {getUserInitials(selectedUser)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate">{selectedUser.name || selectedUser.email}</span>
                        </span>
                      )
                    : (
                        t('admin.impersonate.searchPlaceholder')
                      )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder={t('admin.impersonate.searchPlaceholder')}
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                  />
                  <CommandList>
                    {searchQuery.length < 3
                      ? (
                          <CommandEmpty>
                            {t('admin.impersonate.minCharsHint')}
                          </CommandEmpty>
                        )
                      : isFetching
                        ? (
                            <CommandEmpty>
                              <Icons.loader className="mx-auto size-4 animate-spin" />
                            </CommandEmpty>
                          )
                        : users.length === 0
                          ? (
                              <CommandEmpty>
                                {t('admin.impersonate.noUsersFound')}
                              </CommandEmpty>
                            )
                          : (
                              <CommandGroup className="p-1.5">
                                {users.map((user: UserResult) => (
                                  <CommandItem
                                    key={user.id}
                                    value={user.id}
                                    onSelect={() => handleSelectUser(user)}
                                    className="flex w-full items-center gap-3 px-3 py-2.5 cursor-pointer"
                                  >
                                    <Avatar className="size-9 shrink-0">
                                      <AvatarImage src={user.image || undefined} />
                                      <AvatarFallback className="text-xs">
                                        {getUserInitials(user)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium truncate text-sm">{user.name}</p>
                                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {selectedUser && (
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={selectedUser.image || undefined} alt={selectedUser.name} />
                  <AvatarFallback>{getUserInitials(selectedUser)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{selectedUser.name}</p>
                  <p className="text-sm text-muted-foreground truncate">{selectedUser.email}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedUser(null)}
                  className="shrink-0"
                >
                  <Icons.x className="size-4" />
                </Button>
              </div>
              <Button
                className="w-full"
                variant="destructive"
                onClick={handleImpersonate}
                disabled={isImpersonating.value}
                loading={isImpersonating.value}
                loadingText={t('admin.impersonate.switching')}
                startIcon={<Icons.userCheck />}
              >
                {t('admin.impersonate.impersonateButton')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
