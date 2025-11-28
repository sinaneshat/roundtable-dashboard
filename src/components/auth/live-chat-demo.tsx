'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { AnalysisStatuses, ConfidenceWeightings, MessagePartTypes } from '@/api/core/enums';
import type { ChatMessage, ChatParticipant } from '@/api/routes/chat/schema';
import { ThreadTimeline } from '@/components/chat/thread-timeline';
import { UnifiedLoadingIndicator } from '@/components/chat/unified-loading-indicator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useThreadTimeline } from '@/hooks/utils';
import { TYPING_CHARS_PER_FRAME, TYPING_FRAME_INTERVAL } from '@/lib/ui/animations';
import { chatMessagesToUIMessages } from '@/lib/utils/message-transforms';

import {
  MOCK_ANALYSIS,
  MOCK_PARTICIPANT_MESSAGES,
  MOCK_PARTICIPANTS,
  MOCK_PRE_SEARCH,
  MOCK_USER,
  MOCK_USER_MESSAGE,
} from './chat-showcase-data';

// ============================================================================
// ENUM-BASED PATTERN: Demo Stages
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for stage values (prefixed with _ as only used for type derivation)
const _DEMO_STAGES = [
  'idle',
  'user-message',
  'pre-search-container-appearing',
  'pre-search-expanding',
  'pre-search-content-fading',
  'pre-search-streaming',
  'pre-search-collapsing',
  'pre-search-complete',
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
] as const;

// 2️⃣ TYPESCRIPT TYPE - Inferred from array constant
type Stage = (typeof _DEMO_STAGES)[number];

// 3️⃣ CONSTANT OBJECT - For type-safe usage in code (prevents typos)
const DemoStages = {
  IDLE: 'idle',
  USER_MESSAGE: 'user-message',
  PRE_SEARCH_CONTAINER_APPEARING: 'pre-search-container-appearing',
  PRE_SEARCH_EXPANDING: 'pre-search-expanding',
  PRE_SEARCH_CONTENT_FADING: 'pre-search-content-fading',
  PRE_SEARCH_STREAMING: 'pre-search-streaming',
  PRE_SEARCH_COLLAPSING: 'pre-search-collapsing',
  PRE_SEARCH_COMPLETE: 'pre-search-complete',
  LOADING_INDICATOR: 'loading-indicator',
  PARTICIPANT_0_CONTAINER: 'participant-0-container',
  PARTICIPANT_0_STREAMING: 'participant-0-streaming',
  PARTICIPANT_0_COMPLETE: 'participant-0-complete',
  PARTICIPANT_1_CONTAINER: 'participant-1-container',
  PARTICIPANT_1_STREAMING: 'participant-1-streaming',
  PARTICIPANT_1_COMPLETE: 'participant-1-complete',
  PARTICIPANT_2_CONTAINER: 'participant-2-container',
  PARTICIPANT_2_STREAMING: 'participant-2-streaming',
  PARTICIPANT_2_COMPLETE: 'participant-2-complete',
  ANALYSIS_CONTAINER_APPEARING: 'analysis-container-appearing',
  ANALYSIS_EXPANDING: 'analysis-expanding',
  ANALYSIS_CONTENT_FADING: 'analysis-content-fading',
  ANALYSIS_STREAMING: 'analysis-streaming',
  COMPLETE: 'complete',
} as const satisfies Record<string, Stage>;

// 4️⃣ STAGE GROUP CONSTANTS - Reusable stage checks (code reduction)
const PARTICIPANT_STAGES: readonly Stage[] = [
  DemoStages.PARTICIPANT_0_CONTAINER,
  DemoStages.PARTICIPANT_0_STREAMING,
  DemoStages.PARTICIPANT_0_COMPLETE,
  DemoStages.PARTICIPANT_1_CONTAINER,
  DemoStages.PARTICIPANT_1_STREAMING,
  DemoStages.PARTICIPANT_1_COMPLETE,
  DemoStages.PARTICIPANT_2_CONTAINER,
  DemoStages.PARTICIPANT_2_STREAMING,
  DemoStages.PARTICIPANT_2_COMPLETE,
  DemoStages.ANALYSIS_CONTAINER_APPEARING,
  DemoStages.ANALYSIS_EXPANDING,
  DemoStages.ANALYSIS_CONTENT_FADING,
  DemoStages.ANALYSIS_STREAMING,
  DemoStages.COMPLETE,
] as const;

const PRE_SEARCH_OPEN_STAGES: readonly Stage[] = [
  DemoStages.PRE_SEARCH_EXPANDING,
  DemoStages.PRE_SEARCH_CONTENT_FADING,
  DemoStages.PRE_SEARCH_STREAMING,
  DemoStages.PRE_SEARCH_COMPLETE,
  DemoStages.PRE_SEARCH_COLLAPSING,
  DemoStages.LOADING_INDICATOR,
  ...PARTICIPANT_STAGES,
] as const;

const PRE_SEARCH_CONTENT_STAGES: readonly Stage[] = [
  DemoStages.PRE_SEARCH_CONTENT_FADING,
  DemoStages.PRE_SEARCH_STREAMING,
  DemoStages.PRE_SEARCH_COMPLETE,
  DemoStages.PRE_SEARCH_COLLAPSING,
  DemoStages.LOADING_INDICATOR,
  ...PARTICIPANT_STAGES,
] as const;

