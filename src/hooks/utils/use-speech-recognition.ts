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
  onstart: () => void;
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
    AudioContext?: new () => AudioContext;
    webkitAudioContext?: new () => AudioContext;
  }
}

export type UseSpeechRecognitionOptions = {
  onTranscript: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  lang?: string;
  continuous?: boolean;
  enableAudioVisualization?: boolean;
};

export function useSpeechRecognition(options: UseSpeechRecognitionOptions) {
  const { onTranscript, onInterimTranscript, lang = 'en-US', continuous = true, enableAudioVisualization = true } = options;

  const [isListening, setIsListening] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [audioLevels, setAudioLevels] = useState<number[]>([]);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const isListeningRef = useRef(false);
  const resultIndexRef = useRef(0);
  const lastCommittedInterimRef = useRef<string | null>(null);

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

        // Process only NEW results from the last index we handled
        for (let i = resultIndexRef.current; i < results.length; i++) {
          const result = results[i];
          if (!result)
            continue;

          const transcript = result[0]?.transcript || '';

          if (result.isFinal) {
            // ✅ FIX: Skip final results that match the last manually committed interim
            // This prevents duplication when stop() commits interim and API also finalizes it
            const trimmedTranscript = transcript.trim();
            if (trimmedTranscript && trimmedTranscript !== lastCommittedInterimRef.current) {
              onTranscript(trimmedTranscript);
            }
            // Clear the last committed interim ref after processing
            lastCommittedInterimRef.current = null;
            // Move to next result index since this one is finalized
            resultIndexRef.current = i + 1;
            // ✅ FIX: Clear interim display and notify component
            // This ensures the next interim starts fresh and component shows only finalized text
            setInterimTranscript('');
            if (onInterimTranscript) {
              onInterimTranscript('');
            }
          } else {
            // Interim result - only show the LATEST interim (most recent non-final result)
            // The latest interim already contains all accumulated text for the current phrase
            if (i === results.length - 1) {
              setInterimTranscript(transcript);
              if (onInterimTranscript) {
                onInterimTranscript(transcript);
              }
            }
          }
        }
      };

      recognition.onerror = (event) => {
        console.error('[Speech Recognition] Error:', event.error, event.message);
        setError(event.error);

        // Only stop on critical errors
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setIsListening(false);
          isListeningRef.current = false;
          setError('Microphone permission denied');
        } else if (event.error !== 'no-speech' && event.error !== 'audio-capture' && event.error !== 'aborted') {
          setIsListening(false);
          isListeningRef.current = false;
        }
      };

      recognition.onstart = () => {
        setError(null);
        // Reset result index and committed interim ref when starting new recognition
        resultIndexRef.current = 0;
        lastCommittedInterimRef.current = null;
      };

      recognition.onend = () => {
        // If continuous mode and still listening, restart automatically
        if (continuous && isListeningRef.current) {
          try {
            // Reset result index for new recognition session
            resultIndexRef.current = 0;
            recognition.start();
          } catch (err) {
            console.error('[Speech Recognition] Error restarting:', err);
          }
        } else {
          setIsListening(false);
          setInterimTranscript('');
          resultIndexRef.current = 0;
        }
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
  }, [isSupported, continuous, lang, onTranscript, onInterimTranscript]);

  // Audio visualization using Web Audio API
  useEffect(() => {
    if (!enableAudioVisualization || !isListening || typeof window === 'undefined') {
      return;
    }

    const startAudioVisualization = async () => {
      try {
        // Get microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        // Create audio context and analyser
        const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextConstructor) {
          console.error('AudioContext not supported');
          return;
        }
        const audioContext = new AudioContextConstructor();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);

        analyser.fftSize = 128; // Smaller FFT for better performance
        source.connect(analyser);

        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        // Animation loop to update audio levels
        const updateAudioLevels = () => {
          if (!analyserRef.current || !isListening) {
            return;
          }

          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);

          // Convert to percentage and take subset for visualization (40 bars)
          const levels = Array.from(dataArray)
            .slice(0, 40)
            .map(value => (value / 255) * 100);

          setAudioLevels(levels);
          animationFrameRef.current = requestAnimationFrame(updateAudioLevels);
        };

        updateAudioLevels();
      } catch (error) {
        console.error('Error accessing microphone for visualization:', error);
      }
    };

    startAudioVisualization();

    return () => {
      // Cleanup audio visualization
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
      setAudioLevels([]);
    };
  }, [enableAudioVisualization, isListening]);

  const start = useCallback(() => {
    if (!recognitionRef.current || isListening)
      return;

    try {
      recognitionRef.current.start();
      setIsListening(true);
      isListeningRef.current = true;
      setError(null);
    } catch (err) {
      console.error('[Speech Recognition] Error starting:', err);
      setIsListening(false);
      isListeningRef.current = false;
      setError('Failed to start recording');
    }
  }, [isListening]);

  const stop = useCallback(() => {
    if (!recognitionRef.current || !isListening)
      return;

    // ✅ FIX: Commit any pending interim transcript before stopping
    // When user manually stops recording, treat current interim as final
    // to prevent losing the last spoken words
    const currentInterim = interimTranscript.trim();
    if (currentInterim && onTranscript) {
      // Store this committed text to prevent duplicate processing
      // if the speech API also finalizes the same text
      lastCommittedInterimRef.current = currentInterim;
      onTranscript(currentInterim);
    }

    // Clear interim display to show only finalized text
    setInterimTranscript('');

    // Stop listening flag AFTER committing interim to prevent race conditions
    isListeningRef.current = false;

    try {
      recognitionRef.current.stop();
    } catch (err) {
      console.error('[Speech Recognition] Error stopping:', err);
    }

    // Cleanup audio visualization
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    setAudioLevels([]);
    setIsListening(false);
  }, [isListening, interimTranscript, onTranscript]);

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
    audioLevels,
    interimTranscript,
    error,
  };
}
