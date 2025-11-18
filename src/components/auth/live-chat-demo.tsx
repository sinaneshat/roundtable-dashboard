'use client';

import { useEffect, useRef, useState } from 'react';

import { AnalysisStatuses } from '@/api/core/enums';
import type { ChatMessage, ChatParticipant } from '@/api/routes/chat/schema';
import { ThreadTimeline } from '@/components/chat/thread-timeline';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useThreadTimeline } from '@/hooks/utils';
import { chatMessagesToUIMessages } from '@/lib/utils/message-transforms';

import {
  MOCK_ANALYSIS,
  MOCK_PARTICIPANT_MESSAGES,
  MOCK_PARTICIPANTS,
  MOCK_PRE_SEARCH,
  MOCK_USER,
  MOCK_USER_MESSAGE,
} from './chat-showcase-data';

type Stage
  = | 'idle'
    | 'user-message'
    | 'pre-search-container-appearing'
    | 'pre-search-expanding'
    | 'pre-search-content-fading'
    | 'pre-search-streaming'
    | 'pre-search-collapsing'
    | 'pre-search-complete'
    | 'loading-indicator'
    | 'participant-0-container'
    | 'participant-0-streaming'
    | 'participant-0-complete'
    | 'participant-1-container'
    | 'participant-1-streaming'
    | 'participant-1-complete'
    | 'participant-2-container'
    | 'participant-2-streaming'
    | 'participant-2-complete'
    | 'analysis-container-appearing'
    | 'analysis-expanding'
    | 'analysis-content-fading'
    | 'analysis-streaming'
    | 'complete';

// Comprehensive typing animation state for ALL text sections
type StreamingText = {
  // Pre-search fields
  preSearchAnalysis: string;
  preSearchQuery0: string;
  preSearchQuery1: string;
  preSearchRationale0: string;
  preSearchRationale1: string;
  preSearchResult0Answer: string;
  preSearchResult1Answer: string;

  // Participant messages
  participant0: string;
  participant1: string;
  participant2: string;

  // Analysis fields - sequential typing
  analysisKeyInsight0: string;
  analysisKeyInsight1: string;
  analysisKeyInsight2: string;
  analysisConsensus0: string;
  analysisConsensus1: string;
  analysisParticipant0Pros0: string;
  analysisParticipant0Pros1: string;
  analysisParticipant0Cons0: string;
  analysisParticipant0Summary: string;
  analysisParticipant1Pros0: string;
  analysisParticipant1Pros1: string;
  analysisParticipant1Cons0: string;
  analysisParticipant1Summary: string;
  analysisParticipant2Pros0: string;
  analysisParticipant2Pros1: string;
  analysisParticipant2Cons0: string;
  analysisParticipant2Summary: string;
  analysisOverallSummary: string;
  analysisConclusion: string;
};

// Chars per frame for natural typing effect
const CHARS_PER_FRAME = 3;
const FRAME_INTERVAL = 15; // ms between character additions

