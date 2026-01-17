import type React from 'react';

import { Icons } from '@/components/icons';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { BRAND } from '@/constants';
import { getTranslations, Link } from '@/lib/compat';

type PublicChatLayoutProps = {
  children: React.ReactNode;
};

export default async function PublicChatLayout({ children }: PublicChatLayoutProps) {
  const t = await getTranslations('chat.public');

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/20">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4 px-5 md:px-6 py-3">
          <Link
            href="/"
            className="flex items-center gap-3 hover:opacity-80 transition-opacity min-w-0"
          >
            <Logo size="sm" variant="icon" className="shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="font-semibold tracking-tight text-sm sm:text-base leading-tight">
                {BRAND.displayName}
              </span>
              <span className="text-[10px] sm:text-xs text-muted-foreground leading-tight truncate">
                {BRAND.tagline}
              </span>
            </div>
          </Link>

          <Button asChild size="sm" className="shrink-0">
            <Link
              href="/auth/sign-up?utm_source=public_chat&utm_medium=header&utm_campaign=try_free"
              className="flex items-center gap-1.5"
            >
              <span>{t('tryFree')}</span>
              <Icons.arrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex flex-1 flex-col w-full min-w-0 relative pt-16" data-public-content>
        {children}
      </div>
    </div>
  );
}
