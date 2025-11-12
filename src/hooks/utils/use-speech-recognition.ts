'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Browser speech recognition types
type SpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
};

type SpeechRecognitionEvent = {
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionResultList = {
  length: number;
  item: (index: number) => SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
};

type SpeechRecognitionResult = {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
};

type SpeechRecognitionAlternative = {
  transcript: string;
  confidence: number;
};

type SpeechRecognitionErrorEvent = {
  error: string;
  message: string;
};

declare global {
  // eslint-disable-next-line ts/consistent-type-definitions
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

export type UseSpeechRecognitionOptions = {
  onTranscript: (text: string) => void;
  lang?: string;
  continuous?: boolean;
};

export function useSpeechRecognition(options: UseSpeechRecognitionOptions) {
  const { onTranscript, lang = 'en-US', continuous = false } = options;

  const [isListening, setIsListening] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Check browser support - only after mount to avoid hydration mismatch
  const isSupported = isMounted
    && typeof window !== 'undefined'
    && (Boolean(window.SpeechRecognition) || Boolean(window.webkitSpeechRecognition));

  // Set mounted flag after hydration to avoid hydration mismatch
  // Legitimate pattern for client-side-only features (Next.js recommended)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks-extra/no-direct-set-state-in-use-effect
    setIsMounted(true);
  }, []);

  // Initialize speech recognition
  useEffect(() => {
    if (!isSupported)
      return;

    const SpeechRecognitionAPI
      = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognitionAPI) {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = continuous;
      recognition.interimResults = true;
      recognition.lang = lang;

      recognition.onresult = (event) => {
        const results = event.results;
        const lastResult = results[results.length - 1];

        if (lastResult && lastResult.isFinal) {
          const transcript = lastResult[0]?.transcript || '';
          if (transcript.trim()) {
            onTranscript(transcript.trim());
          }
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore errors on cleanup
        }
      }
    };
  }, [isSupported, continuous, lang, onTranscript]);

  const start = useCallback(() => {
    if (!recognitionRef.current || isListening)
      return;

    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  }, [isListening]);

  const stop = useCallback(() => {
    if (!recognitionRef.current || !isListening)
      return;

    try {
      recognitionRef.current.stop();
    } catch {
      // Ignore errors on stop
    }
    setIsListening(false);
  }, [isListening]);

  const toggle = useCallback(() => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  }, [isListening, start, stop]);

  return {
    isListening,
    isSupported,
    start,
    stop,
    toggle,
  };
}
