import { useCallback, useEffect, useRef, useState } from 'react';

import { useIsMounted } from './use-is-mounted';

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
  resultIndex: number;
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

type SpeechRecognitionWindow = {
  SpeechRecognition?: new () => SpeechRecognition;
  webkitSpeechRecognition?: new () => SpeechRecognition;
  AudioContext?: new () => AudioContext;
  webkitAudioContext?: new () => AudioContext;
};

function getWindowSpeechAPIs(): SpeechRecognitionWindow {
  if (typeof window === 'undefined') {
    return {};
  }
  // BROWSER API ACCESS: SpeechRecognition/webkitSpeechRecognition are vendor-prefixed
  // browser APIs not in standard TypeScript Window type definitions.
  const win = window as unknown as SpeechRecognitionWindow;
  return {
    SpeechRecognition: win.SpeechRecognition,
    webkitSpeechRecognition: win.webkitSpeechRecognition,
    AudioContext: win.AudioContext,
    webkitAudioContext: win.webkitAudioContext,
  };
}

function getSpeechRecognitionConstructor(): (new () => SpeechRecognition) | null {
  const apis = getWindowSpeechAPIs();
  return apis.SpeechRecognition ?? apis.webkitSpeechRecognition ?? null;
}

function getAudioContextConstructor(): (new () => AudioContext) | null {
  const apis = getWindowSpeechAPIs();
  return apis.AudioContext ?? apis.webkitAudioContext ?? null;
}

export type UseSpeechRecognitionOptions = {
  lang?: string;
  continuous?: boolean;
  enableAudioVisualization?: boolean;
};

export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}) {
  const { lang = 'en-US', continuous = true, enableAudioVisualization = true } = options;

  const [isListening, setIsListening] = useState(false);
  const isMounted = useIsMounted();
  const [audioLevels, setAudioLevels] = useState<number[]>([]);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const isListeningRef = useRef(false);
  const sessionFinalTranscriptRef = useRef('');

  const isSupported = isMounted && getSpeechRecognitionConstructor() !== null;

  useEffect(() => {
    if (!isSupported)
      return;

    const SpeechRecognitionAPI = getSpeechRecognitionConstructor();
    if (!SpeechRecognitionAPI)
      return;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event) => {
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result?.[0])
          continue;

        const transcript = result[0].transcript;

        if (result.isFinal) {
          if (sessionFinalTranscriptRef.current) {
            const needsSpace = !sessionFinalTranscriptRef.current.endsWith(' ');
            sessionFinalTranscriptRef.current = needsSpace
              ? `${sessionFinalTranscriptRef.current} ${transcript}`
              : `${sessionFinalTranscriptRef.current}${transcript}`;
          } else {
            sessionFinalTranscriptRef.current = transcript;
          }
          setFinalTranscript(sessionFinalTranscriptRef.current);
        } else {
          interim += transcript;
        }
      }

      setInterimTranscript(interim);
    };

    recognition.onerror = (event) => {
      console.error('[Speech Recognition] Error:', event.error, event.message);
      setError(event.error);

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
      setInterimTranscript('');
    };

    recognition.onend = () => {
      if (continuous && isListeningRef.current) {
        try {
          recognition.start();
        } catch (err) {
          console.error('[Speech Recognition] Error restarting:', err);
        }
      } else {
        setIsListening(false);
        setInterimTranscript('');
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore cleanup errors
        }
      }
    };
  }, [isSupported, continuous, lang]);

  useEffect(() => {
    if (!enableAudioVisualization || !isListening || typeof window === 'undefined')
      return;

    const startAudioVisualization = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        const AudioContextCtor = getAudioContextConstructor();
        if (!AudioContextCtor) {
          console.error('AudioContext not supported');
          return;
        }
        const audioContext = new AudioContextCtor();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);

        analyser.fftSize = 128;
        source.connect(analyser);

        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        const updateAudioLevels = () => {
          if (!analyserRef.current || !isListening)
            return;

          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);

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

    isListeningRef.current = false;

    try {
      recognitionRef.current.stop();
    } catch (err) {
      console.error('[Speech Recognition] Error stopping:', err);
    }

    setInterimTranscript('');

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
  }, [isListening]);

  const toggle = useCallback(() => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  }, [isListening, start, stop]);

  const reset = useCallback(() => {
    sessionFinalTranscriptRef.current = '';
    setFinalTranscript('');
    setInterimTranscript('');
  }, []);

  return {
    isListening,
    isSupported,
    start,
    stop,
    toggle,
    reset,
    audioLevels,
    interimTranscript,
    finalTranscript,
    error,
  };
}
