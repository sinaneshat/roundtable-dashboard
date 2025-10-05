'use client';

import { Bot } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/ui/cn';

type StreamingMessageProps = {
  content: string;
  role: 'user' | 'assistant';
  isStreaming?: boolean;
  participantInfo?: {
    modelId?: string;
    role?: string;
  };
  className?: string;
};

/**
 * StreamingMessage - ChatGPT-style animated streaming message
 *
 * Features:
 * - User messages: Right-aligned with rounded message boxes, no icons
 * - AI messages: Left-aligned with model icons, title/role badges, full-width background
 * - Progressive text reveal animation during streaming
 * - Cursor animation for active streaming (only when isStreaming is true)
 * - Model info badge with flashing dot during active streaming
 *
 * Following AI SDK v5 patterns with motion/react for animations
 */
export function StreamingMessage({
  content,
  role,
  isStreaming = false,
  participantInfo,
  className,
}: StreamingMessageProps) {
  // Track content and streaming state changes with refs
  const lastContentRef = useRef(content);
  const lastStreamingRef = useRef(isStreaming);

  const [displayedContent, setDisplayedContent] = useState(isStreaming ? '' : content);
  const [currentIndex, setCurrentIndex] = useState(isStreaming ? 0 : content.length);

  // Detect when content or streaming state changes
  useEffect(() => {
    const contentChanged = content !== lastContentRef.current;
    const streamingChanged = isStreaming !== lastStreamingRef.current;

    if (contentChanged || streamingChanged) {
      lastContentRef.current = content;
      lastStreamingRef.current = isStreaming;

      if (isStreaming) {
        // Reset for new streaming content
        setCurrentIndex(0);
        setDisplayedContent('');
      } else {
        // Show immediately for non-streaming content
        setDisplayedContent(content);
        setCurrentIndex(content.length);
      }
    }
  }, [content, isStreaming]);

  // Animate content streaming character by character (ChatGPT-style)
  useEffect(() => {
    if (isStreaming && currentIndex < content.length) {
      // Progressive reveal - faster than real-time but visible
      const timeout = setTimeout(() => {
        setDisplayedContent(content.slice(0, currentIndex + 1));
        setCurrentIndex(currentIndex + 1);
      }, 20); // 20ms per character for smooth streaming feel

      return () => clearTimeout(timeout);
    }

    // If streaming stopped but we haven't shown all content yet, show it all
    if (!isStreaming && displayedContent !== content) {
      setDisplayedContent(content);
      setCurrentIndex(content.length);
    }

    return undefined;
  }, [content, currentIndex, isStreaming, displayedContent]);

  const isUser = role === 'user';
  const showCursor = isStreaming && currentIndex < content.length;

  // User messages: Right-aligned with rounded box
  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.3,
          ease: [0.4, 0, 0.2, 1],
        }}
        className={cn('flex w-full justify-end px-4 py-3', className)}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="max-w-[80%] rounded-2xl bg-primary px-4 py-3 text-primary-foreground"
        >
          <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {displayedContent}
          </div>
        </motion.div>
      </motion.div>
    );
  }

  // AI messages: Left-aligned with icon, title/role, full-width background
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        ease: [0.4, 0, 0.2, 1],
      }}
      className={cn(
        'group flex gap-4 w-full px-4 py-6 bg-accent/30',
        className,
      )}
    >
      {/* AI Model Icon */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.3 }}
      >
        <Avatar className="size-8 border-2 border-accent bg-accent">
          <AvatarFallback className="bg-accent text-accent-foreground">
            <Bot className="size-4" />
          </AvatarFallback>
        </Avatar>
      </motion.div>

      {/* Content with Model Info */}
      <div className="flex-1 space-y-2 overflow-hidden">
        {/* Model/Role Badge - with flashing dot only when actively streaming */}
        {participantInfo && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="flex items-center gap-2 text-xs font-medium text-muted-foreground"
          >
            <div className="flex items-center gap-1.5">
              {/* Flashing dot - only when actively streaming */}
              {isStreaming && (
                <motion.div
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{
                    duration: 1.5,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: 'easeInOut',
                  }}
                  className="size-1.5 rounded-full bg-primary"
                />
              )}
              {/* Show role if available, otherwise model ID */}
              <span>{participantInfo.role || participantInfo.modelId}</span>
            </div>
          </motion.div>
        )}

        {/* Message Content */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="prose prose-sm dark:prose-invert max-w-none"
        >
          <div className="text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground">
            {displayedContent}
            {/* Animated cursor during streaming */}
            {showCursor && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0] }}
                transition={{
                  duration: 0.8,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: 'easeInOut',
                }}
                className="inline-block w-1 h-5 ml-0.5 bg-primary/80 align-middle rounded-sm"
              />
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
