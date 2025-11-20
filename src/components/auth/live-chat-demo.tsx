'use client';

import { useEffect, useRef, useState } from 'react';

import { AnalysisStatuses } from '@/api/core/enums';
import type { ChatMessage, ChatParticipant } from '@/api/routes/chat/schema';
import { ThreadTimeline } from '@/components/chat/thread-timeline';
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

  // Analysis fields - sequential typing in order from top to bottom
  // Key Insights (5 items)
  analysisKeyInsight0: string;
  analysisKeyInsight1: string;
  analysisKeyInsight2: string;
  analysisKeyInsight3: string;
  analysisKeyInsight4: string;
  // Consensus Points (3 items)
  analysisConsensus0: string;
  analysisConsensus1: string;
  analysisConsensus2: string;
  // Divergent Approaches
  analysisDivergentTopic0: string;
  analysisDivergentPerspective0: string;
  analysisDivergentPerspective1: string;
  analysisDivergentPerspective2: string;
  // Comparative Analysis - Strengths by Category
  analysisStrengthCategory0: string;
  analysisStrengthCategory1: string;
  analysisStrengthCategory2: string;
  // Comparative Analysis - Tradeoffs
  analysisTradeoff0: string;
  analysisTradeoff1: string;
  analysisTradeoff2: string;
  // Decision Framework - Criteria
  analysisCriteria0: string;
  analysisCriteria1: string;
  analysisCriteria2: string;
  analysisCriteria3: string;
  // Decision Framework - Scenario Recommendations
  analysisScenario0: string;
  analysisScenario1: string;
  analysisScenario2: string;
  // Participant Analyses
  analysisParticipant0Pros0: string;
  analysisParticipant0Pros1: string;
  analysisParticipant0Pros2: string;
  analysisParticipant0Cons0: string;
  analysisParticipant0Summary: string;
  analysisParticipant1Pros0: string;
  analysisParticipant1Pros1: string;
  analysisParticipant1Pros2: string;
  analysisParticipant1Cons0: string;
  analysisParticipant1Summary: string;
  analysisParticipant2Pros0: string;
  analysisParticipant2Pros1: string;
  analysisParticipant2Pros2: string;
  analysisParticipant2Cons0: string;
  analysisParticipant2Summary: string;
  // Summary and Conclusion
  analysisOverallSummary: string;
  analysisConclusion: string;
  // Recommended Actions
  analysisRecommendedAction0: string;
  analysisRecommendedAction1: string;
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
  // Key Insights
  analysisKeyInsight0: '',
  analysisKeyInsight1: '',
  analysisKeyInsight2: '',
  analysisKeyInsight3: '',
  analysisKeyInsight4: '',
  // Consensus Points
  analysisConsensus0: '',
  analysisConsensus1: '',
  analysisConsensus2: '',
  // Divergent Approaches
  analysisDivergentTopic0: '',
  analysisDivergentPerspective0: '',
  analysisDivergentPerspective1: '',
  analysisDivergentPerspective2: '',
  // Strengths by Category
  analysisStrengthCategory0: '',
  analysisStrengthCategory1: '',
  analysisStrengthCategory2: '',
  // Tradeoffs
  analysisTradeoff0: '',
  analysisTradeoff1: '',
  analysisTradeoff2: '',
  // Criteria
  analysisCriteria0: '',
  analysisCriteria1: '',
  analysisCriteria2: '',
  analysisCriteria3: '',
  // Scenario Recommendations
  analysisScenario0: '',
  analysisScenario1: '',
  analysisScenario2: '',
  // Participant Analyses
  analysisParticipant0Pros0: '',
  analysisParticipant0Pros1: '',
  analysisParticipant0Pros2: '',
  analysisParticipant0Cons0: '',
  analysisParticipant0Summary: '',
  analysisParticipant1Pros0: '',
  analysisParticipant1Pros1: '',
  analysisParticipant1Pros2: '',
  analysisParticipant1Cons0: '',
  analysisParticipant1Summary: '',
  analysisParticipant2Pros0: '',
  analysisParticipant2Pros1: '',
  analysisParticipant2Pros2: '',
  analysisParticipant2Cons0: '',
  analysisParticipant2Summary: '',
  // Summary and Conclusion
  analysisOverallSummary: '',
  analysisConclusion: '',
  // Recommended Actions
  analysisRecommendedAction0: '',
  analysisRecommendedAction1: '',
};

