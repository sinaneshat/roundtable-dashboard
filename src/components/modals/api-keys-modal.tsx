'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Icons } from '@/components/icons';
import { ApiKeyForm } from '@/components/settings/api-key-form';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApiKeysQuery } from '@/hooks';
import { cn } from '@/lib/ui/cn';

import { ApiKeysList } from '../settings/api-keys-list';

type ApiKeysModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type ModalTab = 'list' | 'create';

export function ApiKeysModal({ open, onOpenChange }: ApiKeysModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTab>('list');
  const { data: apiKeysResponse, isLoading, isFetching, error } = useApiKeysQuery(open);
  const t = useTranslations();

  const apiKeys = apiKeysResponse?.success && apiKeysResponse.data?.items ? apiKeysResponse.data.items : [];

  const handleCreated = () => {
    setActiveTab('list');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('!max-w-2xl !w-[calc(100vw-2.5rem)]')}>
        <DialogHeader>
          <DialogTitle className="text-xl">{t('apiKeys.modal.title')}</DialogTitle>
          <DialogDescription>{t('apiKeys.modal.description')}</DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col py-0 max-h-[500px] overflow-hidden">
          <ScrollArea className="h-[460px]">
            <div className="space-y-4 py-4 pr-4">
              <Accordion type="single" collapsible className="w-full rounded-xl border border-border">
                <AccordionItem value="docs" className="border-0">
                  <AccordionTrigger className="px-4 hover:no-underline">
                    <div className="flex items-center gap-3">
                      <Icons.book className="size-4 text-muted-foreground" />
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

                      <div className="grid gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto justify-start text-left w-full rounded-xl border border-border hover:bg-muted/50"
                          asChild
                        >
                          <Link href="/api/v1/scalar" target="_blank" rel="noopener noreferrer">
                            <div className="flex items-center gap-3 w-full p-1">
                              <Icons.fileText className="size-4 shrink-0 text-primary" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{t('apiKeys.docs.links.interactive.title')}</p>
                                <p className="text-xs text-muted-foreground">{t('apiKeys.docs.links.interactive.description')}</p>
                              </div>
                              <Icons.externalLink className="size-3 shrink-0 text-muted-foreground" />
                            </div>
                          </Link>
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto justify-start text-left w-full rounded-xl border border-border hover:bg-muted/50"
                          asChild
                        >
                          <Link href="/api/v1/doc" target="_blank" rel="noopener noreferrer">
                            <div className="flex items-center gap-3 w-full p-1">
                              <Icons.fileJson className="size-4 shrink-0 text-primary" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{t('apiKeys.docs.links.openapi.title')}</p>
                                <p className="text-xs text-muted-foreground">{t('apiKeys.docs.links.openapi.description')}</p>
                              </div>
                              <Icons.externalLink className="size-3 shrink-0 text-muted-foreground" />
                            </div>
                          </Link>
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto justify-start text-left w-full rounded-xl border border-border hover:bg-muted/50"
                          asChild
                        >
                          <Link href="/api/v1/llms.txt" target="_blank" rel="noopener noreferrer">
                            <div className="flex items-center gap-3 w-full p-1">
                              <Icons.fileText className="size-4 shrink-0 text-primary" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{t('apiKeys.docs.links.llmText.title')}</p>
                                <p className="text-xs text-muted-foreground">{t('apiKeys.docs.links.llmText.description')}</p>
                              </div>
                              <Icons.externalLink className="size-3 shrink-0 text-muted-foreground" />
                            </div>
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <Tabs value={activeTab} onValueChange={value => setActiveTab(value as ModalTab)} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="list">{t('apiKeys.tabs.list')}</TabsTrigger>
                  <TabsTrigger value="create">{t('apiKeys.tabs.create')}</TabsTrigger>
                </TabsList>
                <TabsContent value="list" className="mt-4">
                  <ApiKeysList
                    apiKeys={apiKeys}
                    isLoading={isLoading || isFetching}
                    error={error ?? null}
                    onCreateNew={() => setActiveTab('create')}
                  />
                </TabsContent>
                <TabsContent value="create" className="mt-4">
                  <ApiKeyForm onCreated={handleCreated} currentKeyCount={apiKeys.length} />
                </TabsContent>
              </Tabs>
            </div>
          </ScrollArea>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
