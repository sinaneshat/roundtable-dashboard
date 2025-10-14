/**
 * API Keys Modal Component
 *
 * Modal for viewing and managing API keys
 * Features:
 * - Automatic data prefetching on mount
 * - Loading states for better UX
 * - Optimistic updates after key creation
 * - Quick links to API documentation
 *
 * Following patterns from pricing-modal.tsx and base-modal.tsx
 */

'use client';

import { Book, ExternalLink, FileJson, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { ApiKeyResponse } from '@/api/routes/api-keys/schema';
import { BaseModal } from '@/components/modals/base-modal';
import { ApiKeyForm } from '@/components/settings/api-key-form';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApiKeysQuery } from '@/hooks';

import { ApiKeysList } from '../settings/api-keys-list';

type ApiKeysModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ApiKeysModal({ open, onOpenChange }: ApiKeysModalProps) {
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const { data: apiKeysResponse, isLoading, isFetching } = useApiKeysQuery(open);
  const t = useTranslations();

  // Extract API keys from response
  const apiKeys = apiKeysResponse?.success && apiKeysResponse.data?.apiKeys
    ? apiKeysResponse.data.apiKeys
    : [];

  const handleCreated = () => {
    setActiveTab('list');
  };

  return (
    <BaseModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('apiKeys.modal.title')}
      description={t('apiKeys.modal.description')}
      size="lg"
    >
      <div className="space-y-4">
        {/* API Documentation Accordion */}
        <Accordion type="single" collapsible className="w-full rounded-lg border">
          <AccordionItem value="docs" className="border-0">
            <AccordionTrigger className="px-4 hover:no-underline">
              <div className="flex items-center gap-3">
                <Book className="size-4 text-muted-foreground" />
                <div className="flex flex-col items-start gap-1">
                  <span className="text-sm font-medium">{t('apiKeys.docs.accordion.title')}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {t('apiKeys.docs.accordion.subtitle')}
                  </span>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {t('apiKeys.docs.accordion.description')}
                </p>

                {/* Documentation Links */}
                <div className="grid gap-2">
                  {/* Interactive Scalar Docs */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-auto justify-start text-left"
                    onClick={() => window.open('/api/v1/scalar', '_blank')}
                  >
                    <div className="flex items-center gap-3 w-full">
                      <FileText className="size-4 shrink-0 text-primary" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{t('apiKeys.docs.links.interactive.title')}</p>
                        <p className="text-xs text-muted-foreground">{t('apiKeys.docs.links.interactive.description')}</p>
                      </div>
                      <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                    </div>
                  </Button>

                  {/* OpenAPI JSON Spec */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-auto justify-start text-left"
                    onClick={() => window.open('/api/v1/doc', '_blank')}
                  >
                    <div className="flex items-center gap-3 w-full">
                      <FileJson className="size-4 shrink-0 text-primary" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{t('apiKeys.docs.links.openapi.title')}</p>
                        <p className="text-xs text-muted-foreground">{t('apiKeys.docs.links.openapi.description')}</p>
                      </div>
                      <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                    </div>
                  </Button>

                  {/* LLM-Friendly Markdown */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-auto justify-start text-left"
                    onClick={() => window.open('/api/v1/llms.txt', '_blank')}
                  >
                    <div className="flex items-center gap-3 w-full">
                      <FileText className="size-4 shrink-0 text-primary" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{t('apiKeys.docs.links.llmText.title')}</p>
                        <p className="text-xs text-muted-foreground">{t('apiKeys.docs.links.llmText.description')}</p>
                      </div>
                      <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                    </div>
                  </Button>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* API Keys Management Tabs */}
        <Tabs value={activeTab} onValueChange={value => setActiveTab(value as 'list' | 'create')} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="list">{t('apiKeys.tabs.list')}</TabsTrigger>
            <TabsTrigger value="create">{t('apiKeys.tabs.create')}</TabsTrigger>
          </TabsList>
          <TabsContent value="list" className="mt-4">
            <ApiKeysList
              apiKeys={apiKeys as unknown as ApiKeyResponse[]}
              isLoading={isLoading || isFetching}
              onCreateNew={() => setActiveTab('create')}
            />
          </TabsContent>
          <TabsContent value="create" className="mt-4">
            <ApiKeyForm onCreated={handleCreated} currentKeyCount={apiKeys.length} />
          </TabsContent>
        </Tabs>
      </div>
    </BaseModal>
  );
}
