'use client';

import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import type { ParticipantConfig } from '@/components/chat/chat-config-sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { AI_MODELS } from '@/lib/ai/models-config';
import { cn } from '@/lib/ui/cn';
import { glassBadge } from '@/lib/ui/glassmorphism';

// ============================================================================
// Types
// ============================================================================

type QuickStartSuggestion = {
  title: string;
  description: string;
  prompt: string;
  mode: 'brainstorming' | 'analyzing' | 'debating' | 'solving';
  participants: ParticipantConfig[];
};

type ChatQuickStartProps = {
  onSuggestionClick: (
    prompt: string,
    mode: QuickStartSuggestion['mode'],
    participants: ParticipantConfig[],
  ) => void;
  className?: string;
};

// ============================================================================
// Component
// ============================================================================

/**
 * ChatQuickStart Component
 *
 * Displays quick start suggestions for users to begin conversations
 * ChatGPT-like experience with preset prompts and modes
 */
export function ChatQuickStart({ onSuggestionClick, className }: ChatQuickStartProps) {
  const t = useTranslations();

  const suggestions: QuickStartSuggestion[] = [
    {
      title: t('chat.quickStart.brainstorm.title'),
      description: t('chat.quickStart.brainstorm.description'),
      prompt: t('chat.quickStart.brainstorm.prompt'),
      mode: 'brainstorming',
      participants: [
        { id: 'p1', modelId: 'anthropic/claude-3.5-sonnet', role: 'The Ideator', order: 0 },
        { id: 'p2', modelId: 'openai/gpt-4o', role: 'Devil\'s Advocate', order: 1 },
        { id: 'p3', modelId: 'google/gemini-2.5-pro', role: 'Practical Evaluator', order: 2 },
      ],
    },
    {
      title: t('chat.quickStart.debate.title'),
      description: t('chat.quickStart.debate.description'),
      prompt: t('chat.quickStart.debate.prompt'),
      mode: 'debating',
      participants: [
        { id: 'p1', modelId: 'anthropic/claude-3.5-sonnet', role: 'Devil\'s Advocate', order: 0 },
        { id: 'p2', modelId: 'openai/gpt-4-turbo', role: 'Practical Evaluator', order: 1 },
        { id: 'p3', modelId: 'meta-llama/llama-3.1-405b-instruct', role: 'Visionary Thinker', order: 2 },
      ],
    },
    {
      title: t('chat.quickStart.solve.title'),
      description: t('chat.quickStart.solve.description'),
      prompt: t('chat.quickStart.solve.prompt'),
      mode: 'solving',
      participants: [
        { id: 'p1', modelId: 'anthropic/claude-3.5-sonnet', role: 'Builder', order: 0 },
        { id: 'p2', modelId: 'openai/o1-mini', role: 'Implementation Strategist', order: 1 },
        { id: 'p3', modelId: 'deepseek/deepseek-chat', role: 'Practical Evaluator', order: 2 },
      ],
    },
  ];

  return (
    <div className={cn('w-full relative z-20', className)}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-fr">
        {suggestions.map((suggestion, index) => {
          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.3,
                delay: index * 0.05,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="flex"
            >
              <Card
                variant="glass"
                className="cursor-pointer py-4 flex-1 flex flex-col justify-between hover:shadow-3xl"
                onClick={() => onSuggestionClick(suggestion.prompt, suggestion.mode, suggestion.participants)}
              >
                <div className="flex flex-col gap-3 px-6 flex-1">
                  {/* Title */}
                  <div className="font-semibold text-sm text-white drop-shadow-md">
                    {suggestion.title}
                  </div>

                  {/* Description */}
                  <div className="text-xs text-white/80 line-clamp-2">
                    {suggestion.description}
                  </div>

                  {/* Model Participants - Same styling as ParticipantsPreview */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {suggestion.participants
                      .sort((a, b) => a.order - b.order)
                      .map((participant) => {
                        const model = AI_MODELS.find(m => m.modelId === participant.modelId);
                        if (!model)
                          return null;
                        return (
                          <div
                            key={participant.id}
                            className={cn(glassBadge, 'flex items-center gap-1.5 rounded-full px-2.5 py-1.5')}
                          >
                            <Avatar className="size-5">
                              <AvatarImage src={model.metadata.icon} alt={model.name} />
                              <AvatarFallback className="text-[10px]">
                                {model.name.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col">
                              <span className="text-xs font-medium text-white">{model.name}</span>
                              {participant.role && (
                                <span className="text-[10px] text-white/70">{participant.role}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
