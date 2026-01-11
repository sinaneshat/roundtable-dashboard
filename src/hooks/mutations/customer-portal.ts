/**
 * Customer Portal Mutation Hook
 *
 * TanStack Mutation hook for creating Stripe customer portal sessions
 * Used for payment method management and invoice downloads
 */

'use client';

import { useMutation } from '@tanstack/react-query';

import { createCustomerPortalSessionService } from '@/services/api';

/**
 * Hook to create customer portal session
 * Protected endpoint - requires authentication
 *
 * Returns a URL to redirect the user to Stripe's customer portal
 * where they can:
 * - Update payment methods
 * - View and download invoices
 * - View billing history
 */
export function useCreateCustomerPortalSessionMutation() {
  return useMutation({
    mutationFn: createCustomerPortalSessionService,
    retry: false,
    throwOnError: false,
  });
}
