'use client';
import { ChevronsUpDown, CreditCard, Key, Loader2, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { StripeSubscriptionStatuses } from '@/api/core/enums';
import type { SubscriptionTier } from '@/api/services/product-logic.service';
import { CancelSubscriptionDialog } from '@/components/chat/cancel-subscription-dialog';
import { UsageMetrics } from '@/components/chat/usage-metrics';
import { ApiKeysModal } from '@/components/modals/api-keys-modal';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import {
  useCancelSubscriptionMutation,
  useCreateCustomerPortalSessionMutation,
  useSubscriptionsQuery,
  useUsageStatsQuery,
} from '@/hooks';
import { useBoolean, useIsMobile } from '@/hooks/utils';
import { signOut, useSession } from '@/lib/auth/client';
import { showApiErrorToast } from '@/lib/toast';

export function NavUser() {
  const router = useRouter();
  const { data: session } = useSession();
  const t = useTranslations();
  const isMobile = useIsMobile();
  const { data: usageData } = useUsageStatsQuery();
  const { data: subscriptionsData } = useSubscriptionsQuery();
  const showCancelDialog = useBoolean(false);
  const showApiKeysModal = useBoolean(false);
  const customerPortalMutation = useCreateCustomerPortalSessionMutation();
  const cancelSubscriptionMutation = useCancelSubscriptionMutation();
  const user = session?.user;
  // ✅ FIX: Prevent hydration mismatch by deferring initials calculation to client
  // Server has no session, client does - causes 'U' (server) vs 'AB' (client) mismatch
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Standard mounted flag pattern
    setIsMounted(true);
  }, []);

  const userInitials = React.useMemo(() => {
    if (!isMounted)
      return 'U'; // Prevent hydration mismatch
    return user?.name
      ? user.name
          .split(' ')
          .map((n: string) => n[0])
          .join('')
          .toUpperCase()
      : user?.email?.[0]?.toUpperCase() || 'U';
  }, [isMounted, user]);
  const subscriptions = subscriptionsData?.success ? subscriptionsData.data?.items || [] : [];
  const activeSubscription = subscriptions.find(
    sub => (sub.status === StripeSubscriptionStatuses.ACTIVE || sub.status === StripeSubscriptionStatuses.TRIALING) && !sub.cancelAtPeriodEnd,
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
  const subscriptionTier: SubscriptionTier = usageData?.data?.subscription?.tier ?? 'free';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            size="lg"
            tooltip={user?.name || t('user.defaultName')}
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            <Avatar className="h-8 w-8 rounded-full">
              <AvatarImage
                src={user?.image || undefined}
                alt={user?.name || t('user.defaultName')}
              />
              <AvatarFallback className="rounded-full">{userInitials}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate font-semibold">
                {user?.name || t('user.defaultName')}
              </span>
              <span className="truncate text-xs">{user?.email}</span>
            </div>
            <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className={isMobile ? 'w-[calc(var(--sidebar-width)-1rem)] rounded-lg' : 'min-w-56 rounded-lg'}
          side={isMobile ? 'top' : 'right'}
          align={isMobile ? 'start' : 'end'}
          sideOffset={8}
        >
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
              <Avatar className="h-8 w-8 rounded-full">
                <AvatarImage
                  src={user?.image || undefined}
                  alt={user?.name || t('user.defaultName')}
                />
                <AvatarFallback className="rounded-full">{userInitials}</AvatarFallback>
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

          {/* Usage Metrics */}
          <div className="px-2">
            <Accordion type="single" collapsible>
              <AccordionItem value="usage" className="border-none">
                <AccordionTrigger className="py-2 text-xs font-medium text-muted-foreground hover:no-underline">
                  {t('usage.planUsage')}
                </AccordionTrigger>
                <AccordionContent className="pb-2">
                  <UsageMetrics />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={showApiKeysModal.onTrue}>
              <Key />
              API Keys
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {activeSubscription && (
            <>
              <DropdownMenuSeparator />
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
              </DropdownMenuGroup>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut}>
            <LogOut />
            {t('navigation.signOut')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CancelSubscriptionDialog
        open={showCancelDialog.value}
        onOpenChange={showCancelDialog.setValue}
        onConfirm={handleConfirmCancellation}
        subscriptionTier={subscriptionTier}
        currentPeriodEnd={activeSubscription?.currentPeriodEnd}
        isProcessing={cancelSubscriptionMutation.isPending}
      />
      <ApiKeysModal
        open={showApiKeysModal.value}
        onOpenChange={showApiKeysModal.setValue}
      />
    </>
  );
}