const ANALYSIS_VISIBLE_STAGES: readonly Stage[] = [
  DemoStages.ANALYSIS_CONTAINER_APPEARING,
  DemoStages.ANALYSIS_EXPANDING,
  DemoStages.ANALYSIS_CONTENT_FADING,
  DemoStages.ANALYSIS_STREAMING,
  DemoStages.COMPLETE,
] as const;

const ANALYSIS_OPEN_STAGES: readonly Stage[] = [
  DemoStages.ANALYSIS_EXPANDING,
  DemoStages.ANALYSIS_CONTENT_FADING,
  DemoStages.ANALYSIS_STREAMING,
  DemoStages.COMPLETE,
] as const;

const ANALYSIS_CONTENT_STAGES: readonly Stage[] = [
  DemoStages.ANALYSIS_CONTENT_FADING,
  DemoStages.ANALYSIS_STREAMING,
  DemoStages.COMPLETE,
] as const;

// ============================================================================
// STREAMING TEXT TYPE
// ============================================================================

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
  // Pre-search website results (individual items)
  preSearchResult0Site0Title: string;
  preSearchResult0Site0Content: string;
  preSearchResult0Site1Title: string;
  preSearchResult0Site1Content: string;
  preSearchResult1Site0Title: string;
  preSearchResult1Site0Content: string;

  // Participant messages
  participant0: string;
  participant1: string;
  participant2: string;

  // Analysis fields - Multi-AI Deliberation Framework
  // Key Insights & Summary
  analysisSummary: string;
  // Recommendations
  analysisRecommendation0Title: string;
  analysisRecommendation0Desc: string;
  analysisRecommendation1Title: string;
  analysisRecommendation1Desc: string;
  // Contributor Perspectives - Stances
  analysisContributor0Stance: string;
  analysisContributor1Stance: string;
  analysisContributor2Stance: string;
  // Contributor Evidence
  analysisContributor0Evidence0: string;
  analysisContributor0Evidence1: string;
  analysisContributor1Evidence0: string;
  analysisContributor1Evidence1: string;
  analysisContributor2Evidence0: string;
  analysisContributor2Evidence1: string;
  // Consensus Analysis - Agreement Heatmap
  analysisConsensusClaim0: string;
  analysisConsensusClaim1: string;
  analysisConsensusClaim2: string;
  // Evidence & Reasoning - Reasoning Threads
  analysisReasoningClaim0: string;
  analysisReasoningSynthesis0: string;
  analysisReasoningClaim1: string;
  analysisReasoningSynthesis1: string;
  // Explore Alternatives
  analysisAlternative0: string;
  analysisAlternative1: string;
  analysisAlternative2: string;
  // Round Summary
  analysisRoundSummaryThemes: string;
  analysisRoundSummaryQuestion0: string;
  analysisRoundSummaryQuestion1: string;
};

// Initial streaming text state
const INITIAL_STREAMING_TEXT: StreamingText = {
  preSearchAnalysis: '',
  preSearchQuery0: '',
  preSearchQuery1: '',
  preSearchRationale0: '',
  preSearchRationale1: '',
  preSearchResult0Answer: '',
  preSearchResult1Answer: '',
  // Pre-search website results
  preSearchResult0Site0Title: '',
  preSearchResult0Site0Content: '',
  preSearchResult0Site1Title: '',
  preSearchResult0Site1Content: '',
  preSearchResult1Site0Title: '',
  preSearchResult1Site0Content: '',
  participant0: '',
  participant1: '',
  participant2: '',
  // Analysis - Multi-AI Deliberation Framework
  analysisSummary: '',
  analysisRecommendation0Title: '',
  analysisRecommendation0Desc: '',
  analysisRecommendation1Title: '',
  analysisRecommendation1Desc: '',
  analysisContributor0Stance: '',
  analysisContributor1Stance: '',
  analysisContributor2Stance: '',
  analysisContributor0Evidence0: '',
  analysisContributor0Evidence1: '',
  analysisContributor1Evidence0: '',
  analysisContributor1Evidence1: '',
  analysisContributor2Evidence0: '',
  analysisContributor2Evidence1: '',
  analysisConsensusClaim0: '',
  analysisConsensusClaim1: '',
  analysisConsensusClaim2: '',
  analysisReasoningClaim0: '',
  analysisReasoningSynthesis0: '',
  analysisReasoningClaim1: '',
  analysisReasoningSynthesis1: '',
  analysisAlternative0: '',
  analysisAlternative1: '',
  analysisAlternative2: '',
  analysisRoundSummaryThemes: '',
  analysisRoundSummaryQuestion0: '',
  analysisRoundSummaryQuestion1: '',
};

