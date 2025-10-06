'use client';

import { motion } from 'motion/react';

import type { ParticipantConfig } from '@/components/chat/chat-config-sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { AI_MODELS } from '@/lib/ai/models-config';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { cn } from '@/lib/ui/cn';
import { glassBadge } from '@/lib/ui/glassmorphism';

// ============================================================================
// Types
// ============================================================================

type QuickStartSuggestion = {
  title: string;
  prompt: string;
  mode: ChatModeId;
  participants: ParticipantConfig[];
};

type ChatQuickStartProps = {
  onSuggestionClick: (
    prompt: string,
    mode: ChatModeId,
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
 * Compact, mobile-friendly quick start suggestions
 */
export function ChatQuickStart({ onSuggestionClick, className }: ChatQuickStartProps) {
  const suggestions: QuickStartSuggestion[] = [
    {
      title: 'Can artificial general intelligence be aligned with human values?',
      prompt: 'Debate the existential challenge: Can we truly align AGI with human values, or is catastrophic misalignment inevitable?',
      mode: 'debating',
      participants: [
        { id: 'p1', modelId: 'anthropic/claude-3.5-sonnet', role: 'AI Safety Researcher', order: 0 },
        { id: 'p2', modelId: 'openai/o1-mini', role: 'Technical Skeptic', order: 1 },
        { id: 'p3', modelId: 'openai/gpt-4o', role: 'Ethics Philosopher', order: 2 },
      ],
    },
    {
      title: 'Is objective morality possible without a higher power?',
      prompt: 'Explore whether objective moral truths can exist in a purely materialist universe without divine authority.',
      mode: 'debating',
      participants: [
        { id: 'p1', modelId: 'anthropic/claude-3.5-sonnet', role: 'Moral Realist', order: 0 },
        { id: 'p2', modelId: 'openai/gpt-4-turbo', role: 'Moral Relativist', order: 1 },
        { id: 'p3', modelId: 'google/gemini-2.5-pro', role: 'Pragmatic Ethicist', order: 2 },
        { id: 'p4', modelId: 'meta-llama/llama-3.1-405b-instruct', role: 'Philosopher', order: 3 },
      ],
    },
    {
      title: 'Should we edit human embryos to eliminate genetic diseases?',
      prompt: 'Debate CRISPR germline editing: eliminating suffering vs. playing god and creating designer babies.',
      mode: 'debating',
      participants: [
        { id: 'p1', modelId: 'anthropic/claude-3.5-sonnet', role: 'Bioethicist', order: 0 },
        { id: 'p2', modelId: 'openai/gpt-4o', role: 'Geneticist', order: 1 },
        { id: 'p3', modelId: 'deepseek/deepseek-chat', role: 'Disability Rights', order: 2 },
        { id: 'p4', modelId: 'google/gemini-2.5-pro', role: 'Medical Ethics', order: 3 },
        { id: 'p5', modelId: 'openai/gpt-4-turbo', role: 'Futurist', order: 4 },
      ],
    },
  ];

  return (
    <div className={cn('w-full relative z-20 overflow-hidden', className)}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-1.5 lg:gap-4 overflow-hidden">
        {suggestions.map((suggestion) => {
          return (
            <motion.div
              key={suggestion.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.3,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="flex min-w-0"
            >
              <Card
                variant="glass"
                className="gap-1 cursor-pointer p-1.5 lg:p-4 hover:shadow-2xl transition-all group flex-1 flex flex-col min-w-0 overflow-hidden"
                onClick={() => onSuggestionClick(suggestion.prompt, suggestion.mode, suggestion.participants)}
              >
                {/* Title - Full text visible with line breaks */}
                <div className="font-semibold text-xs lg:text-sm text-white/90 mb-1 lg:mb-3 line-clamp-3 lg:line-clamp-2 drop-shadow-md leading-relaxed">
                  {suggestion.title}
                </div>

                {/* Model Participants */}
                <div className="flex items-center gap-1.5 min-w-0 w-full">
                  {/* Mobile & Tablet: Always ScrollArea (< lg) */}
                  <div className="lg:hidden w-full min-w-0">
                    <ScrollArea className="w-full max-w-full" type="always">
                      <div className="flex items-center gap-1.5 pb-2">
                        {suggestion.participants
                          .sort((a, b) => a.order - b.order)
                          .map((participant) => {
                            const model = AI_MODELS.find(m => m.modelId === participant.modelId);
                            if (!model)
                              return null;
                            return (
                              <div
                                key={participant.id}
                                className={cn(
                                  glassBadge,
                                  'flex items-center gap-1 rounded-full px-2 py-1 flex-shrink-0',
                                )}
                              >
                                <Avatar className="size-4">
                                  <AvatarImage src={model.metadata.icon} alt={model.name} />
                                  <AvatarFallback className="text-[8px]">
                                    {model.name.slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex flex-col">
                                  <span className="text-[10px] font-medium text-white/80 whitespace-nowrap leading-tight">
                                    {model.name.split(' ')[0]}
                                  </span>
                                  {participant.role && (
                                    <span className="text-[9px] text-white/60 whitespace-nowrap leading-tight">
                                      {participant.role}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                      <ScrollBar orientation="horizontal" className="h-1" />
                    </ScrollArea>
                  </div>

                  {/* Desktop: Show all participants with wrapping (>= lg) */}
                  <div className="hidden lg:flex flex-wrap gap-2 w-full min-w-0">
                    {suggestion.participants
                      .sort((a, b) => a.order - b.order)
                      .map((participant) => {
                        const model = AI_MODELS.find(m => m.modelId === participant.modelId);
                        if (!model)
                          return null;
                        return (
                          <div
                            key={participant.id}
                            className={cn(
                              glassBadge,
                              'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 flex-shrink-0',
                            )}
                          >
                            <Avatar className="size-5">
                              <AvatarImage src={model.metadata.icon} alt={model.name} />
                              <AvatarFallback className="text-[10px]">
                                {model.name.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-medium text-white truncate">
                                {model.name}
                              </span>
                              {participant.role && (
                                <span className="text-[10px] text-white/70 truncate">
                                  {participant.role}
                                </span>
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
