'use client';

import { BadgeCheck, ChevronsUpDown, CreditCard, Key, Loader2, LogOut, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { CancelSubscriptionDialog } from '@/components/chat/cancel-subscription-dialog';
import { ApiKeysModal } from '@/components/modals/api-keys-modal';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  useCancelSubscriptionMutation,
  useCreateCustomerPortalSessionMutation,
  useSubscriptionsQuery,
  useUsageStatsQuery,
} from '@/hooks';
import { signOut, useSession } from '@/lib/auth/client';
import { toastManager } from '@/lib/toast/toast-manager';
import { getApiErrorMessage } from '@/lib/utils/error-handling';

export function NavUser() {
  const router = useRouter();
  const { data: session } = useSession();
  const { isMobile } = useSidebar();
  const t = useTranslations();
  const { data: usageData } = useUsageStatsQuery();
  const { data: subscriptionsData } = useSubscriptionsQuery();
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showApiKeysModal, setShowApiKeysModal] = useState(false);

  // Mutations
  const customerPortalMutation = useCreateCustomerPortalSessionMutation();
  const cancelSubscriptionMutation = useCancelSubscriptionMutation();

  const user = session?.user;
  const userInitials = user?.name
    ? user.name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
    : user?.email?.[0]?.toUpperCase() || 'U';

  // Get active subscription
  const subscriptions = subscriptionsData?.success ? subscriptionsData.data?.subscriptions || [] : [];
  const activeSubscription = subscriptions.find(
    sub => (sub.status === 'active' || sub.status === 'trialing') && !sub.cancelAtPeriodEnd,
  );

  const handleSignOut = async () => {
    await signOut();
    router.push('/auth/sign-in');
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
      const errorMessage = getApiErrorMessage(error, 'Failed to open customer portal');
      toastManager.error('Portal Error', errorMessage);
    }
  };

  const handleOpenCancelDialog = () => {
    setShowCancelDialog(true);
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
        setShowCancelDialog(false);
        // Success is obvious from the dialog closing and UI update - no toast needed
      }
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, 'Failed to cancel subscription');
      toastManager.error('Cancellation Failed', errorMessage);
    }
  };

  // Get subscription tier and cancellation status
  const subscriptionTier = usageData?.success ? usageData.data.subscription.tier : 'free';
  const isPremium = subscriptionTier !== 'free';
  const isCanceled = activeSubscription?.cancelAtPeriodEnd ?? false;
  const endDate = activeSubscription?.currentPeriodEnd;
  const formattedEndDate = endDate
    ? new Date(endDate).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage
                    src={user?.image || undefined}
                    alt={user?.name || t('user.defaultName')}
                  />
                  <AvatarFallback className="rounded-lg">{userInitials}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{user?.name || t('user.defaultName')}</span>
                  <span className="truncate text-xs">{user?.email}</span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
              side={isMobile ? 'bottom' : 'right'}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage
                      src={user?.image || undefined}
                      alt={user?.name || t('user.defaultName')}
                    />
                    <AvatarFallback className="rounded-lg">{userInitials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {user?.name || t('user.defaultName')}
                    </span>
                    <span className="truncate text-xs">{user?.email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              {/* Subscription Status - Only show for premium users */}
              {isPremium && (
                <>
                  <DropdownMenuGroup>
                    <DropdownMenuItem disabled className="cursor-default focus:bg-transparent">
                      <BadgeCheck className="text-primary" />
                      <div className="flex flex-1 items-center justify-between gap-2">
                        <span className="font-medium capitalize">
                          {subscriptionTier}
                          {' '}
                          {t('usage.plan')}
                        </span>
                        {isCanceled && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="destructive" className="text-[10px]">
                                {t('billing.status.canceled')}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs" side="left">
                              <p className="text-sm">
                                {t('billing.status.canceledTooltip', { date: formattedEndDate || t('billing.status.endOfPeriod') })}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                </>
              )}

              {/* Account Actions */}
              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Link href="/chat/pricing" prefetch={false}>
                    <Sparkles />
                    {isPremium ? t('navigation.pricing') : t('pricing.card.upgradeToPro')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowApiKeysModal(true)}>
                  <Key />
                  API Keys
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />

              {/* Billing Actions */}
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={handleManageBilling}
                  disabled={customerPortalMutation.isPending || cancelSubscriptionMutation.isPending}
                >
                  {customerPortalMutation.isPending
                    ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          {t('pricing.card.processing')}
                        </>
                      )
                    : (
                        <>
                          <CreditCard />
                          {t('pricing.card.manageBilling')}
                        </>
                      )}
                </DropdownMenuItem>

                {/* Cancel subscription - only for paid plans */}
                {isPremium && activeSubscription && (
                  <DropdownMenuItem
                    onClick={handleOpenCancelDialog}
                    disabled={customerPortalMutation.isPending}
                    className="text-destructive focus:text-destructive"
                  >
                    <X />
                    {t('pricing.card.cancelSubscription')}
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>

              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut />
                {t('navigation.signOut')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      {/* Cancel Subscription Confirmation Dialog */}
      <CancelSubscriptionDialog
        open={showCancelDialog}
        onOpenChange={setShowCancelDialog}
        onConfirm={handleConfirmCancellation}
        subscriptionTier={subscriptionTier}
        currentPeriodEnd={activeSubscription?.currentPeriodEnd}
        isProcessing={cancelSubscriptionMutation.isPending}
      />

      {/* API Keys Modal */}
      <ApiKeysModal
        open={showApiKeysModal}
        onOpenChange={setShowApiKeysModal}
      />
    </>
  );
}
