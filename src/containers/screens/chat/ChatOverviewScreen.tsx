'use client';

import { useTranslations } from 'next-intl';

import { ChatInput } from '@/components/chat/chat-input';
import { Logo } from '@/components/logo';
import { LayoutTextFlip } from '@/components/ui/layout-text-flip';
import { ScaleIn, StaggerContainer, StaggerItem } from '@/components/ui/motion';

export default function ChatOverviewScreen() {
  const t = useTranslations();

  // Prepare rotating words from translations
  const rotatingWords = [
    t('chat.hero.rotatingWords.multipleAI'),
    t('chat.hero.rotatingWords.expertSystems'),
    t('chat.hero.rotatingWords.smartAssistants'),
    t('chat.hero.rotatingWords.aiThinkTanks'),
  ];

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-between px-4 pt-16 md:pt-20 pb-8">
      {/* Main content block with stagger animation */}
      <StaggerContainer
        className="flex flex-col items-center gap-6 text-center flex-1 justify-center"
        staggerDelay={0.15}
        delayChildren={0.1}
      >
        {/* Logo - much larger with scale animation */}
        <StaggerItem>
          <ScaleIn duration={0.5} delay={0}>
            <div className="flex items-center justify-center">
              <Logo size="lg" variant="full" className="w-64 h-64 md:w-80 md:h-80" />
            </div>
          </ScaleIn>
        </StaggerItem>

        {/* Hero Section with Animated Text */}
        <StaggerItem className="flex flex-col items-center gap-5">
          <LayoutTextFlip
            text={t('chat.hero.staticText')}
            words={rotatingWords}
            duration={3000}
          />

          <p className="text-base md:text-lg text-muted-foreground max-w-xl md:max-w-2xl px-4 leading-relaxed">
            {t('chat.hero.subtitle')}
          </p>
        </StaggerItem>
      </StaggerContainer>

      {/* Enhanced Chat Input - ChatGPT-style with attachments and mode selector */}
      <div className="w-full flex justify-center">
        <StaggerItem className="w-full">
          <ChatInput className="w-full" />
        </StaggerItem>
      </div>
    </div>
  );
}
