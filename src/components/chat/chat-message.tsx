'use client';

import { Bot, Copy, Edit3, RefreshCw } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { memo, useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getModelById } from '@/lib/ai/models-config';
import { useSession } from '@/lib/auth/client';
import { cn } from '@/lib/ui/cn';

// ============================================================================
// Types
// ============================================================================

export type ChatMessageType = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  participantId: string | null;
  metadata?: {
    model?: string;
    role?: string;
    mode?: 'analyzing' | 'brainstorming' | 'debating' | 'solving';
    [key: string]: unknown;
  } | null;
  createdAt: string;
  isStreaming?: boolean; // Track if this message is currently streaming
};

type ChatMessageProps = {
  message: ChatMessageType;
  className?: string;
  isFirstUserMessage?: boolean; // Identify if this is the initial prompt
  contextCount?: number; // Number of messages this AI model sees in context (compound chain)
  onRegenerate?: () => void; // Regenerate responses (simplified per AI SDK v5 docs)
  onCopy?: (content: string) => void; // Copy message content
  onEdit?: (messageId: string, currentContent: string) => void; // Edit and regenerate
};

// ============================================================================
// Component
// ============================================================================

/**
 * ChatMessage Component
 *
 * Simple message display following official AI SDK v5 patterns
 * Displays text as it streams in with hover actions for user messages
 *
 * Memoized to prevent unnecessary re-renders
 */
export const ChatMessage = memo(({
  message,
  className,
  isFirstUserMessage = false,
  contextCount = 0,
  onRegenerate,
  onCopy,
  onEdit,
}: ChatMessageProps) => {
  const t = useTranslations();
  const { data: session } = useSession();
  const [isHovered, setIsHovered] = useState(false);
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  // Show actions only for user messages
  const showActions = isUser && (onRegenerate || onCopy || onEdit);

  // Get model config for AI messages
  const modelConfig = isAssistant && message.metadata?.model
    ? getModelById(message.metadata.model)
    : null;

  // Get user info for user messages
  const user = session?.user;
  const userInitials = user?.name
    ? user.name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
    : user?.email?.[0]?.toUpperCase() || 'U';

  const handleCopy = () => {
    if (onCopy) {
      onCopy(message.content);
    } else {
      // Fallback to clipboard API
      navigator.clipboard.writeText(message.content);
    }
  };

  const handleRegenerate = () => {
    if (onRegenerate) {
      onRegenerate();
    }
  };

  const handleEdit = () => {
    if (onEdit) {
      onEdit(message.id, message.content);
    }
  };

  return (
    <div
      className={cn(
        'group relative flex gap-4 py-6',
        isUser && 'flex-row-reverse', // User messages align to right
        className,
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Avatar */}
      {isUser
        ? (
            <Avatar className="size-8 shrink-0">
              <AvatarImage
                src={user?.image || undefined}
                alt={user?.name || t('user.defaultName')}
              />
              <AvatarFallback className="bg-primary text-primary-foreground">
                {userInitials}
              </AvatarFallback>
            </Avatar>
          )
        : (
            <Avatar className="size-8 shrink-0">
              {modelConfig?.metadata?.icon
                ? (
                    <AvatarImage
                      src={modelConfig.metadata.icon}
                      alt={modelConfig.name}
                    />
                  )
                : null}
              <AvatarFallback
                style={{ backgroundColor: modelConfig?.metadata?.color || undefined }}
                className="text-white"
              >
                <Bot className="size-4" />
              </AvatarFallback>
            </Avatar>
          )}

      {/* Content */}
      <div className={cn(
        'flex-1 space-y-2 overflow-hidden',
        isUser ? 'max-w-2xl ml-auto' : 'max-w-3xl',
      )}
      >
        {/* Metadata header */}
        <div className={cn(
          'flex flex-wrap items-center gap-2',
          isUser && 'justify-end',
        )}
        >
          {isUser
            ? (
                <span className="text-sm font-semibold text-muted-foreground">
                  {user?.name || t('user.defaultName')}
                </span>
              )
            : modelConfig && (
              <>
                <span className="text-sm font-semibold">
                  {modelConfig.name}
                </span>
                {message.metadata?.role && (
                  <>
                    <span className="text-xs text-muted-foreground">•</span>
                    <Badge variant="secondary" className="text-xs h-5">
                      {message.metadata.role}
                    </Badge>
                  </>
                )}
                {/* Compound Context Indicator - Show what this AI sees */}
                {contextCount > 0 && (
                  <>
                    <span className="text-xs text-muted-foreground">•</span>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
                      <svg
                        className="size-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                      <span>
                        sees
                        {' '}
                        {contextCount}
                        {' '}
                        {contextCount === 1 ? 'message' : 'messages'}
                      </span>
                    </div>
                  </>
                )}
              </>
            )}
        </div>

        {/* Message text */}
        <div className="relative">
          <div className={cn(
            'rounded-2xl transition-colors',
            isUser
              ? 'bg-accent/80 dark:bg-accent/60 border border-accent px-4 py-3 text-accent-foreground'
              : 'prose prose-sm dark:prose-invert max-w-none',
          )}
          >
            <span className="whitespace-pre-wrap">{message.content}</span>
            {message.isStreaming && (
              <span className="ml-1 inline-block size-1 animate-pulse rounded-full bg-current" />
            )}
          </div>

          {/* Hover Actions - Animate in from the side */}
          <AnimatePresence>
            {showActions && isHovered && !message.isStreaming && (
              <motion.div
                initial={{ opacity: 0, x: isUser ? 10 : -10, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: isUser ? 10 : -10, scale: 0.95 }}
                transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
                className={cn(
                  'absolute top-1/2 -translate-y-1/2 flex items-center gap-1',
                  isUser ? '-left-2 -translate-x-full flex-row-reverse' : '-right-2 translate-x-full',
                )}
              >
                {/* Copy Button */}
                {onCopy && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCopy}
                    className="size-8 rounded-full bg-background border border-border hover:bg-accent shadow-sm"
                    title={t('chat.actions.copy')}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                )}

                {/* Regenerate Button - Only for first user message */}
                {onRegenerate && isFirstUserMessage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRegenerate}
                    className="size-8 rounded-full bg-background border border-border hover:bg-accent shadow-sm"
                    title={t('chat.actions.regenerate')}
                  >
                    <RefreshCw className="size-3.5" />
                  </Button>
                )}

                {/* Edit Button - Only for first user message */}
                {onEdit && isFirstUserMessage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleEdit}
                    className="size-8 rounded-full bg-background border border-border hover:bg-accent shadow-sm"
                    title={t('chat.actions.edit')}
                  >
                    <Edit3 className="size-3.5" />
                  </Button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Only re-render if content actually changed
  return (
    prevProps.message.id === nextProps.message.id
    && prevProps.message.content === nextProps.message.content
    && prevProps.message.isStreaming === nextProps.message.isStreaming
  );
});