export function LiveChatDemo() {
  const [stage, setStage] = useState<Stage>(DemoStages.IDLE);
  const [streamingText, setStreamingText] = useState<StreamingText>(INITIAL_STREAMING_TEXT);
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
    const fullText = message?.parts[0]?.type === 'text' ? message.parts[0].text : '';
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
    const fullText = message?.parts[0]?.type === 'text' ? message.parts[0].text : '';
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
    const fullText = message?.parts[0]?.type === 'text' ? message.parts[0].text : '';
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
    if (stage !== DemoStages.ANALYSIS_STREAMING || !MOCK_ANALYSIS.analysisData?.roundSummary)
      return;

    const summary = MOCK_ANALYSIS.analysisData.roundSummary;
    const participantAnalyses = MOCK_ANALYSIS.analysisData.participantAnalyses || [];

    let currentStep = 0;
    const activeIntervals: NodeJS.Timeout[] = [];

    const divergent = summary.divergentApproaches?.[0];
    const comparative = summary.comparativeAnalysis;
    const framework = summary.decisionFramework;
    const actions = summary.recommendedActions;

    const steps = [
      // 1. Key Insights (5 items)
      { key: 'analysisKeyInsight0', text: summary.keyInsights?.[0] || '' },
      { key: 'analysisKeyInsight1', text: summary.keyInsights?.[1] || '' },
      { key: 'analysisKeyInsight2', text: summary.keyInsights?.[2] || '' },
      { key: 'analysisKeyInsight3', text: summary.keyInsights?.[3] || '' },
      { key: 'analysisKeyInsight4', text: summary.keyInsights?.[4] || '' },
      // 2. Consensus Points (3 items)
      { key: 'analysisConsensus0', text: summary.consensusPoints?.[0] || '' },
      { key: 'analysisConsensus1', text: summary.consensusPoints?.[1] || '' },
      { key: 'analysisConsensus2', text: summary.consensusPoints?.[2] || '' },
      // 3. Divergent Approaches
      { key: 'analysisDivergentTopic0', text: divergent?.topic || '' },
      { key: 'analysisDivergentPerspective0', text: divergent?.perspectives?.[0] || '' },
      { key: 'analysisDivergentPerspective1', text: divergent?.perspectives?.[1] || '' },
      { key: 'analysisDivergentPerspective2', text: divergent?.perspectives?.[2] || '' },
      // 4. Comparative Analysis - Strengths by Category
      { key: 'analysisStrengthCategory0', text: `${comparative?.strengthsByCategory?.[0]?.category}: ${comparative?.strengthsByCategory?.[0]?.participants?.join(', ')}` },
      { key: 'analysisStrengthCategory1', text: `${comparative?.strengthsByCategory?.[1]?.category}: ${comparative?.strengthsByCategory?.[1]?.participants?.join(', ')}` },
      { key: 'analysisStrengthCategory2', text: `${comparative?.strengthsByCategory?.[2]?.category}: ${comparative?.strengthsByCategory?.[2]?.participants?.join(', ')}` },
      // 5. Comparative Analysis - Tradeoffs
      { key: 'analysisTradeoff0', text: comparative?.tradeoffs?.[0] || '' },
      { key: 'analysisTradeoff1', text: comparative?.tradeoffs?.[1] || '' },
      { key: 'analysisTradeoff2', text: comparative?.tradeoffs?.[2] || '' },
      // 6. Decision Framework - Criteria
      { key: 'analysisCriteria0', text: framework?.criteriaToConsider?.[0] || '' },
      { key: 'analysisCriteria1', text: framework?.criteriaToConsider?.[1] || '' },
      { key: 'analysisCriteria2', text: framework?.criteriaToConsider?.[2] || '' },
      { key: 'analysisCriteria3', text: framework?.criteriaToConsider?.[3] || '' },
      // 7. Decision Framework - Scenario Recommendations
      { key: 'analysisScenario0', text: `${framework?.scenarioRecommendations?.[0]?.scenario}: ${framework?.scenarioRecommendations?.[0]?.recommendation}` },
      { key: 'analysisScenario1', text: `${framework?.scenarioRecommendations?.[1]?.scenario}: ${framework?.scenarioRecommendations?.[1]?.recommendation}` },
      { key: 'analysisScenario2', text: `${framework?.scenarioRecommendations?.[2]?.scenario}: ${framework?.scenarioRecommendations?.[2]?.recommendation}` },
      // 8. Participant Analyses
      // Participant 0
      { key: 'analysisParticipant0Pros0', text: participantAnalyses[0]?.pros?.[0] || '' },
      { key: 'analysisParticipant0Pros1', text: participantAnalyses[0]?.pros?.[1] || '' },
      { key: 'analysisParticipant0Pros2', text: participantAnalyses[0]?.pros?.[2] || '' },
      { key: 'analysisParticipant0Cons0', text: participantAnalyses[0]?.cons?.[0] || '' },
      { key: 'analysisParticipant0Summary', text: participantAnalyses[0]?.summary || '' },
      // Participant 1
      { key: 'analysisParticipant1Pros0', text: participantAnalyses[1]?.pros?.[0] || '' },
      { key: 'analysisParticipant1Pros1', text: participantAnalyses[1]?.pros?.[1] || '' },
      { key: 'analysisParticipant1Pros2', text: participantAnalyses[1]?.pros?.[2] || '' },
      { key: 'analysisParticipant1Cons0', text: participantAnalyses[1]?.cons?.[0] || '' },
      { key: 'analysisParticipant1Summary', text: participantAnalyses[1]?.summary || '' },
      // Participant 2
      { key: 'analysisParticipant2Pros0', text: participantAnalyses[2]?.pros?.[0] || '' },
      { key: 'analysisParticipant2Pros1', text: participantAnalyses[2]?.pros?.[1] || '' },
      { key: 'analysisParticipant2Pros2', text: participantAnalyses[2]?.pros?.[2] || '' },
      { key: 'analysisParticipant2Cons0', text: participantAnalyses[2]?.cons?.[0] || '' },
      { key: 'analysisParticipant2Summary', text: participantAnalyses[2]?.summary || '' },
      // 9. Summary and Conclusion
      { key: 'analysisOverallSummary', text: summary.overallSummary },
      { key: 'analysisConclusion', text: summary.conclusion },
      // 10. Recommended Actions
      { key: 'analysisRecommendedAction0', text: actions?.[0]?.action || '' },
      { key: 'analysisRecommendedAction1', text: actions?.[1]?.action || '' },
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

  // Smooth scroll to bottom when new content appears (but preserve user scroll)
  const isUserScrollingRef = useRef(false);
  const lastStageRef = useRef<Stage>(stage);

  // Helper to get the actual viewport element from ScrollArea
  const getViewportElement = () => {
    const root = scrollViewportRef.current;
    if (!root)
      return null;
    return root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
  };

  useEffect(() => {
    const viewport = getViewportElement();
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

    const viewport = getViewportElement();
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

  // Also auto-scroll during streaming text updates
  useEffect(() => {
    const viewport = getViewportElement();
    if (!viewport || isUserScrollingRef.current)
      return;

    // Only scroll during active streaming stages
    const isActivelyStreaming = stage === DemoStages.PRE_SEARCH_STREAMING
      || stage === DemoStages.PARTICIPANT_0_STREAMING
      || stage === DemoStages.PARTICIPANT_1_STREAMING
      || stage === DemoStages.PARTICIPANT_2_STREAMING
      || stage === DemoStages.ANALYSIS_STREAMING;

    if (!isActivelyStreaming)
      return;

    // Scroll to bottom as content streams in
    requestAnimationFrame(() => {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: 'smooth',
      });
    });
  }, [streamingText, stage]);

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
  const showPreSearch = stage !== DemoStages.IDLE && stage !== DemoStages.USER_MESSAGE;

  // Accordion control states - keep open after completion (using predefined stage group constants)
  const preSearchIsOpen = PRE_SEARCH_OPEN_STAGES.includes(stage);
  const preSearchShowContent = PRE_SEARCH_CONTENT_STAGES.includes(stage);

  // Determine if we're actively streaming pre-search (use partial text) vs completed (use full text)
  const isPreSearchStreaming = stage === DemoStages.PRE_SEARCH_STREAMING;

  const preSearchWithStreamingData = showPreSearch && MOCK_PRE_SEARCH.searchData
    ? {
        ...MOCK_PRE_SEARCH,
        status: isPreSearchStreaming ? AnalysisStatuses.STREAMING : AnalysisStatuses.COMPLETE,
        searchData: preSearchShowContent
          ? {
              queries: [
                {
                  ...MOCK_PRE_SEARCH.searchData.queries[0]!,
                  // During streaming: show partial text (even empty). After complete: show full text.
                  query: isPreSearchStreaming ? streamingText.preSearchQuery0 : MOCK_PRE_SEARCH.searchData.queries[0]!.query,
                  rationale: isPreSearchStreaming ? streamingText.preSearchRationale0 : MOCK_PRE_SEARCH.searchData.queries[0]!.rationale,
                },
                {
                  ...MOCK_PRE_SEARCH.searchData.queries[1]!,
                  query: isPreSearchStreaming ? streamingText.preSearchQuery1 : MOCK_PRE_SEARCH.searchData.queries[1]!.query,
                  rationale: isPreSearchStreaming ? streamingText.preSearchRationale1 : MOCK_PRE_SEARCH.searchData.queries[1]!.rationale,
                },
              ],
              results: [
                {
                  ...MOCK_PRE_SEARCH.searchData.results[0]!,
                  answer: isPreSearchStreaming ? streamingText.preSearchResult0Answer : MOCK_PRE_SEARCH.searchData.results[0]!.answer,
                  results: isPreSearchStreaming
                    ? [
                        // Only show sites that have started streaming
                        ...(streamingText.preSearchResult0Site0Title.length > 0
                          ? [{
                              title: streamingText.preSearchResult0Site0Title,
                              url: MOCK_PRE_SEARCH.searchData.results[0]!.results[0]!.url,
                              content: streamingText.preSearchResult0Site0Content,
                              score: MOCK_PRE_SEARCH.searchData.results[0]!.results[0]!.score,
                            }]
                          : []),
                        ...(streamingText.preSearchResult0Site1Title.length > 0
                          ? [{
                              title: streamingText.preSearchResult0Site1Title,
                              url: MOCK_PRE_SEARCH.searchData.results[0]!.results[1]!.url,
                              content: streamingText.preSearchResult0Site1Content,
                              score: MOCK_PRE_SEARCH.searchData.results[0]!.results[1]!.score,
                            }]
                          : []),
                      ]
                    : MOCK_PRE_SEARCH.searchData.results[0]!.results,
                },
                {
                  ...MOCK_PRE_SEARCH.searchData.results[1]!,
                  answer: isPreSearchStreaming ? streamingText.preSearchResult1Answer : MOCK_PRE_SEARCH.searchData.results[1]!.answer,
                  results: isPreSearchStreaming
                    ? [
                        ...(streamingText.preSearchResult1Site0Title.length > 0
                          ? [{
                              title: streamingText.preSearchResult1Site0Title,
                              url: MOCK_PRE_SEARCH.searchData.results[1]!.results[0]!.url,
                              content: streamingText.preSearchResult1Site0Content,
                              score: MOCK_PRE_SEARCH.searchData.results[1]!.results[0]!.score,
                            }]
                          : []),
                      ]
                    : MOCK_PRE_SEARCH.searchData.results[1]!.results,
                },
              ],
              analysis: isPreSearchStreaming ? streamingText.preSearchAnalysis : MOCK_PRE_SEARCH.searchData.analysis,
              successCount: MOCK_PRE_SEARCH.searchData.successCount,
              failureCount: MOCK_PRE_SEARCH.searchData.failureCount,
              totalResults: MOCK_PRE_SEARCH.searchData.totalResults,
              totalTime: MOCK_PRE_SEARCH.searchData.totalTime,
            }
          : undefined,
      }
    : null;

  // Analysis with streaming text and controlled visibility (using predefined stage group constants)
  const showAnalysis = ANALYSIS_VISIBLE_STAGES.includes(stage);
  const analysisIsOpen = ANALYSIS_OPEN_STAGES.includes(stage);
  const analysisShowContent = ANALYSIS_CONTENT_STAGES.includes(stage);

  // Determine if we're actively streaming analysis (use partial text) vs completed (use full text)
  const isAnalysisStreaming = stage === DemoStages.ANALYSIS_STREAMING;

  const analysisWithStreamingText = showAnalysis && MOCK_ANALYSIS.analysisData
    ? {
        ...MOCK_ANALYSIS,
        // Always use COMPLETE status to prevent ModeratorAnalysisStream from making API calls
        // The streaming visual effect is achieved through text animations, not actual API streaming
        status: AnalysisStatuses.COMPLETE,
        analysisData: analysisShowContent
          ? {
              ...MOCK_ANALYSIS.analysisData,
              roundSummary: {
                ...MOCK_ANALYSIS.analysisData.roundSummary,
                // Key Insights (5 items)
                keyInsights: [
                  isAnalysisStreaming ? streamingText.analysisKeyInsight0 : (MOCK_ANALYSIS.analysisData.roundSummary.keyInsights[0] || ''),
                  isAnalysisStreaming ? streamingText.analysisKeyInsight1 : (MOCK_ANALYSIS.analysisData.roundSummary.keyInsights[1] || ''),
                  isAnalysisStreaming ? streamingText.analysisKeyInsight2 : (MOCK_ANALYSIS.analysisData.roundSummary.keyInsights[2] || ''),
                  isAnalysisStreaming ? streamingText.analysisKeyInsight3 : (MOCK_ANALYSIS.analysisData.roundSummary.keyInsights[3] || ''),
                  isAnalysisStreaming ? streamingText.analysisKeyInsight4 : (MOCK_ANALYSIS.analysisData.roundSummary.keyInsights[4] || ''),
                ].filter(text => text.length > 0),
                // Consensus Points (3 items)
                consensusPoints: [
                  isAnalysisStreaming ? streamingText.analysisConsensus0 : (MOCK_ANALYSIS.analysisData.roundSummary.consensusPoints[0] || ''),
                  isAnalysisStreaming ? streamingText.analysisConsensus1 : (MOCK_ANALYSIS.analysisData.roundSummary.consensusPoints[1] || ''),
                  isAnalysisStreaming ? streamingText.analysisConsensus2 : (MOCK_ANALYSIS.analysisData.roundSummary.consensusPoints[2] || ''),
                ].filter(text => text.length > 0),
                // Summary and Conclusion
                overallSummary: isAnalysisStreaming ? streamingText.analysisOverallSummary : MOCK_ANALYSIS.analysisData.roundSummary.overallSummary,
                conclusion: isAnalysisStreaming ? streamingText.analysisConclusion : MOCK_ANALYSIS.analysisData.roundSummary.conclusion,
                // Divergent Approaches with streaming
                divergentApproaches: isAnalysisStreaming
                  ? (streamingText.analysisDivergentTopic0.length > 0
                      ? [{
                          topic: streamingText.analysisDivergentTopic0,
                          perspectives: [
                            streamingText.analysisDivergentPerspective0,
                            streamingText.analysisDivergentPerspective1,
                            streamingText.analysisDivergentPerspective2,
                          ].filter(p => p.length > 0),
                        }]
                      : [])
                  : MOCK_ANALYSIS.analysisData.roundSummary.divergentApproaches,
                // Comparative Analysis with streaming
                comparativeAnalysis: isAnalysisStreaming
                  ? {
                      strengthsByCategory: [
                        ...(streamingText.analysisStrengthCategory0.length > 0
                          ? [{
                              category: streamingText.analysisStrengthCategory0.split(':')[0] || '',
                              participants: [streamingText.analysisStrengthCategory0.split(': ')[1] || ''],
                            }]
                          : []),
                        ...(streamingText.analysisStrengthCategory1.length > 0
                          ? [{
                              category: streamingText.analysisStrengthCategory1.split(':')[0] || '',
                              participants: [streamingText.analysisStrengthCategory1.split(': ')[1] || ''],
                            }]
                          : []),
                        ...(streamingText.analysisStrengthCategory2.length > 0
                          ? [{
                              category: streamingText.analysisStrengthCategory2.split(':')[0] || '',
                              participants: [streamingText.analysisStrengthCategory2.split(': ')[1] || ''],
                            }]
                          : []),
                      ],
                      tradeoffs: [
                        streamingText.analysisTradeoff0,
                        streamingText.analysisTradeoff1,
                        streamingText.analysisTradeoff2,
                      ].filter(t => t.length > 0),
                    }
                  : MOCK_ANALYSIS.analysisData.roundSummary.comparativeAnalysis,
                // Decision Framework with streaming
                decisionFramework: isAnalysisStreaming
                  ? {
                      criteriaToConsider: [
                        streamingText.analysisCriteria0,
                        streamingText.analysisCriteria1,
                        streamingText.analysisCriteria2,
                        streamingText.analysisCriteria3,
                      ].filter(c => c.length > 0),
                      scenarioRecommendations: [
                        ...(streamingText.analysisScenario0.length > 0
                          ? [{
                              scenario: streamingText.analysisScenario0.split(':')[0] || '',
                              recommendation: streamingText.analysisScenario0.split(': ')[1] || '',
                            }]
                          : []),
                        ...(streamingText.analysisScenario1.length > 0
                          ? [{
                              scenario: streamingText.analysisScenario1.split(':')[0] || '',
                              recommendation: streamingText.analysisScenario1.split(': ')[1] || '',
                            }]
                          : []),
                        ...(streamingText.analysisScenario2.length > 0
                          ? [{
                              scenario: streamingText.analysisScenario2.split(':')[0] || '',
                              recommendation: streamingText.analysisScenario2.split(': ')[1] || '',
                            }]
                          : []),
                      ],
                    }
                  : MOCK_ANALYSIS.analysisData.roundSummary.decisionFramework,
                // Recommended Actions with streaming
                recommendedActions: isAnalysisStreaming
                  ? [
                      ...(streamingText.analysisRecommendedAction0.length > 0
                        ? [{
                            action: streamingText.analysisRecommendedAction0,
                            rationale: MOCK_ANALYSIS.analysisData.roundSummary.recommendedActions?.[0]?.rationale || '',
                            suggestedModels: MOCK_ANALYSIS.analysisData.roundSummary.recommendedActions?.[0]?.suggestedModels || [],
                            suggestedRoles: MOCK_ANALYSIS.analysisData.roundSummary.recommendedActions?.[0]?.suggestedRoles || [],
                            suggestedMode: MOCK_ANALYSIS.analysisData.roundSummary.recommendedActions?.[0]?.suggestedMode || '',
                          }]
                        : []),
                      ...(streamingText.analysisRecommendedAction1.length > 0
                        ? [{
                            action: streamingText.analysisRecommendedAction1,
                            rationale: MOCK_ANALYSIS.analysisData.roundSummary.recommendedActions?.[1]?.rationale || '',
                            suggestedModels: MOCK_ANALYSIS.analysisData.roundSummary.recommendedActions?.[1]?.suggestedModels || [],
                            suggestedRoles: MOCK_ANALYSIS.analysisData.roundSummary.recommendedActions?.[1]?.suggestedRoles || [],
                            suggestedMode: MOCK_ANALYSIS.analysisData.roundSummary.recommendedActions?.[1]?.suggestedMode || '',
                          }]
                        : []),
                    ]
                  : MOCK_ANALYSIS.analysisData.roundSummary.recommendedActions,
              },
              participantAnalyses: MOCK_ANALYSIS.analysisData.participantAnalyses.map((p, idx) => ({
                ...p,
                pros: idx === 0
                  ? [
                      isAnalysisStreaming ? streamingText.analysisParticipant0Pros0 : (p.pros[0] || ''),
                      isAnalysisStreaming ? streamingText.analysisParticipant0Pros1 : (p.pros[1] || ''),
                      isAnalysisStreaming ? streamingText.analysisParticipant0Pros2 : (p.pros[2] || ''),
                    ].filter(text => text.length > 0)
                  : idx === 1
                    ? [
                        isAnalysisStreaming ? streamingText.analysisParticipant1Pros0 : (p.pros[0] || ''),
                        isAnalysisStreaming ? streamingText.analysisParticipant1Pros1 : (p.pros[1] || ''),
                        isAnalysisStreaming ? streamingText.analysisParticipant1Pros2 : (p.pros[2] || ''),
                      ].filter(text => text.length > 0)
                    : [
                        isAnalysisStreaming ? streamingText.analysisParticipant2Pros0 : (p.pros[0] || ''),
                        isAnalysisStreaming ? streamingText.analysisParticipant2Pros1 : (p.pros[1] || ''),
                        isAnalysisStreaming ? streamingText.analysisParticipant2Pros2 : (p.pros[2] || ''),
                      ].filter(text => text.length > 0),
                cons: idx === 0
                  ? [isAnalysisStreaming ? streamingText.analysisParticipant0Cons0 : (p.cons[0] || '')].filter(text => text.length > 0)
                  : idx === 1
                    ? [isAnalysisStreaming ? streamingText.analysisParticipant1Cons0 : (p.cons[0] || '')].filter(text => text.length > 0)
                    : [isAnalysisStreaming ? streamingText.analysisParticipant2Cons0 : (p.cons[0] || '')].filter(text => text.length > 0),
                summary: idx === 0
                  ? (isAnalysisStreaming ? streamingText.analysisParticipant0Summary : p.summary)
                  : idx === 1
                    ? (isAnalysisStreaming ? streamingText.analysisParticipant1Summary : p.summary)
                    : (isAnalysisStreaming ? streamingText.analysisParticipant2Summary : p.summary),
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
