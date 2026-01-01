'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';

import { PlanTypes, StripeSubscriptionStatuses, SubscriptionTiers } from '@/api/core/enums';
import { UsageMetrics } from '@/components/chat/usage-metrics';
import { Icons } from '@/components/icons';
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
import { useBoolean } from '@/hooks/utils';
import { signOut, useSession } from '@/lib/auth/client';
import type { Session, User } from '@/lib/auth/types';
import { showApiErrorToast } from '@/lib/toast';

// Dynamic imports - only loaded when user opens these dialogs
const CancelSubscriptionDialog = dynamic(
  () => import('@/components/chat/cancel-subscription-dialog').then(m => m.CancelSubscriptionDialog),
  { ssr: false },
);

const ApiKeysModal = dynamic(
  () => import('@/components/modals/api-keys-modal').then(m => m.ApiKeysModal),
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
  const { data: usageData } = useUsageStatsQuery();
  const { data: subscriptionsData } = useSubscriptionsQuery();
  const showCancelDialog = useBoolean(false);
  const showApiKeysModal = useBoolean(false);
  const customerPortalMutation = useCreateCustomerPortalSessionMutation();
  const cancelSubscriptionMutation = useCancelSubscriptionMutation();

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
  const subscriptionTier = usageData?.data?.plan?.type === PlanTypes.PAID ? SubscriptionTiers.PRO : SubscriptionTiers.FREE;

  const mounted = useBoolean(false);
  useEffect(() => {
    mounted.onTrue();
  }, [mounted]);

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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            size="lg"
            tooltip={displayName}
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
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
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-[calc(var(--sidebar-width)-1.5rem)] min-w-56 rounded-lg"
          side="top"
          align="start"
          sideOffset={8}
        >
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
              <Avatar className="h-8 w-8 rounded-full">
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
                <span className="truncate text-xs">{displayEmail}</span>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

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
              <Icons.key />
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
                          <Icons.loader className="size-4 animate-spin" />
                          {t('pricing.card.processing')}
                        </>
                      )
                    : (
                        <>
                          <Icons.creditCard />
                          {t('pricing.card.manageBilling')}
                        </>
                      )}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut}>
            <Icons.logOut />
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
