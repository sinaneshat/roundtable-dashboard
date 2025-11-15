/**
 * API Keys List Component
 *
 * Displays list of user's API keys with delete functionality
 * Following patterns from chat-list.tsx and chat-nav.tsx for ScrollArea usage
 * Uses reusable ApiKeyCard component for consistent design
 */

'use client';

import { Key, Loader2, Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { ApiKey } from '@/api/routes/api-keys/schema';
import { ApiKeyCard } from '@/components/settings/api-key-card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDeleteApiKeyMutation } from '@/hooks';
import { showApiErrorToast } from '@/lib/toast';

// ============================================================================
// Types
// ============================================================================

type ApiKeysListProps = {
  apiKeys: ApiKey[];
  isLoading: boolean;
  error?: Error | string | null;
  onCreateNew: () => void;
};

// ============================================================================
// Component
// ============================================================================

/**
 * Displays API keys in a scrollable list with compact card design
 * Following chat-nav.tsx pattern for ScrollArea usage
 * Reuses ApiKeyCard for consistency
 */
export function ApiKeysList({ apiKeys, isLoading, error, onCreateNew }: ApiKeysListProps) {
  const t = useTranslations();
  const [deleteKeyId, setDeleteKeyId] = useState<string | null>(null);
  const deleteMutation = useDeleteApiKeyMutation();

  const handleDelete = async () => {
    if (!deleteKeyId)
      return;

    try {
      await deleteMutation.mutateAsync({ param: { keyId: deleteKeyId } });
      // Success is obvious from the item disappearing - no toast needed
    } catch (error) {
      showApiErrorToast(t('apiKeys.list.deleteFailed'), error);
    } finally {
      setDeleteKeyId(null);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Error state
  if (error) {
    const errorMessage = typeof error === 'string' ? error : error.message;
    return (
      <Empty className="border-dashed border-destructive/50">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Key className="text-destructive" />
          </EmptyMedia>
          <EmptyTitle>{t('apiKeys.list.errorTitle')}</EmptyTitle>
          <EmptyDescription className="text-destructive">
            {errorMessage}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  // Empty state
  if (apiKeys.length === 0) {
    return (
      <Empty className="border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Key />
          </EmptyMedia>
          <EmptyTitle>{t('apiKeys.list.noKeys')}</EmptyTitle>
          <EmptyDescription>
            {t('apiKeys.list.noKeysDescription')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={onCreateNew} size="sm">
            <Plus className="mr-2 size-4" />
            {t('apiKeys.list.createNew')}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  // List with ScrollArea
  return (
    <div className="space-y-4">
      <ScrollArea className="h-[400px] pr-4">
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {apiKeys.map(key => (
              <motion.div
                key={key.id}
                initial={{ opacity: 1 }}
                exit={{
                  opacity: 0,
                  height: 0,
                  marginBottom: 0,
                  transition: { duration: 0.15, ease: 'easeOut' },
                }}
              >
                <ApiKeyCard
                  apiKey={key}
                  onDelete={setDeleteKeyId}
                  isDeleting={deleteMutation.isPending && deleteKeyId === key.id}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </ScrollArea>

      {/* Delete Confirmation Dialog - Following chat-delete-dialog.tsx pattern */}
      <AlertDialog open={!!deleteKeyId} onOpenChange={() => setDeleteKeyId(null)}>
        <AlertDialogContent glass={true}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('apiKeys.list.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('apiKeys.list.deleteConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t('actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending
                ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-2" />
                      {t('actions.deleting')}
                    </>
                  )
                : (
                    t('apiKeys.list.deleteButton')
                  )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
