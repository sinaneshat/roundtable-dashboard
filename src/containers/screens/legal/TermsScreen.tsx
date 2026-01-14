import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const TERMS_SECTIONS = [
  'acceptance',
  'services',
  'billing',
  'privacy',
  'termination',
  'liability',
  'governing',
  'contact',
] as const;

export default async function TermsScreen() {
  const t = await getTranslations('legal.terms');
  const tActions = await getTranslations('actions');

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <Button asChild variant="ghost" size="sm" startIcon={<Icons.arrowLeft />}>
          <Link href="/auth/sign-in">
            {tActions('back')}
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">{t('title')}</CardTitle>
          <CardDescription>
            {t('lastUpdated', { date: '2024-01-01' })}
          </CardDescription>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none">
          <section className="space-y-6">
            {TERMS_SECTIONS.map(section => (
              <div key={section}>
                <h2 className="text-xl font-semibold mb-3">
                  {t(`${section}.title`)}
                </h2>
                <p className="text-muted-foreground">
                  {t(`${section}.content`)}
                </p>
              </div>
            ))}
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
