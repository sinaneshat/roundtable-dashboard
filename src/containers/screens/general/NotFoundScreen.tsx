'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

export default function NotFoundScreen() {
  const t = useTranslations();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background px-4 py-12">
      <Empty className="max-w-md border-none">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icons.fileQuestion />
          </EmptyMedia>
          <EmptyTitle className="text-3xl font-bold sm:text-4xl">
            {t('pages.notFound.title')}
          </EmptyTitle>
          <EmptyDescription className="text-base md:text-lg">
            {t('pages.notFound.description')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild size="lg">
            <Link href="/">{t('pages.notFound.goHome')}</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
