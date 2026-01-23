import { StripeSubscriptionStatuses, SubscriptionTiers } from '@roundtable/shared';
import { WebAppEnvs } from '@roundtable/shared/enums';
import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';

import type { CancelSubscriptionDialogProps } from '@/components/chat/cancel-subscription-dialog';
import type { DeleteAccountDialogProps } from '@/components/chat/delete-account-dialog';
import type { FeedbackModalProps } from '@/components/chat/feedback-modal';
import { Icons } from '@/components/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useAdminClearUserCacheMutation,
  useCancelSubscriptionMutation,
  useCreateCustomerPortalSessionMutation,
  useSubscriptionsQuery,
} from '@/hooks';
import { useBoolean } from '@/hooks/utils';
import { clearCachedSession } from '@/lib/auth';
import { authClient, deleteUser, signOut, useSession } from '@/lib/auth/client';
import type { Session, User } from '@/lib/auth/types';
import { getAppBaseUrl, getWebappEnv } from '@/lib/config/base-urls';
import { useTranslations } from '@/lib/i18n';
import { showApiErrorToast } from '@/lib/toast';
import dynamic from '@/lib/utils/dynamic';
import type { Subscription } from '@/services/api/billing/subscriptions';

const CancelSubscriptionDialog = dynamic<CancelSubscriptionDialogProps>(
  () => import('@/components/chat/cancel-subscription-dialog').then(m => ({ default: m.CancelSubscriptionDialog })),
  { ssr: false },
);

const DeleteAccountDialog = dynamic<DeleteAccountDialogProps>(
  () => import('@/components/chat/delete-account-dialog').then(m => ({ default: m.DeleteAccountDialog })),
  { ssr: false },
);

const FeedbackModal = dynamic<FeedbackModalProps>(
  () => import('@/components/chat/feedback-modal').then(m => ({ default: m.FeedbackModal })),
  { ssr: false },
);

type NavUserProps = {
  /** Server-side session for hydration - prevents mismatch */
  initialSession?: { session: Session; user: User } | null;
};

