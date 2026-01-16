'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

import { StripeSubscriptionStatuses, SubscriptionTiers } from '@/api/core/enums';
import type { Subscription } from '@/api/routes/billing/schema';
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
  useCancelSubscriptionMutation,
  useCreateCustomerPortalSessionMutation,
  useSubscriptionsQuery,
} from '@/hooks';
import { useBoolean } from '@/hooks/utils';
import { deleteUser, signOut, useSession } from '@/lib/auth/client';
import type { Session, User } from '@/lib/auth/types';
import { getWebappEnv, WEBAPP_ENVS } from '@/lib/config/base-urls';
import { showApiErrorToast } from '@/lib/toast';

const CancelSubscriptionDialog = dynamic(
  () => import('@/components/chat/cancel-subscription-dialog').then(m => m.CancelSubscriptionDialog),
  { ssr: false },
);

const DeleteAccountDialog = dynamic(
  () => import('@/components/chat/delete-account-dialog').then(m => m.DeleteAccountDialog),
  { ssr: false },
);

const FeedbackModal = dynamic(
  () => import('@/components/chat/feedback-modal').then(m => m.FeedbackModal),
  { ssr: false },
);

type NavUserProps = {
  /** Server-side session for hydration - prevents mismatch */
  initialSession?: { session: Session; user: User } | null;
};

export function NavUser({ initialSession }: NavUserProps) {
  const router = useRouter();
  const { data: clientSession } = useSession();
  const t = useTranslations();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const { data: subscriptionsData } = useSubscriptionsQuery();
  const showCancelDialog = useBoolean(false);
  const showDeleteDialog = useBoolean(false);
  const showFeedbackModal = useBoolean(false);
  const isDeleting = useBoolean(false);
  const customerPortalMutation = useCreateCustomerPortalSessionMutation();
  const cancelSubscriptionMutation = useCancelSubscriptionMutation();
  const showDeleteAccountOption = getWebappEnv() !== WEBAPP_ENVS.PROD;

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
  const subscriptions: Subscription[] = subscriptionsData?.success ? subscriptionsData.data?.items ?? [] : [];
  const activeSubscription = subscriptions.find(
    (sub: Subscription) => (sub.status === StripeSubscriptionStatuses.ACTIVE || sub.status === StripeSubscriptionStatuses.TRIALING) && !sub.cancelAtPeriodEnd,
  );
  const handleSignOut = async () => {
    await signOut();
    router.replace('/auth/sign-in');
  };
  const handleManageBilling = async () => {
    try {
      const result = await customerPortalMutation.mutateAsync({
        json: {
          returnUrl: window.location.href,
        },
      });
      if (result.success && result.data?.url) {
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
      if (result.success) {
        showCancelDialog.onFalse();
      }
    } catch (error) {
      showApiErrorToast('Cancellation Failed', error);
    }
  };

  const handleDeleteAccount = async () => {
    isDeleting.onTrue();
    try {
      await deleteUser({
        callbackURL: '/auth/sign-in',
      });
    } catch (error) {
      showApiErrorToast('Delete Account Failed', error);
      isDeleting.onFalse();
    }
  };

  const mounted = useBoolean(false);
  useEffect(() => {
    mounted.onTrue();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- onTrue is stable, mounted object changes on each render
  }, []);

  if (!mounted.value) {
    return (
      <button
        type="button"
        data-sidebar="menu-button"
        data-size="lg"
        className="peer/menu-button flex w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-md p-2 text-left outline-hidden transition-[width,height,padding] h-12 text-sm"
      >
        <Avatar className="h-8 w-8 rounded-full">
          <AvatarImage
            src={user?.image || undefined}
            alt={displayName}
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
      </button>
    );
  }

  return (
    <>
      <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
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
                      <Link href="/chat/pricing" prefetch={true} className="flex items-center gap-2.5">
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