export function LiveChatDemo() {
  const [stage, setStage] = useState<Stage>('idle');
  const [streamingText, setStreamingText] = useState<StreamingText>({
    preSearchAnalysis: '',
    preSearchQuery0: '',
    preSearchQuery1: '',
    preSearchRationale0: '',
    preSearchRationale1: '',
    preSearchResult0Answer: '',
    preSearchResult1Answer: '',
    participant0: '',
    participant1: '',
    participant2: '',
    analysisKeyInsight0: '',
    analysisKeyInsight1: '',
    analysisKeyInsight2: '',
    analysisConsensus0: '',
    analysisConsensus1: '',
    analysisParticipant0Pros0: '',
    analysisParticipant0Pros1: '',
    analysisParticipant0Cons0: '',
    analysisParticipant0Summary: '',
    analysisParticipant1Pros0: '',
    analysisParticipant1Pros1: '',
    analysisParticipant1Cons0: '',
    analysisParticipant1Summary: '',
    analysisParticipant2Pros0: '',
    analysisParticipant2Pros1: '',
    analysisParticipant2Cons0: '',
    analysisParticipant2Summary: '',
    analysisOverallSummary: '',
    analysisConclusion: '',
  });
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const intervalsRef = useRef<NodeJS.Timeout[]>([]);

  // Clear all timeouts and intervals on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      intervalsRef.current.forEach(clearInterval);
      timeoutsRef.current = [];
      intervalsRef.current = [];
    };
  }, []);

  // Stage progression - Sequential animation chain with looping
  useEffect(() => {
    const addTimeout = (fn: () => void, delay: number) => {
      // eslint-disable-next-line react-web-api/no-leaked-timeout -- Properly cleaned up in unmount effect
      const timeout = setTimeout(fn, delay);
      timeoutsRef.current.push(timeout);
      return timeout;
    };

    // Sequential animation timing chain
    if (stage === 'idle') {
      addTimeout(() => setStage('user-message'), 800);
    } else if (stage === 'user-message') {
      addTimeout(() => setStage('pre-search-container-appearing'), 600);
    } else if (stage === 'pre-search-container-appearing') {
      addTimeout(() => setStage('pre-search-expanding'), 300);
    } else if (stage === 'pre-search-expanding') {
      addTimeout(() => setStage('pre-search-content-fading'), 400);
    } else if (stage === 'pre-search-content-fading') {
      addTimeout(() => setStage('pre-search-streaming'), 200);
    } else if (stage === 'pre-search-complete') {
      addTimeout(() => setStage('loading-indicator'), 300);
    } else if (stage === 'loading-indicator') {
      addTimeout(() => setStage('participant-0-container'), 500);
    } else if (stage === 'participant-0-container') {
      addTimeout(() => setStage('participant-0-streaming'), 300);
    } else if (stage === 'participant-0-complete') {
      addTimeout(() => setStage('participant-1-container'), 300);
    } else if (stage === 'participant-1-container') {
      addTimeout(() => setStage('participant-1-streaming'), 300);
    } else if (stage === 'participant-1-complete') {
      addTimeout(() => setStage('participant-2-container'), 300);
    } else if (stage === 'participant-2-container') {
      addTimeout(() => setStage('participant-2-streaming'), 300);
    } else if (stage === 'participant-2-complete') {
      addTimeout(() => setStage('analysis-container-appearing'), 400);
    } else if (stage === 'analysis-container-appearing') {
      addTimeout(() => setStage('analysis-expanding'), 300);
    } else if (stage === 'analysis-expanding') {
      addTimeout(() => setStage('analysis-content-fading'), 400);
    } else if (stage === 'analysis-content-fading') {
      addTimeout(() => setStage('analysis-streaming'), 200);
    }
    // Animation complete - stay at 'complete' stage without looping

    // Cleanup function for this effect
    return () => {
      // Don't clear all refs here, just let them accumulate until unmount or reset
      // The main cleanup is in the unmount effect above
    };
  }, [stage]);

  // Typing animation for pre-search (queries → results → analysis)
  useEffect(() => {
    if (stage !== 'pre-search-streaming' || !MOCK_PRE_SEARCH.searchData)
      return;

    const queries = MOCK_PRE_SEARCH.searchData.queries;
    const results = MOCK_PRE_SEARCH.searchData.results;
    const analysis = MOCK_PRE_SEARCH.searchData.analysis;

    let currentStep = 0;
    const activeIntervals: NodeJS.Timeout[] = [];

    const steps = [
      { key: 'preSearchQuery0', text: queries[0]?.query || '' },
      { key: 'preSearchRationale0', text: queries[0]?.rationale || '' },
      { key: 'preSearchQuery1', text: queries[1]?.query || '' },
      { key: 'preSearchRationale1', text: queries[1]?.rationale || '' },
      { key: 'preSearchResult0Answer', text: results[0]?.answer || '' },
      { key: 'preSearchResult1Answer', text: results[1]?.answer || '' },
      { key: 'preSearchAnalysis', text: analysis },
    ];

    const typeNextStep = () => {
      if (currentStep >= steps.length) {
        // eslint-disable-next-line react-web-api/no-leaked-timeout -- Properly cleaned up in unmount effect
        const timeout = setTimeout(() => setStage('pre-search-complete'), 500);
        timeoutsRef.current.push(timeout);
        return;
      }

      const step = steps[currentStep];
      if (!step)
        return;
      let charIndex = 0;

      const interval = setInterval(() => {
        if (charIndex < step.text.length) {
          charIndex = Math.min(charIndex + CHARS_PER_FRAME, step.text.length);
          setStreamingText(prev => ({
            ...prev,
            [step.key]: step.text.slice(0, charIndex),
          }));
        } else {
          clearInterval(interval);
          const idx = activeIntervals.indexOf(interval);
          if (idx > -1) {
            activeIntervals.splice(idx, 1);
          }
          currentStep++;
          typeNextStep();
        }
      }, FRAME_INTERVAL);

      activeIntervals.push(interval);
      intervalsRef.current.push(interval);
    };

    typeNextStep();

    return () => {
      activeIntervals.forEach(clearInterval);
    };
  }, [stage]);

  // Typing animation for participant 0
  useEffect(() => {
    if (stage !== 'participant-0-streaming')
      return;

    const message = MOCK_PARTICIPANT_MESSAGES[0];
    const fullText = message?.parts[0]?.type === 'text' ? message.parts[0].text : '';
    let charIndex = 0;
    let interval: NodeJS.Timeout | null = null;

    interval = setInterval(() => {
      if (charIndex < fullText.length) {
        charIndex = Math.min(charIndex + CHARS_PER_FRAME, fullText.length);
        setStreamingText(prev => ({
          ...prev,
          participant0: fullText.slice(0, charIndex),
        }));
      } else {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
        // eslint-disable-next-line react-web-api/no-leaked-timeout -- Properly cleaned up in unmount effect
        const timeout = setTimeout(() => setStage('participant-0-complete'), 500);
        timeoutsRef.current.push(timeout);
      }
    }, FRAME_INTERVAL);

    intervalsRef.current.push(interval);
    return () => {
      if (interval)
        clearInterval(interval);
    };
  }, [stage]);

  // Typing animation for participant 1
  useEffect(() => {
    if (stage !== 'participant-1-streaming')
      return;

    const message = MOCK_PARTICIPANT_MESSAGES[1];
    const fullText = message?.parts[0]?.type === 'text' ? message.parts[0].text : '';
    let charIndex = 0;
    let interval: NodeJS.Timeout | null = null;

    interval = setInterval(() => {
      if (charIndex < fullText.length) {
        charIndex = Math.min(charIndex + CHARS_PER_FRAME, fullText.length);
        setStreamingText(prev => ({
          ...prev,
          participant1: fullText.slice(0, charIndex),
        }));
      } else {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
        // eslint-disable-next-line react-web-api/no-leaked-timeout -- Properly cleaned up in unmount effect
        const timeout = setTimeout(() => setStage('participant-1-complete'), 500);
        timeoutsRef.current.push(timeout);
      }
    }, FRAME_INTERVAL);

    intervalsRef.current.push(interval);
    return () => {
      if (interval)
        clearInterval(interval);
    };
  }, [stage]);

  // Typing animation for participant 2
  useEffect(() => {
    if (stage !== 'participant-2-streaming')
      return;

    const message = MOCK_PARTICIPANT_MESSAGES[2];
    const fullText = message?.parts[0]?.type === 'text' ? message.parts[0].text : '';
    let charIndex = 0;
    let interval: NodeJS.Timeout | null = null;

    interval = setInterval(() => {
      if (charIndex < fullText.length) {
        charIndex = Math.min(charIndex + CHARS_PER_FRAME, fullText.length);
        setStreamingText(prev => ({
          ...prev,
          participant2: fullText.slice(0, charIndex),
        }));
      } else {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
        // eslint-disable-next-line react-web-api/no-leaked-timeout -- Properly cleaned up in unmount effect
        const timeout = setTimeout(() => setStage('participant-2-complete'), 500);
        timeoutsRef.current.push(timeout);
      }
    }, FRAME_INTERVAL);

    intervalsRef.current.push(interval);
    return () => {
      if (interval)
        clearInterval(interval);
    };
  }, [stage]);

  // Typing animation for analysis (key insights → consensus → participant analyses → summary → conclusion)
  useEffect(() => {
    if (stage !== 'analysis-streaming' || !MOCK_ANALYSIS.analysisData?.roundSummary)
      return;

    const summary = MOCK_ANALYSIS.analysisData.roundSummary;
    const participantAnalyses = MOCK_ANALYSIS.analysisData.participantAnalyses || [];

    let currentStep = 0;
    const activeIntervals: NodeJS.Timeout[] = [];

    const steps = [
      // Key insights
      { key: 'analysisKeyInsight0', text: summary.keyInsights?.[0] || '' },
      { key: 'analysisKeyInsight1', text: summary.keyInsights?.[1] || '' },
      { key: 'analysisKeyInsight2', text: summary.keyInsights?.[2] || '' },
      // Consensus points
      { key: 'analysisConsensus0', text: summary.consensusPoints?.[0] || '' },
      { key: 'analysisConsensus1', text: summary.consensusPoints?.[1] || '' },
      // Participant 0 analysis
      { key: 'analysisParticipant0Pros0', text: participantAnalyses[0]?.pros?.[0] || '' },
      { key: 'analysisParticipant0Pros1', text: participantAnalyses[0]?.pros?.[1] || '' },
      { key: 'analysisParticipant0Cons0', text: participantAnalyses[0]?.cons?.[0] || '' },
      { key: 'analysisParticipant0Summary', text: participantAnalyses[0]?.summary || '' },
      // Participant 1 analysis
      { key: 'analysisParticipant1Pros0', text: participantAnalyses[1]?.pros?.[0] || '' },
      { key: 'analysisParticipant1Pros1', text: participantAnalyses[1]?.pros?.[1] || '' },
      { key: 'analysisParticipant1Cons0', text: participantAnalyses[1]?.cons?.[0] || '' },
      { key: 'analysisParticipant1Summary', text: participantAnalyses[1]?.summary || '' },
      // Participant 2 analysis
      { key: 'analysisParticipant2Pros0', text: participantAnalyses[2]?.pros?.[0] || '' },
      { key: 'analysisParticipant2Pros1', text: participantAnalyses[2]?.pros?.[1] || '' },
      { key: 'analysisParticipant2Cons0', text: participantAnalyses[2]?.cons?.[0] || '' },
      { key: 'analysisParticipant2Summary', text: participantAnalyses[2]?.summary || '' },
      // Overall summary and conclusion
      { key: 'analysisOverallSummary', text: summary.overallSummary },
      { key: 'analysisConclusion', text: summary.conclusion },
    ];

    const typeNextStep = () => {
      if (currentStep >= steps.length) {
        // eslint-disable-next-line react-web-api/no-leaked-timeout -- Properly cleaned up in unmount effect
        const timeout = setTimeout(() => setStage('complete'), 500);
        timeoutsRef.current.push(timeout);
        return;
      }

      const step = steps[currentStep];
      if (!step || !step.text) {
        currentStep++;
        typeNextStep();
        return;
      }

      let charIndex = 0;

      const interval = setInterval(() => {
        if (charIndex < step.text.length) {
          charIndex = Math.min(charIndex + CHARS_PER_FRAME, step.text.length);
          setStreamingText(prev => ({
            ...prev,
            [step.key]: step.text.slice(0, charIndex),
          }));
        } else {
          clearInterval(interval);
          const idx = activeIntervals.indexOf(interval);
          if (idx > -1) {
            activeIntervals.splice(idx, 1);
          }
          currentStep++;
          typeNextStep();
        }
      }, FRAME_INTERVAL);

      activeIntervals.push(interval);
      intervalsRef.current.push(interval);
    };

    typeNextStep();

    return () => {
      activeIntervals.forEach(clearInterval);
    };
  }, [stage]);

  // Smooth scroll to bottom when new content appears (but preserve user scroll)
  const isUserScrollingRef = useRef(false);
  const lastStageRef = useRef<Stage>(stage);

  useEffect(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport)
      return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      isUserScrollingRef.current = !isNearBottom;
    };

    viewport.addEventListener('scroll', handleScroll);
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll smoothly when stage changes (only if user hasn't scrolled away)
  useEffect(() => {
    if (lastStageRef.current === stage)
      return;
    lastStageRef.current = stage;

    const viewport = scrollViewportRef.current;
    if (!viewport || isUserScrollingRef.current)
      return;

    // Smooth scroll to bottom with a slight delay to allow content to render
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: 'smooth',
        });
      });
    });
  }, [stage]);

  // Build messages array based on current stage
  const messages: ChatMessage[] = [];

  // User message - show after idle
  if (stage !== 'idle') {
    messages.push({
      id: MOCK_USER_MESSAGE.id,
      threadId: 'demo-thread',
      participantId: null,
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: MOCK_USER_MESSAGE.content }],
      roundNumber: 1,
      createdAt: new Date(),
      metadata: MOCK_USER_MESSAGE.metadata,
    });
  }

  // Participant messages with sequential appearance and streaming
  const participantStages: Stage[] = [
    'participant-0-container',
    'participant-0-streaming',
    'participant-0-complete',
    'participant-1-container',
    'participant-1-streaming',
    'participant-1-complete',
    'participant-2-container',
    'participant-2-streaming',
    'participant-2-complete',
    'analysis-container-appearing',
    'analysis-expanding',
    'analysis-content-fading',
    'analysis-streaming',
    'complete',
  ];

  if (participantStages.includes(stage)) {
    const participantKeys = ['participant0', 'participant1', 'participant2'] as const;

    // Add participants based on current stage (sequential appearance)
    participantKeys.forEach((key, idx) => {
      const containerStage = `participant-${idx}-container` as Stage;
      const streamingStage = `participant-${idx}-streaming` as Stage;
      const completeStage = `participant-${idx}-complete` as Stage;

      const containerIndex = participantStages.indexOf(containerStage);
      const currentIndex = participantStages.indexOf(stage);

      // Show participant if current stage is at or past their container stage
      if (currentIndex >= containerIndex) {
        const mockMsg = MOCK_PARTICIPANT_MESSAGES[idx];
        if (!mockMsg)
          return;

        // Determine text based on streaming state
        const isStreaming = stage === streamingStage;
        const isComplete = currentIndex > participantStages.indexOf(completeStage);

        const text = isStreaming
          ? streamingText[key]
          : isComplete || stage === completeStage
            ? mockMsg.parts[0]?.type === 'text'
              ? mockMsg.parts[0].text
              : ''
            : ''; // Container visible but no text yet

        messages.push({
          id: mockMsg.id,
          threadId: 'demo-thread',
          participantId: `participant-${idx}`,
          role: mockMsg.role,
          parts: [{ type: 'text' as const, text }],
          roundNumber: 1,
          createdAt: new Date(),
          metadata: mockMsg.metadata,
        });
      }
    });
  }

  // Store participants
  const storeParticipants: ChatParticipant[] = MOCK_PARTICIPANTS.map((p, idx) => ({
    id: `participant-${idx}`,
    threadId: 'demo-thread',
    modelId: p.modelId,
    customRoleId: null,
    role: p.role,
    priority: idx,
    isEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    settings: null,
  }));

  // Pre-search with streaming status and controlled visibility
  const showPreSearch = ![
    'idle',
    'user-message',
  ].includes(stage);

  // Accordion control states - keep open after completion
  const preSearchIsOpen = [
    'pre-search-expanding',
    'pre-search-content-fading',
    'pre-search-streaming',
    'pre-search-complete',
    'pre-search-collapsing',
    'loading-indicator',
    'participant-0-container',
    'participant-0-streaming',
    'participant-0-complete',
    'participant-1-container',
    'participant-1-streaming',
    'participant-1-complete',
    'participant-2-container',
    'participant-2-streaming',
    'participant-2-complete',
    'analysis-container-appearing',
    'analysis-expanding',
    'analysis-content-fading',
    'analysis-streaming',
    'complete',
  ].includes(stage);

  const preSearchShowContent = [
    'pre-search-content-fading',
    'pre-search-streaming',
    'pre-search-complete',
    'pre-search-collapsing',
    'loading-indicator',
    'participant-0-container',
    'participant-0-streaming',
    'participant-0-complete',
    'participant-1-container',
    'participant-1-streaming',
    'participant-1-complete',
    'participant-2-container',
    'participant-2-streaming',
    'participant-2-complete',
    'analysis-container-appearing',
    'analysis-expanding',
    'analysis-content-fading',
    'analysis-streaming',
    'complete',
  ].includes(stage);

  const preSearchWithStreamingData = showPreSearch && MOCK_PRE_SEARCH.searchData
    ? {
        ...MOCK_PRE_SEARCH,
        status: stage === 'pre-search-streaming' ? AnalysisStatuses.STREAMING : AnalysisStatuses.COMPLETE,
        searchData: preSearchShowContent
          ? {
              queries: [
                {
                  ...MOCK_PRE_SEARCH.searchData.queries[0]!,
                  query: streamingText.preSearchQuery0 || MOCK_PRE_SEARCH.searchData.queries[0]!.query,
                  rationale: streamingText.preSearchRationale0 || MOCK_PRE_SEARCH.searchData.queries[0]!.rationale,
                },
                {
                  ...MOCK_PRE_SEARCH.searchData.queries[1]!,
                  query: streamingText.preSearchQuery1 || MOCK_PRE_SEARCH.searchData.queries[1]!.query,
                  rationale: streamingText.preSearchRationale1 || MOCK_PRE_SEARCH.searchData.queries[1]!.rationale,
                },
              ],
              results: [
                {
                  ...MOCK_PRE_SEARCH.searchData.results[0]!,
                  answer: streamingText.preSearchResult0Answer || MOCK_PRE_SEARCH.searchData.results[0]!.answer,
                },
                {
                  ...MOCK_PRE_SEARCH.searchData.results[1]!,
                  answer: streamingText.preSearchResult1Answer || MOCK_PRE_SEARCH.searchData.results[1]!.answer,
                },
              ],
              analysis: streamingText.preSearchAnalysis || MOCK_PRE_SEARCH.searchData.analysis,
              successCount: MOCK_PRE_SEARCH.searchData.successCount,
              failureCount: MOCK_PRE_SEARCH.searchData.failureCount,
              totalResults: MOCK_PRE_SEARCH.searchData.totalResults,
              totalTime: MOCK_PRE_SEARCH.searchData.totalTime,
            }
          : undefined,
      }
    : null;

  // Analysis with streaming text and controlled visibility
  const showAnalysis = [
    'analysis-container-appearing',
    'analysis-expanding',
    'analysis-content-fading',
    'analysis-streaming',
    'complete',
  ].includes(stage);

  const analysisIsOpen = [
    'analysis-expanding',
    'analysis-content-fading',
    'analysis-streaming',
    'complete',
  ].includes(stage);

  const analysisShowContent = [
    'analysis-content-fading',
    'analysis-streaming',
    'complete',
  ].includes(stage);

  const analysisWithStreamingText = showAnalysis && MOCK_ANALYSIS.analysisData
    ? {
        ...MOCK_ANALYSIS,
        status: stage === 'analysis-streaming' ? AnalysisStatuses.STREAMING : AnalysisStatuses.COMPLETE,
        analysisData: analysisShowContent
          ? {
              ...MOCK_ANALYSIS.analysisData,
              roundSummary: {
                ...MOCK_ANALYSIS.analysisData.roundSummary,
                keyInsights: [
                  streamingText.analysisKeyInsight0 || MOCK_ANALYSIS.analysisData.roundSummary.keyInsights[0] || '',
                  streamingText.analysisKeyInsight1 || MOCK_ANALYSIS.analysisData.roundSummary.keyInsights[1] || '',
                  streamingText.analysisKeyInsight2 || MOCK_ANALYSIS.analysisData.roundSummary.keyInsights[2] || '',
                  ...MOCK_ANALYSIS.analysisData.roundSummary.keyInsights.slice(3),
                ].filter(text => text.length > 0),
                consensusPoints: [
                  streamingText.analysisConsensus0 || MOCK_ANALYSIS.analysisData.roundSummary.consensusPoints[0] || '',
                  streamingText.analysisConsensus1 || MOCK_ANALYSIS.analysisData.roundSummary.consensusPoints[1] || '',
                  ...MOCK_ANALYSIS.analysisData.roundSummary.consensusPoints.slice(2),
                ].filter(text => text.length > 0),
                overallSummary: streamingText.analysisOverallSummary || MOCK_ANALYSIS.analysisData.roundSummary.overallSummary,
                conclusion: streamingText.analysisConclusion || MOCK_ANALYSIS.analysisData.roundSummary.conclusion,
                divergentApproaches: MOCK_ANALYSIS.analysisData.roundSummary.divergentApproaches,
                comparativeAnalysis: MOCK_ANALYSIS.analysisData.roundSummary.comparativeAnalysis,
                decisionFramework: MOCK_ANALYSIS.analysisData.roundSummary.decisionFramework,
                recommendedActions: MOCK_ANALYSIS.analysisData.roundSummary.recommendedActions,
              },
              participantAnalyses: MOCK_ANALYSIS.analysisData.participantAnalyses.map((p, idx) => ({
                ...p,
                pros: idx === 0
                  ? [
                      streamingText.analysisParticipant0Pros0 || p.pros[0] || '',
                      streamingText.analysisParticipant0Pros1 || p.pros[1] || '',
                      ...p.pros.slice(2),
                    ].filter(text => text.length > 0)
                  : idx === 1
                    ? [
                        streamingText.analysisParticipant1Pros0 || p.pros[0] || '',
                        streamingText.analysisParticipant1Pros1 || p.pros[1] || '',
                        ...p.pros.slice(2),
                      ].filter(text => text.length > 0)
                    : [
                        streamingText.analysisParticipant2Pros0 || p.pros[0] || '',
                        streamingText.analysisParticipant2Pros1 || p.pros[1] || '',
                        ...p.pros.slice(2),
                      ].filter(text => text.length > 0),
                cons: idx === 0
                  ? [streamingText.analysisParticipant0Cons0 || p.cons[0] || ''].filter(text => text.length > 0)
                  : idx === 1
                    ? [streamingText.analysisParticipant1Cons0 || p.cons[0] || ''].filter(text => text.length > 0)
                    : [streamingText.analysisParticipant2Cons0 || p.cons[0] || ''].filter(text => text.length > 0),
                summary: idx === 0
                  ? (streamingText.analysisParticipant0Summary || p.summary)
                  : idx === 1
                    ? (streamingText.analysisParticipant1Summary || p.summary)
                    : (streamingText.analysisParticipant2Summary || p.summary),
              })),
              leaderboard: MOCK_ANALYSIS.analysisData.leaderboard,
            }
          : undefined,
      }
    : null;

  // Convert to UIMessages and build timeline
  const participantContext = MOCK_PARTICIPANTS.map((p, idx) => ({
    id: `participant-${idx}`,
    modelId: p.modelId,
    role: p.role,
  }));

  const uiMessages = chatMessagesToUIMessages(messages, participantContext);

  const timelineItems = useThreadTimeline({
    messages: uiMessages,
    analyses: analysisWithStreamingText ? [analysisWithStreamingText] : [],
    changelog: [],
  });

  // Determine current streaming participant
  const currentStreamingIndex = stage === 'participant-0-streaming'
    ? 0
    : stage === 'participant-1-streaming'
      ? 1
      : stage === 'participant-2-streaming'
        ? 2
        : null;

  const isStreaming = currentStreamingIndex !== null;

  return (
    <div className="flex flex-col h-svh relative">
      <ScrollArea className="h-full" ref={scrollViewportRef}>
        <div className="container max-w-3xl mx-auto px-4 sm:px-6 pt-6 pb-[240px]">
          {stage !== 'idle' && (
            <ThreadTimeline
              timelineItems={timelineItems}
              scrollContainerId="demo-scroll-container"
              user={MOCK_USER}
              participants={storeParticipants}
              threadId="demo-thread"
              isStreaming={isStreaming}
              currentParticipantIndex={currentStreamingIndex ?? 0}
              currentStreamingParticipant={
                currentStreamingIndex !== null ? storeParticipants[currentStreamingIndex] ?? null : null
              }
              streamingRoundNumber={1}
              preSearches={preSearchWithStreamingData ? [preSearchWithStreamingData] : []}
              isReadOnly={true}
              // Controlled accordion states for demo
              demoPreSearchOpen={preSearchIsOpen}
              demoAnalysisOpen={analysisIsOpen}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
