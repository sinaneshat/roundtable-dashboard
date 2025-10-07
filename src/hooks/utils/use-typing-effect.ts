'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Typing effect hook for streaming text
 *
 * Creates a smooth character-by-character typing animation that matches
 * the speed of incoming stream chunks. Designed to be subtle and not
 * slow down perceived performance.
 *
 * @param incomingText - The full text content (updates as stream chunks arrive)
 * @param isStreaming - Whether the text is currently streaming
 * @param speed - Milliseconds per character (default: 15ms, fast and subtle)
 * @returns Currently displayed text with typing effect
 */
export function useTypingEffect(
  incomingText: string,
  isStreaming: boolean,
  speed: number = 15,
): string {
  const [displayedText, setDisplayedText] = useState('');
  const rafRef = useRef<number | undefined>(undefined);
  const indexRef = useRef(0);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    // If not streaming, show full text immediately
    if (!isStreaming) {
      setDisplayedText(incomingText);
      indexRef.current = incomingText.length;
      return;
    }

    // If incoming text is shorter (user edited), reset
    if (incomingText.length < indexRef.current) {
      indexRef.current = 0;
      setDisplayedText('');
    }

    // Start typing animation
    const startTyping = (timestamp: number) => {
      const elapsed = timestamp - lastUpdateRef.current;

      if (elapsed >= speed && indexRef.current < incomingText.length) {
        indexRef.current++;
        setDisplayedText(incomingText.slice(0, indexRef.current));
        lastUpdateRef.current = timestamp;
      }

      if (indexRef.current < incomingText.length) {
        rafRef.current = requestAnimationFrame(startTyping);
      }
    };

    rafRef.current = requestAnimationFrame(startTyping);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [incomingText, isStreaming, speed]);

  return displayedText;
}