export function LiveChatDemo() {
  const [stage, setStage] = useState<Stage>(DemoStages.IDLE);
  const [streamingText, setStreamingText] = useState<StreamingText>(INITIAL_STREAMING_TEXT);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const intervalsRef = useRef<NodeJS.Timeout[]>([]);

  // ✅ SCROLL STATE: Track sticky state like useChatScroll
  const isAtBottomRef = useRef(true);
  const isProgrammaticScrollRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const scrollThrottleRef = useRef(0);

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

    // Sequential animation timing chain using DemoStages constants
    if (stage === DemoStages.IDLE) {
      addTimeout(() => setStage(DemoStages.USER_MESSAGE), 800);
    } else if (stage === DemoStages.USER_MESSAGE) {
      addTimeout(() => setStage(DemoStages.PRE_SEARCH_CONTAINER_APPEARING), 600);
    } else if (stage === DemoStages.PRE_SEARCH_CONTAINER_APPEARING) {
      addTimeout(() => setStage(DemoStages.PRE_SEARCH_EXPANDING), 300);
    } else if (stage === DemoStages.PRE_SEARCH_EXPANDING) {
      addTimeout(() => setStage(DemoStages.PRE_SEARCH_CONTENT_FADING), 400);
    } else if (stage === DemoStages.PRE_SEARCH_CONTENT_FADING) {
      addTimeout(() => setStage(DemoStages.PRE_SEARCH_STREAMING), 200);
    } else if (stage === DemoStages.PRE_SEARCH_COMPLETE) {
      addTimeout(() => setStage(DemoStages.LOADING_INDICATOR), 300);
    } else if (stage === DemoStages.LOADING_INDICATOR) {
      addTimeout(() => setStage(DemoStages.PARTICIPANT_0_CONTAINER), 500);
    } else if (stage === DemoStages.PARTICIPANT_0_CONTAINER) {
      addTimeout(() => setStage(DemoStages.PARTICIPANT_0_STREAMING), 300);
    } else if (stage === DemoStages.PARTICIPANT_0_COMPLETE) {
      addTimeout(() => setStage(DemoStages.PARTICIPANT_1_CONTAINER), 300);
    } else if (stage === DemoStages.PARTICIPANT_1_CONTAINER) {
      addTimeout(() => setStage(DemoStages.PARTICIPANT_1_STREAMING), 300);
    } else if (stage === DemoStages.PARTICIPANT_1_COMPLETE) {
      addTimeout(() => setStage(DemoStages.PARTICIPANT_2_CONTAINER), 300);
    } else if (stage === DemoStages.PARTICIPANT_2_CONTAINER) {
      addTimeout(() => setStage(DemoStages.PARTICIPANT_2_STREAMING), 300);
    } else if (stage === DemoStages.PARTICIPANT_2_COMPLETE) {
      addTimeout(() => setStage(DemoStages.ANALYSIS_CONTAINER_APPEARING), 400);
    } else if (stage === DemoStages.ANALYSIS_CONTAINER_APPEARING) {
      addTimeout(() => setStage(DemoStages.ANALYSIS_EXPANDING), 300);
    } else if (stage === DemoStages.ANALYSIS_EXPANDING) {
      addTimeout(() => setStage(DemoStages.ANALYSIS_CONTENT_FADING), 400);
    } else if (stage === DemoStages.ANALYSIS_CONTENT_FADING) {
      addTimeout(() => setStage(DemoStages.ANALYSIS_STREAMING), 200);
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
    if (stage !== DemoStages.PRE_SEARCH_STREAMING || !MOCK_PRE_SEARCH.searchData)
      return;

    const queries = MOCK_PRE_SEARCH.searchData.queries;
    const results = MOCK_PRE_SEARCH.searchData.results;
    const analysis = MOCK_PRE_SEARCH.searchData.analysis;

    let currentStep = 0;
    const activeIntervals: NodeJS.Timeout[] = [];

    const steps = [
      // Query 0 with rationale
      { key: 'preSearchQuery0', text: queries[0]?.query || '' },
      { key: 'preSearchRationale0', text: queries[0]?.rationale || '' },
      // Query 1 with rationale
      { key: 'preSearchQuery1', text: queries[1]?.query || '' },
      { key: 'preSearchRationale1', text: queries[1]?.rationale || '' },
      // Result 0 with answer and individual website results
      { key: 'preSearchResult0Answer', text: results[0]?.answer || '' },
      { key: 'preSearchResult0Site0Title', text: results[0]?.results?.[0]?.title || '' },
      { key: 'preSearchResult0Site0Content', text: results[0]?.results?.[0]?.content || '' },
      { key: 'preSearchResult0Site1Title', text: results[0]?.results?.[1]?.title || '' },
      { key: 'preSearchResult0Site1Content', text: results[0]?.results?.[1]?.content || '' },
      // Result 1 with answer and individual website results
      { key: 'preSearchResult1Answer', text: results[1]?.answer || '' },
      { key: 'preSearchResult1Site0Title', text: results[1]?.results?.[0]?.title || '' },
      { key: 'preSearchResult1Site0Content', text: results[1]?.results?.[0]?.content || '' },
      // Overall analysis
      { key: 'preSearchAnalysis', text: analysis },
    ];

    const typeNextStep = () => {
      if (currentStep >= steps.length) {
        // eslint-disable-next-line react-web-api/no-leaked-timeout -- Properly cleaned up in unmount effect
        const timeout = setTimeout(() => setStage(DemoStages.PRE_SEARCH_COMPLETE), 500);
        timeoutsRef.current.push(timeout);
        return;
      }

      const step = steps[currentStep];
      if (!step)
        return;
      let charIndex = 0;

      const interval = setInterval(() => {
        if (charIndex < step.text.length) {
          charIndex = Math.min(charIndex + TYPING_CHARS_PER_FRAME, step.text.length);
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
      }, TYPING_FRAME_INTERVAL);

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
    if (stage !== DemoStages.PARTICIPANT_0_STREAMING)
      return;

    const message = MOCK_PARTICIPANT_MESSAGES[0];
    const fullText = message?.parts[0]?.type === MessagePartTypes.TEXT ? message.parts[0].text : '';
    let charIndex = 0;
    let interval: NodeJS.Timeout | null = null;

    interval = setInterval(() => {
      if (charIndex < fullText.length) {
        charIndex = Math.min(charIndex + TYPING_CHARS_PER_FRAME, fullText.length);
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
        const timeout = setTimeout(() => setStage(DemoStages.PARTICIPANT_0_COMPLETE), 500);
        timeoutsRef.current.push(timeout);
      }
    }, TYPING_FRAME_INTERVAL);

    intervalsRef.current.push(interval);
    return () => {
      if (interval)
        clearInterval(interval);
    };
  }, [stage]);

  // Typing animation for participant 1
  useEffect(() => {
    if (stage !== DemoStages.PARTICIPANT_1_STREAMING)
      return;

    const message = MOCK_PARTICIPANT_MESSAGES[1];
    const fullText = message?.parts[0]?.type === MessagePartTypes.TEXT ? message.parts[0].text : '';
    let charIndex = 0;
    let interval: NodeJS.Timeout | null = null;

    interval = setInterval(() => {
      if (charIndex < fullText.length) {
        charIndex = Math.min(charIndex + TYPING_CHARS_PER_FRAME, fullText.length);
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
        const timeout = setTimeout(() => setStage(DemoStages.PARTICIPANT_1_COMPLETE), 500);
        timeoutsRef.current.push(timeout);
      }
    }, TYPING_FRAME_INTERVAL);

    intervalsRef.current.push(interval);
    return () => {
      if (interval)
        clearInterval(interval);
    };
  }, [stage]);

  // Typing animation for participant 2
  useEffect(() => {
    if (stage !== DemoStages.PARTICIPANT_2_STREAMING)
      return;

    const message = MOCK_PARTICIPANT_MESSAGES[2];
    const fullText = message?.parts[0]?.type === MessagePartTypes.TEXT ? message.parts[0].text : '';
    let charIndex = 0;
    let interval: NodeJS.Timeout | null = null;

    interval = setInterval(() => {
      if (charIndex < fullText.length) {
        charIndex = Math.min(charIndex + TYPING_CHARS_PER_FRAME, fullText.length);
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
        const timeout = setTimeout(() => setStage(DemoStages.PARTICIPANT_2_COMPLETE), 500);
        timeoutsRef.current.push(timeout);
      }
    }, TYPING_FRAME_INTERVAL);

    intervalsRef.current.push(interval);
    return () => {
      if (interval)
        clearInterval(interval);
    };
  }, [stage]);

  // Typing animation for analysis (key insights → consensus → participant analyses → summary → conclusion)
  useEffect(() => {
    if (stage !== DemoStages.ANALYSIS_STREAMING || !MOCK_ANALYSIS.analysisData)
      return;

    const data = MOCK_ANALYSIS.analysisData;
    const contributors = data.contributorPerspectives || [];
    const recommendations = data.recommendations || [];
    const consensus = data.consensusAnalysis;
    const evidence = data.evidenceAndReasoning;
    const alternatives = data.alternatives || [];
    const summary = data.roundSummary;

    let currentStep = 0;
    const activeIntervals: NodeJS.Timeout[] = [];

    const steps = [
      // 1. Key Insights & Summary
      { key: 'analysisSummary', text: data.summary || '' },

      // 2. Recommendations
      { key: 'analysisRecommendation0Title', text: recommendations[0]?.title || '' },
      { key: 'analysisRecommendation0Desc', text: recommendations[0]?.description || '' },
      { key: 'analysisRecommendation1Title', text: recommendations[1]?.title || '' },
      { key: 'analysisRecommendation1Desc', text: recommendations[1]?.description || '' },

      // 3. Contributor Perspectives - Stances
      { key: 'analysisContributor0Stance', text: contributors[0]?.stance || '' },
      { key: 'analysisContributor1Stance', text: contributors[1]?.stance || '' },
      { key: 'analysisContributor2Stance', text: contributors[2]?.stance || '' },

      // 4. Contributor Evidence
      { key: 'analysisContributor0Evidence0', text: contributors[0]?.evidence?.[0] || '' },
      { key: 'analysisContributor0Evidence1', text: contributors[0]?.evidence?.[1] || '' },
      { key: 'analysisContributor1Evidence0', text: contributors[1]?.evidence?.[0] || '' },
      { key: 'analysisContributor1Evidence1', text: contributors[1]?.evidence?.[1] || '' },
      { key: 'analysisContributor2Evidence0', text: contributors[2]?.evidence?.[0] || '' },
      { key: 'analysisContributor2Evidence1', text: contributors[2]?.evidence?.[1] || '' },

      // 5. Consensus Analysis - Agreement Heatmap
      { key: 'analysisConsensusClaim0', text: consensus?.agreementHeatmap?.[0]?.claim || '' },
      { key: 'analysisConsensusClaim1', text: consensus?.agreementHeatmap?.[1]?.claim || '' },
      { key: 'analysisConsensusClaim2', text: consensus?.agreementHeatmap?.[2]?.claim || '' },

      // 6. Evidence & Reasoning - Reasoning Threads
      { key: 'analysisReasoningClaim0', text: evidence?.reasoningThreads?.[0]?.claim || '' },
      { key: 'analysisReasoningSynthesis0', text: evidence?.reasoningThreads?.[0]?.synthesis || '' },
      { key: 'analysisReasoningClaim1', text: evidence?.reasoningThreads?.[1]?.claim || '' },
      { key: 'analysisReasoningSynthesis1', text: evidence?.reasoningThreads?.[1]?.synthesis || '' },

      // 7. Explore Alternatives
      { key: 'analysisAlternative0', text: alternatives[0]?.scenario || '' },
      { key: 'analysisAlternative1', text: alternatives[1]?.scenario || '' },
      { key: 'analysisAlternative2', text: alternatives[2]?.scenario || '' },

      // 8. Round Summary
      { key: 'analysisRoundSummaryThemes', text: summary?.keyThemes || '' },
      { key: 'analysisRoundSummaryQuestion0', text: summary?.unresolvedQuestions?.[0] || '' },
      { key: 'analysisRoundSummaryQuestion1', text: summary?.unresolvedQuestions?.[1] || '' },
    ];

    const typeNextStep = () => {
      if (currentStep >= steps.length) {
        // eslint-disable-next-line react-web-api/no-leaked-timeout -- Properly cleaned up in unmount effect
        const timeout = setTimeout(() => setStage(DemoStages.COMPLETE), 500);
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
          charIndex = Math.min(charIndex + TYPING_CHARS_PER_FRAME, step.text.length);
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
      }, TYPING_FRAME_INTERVAL);

      activeIntervals.push(interval);
      intervalsRef.current.push(interval);
    };

    typeNextStep();

    return () => {
      activeIntervals.forEach(clearInterval);
    };
  }, [stage]);

  // Helper to get the actual viewport element from ScrollArea
  const getViewportElement = useCallback(() => {
    const root = scrollContainerRef.current;
    if (!root)
      return null;
    return root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
  }, []);

  // ✅ SCROLL TO BOTTOM: Proper scrollIntoView-based scrolling like ChatView
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const viewport = getViewportElement();
    if (!scrollAnchorRef.current || !viewport)
      return;

    isProgrammaticScrollRef.current = true;

    requestAnimationFrame(() => {
      scrollAnchorRef.current?.scrollIntoView({
        behavior,
        block: 'end',
      });

      isAtBottomRef.current = true;

      // Reset programmatic flag after animation
      const delay = behavior === 'smooth' ? 300 : 50;
      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, delay);
    });
  }, [getViewportElement]);

  // ✅ SCROLL DETECTION: Track user scroll intent (sticky/unsticky)
  useEffect(() => {
    const viewport = getViewportElement();
    if (!viewport)
      return;

    let ticking = false;

    const handleScroll = () => {
      if (isProgrammaticScrollRef.current || ticking)
        return;

      ticking = true;
      requestAnimationFrame(() => {
        const { scrollTop, scrollHeight, clientHeight } = viewport;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        const scrollDelta = scrollTop - lastScrollTopRef.current;
        lastScrollTopRef.current = scrollTop;

        // ✅ STICKY LOGIC: scroll up (delta < -10) = unstick, reach bottom = stick
        if (scrollDelta < -10) {
          // User scrolled UP - unstick immediately
          isAtBottomRef.current = false;
        } else if (distanceFromBottom <= 50) {
          // User reached bottom - re-stick
          isAtBottomRef.current = true;
        }

        ticking = false;
      });
    };

    viewport.addEventListener('scroll', handleScroll, { passive: true });
    lastScrollTopRef.current = viewport.scrollTop;

    return () => {
      viewport.removeEventListener('scroll', handleScroll);
    };
  }, [getViewportElement]);

  // ✅ RESIZE/MUTATION OBSERVER: Auto-scroll when content grows (if sticky)
  const isActivelyStreaming = stage === DemoStages.PRE_SEARCH_STREAMING
    || stage === DemoStages.PARTICIPANT_0_STREAMING
    || stage === DemoStages.PARTICIPANT_1_STREAMING
    || stage === DemoStages.PARTICIPANT_2_STREAMING
    || stage === DemoStages.ANALYSIS_STREAMING
    || stage === DemoStages.LOADING_INDICATOR;

  useEffect(() => {
    const viewport = getViewportElement();
    if (!viewport || !isActivelyStreaming)
      return;

    const mutationObserver = new MutationObserver(() => {
      if (!isAtBottomRef.current || isProgrammaticScrollRef.current)
        return;

      // Throttle: max once per 50ms
      const now = Date.now();
      if (now - scrollThrottleRef.current < 50)
        return;
      scrollThrottleRef.current = now;

      requestAnimationFrame(() => {
        if (isAtBottomRef.current && !isProgrammaticScrollRef.current) {
          scrollToBottom('auto');
        }
      });
    });

    mutationObserver.observe(viewport, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      mutationObserver.disconnect();
    };
  }, [isActivelyStreaming, scrollToBottom, getViewportElement]);

  // ✅ INITIAL SCROLL: When streaming starts, scroll to bottom
  const lastStageRef = useRef<Stage>(stage);
  useEffect(() => {
    if (lastStageRef.current === stage)
      return;
    lastStageRef.current = stage;

    // Only auto-scroll if user is at bottom
    if (!isAtBottomRef.current)
      return;

    // Small delay to allow content to render
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (isAtBottomRef.current) {
          scrollToBottom('smooth');
        }
      });
    });
  }, [stage, scrollToBottom]);

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
            ? mockMsg.parts[0]?.type === MessagePartTypes.TEXT
              ? mockMsg.parts[0].text
              : ''
            : ''; // Container visible but no text yet

        messages.push({
          id: mockMsg.id,
          threadId: 'demo-thread',
          participantId: `participant-${idx}`,
          role: mockMsg.role,
          parts: [{ type: MessagePartTypes.TEXT, text }],
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
  const showPreSearch = stage !== DemoStages.IDLE && stage !== DemoStages.USER_MESSAGE;

  // Accordion control states - keep open after completion (using predefined stage group constants)
  const preSearchIsOpen = PRE_SEARCH_OPEN_STAGES.includes(stage);
  const preSearchShowContent = PRE_SEARCH_CONTENT_STAGES.includes(stage);

  // Determine if we're actively streaming pre-search (use partial text) vs completed (use full text)
  const isPreSearchStreaming = stage === DemoStages.PRE_SEARCH_STREAMING;
  // ✅ FIX: Also check for content fading stage - content is visible but streaming hasn't started
  const isPreSearchFadingIn = stage === DemoStages.PRE_SEARCH_CONTENT_FADING;
  // ✅ FIX: Pre-search is only truly complete after these stages
  const isPreSearchComplete = [
    DemoStages.PRE_SEARCH_COMPLETE,
    DemoStages.PRE_SEARCH_COLLAPSING,
    DemoStages.LOADING_INDICATOR,
    ...PARTICIPANT_STAGES,
  ].includes(stage);

  // Build pre-search data incrementally - only include items that have content
  // This prevents height jumping by not rendering empty containers
  const buildPreSearchData = () => {
    if (!showPreSearch || !MOCK_PRE_SEARCH.searchData || !preSearchShowContent) {
      return null;
    }

    // ✅ FIX: During content fading, return null to prevent height jump
    // The accordion opens but content streams in gradually
    if (isPreSearchFadingIn) {
      return {
        queries: [],
        results: [],
        analysis: '',
        successCount: 0,
        failureCount: 0,
        totalResults: 0,
        totalTime: 0,
      };
    }

    // After streaming complete: show full data
    if (isPreSearchComplete) {
      return MOCK_PRE_SEARCH.searchData;
    }

    // During streaming: build arrays incrementally based on what has content
    if (isPreSearchStreaming) {
      // Build queries array - only include queries that have started streaming
      const streamingQueries = [];
      if (streamingText.preSearchQuery0.length > 0) {
        streamingQueries.push({
          ...MOCK_PRE_SEARCH.searchData.queries[0]!,
          query: streamingText.preSearchQuery0,
          rationale: streamingText.preSearchRationale0,
        });
      }
      if (streamingText.preSearchQuery1.length > 0) {
        streamingQueries.push({
          ...MOCK_PRE_SEARCH.searchData.queries[1]!,
          query: streamingText.preSearchQuery1,
          rationale: streamingText.preSearchRationale1,
        });
      }

      // Build results array - only include results that have started streaming
      const streamingResults = [];
      if (streamingText.preSearchResult0Answer.length > 0) {
        const result0Sites = [];
        if (streamingText.preSearchResult0Site0Title.length > 0) {
          result0Sites.push({
            title: streamingText.preSearchResult0Site0Title,
            url: MOCK_PRE_SEARCH.searchData.results[0]!.results[0]!.url,
            content: streamingText.preSearchResult0Site0Content,
            score: MOCK_PRE_SEARCH.searchData.results[0]!.results[0]!.score,
          });
        }
        if (streamingText.preSearchResult0Site1Title.length > 0) {
          result0Sites.push({
            title: streamingText.preSearchResult0Site1Title,
            url: MOCK_PRE_SEARCH.searchData.results[0]!.results[1]!.url,
            content: streamingText.preSearchResult0Site1Content,
            score: MOCK_PRE_SEARCH.searchData.results[0]!.results[1]!.score,
          });
        }
        streamingResults.push({
          ...MOCK_PRE_SEARCH.searchData.results[0]!,
          answer: streamingText.preSearchResult0Answer,
          results: result0Sites,
        });
      }
      if (streamingText.preSearchResult1Answer.length > 0) {
        const result1Sites = [];
        if (streamingText.preSearchResult1Site0Title.length > 0) {
          result1Sites.push({
            title: streamingText.preSearchResult1Site0Title,
            url: MOCK_PRE_SEARCH.searchData.results[1]!.results[0]!.url,
            content: streamingText.preSearchResult1Site0Content,
            score: MOCK_PRE_SEARCH.searchData.results[1]!.results[0]!.score,
          });
        }
        streamingResults.push({
          ...MOCK_PRE_SEARCH.searchData.results[1]!,
          answer: streamingText.preSearchResult1Answer,
          results: result1Sites,
        });
      }

      return {
        queries: streamingQueries,
        results: streamingResults,
        analysis: streamingText.preSearchAnalysis,
        successCount: MOCK_PRE_SEARCH.searchData.successCount,
        failureCount: MOCK_PRE_SEARCH.searchData.failureCount,
        totalResults: MOCK_PRE_SEARCH.searchData.totalResults,
        totalTime: MOCK_PRE_SEARCH.searchData.totalTime,
      };
    }

    // After streaming complete: show full data
    return MOCK_PRE_SEARCH.searchData;
  };

  const preSearchStreamingData = buildPreSearchData();
  const preSearchWithStreamingData = showPreSearch && MOCK_PRE_SEARCH.searchData
    ? {
        ...MOCK_PRE_SEARCH,
        status: isPreSearchStreaming ? AnalysisStatuses.STREAMING : AnalysisStatuses.COMPLETE,
        searchData: preSearchStreamingData || undefined,
      }
    : null;

  // Analysis with streaming text and controlled visibility (using predefined stage group constants)
  const showAnalysis = ANALYSIS_VISIBLE_STAGES.includes(stage);
  const analysisIsOpen = ANALYSIS_OPEN_STAGES.includes(stage);
  const analysisShowContent = ANALYSIS_CONTENT_STAGES.includes(stage);

  // ✅ FIX: Check for content fading stage - content is visible but streaming hasn't started
  const isAnalysisFadingIn = stage === DemoStages.ANALYSIS_CONTENT_FADING;
  // ✅ FIX: Analysis is only truly complete after streaming finishes
  const isAnalysisComplete = stage === DemoStages.COMPLETE;

  // Build analysis data incrementally - only include items that have content
  // This prevents height jumping by not rendering empty containers
  const buildAnalysisData = () => {
    if (!showAnalysis || !MOCK_ANALYSIS.analysisData || !analysisShowContent) {
      return null;
    }

    // ✅ FIX: During content fading, return minimal data to prevent height jump
    if (isAnalysisFadingIn) {
      return {
        roundConfidence: 0,
        confidenceWeighting: ConfidenceWeightings.BALANCED,
        consensusEvolution: MOCK_ANALYSIS.analysisData.consensusEvolution,
        summary: '',
        recommendations: [],
        contributorPerspectives: [],
        consensusAnalysis: {
          ...MOCK_ANALYSIS.analysisData.consensusAnalysis,
          agreementHeatmap: [],
        },
        evidenceAndReasoning: {
          ...MOCK_ANALYSIS.analysisData.evidenceAndReasoning,
          reasoningThreads: [],
        },
        alternatives: [],
        roundSummary: {
          ...MOCK_ANALYSIS.analysisData.roundSummary,
          keyThemes: '',
          unresolvedQuestions: [],
        },
      };
    }

    // After streaming complete: show full data
    if (isAnalysisComplete) {
      return MOCK_ANALYSIS.analysisData;
    }

    // During streaming: build arrays incrementally based on what has content
    // Recommendations - only include if title has content
    const streamingRecommendations = [];
    if (streamingText.analysisRecommendation0Title.length > 0) {
      streamingRecommendations.push({
        ...MOCK_ANALYSIS.analysisData.recommendations[0]!,
        title: streamingText.analysisRecommendation0Title,
        description: streamingText.analysisRecommendation0Desc,
      });
    }
    if (streamingText.analysisRecommendation1Title.length > 0) {
      streamingRecommendations.push({
        ...MOCK_ANALYSIS.analysisData.recommendations[1]!,
        title: streamingText.analysisRecommendation1Title,
        description: streamingText.analysisRecommendation1Desc,
      });
    }

    // Contributor perspectives - only include if stance has content
    const streamingContributors = [];
    if (streamingText.analysisContributor0Stance.length > 0) {
      const evidence = [
        streamingText.analysisContributor0Evidence0,
        streamingText.analysisContributor0Evidence1,
      ].filter(e => e.length > 0);
      streamingContributors.push({
        ...MOCK_ANALYSIS.analysisData.contributorPerspectives[0]!,
        stance: streamingText.analysisContributor0Stance,
        evidence,
      });
    }
    if (streamingText.analysisContributor1Stance.length > 0) {
      const evidence = [
        streamingText.analysisContributor1Evidence0,
        streamingText.analysisContributor1Evidence1,
      ].filter(e => e.length > 0);
      streamingContributors.push({
        ...MOCK_ANALYSIS.analysisData.contributorPerspectives[1]!,
        stance: streamingText.analysisContributor1Stance,
        evidence,
      });
    }
    if (streamingText.analysisContributor2Stance.length > 0) {
      const evidence = [
        streamingText.analysisContributor2Evidence0,
        streamingText.analysisContributor2Evidence1,
      ].filter(e => e.length > 0);
      streamingContributors.push({
        ...MOCK_ANALYSIS.analysisData.contributorPerspectives[2]!,
        stance: streamingText.analysisContributor2Stance,
        evidence,
      });
    }

    // Consensus claims - only include if claim has content
    const streamingHeatmap = [];
    if (streamingText.analysisConsensusClaim0.length > 0) {
      streamingHeatmap.push({
        ...MOCK_ANALYSIS.analysisData.consensusAnalysis.agreementHeatmap[0]!,
        claim: streamingText.analysisConsensusClaim0,
      });
    }
    if (streamingText.analysisConsensusClaim1.length > 0) {
      streamingHeatmap.push({
        ...MOCK_ANALYSIS.analysisData.consensusAnalysis.agreementHeatmap[1]!,
        claim: streamingText.analysisConsensusClaim1,
      });
    }
    if (streamingText.analysisConsensusClaim2.length > 0) {
      streamingHeatmap.push({
        ...MOCK_ANALYSIS.analysisData.consensusAnalysis.agreementHeatmap[2]!,
        claim: streamingText.analysisConsensusClaim2,
      });
    }

    // Reasoning threads - only include if claim has content
    const streamingReasoningThreads = [];
    if (streamingText.analysisReasoningClaim0.length > 0) {
      streamingReasoningThreads.push({
        ...MOCK_ANALYSIS.analysisData.evidenceAndReasoning.reasoningThreads[0]!,
        claim: streamingText.analysisReasoningClaim0,
        synthesis: streamingText.analysisReasoningSynthesis0,
      });
    }
    if (streamingText.analysisReasoningClaim1.length > 0) {
      streamingReasoningThreads.push({
        ...MOCK_ANALYSIS.analysisData.evidenceAndReasoning.reasoningThreads[1]!,
        claim: streamingText.analysisReasoningClaim1,
        synthesis: streamingText.analysisReasoningSynthesis1,
      });
    }

    // Alternatives - only include if scenario has content
    const streamingAlternatives = [];
    if (streamingText.analysisAlternative0.length > 0) {
      streamingAlternatives.push({
        ...MOCK_ANALYSIS.analysisData.alternatives[0]!,
        scenario: streamingText.analysisAlternative0,
      });
    }
    if (streamingText.analysisAlternative1.length > 0) {
      streamingAlternatives.push({
        ...MOCK_ANALYSIS.analysisData.alternatives[1]!,
        scenario: streamingText.analysisAlternative1,
      });
    }
    if (streamingText.analysisAlternative2.length > 0) {
      streamingAlternatives.push({
        ...MOCK_ANALYSIS.analysisData.alternatives[2]!,
        scenario: streamingText.analysisAlternative2,
      });
    }

    // Unresolved questions - only include if content exists
    const streamingUnresolvedQuestions = [
      streamingText.analysisRoundSummaryQuestion0,
      streamingText.analysisRoundSummaryQuestion1,
    ].filter(q => q.length > 0);

    return {
      roundConfidence: MOCK_ANALYSIS.analysisData.roundConfidence,
      confidenceWeighting: ConfidenceWeightings.BALANCED,
      consensusEvolution: MOCK_ANALYSIS.analysisData.consensusEvolution,
      summary: streamingText.analysisSummary,
      recommendations: streamingRecommendations,
      contributorPerspectives: streamingContributors,
      consensusAnalysis: {
        ...MOCK_ANALYSIS.analysisData.consensusAnalysis,
        agreementHeatmap: streamingHeatmap,
      },
      evidenceAndReasoning: {
        ...MOCK_ANALYSIS.analysisData.evidenceAndReasoning,
        reasoningThreads: streamingReasoningThreads,
      },
      alternatives: streamingAlternatives,
      roundSummary: {
        ...MOCK_ANALYSIS.analysisData.roundSummary,
        keyThemes: streamingText.analysisRoundSummaryThemes,
        unresolvedQuestions: streamingUnresolvedQuestions,
      },
    };
  };

  const analysisStreamingData = buildAnalysisData();
  const analysisWithStreamingText = showAnalysis && MOCK_ANALYSIS.analysisData
    ? {
        ...MOCK_ANALYSIS,
        // Always use COMPLETE status to prevent ModeratorAnalysisStream from making API calls
        // The streaming visual effect is achieved through text animations, not actual API streaming
        status: AnalysisStatuses.COMPLETE,
        analysisData: analysisStreamingData || undefined,
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

  // ✅ LOADING STATE: Show matrix loading indicator during loading stage
  const showLoader = stage === DemoStages.LOADING_INDICATOR
    || stage === DemoStages.PRE_SEARCH_STREAMING
    || stage === DemoStages.PARTICIPANT_0_STREAMING
    || stage === DemoStages.PARTICIPANT_1_STREAMING
    || stage === DemoStages.PARTICIPANT_2_STREAMING
    || stage === DemoStages.ANALYSIS_STREAMING;

  const loadingDetails = {
    isCreatingThread: false,
    isStreamingParticipants: stage === DemoStages.PARTICIPANT_0_STREAMING
      || stage === DemoStages.PARTICIPANT_1_STREAMING
      || stage === DemoStages.PARTICIPANT_2_STREAMING,
    isStreamingAnalysis: stage === DemoStages.ANALYSIS_STREAMING,
    isNavigating: false,
  };

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      {/* ✅ SHADCN SCROLL AREA: Consistent scrollbar styling */}
      <ScrollArea className="h-full min-h-0 flex-1" ref={scrollContainerRef}>
        <div className="w-full px-4 sm:px-6 pt-6 pb-6">
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

          {/* ✅ LOADING INDICATOR: Matrix text loader during streaming stages */}
          {showLoader && (
            <div className="mt-4 mb-2">
              <UnifiedLoadingIndicator
                showLoader={showLoader}
                loadingDetails={loadingDetails}
                preSearches={preSearchWithStreamingData ? [preSearchWithStreamingData] : []}
              />
            </div>
          )}

          {/* ✅ SCROLL ANCHOR: Single marker at the very bottom of all content */}
          <div
            ref={scrollAnchorRef}
            aria-hidden="true"
            className="h-px w-full"
            data-scroll-anchor="demo-bottom"
          />
        </div>
      </ScrollArea>
    </div>
  );
}