// ============================================================================
// Message List Component
// ============================================================================

type ChatMessageListProps = {
  messages: ChatMessageType[];
  showModeSeparators?: boolean; // Show mode change separators
  className?: string;
  onRegenerate?: () => void; // Simplified: no messageId needed
  onCopy?: (content: string) => void;
  onEdit?: (messageId: string, currentContent: string) => void;
};

/**
 * ChatMessageList Component
 *
 * Renders a list of chat messages with proper spacing and grouping
 * Optionally displays mode separators when conversation mode changes
 */
export function ChatMessageList({
  messages,
  showModeSeparators = true,
  className,
  onRegenerate,
  onCopy,
  onEdit,
}: ChatMessageListProps) {
  const t = useTranslations();

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-center text-muted-foreground">
        <div className="space-y-2">
          <Bot className="size-12 mx-auto opacity-50" />
          <p className="text-sm">{t('chat.noMessages')}</p>
        </div>
      </div>
    );
  }

  // Find the first user message index
  const firstUserMessageIndex = messages.findIndex(msg => msg.role === 'user');

  return (
    <div className={cn('flex flex-col w-full', className)}>
      {messages.map((message, index) => {
        // Check if mode changed from previous message (for separators)
        const prevMessage = index > 0 ? messages[index - 1] : null;
        const currentMode = message.metadata?.mode;
        const prevMode = prevMessage?.metadata?.mode;
        const modeChanged = showModeSeparators
          && currentMode
          && prevMode
          && currentMode !== prevMode
          && message.role === 'assistant'; // Only show separator before assistant messages

        // Calculate compound context - what this AI model sees
        // For assistant messages, count how many messages (user + assistants) came before it
        let contextCount = 0;
        if (message.role === 'assistant') {
          // Count all messages before this one (they're in the context)
          contextCount = index;
        }

        // Identify if this is the first user message
        const isFirstUserMessage = message.role === 'user' && index === firstUserMessageIndex;

        return (
          <div key={message.id}>
            {modeChanged && (
              <ChatModeSeparator mode={currentMode} />
            )}
            <ChatMessage
              message={message}
              isFirstUserMessage={isFirstUserMessage}
              contextCount={contextCount}
              onRegenerate={onRegenerate}
              onCopy={onCopy}
              onEdit={onEdit}
            />
          </div>
        );
      })}
    </div>
  );
}

// Mode separator component (imported from separate file)
function ChatModeSeparator({ mode }: { mode: 'analyzing' | 'brainstorming' | 'debating' | 'solving' }) {
  // Import dynamically to avoid circular dependencies
  // eslint-disable-next-line ts/no-require-imports
  const { ChatModeSeparator: Separator } = require('./chat-mode-separator');
  return <Separator mode={mode} />;
}
