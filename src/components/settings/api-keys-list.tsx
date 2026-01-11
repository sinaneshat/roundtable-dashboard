'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Icons } from '@/components/icons';
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
import { useDeleteApiKeyMutation } from '@/hooks';
import { showApiErrorToast } from '@/lib/toast';
import type { ListApiKeysResponse } from '@/services/api';

// RPC-inferred type for API keys from service response
type ApiKeyItem = NonNullable<Extract<ListApiKeysResponse, { success: true }>['data']>['items'][number];

type ApiKeysListProps = {
  apiKeys: ApiKeyItem[];
  isLoading: boolean;
  error?: Error | null;
  onCreateNew: () => void;
};

export function ApiKeysList({ apiKeys, isLoading, error, onCreateNew }: ApiKeysListProps) {
  const t = useTranslations();
  const [deleteKeyId, setDeleteKeyId] = useState<string | null>(null);
  const deleteMutation = useDeleteApiKeyMutation();

  const handleDelete = async () => {
    if (!deleteKeyId)
      return;

    try {
      await deleteMutation.mutateAsync({ param: { keyId: deleteKeyId } });
    } catch (error) {
      showApiErrorToast(t('apiKeys.list.deleteFailed'), error);
    } finally {
      setDeleteKeyId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Icons.loader className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Empty className="border-dashed border-destructive/50">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icons.key className="text-destructive" />
          </EmptyMedia>
          <EmptyTitle>{t('apiKeys.list.errorTitle')}</EmptyTitle>
          <EmptyDescription className="text-destructive">
            {error.message}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (apiKeys.length === 0) {
    return (
      <Empty className="border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icons.key />
          </EmptyMedia>
          <EmptyTitle>{t('apiKeys.list.noKeys')}</EmptyTitle>
          <EmptyDescription>
            {t('apiKeys.list.noKeysDescription')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={onCreateNew} size="sm" startIcon={<Icons.plus />}>
            {t('apiKeys.list.createNew')}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
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

      <AlertDialog open={!!deleteKeyId} onOpenChange={() => setDeleteKeyId(null)}>
        <AlertDialogContent>
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
                      <Icons.loader className="size-4 animate-spin mr-2" />
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