export function NavUser({ initialSession }: NavUserProps) {
  const { data: clientSession } = useSession();
  const navigate = useNavigate();
  const t = useTranslations();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const { data: subscriptionsData } = useSubscriptionsQuery();
  const showCancelDialog = useBoolean(false);
  const showDeleteDialog = useBoolean(false);
  const showFeedbackModal = useBoolean(false);
  const isDeleting = useBoolean(false);
  const isStoppingImpersonation = useBoolean(false);
  const customerPortalMutation = useCreateCustomerPortalSessionMutation();
  const cancelSubscriptionMutation = useCancelSubscriptionMutation();
  const clearCacheMutation = useAdminClearUserCacheMutation();
  const showDeleteAccountOption = getWebappEnv() !== WebAppEnvs.PROD;

  const user = clientSession?.user ?? initialSession?.user;

  const userInitials = useMemo(() => {
    if (!user?.name && !user?.email)
      return 'U';
    return user.name
      ? user.name
          .split(' ')
          .map((n: string) => n[0])
          .join('')
          .toUpperCase()
      : user.email?.[0]?.toUpperCase() || 'U';
  }, [user]);

  const displayName = user?.name || t('user.defaultName');
  const displayEmail = user?.email || '';
  // Type narrowing: when success is true, data.items is correctly typed from API response
  const subscriptions = subscriptionsData?.success && subscriptionsData.data?.items
    ? subscriptionsData.data.items
    : [];
  const activeSubscription = subscriptions.find(
    (sub: Subscription) => (sub.status === StripeSubscriptionStatuses.ACTIVE || sub.status === StripeSubscriptionStatuses.TRIALING) && !sub.cancelAtPeriodEnd,
  );
  const handleSignOut = async () => {
    // Clear cached session before signing out to ensure fresh auth check on next login
    clearCachedSession();
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          navigate({ to: '/auth/sign-in' });
        },
      },
    });
  };
  const handleManageBilling = async () => {
    try {
      const result = await customerPortalMutation.mutateAsync({
        json: {
          // Reading current URL (not navigating) - window.location.href is appropriate
          returnUrl: window.location.href,
        },
      });
      if (!result || !result.success)
        return;
      if (result.data?.url) {
        window.open(result.data.url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      showApiErrorToast('Portal Error', error);
    }
  };
  const handleConfirmCancellation = async () => {
    if (!activeSubscription)
      return;
    try {
      const result = await cancelSubscriptionMutation.mutateAsync({
        param: { id: activeSubscription.id },
        json: { immediately: false },
      });
      if (result?.success) {
        showCancelDialog.onFalse();
      }
    } catch (error) {
      showApiErrorToast('Cancellation Failed', error);
    }
  };

  const handleDeleteAccount = async () => {
    isDeleting.onTrue();
    try {
      const appBaseUrl = getAppBaseUrl();
      await deleteUser({
        callbackURL: `${appBaseUrl}/auth/sign-in`,
      });
      // Clear cached session before signing out
      clearCachedSession();
      await signOut({
        fetchOptions: {
          onSuccess: () => {
            navigate({ to: '/auth/sign-in' });
          },
        },
      });
    } catch (error) {
      showApiErrorToast('Delete Account Failed', error);
      isDeleting.onFalse();
      showDeleteDialog.onFalse();
    }
  };

  const handleStopImpersonating = async () => {
    const adminUserId = clientSession?.session?.impersonatedBy;
    if (!adminUserId)
      return;

    isStoppingImpersonation.onTrue();
    const baseUrl = getAppBaseUrl();

    // Clear server-side cache for admin user first
    clearCacheMutation.mutate(adminUserId, {
      onSuccess: () => {
        // Then restore admin session - onSuccess fires only after session is established
        authClient.admin.stopImpersonating({
          fetchOptions: {
            onSuccess: () => {
              window.location.href = `${baseUrl}/admin/impersonate`;
            },
            onError: (ctx) => {
              showApiErrorToast('Failed to Stop Impersonation', ctx.error);
              isStoppingImpersonation.onFalse();
            },
          },
        });
      },
      onError: (error) => {
        showApiErrorToast('Cache Clear Failed', error);
        isStoppingImpersonation.onFalse();
      },
    });
  };

  const isImpersonating = !!clientSession?.session?.impersonatedBy;

  // Track mount state for client-only functionality (dropdown opening)
  // SSR renders the same structure - dropdown just won't open until mounted
  const mounted = useBoolean(false);
  useEffect(() => {
    mounted.onTrue();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- onTrue is stable, mounted object changes on each render
  }, []);

  // Handler that only works after mount (prevents SSR/hydration issues with dropdown)
  const handleDropdownOpenChange = (open: boolean) => {
    if (mounted.value) {
      setIsDropdownOpen(open);
    }
  };

  return (
    <>
      <DropdownMenu open={isDropdownOpen} onOpenChange={handleDropdownOpenChange}>
        {/* Remove asChild to avoid React 19 + Radix compose-refs infinite loop */}
        {/* SidebarMenuButton styles applied directly to trigger */}
        <DropdownMenuTrigger
          data-sidebar="menu-button"
          data-size="lg"
          title={displayName}
          className="peer/menu-button flex w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-lg px-4 py-2 text-start text-sm outline-hidden ring-sidebar-ring transition-all duration-200 hover:bg-accent hover:bg-white/[0.07] focus-visible:ring-2 active:bg-accent active:scale-[0.998] disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-10 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-accent data-[active=true]:font-medium data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground data-[state=open]:hover:bg-accent group-data-[collapsible=icon]:!w-10 group-data-[collapsible=icon]:!h-10 group-data-[collapsible=icon]:!min-w-[2.5rem] group-data-[collapsible=icon]:!max-w-[2.5rem] group-data-[collapsible=icon]:!min-h-[2.5rem] group-data-[collapsible=icon]:!max-h-[2.5rem] group-data-[collapsible=icon]:!flex-shrink-0 group-data-[collapsible=icon]:!flex-grow-0 group-data-[collapsible=icon]:items-center! group-data-[collapsible=icon]:justify-center! group-data-[collapsible=icon]:gap-0! group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:rounded-lg! group-data-[collapsible=icon]:aspect-square [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 h-11"
        >
          <Avatar className="h-8 w-8 rounded-full">
            <AvatarImage
              src={user?.image || undefined}
              alt={displayName}
              loading="eager"
            />
            <AvatarFallback className="rounded-full">{userInitials}</AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate font-semibold">
              {displayName}
            </span>
            <span className="truncate text-xs">{displayEmail}</span>
          </div>
          <Icons.chevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-[calc(var(--sidebar-width)-1rem)] min-w-52 sm:min-w-60 rounded-xl ml-3"
          side="top"
          align="start"
          sideOffset={8}
        >
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-2.5 px-2 py-2 text-left text-sm">
              <Avatar className="h-9 w-9 rounded-full">
                <AvatarImage
                  src={user?.image || undefined}
                  alt={displayName}
                  loading="eager"
                />
                <AvatarFallback className="rounded-full">{userInitials}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">
                  {displayName}
                </span>
                <span className="truncate text-xs text-muted-foreground">{displayEmail}</span>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {isDropdownOpen && (
            <>
              {activeSubscription
                ? (
                    <DropdownMenuItem
                      onClick={handleManageBilling}
                      disabled={customerPortalMutation.isPending}
                      className="text-emerald-400 focus:text-emerald-300 focus:bg-emerald-500/10"
                    >
                      <div className="flex items-center gap-2.5 w-full">
                        {customerPortalMutation.isPending
                          ? <Icons.loader className="size-4 animate-spin" />
                          : <Icons.check className="size-4" />}
                        <div className="flex-1">
                          <p className="text-xs font-semibold">{t('userMenu.proPlan')}</p>
                          <p className="text-[10px] text-muted-foreground">{t('userMenu.manageBilling')}</p>
                        </div>
                        <Icons.chevronRight className="size-4 opacity-50" />
                      </div>
                    </DropdownMenuItem>
                  )
                : (
                    <DropdownMenuItem asChild className="text-emerald-400 focus:text-emerald-300 focus:bg-emerald-500/10">
                      <Link to="/chat/pricing" preload="intent" className="flex items-center gap-2.5">
                        <Icons.sparkles className="size-4" />
                        <div className="flex-1">
                          <p className="text-xs font-semibold">{t('userMenu.upgradeToPro')}</p>
                          <p className="text-[10px] text-muted-foreground">{t('userMenu.upgradeDescription')}</p>
                        </div>
                        <Icons.chevronRight className="size-4 opacity-50" />
                      </Link>
                    </DropdownMenuItem>
                  )}

              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={showFeedbackModal.onTrue}>
                <Icons.messageSquare />
                <div className="flex-1">
                  <p className="text-xs font-semibold">{t('userMenu.sendFeedback')}</p>
                  <p className="text-[10px] text-muted-foreground">{t('userMenu.feedbackDescription')}</p>
                </div>
              </DropdownMenuItem>
              {showDeleteAccountOption && (
                <DropdownMenuItem
                  onClick={showDeleteDialog.onTrue}
                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                >
                  <Icons.trash />
                  <div className="flex-1">
                    <p className="text-xs font-semibold">{t('userMenu.deleteAccount')}</p>
                    <p className="text-[10px] text-muted-foreground/70">{t('userMenu.deleteAccountDescription')}</p>
                  </div>
                </DropdownMenuItem>
              )}
              {user?.role === 'admin' && (
                <DropdownMenuItem asChild>
                  <Link to="/admin/impersonate" preload="intent" className="flex items-center gap-2">
                    <Icons.userCog className="size-4" />
                    <div className="flex-1">
                      <p className="text-xs font-semibold">{t('userMenu.impersonateUser')}</p>
                      <p className="text-[10px] text-muted-foreground">{t('userMenu.impersonateDescription')}</p>
                    </div>
                  </Link>
                </DropdownMenuItem>
              )}
              {isImpersonating && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleStopImpersonating}
                    disabled={isStoppingImpersonation.value}
                    className="text-amber-500 focus:text-amber-400 focus:bg-amber-500/10"
                  >
                    {isStoppingImpersonation.value
                      ? <Icons.loader className="size-4 animate-spin" />
                      : <Icons.alertTriangle className="size-4" />}
                    <div className="flex-1">
                      <p className="text-xs font-semibold">{t('admin.banner.stopButton')}</p>
                      <p className="text-[10px] text-muted-foreground">{t('admin.banner.impersonating', { email: user?.email || 'user' })}</p>
                    </div>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <Icons.logOut />
                {t('navigation.signOut')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {showCancelDialog.value && (
        <CancelSubscriptionDialog
          open={showCancelDialog.value}
          onOpenChange={showCancelDialog.setValue}
          onConfirm={handleConfirmCancellation}
          subscriptionTier={activeSubscription ? SubscriptionTiers.PRO : SubscriptionTiers.FREE}
          currentPeriodEnd={activeSubscription?.currentPeriodEnd}
          isProcessing={cancelSubscriptionMutation.isPending}
        />
      )}
      {showFeedbackModal.value && (
        <FeedbackModal
          open={showFeedbackModal.value}
          onOpenChange={showFeedbackModal.setValue}
        />
      )}
      {showDeleteDialog.value && (
        <DeleteAccountDialog
          open={showDeleteDialog.value}
          onOpenChange={showDeleteDialog.setValue}
          onConfirm={handleDeleteAccount}
          isProcessing={isDeleting.value}
        />
      )}
    </>
  );
}
