/**
 * Mock data for chat showcase on login page
 * Simulates a complete chat round with web search, multiple participants, and analysis
 */

import {
  AgreementStatuses,
  AnalysisStatuses,
  ConfidenceWeightings,
  DebatePhases,
  EvidenceStrengths,
  MessagePartTypes,
  MessageStatuses,
  VoteTypes,
  WebSearchDepths,
} from '@/api/core/enums';
import type { StoredModeratorAnalysis, StoredPreSearch } from '@/api/routes/chat/schema';
import type { MessagePart } from '@/lib/schemas/message-schemas';

export const MOCK_USER = {
  name: 'Demo User',
  image: null,
};

export const MOCK_PARTICIPANTS = [
  {
    modelId: 'anthropic/claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    name: 'Claude 3.5 Sonnet',
    role: 'Strategic Analyst',
  },
  {
    modelId: 'openai/gpt-4o',
    provider: 'openai',
    name: 'GPT-4o',
    role: 'Creative Director',
  },
  {
    modelId: 'google/gemini-2.0-flash-exp',
    provider: 'google',
    name: 'Gemini 2.0 Flash',
    role: 'Technical Expert',
  },
];

export const MOCK_USER_MESSAGE = {
  id: 'msg-demo-user-001',
  role: 'user' as const,
  content: 'What are the latest trends in AI-powered collaboration tools?',
  createdAt: new Date(),
  metadata: {
    role: 'user' as const,
    roundNumber: 1,
  },
};

export const MOCK_PRE_SEARCH: StoredPreSearch = {
  id: 'pre-search-demo-001',
  threadId: 'demo-thread',
  roundNumber: 1,
  userQuery: 'What are the latest trends in AI-powered collaboration tools?',
  status: AnalysisStatuses.COMPLETE,
  errorMessage: null,
  searchData: {
    queries: [
      {
        query: 'latest AI collaboration tools 2025',
        rationale: 'Focus on current year trends and innovations',
        searchDepth: WebSearchDepths.ADVANCED,
        index: 0,
        total: 3,
      },
      {
        query: 'AI team productivity features comparison',
        rationale: 'Compare key features across platforms',
        searchDepth: WebSearchDepths.BASIC,
        index: 1,
        total: 3,
      },
      {
        query: 'multi-agent AI systems enterprise adoption',
        rationale: 'Understand enterprise-level implementations and case studies',
        searchDepth: WebSearchDepths.ADVANCED,
        index: 2,
        total: 3,
      },
    ],
    results: [
      {
        query: 'latest AI collaboration tools 2025',
        answer: 'The AI collaboration landscape in 2025 is dominated by multi-agent systems, real-time knowledge synthesis, and adaptive learning interfaces. Leading platforms are integrating multiple AI models to provide diverse perspectives and enhanced problem-solving capabilities.',
        results: [
          {
            title: 'The Future of AI Collaboration: 2025 Trends & Innovations',
            url: 'https://techcrunch.com/2025/ai-collaboration-future',
            content: 'Multi-agent AI systems are revolutionizing how teams work together, enabling unprecedented levels of collaborative intelligence.',
            excerpt: 'Multi-agent AI systems are revolutionizing team collaboration...',
            fullContent: 'Multi-agent AI systems are revolutionizing how teams work together, enabling unprecedented levels of collaborative intelligence. These systems combine the strengths of multiple AI models, each specializing in different aspects of problem-solving. From strategic analysis to creative ideation, multi-agent platforms are becoming the backbone of modern enterprise collaboration. Key trends include: 1) Real-time synthesis of diverse AI perspectives, 2) Context-aware response generation, and 3) Seamless human-AI collaboration workflows that enhance rather than replace human creativity.',
            rawContent: 'Multi-agent AI systems are revolutionizing how teams work together...',
            score: 0.95,
            publishedDate: '2025-01-15',
            domain: 'techcrunch.com',
            metadata: {
              author: 'Sarah Chen',
              readingTime: 8,
              wordCount: 2450,
              description: 'An in-depth look at how multi-agent AI is transforming enterprise collaboration in 2025.',
              faviconUrl: 'https://techcrunch.com/favicon.ico',
            },
          },
          {
            title: 'Top 10 AI Tools for Teams in 2025 - Complete Guide',
            url: 'https://forbes.com/sites/technology/ai-tools-teams-2025',
            content: 'Leading platforms now offer real-time synthesis of multiple AI perspectives, transforming how organizations approach complex problem-solving.',
            excerpt: 'Leading platforms offer real-time synthesis of multiple AI perspectives...',
            fullContent: 'Leading platforms now offer real-time synthesis of multiple AI perspectives, transforming how organizations approach complex problem-solving. Our comprehensive analysis of the top 10 AI collaboration tools reveals common themes: multi-model orchestration, enterprise-grade security, and intuitive user interfaces that minimize the learning curve. Standout features include automated meeting summaries, intelligent document analysis, and predictive workflow optimization.',
            rawContent: 'Leading platforms now offer real-time synthesis of multiple AI perspectives...',
            score: 0.92,
            publishedDate: '2025-01-10',
            domain: 'forbes.com',
            metadata: {
              author: 'Michael Roberts',
              readingTime: 12,
              wordCount: 3200,
              description: 'Forbes technology ranking of the best AI collaboration tools for enterprise teams.',
              faviconUrl: 'https://forbes.com/favicon.ico',
            },
          },
          {
            title: 'How AI is Reshaping Remote Work Collaboration',
            url: 'https://hbr.org/2025/01/ai-remote-work-collaboration',
            content: 'Research shows AI-powered collaboration tools increase team productivity by 40% while reducing meeting time by 25%.',
            excerpt: 'AI-powered tools increase productivity by 40%...',
            fullContent: 'Our latest research shows AI-powered collaboration tools increase team productivity by 40% while reducing meeting time by 25%. Key findings from our study of 500+ organizations reveal that the most effective implementations focus on augmentation rather than automation. Teams using multi-agent AI systems report higher satisfaction scores and better work-life balance due to reduced cognitive load from routine tasks.',
            rawContent: 'Research shows AI-powered collaboration tools increase team productivity...',
            score: 0.89,
            publishedDate: '2025-01-08',
            domain: 'hbr.org',
            metadata: {
              author: 'Dr. Emily Zhang',
              readingTime: 6,
              wordCount: 1800,
              description: 'Harvard Business Review research on AI collaboration impact.',
              faviconUrl: 'https://hbr.org/favicon.ico',
            },
          },
        ],
        responseTime: 1250,
      },
      {
        query: 'AI team productivity features comparison',
        answer: 'Key differentiators include multi-model orchestration, context-aware responses, and seamless human-AI collaboration workflows. The best platforms combine real-time synthesis with adaptive learning.',
        results: [
          {
            title: 'AI Productivity Tools Compared: A Technical Deep Dive',
            url: 'https://wired.com/story/ai-productivity-tools-comparison-2025',
            content: 'The best tools combine multiple AI models to provide diverse perspectives and comprehensive analysis capabilities.',
            excerpt: 'The best tools combine multiple AI models for diverse perspectives...',
            fullContent: 'The best tools combine multiple AI models to provide diverse perspectives and comprehensive analysis capabilities. Our technical comparison evaluated 15 leading platforms across key metrics: response quality, context retention, integration ecosystem, and enterprise security. Multi-model orchestration emerged as the key differentiator, with platforms supporting 3+ AI providers showing 60% better results on complex problem-solving tasks.',
            rawContent: 'The best tools combine multiple AI models to provide diverse perspectives...',
            score: 0.91,
            publishedDate: '2025-01-12',
            domain: 'wired.com',
            metadata: {
              author: 'Alex Thompson',
              readingTime: 10,
              wordCount: 2800,
              description: 'Technical comparison of AI productivity platforms for enterprise teams.',
              faviconUrl: 'https://wired.com/favicon.ico',
            },
          },
          {
            title: 'Enterprise AI: ROI Analysis and Implementation Guide',
            url: 'https://mckinsey.com/capabilities/quantumblack/ai-enterprise-roi',
            content: 'Organizations implementing AI collaboration tools see average ROI of 250% within 18 months of deployment.',
            excerpt: 'Average ROI of 250% within 18 months...',
            fullContent: 'Organizations implementing AI collaboration tools see average ROI of 250% within 18 months of deployment. Our analysis of 200+ enterprise implementations identifies key success factors: executive sponsorship, phased rollout strategies, and continuous training programs. The most successful deployments prioritize integration with existing workflows rather than wholesale replacement.',
            rawContent: 'Organizations implementing AI collaboration tools see average ROI of 250%...',
            score: 0.88,
            publishedDate: '2025-01-05',
            domain: 'mckinsey.com',
            metadata: {
              author: 'McKinsey Digital',
              readingTime: 15,
              wordCount: 4500,
              description: 'McKinsey research on enterprise AI collaboration ROI.',
              faviconUrl: 'https://mckinsey.com/favicon.ico',
            },
          },
        ],
        responseTime: 980,
      },
      {
        query: 'multi-agent AI systems enterprise adoption',
        answer: 'Enterprise adoption of multi-agent AI is accelerating, with 67% of Fortune 500 companies piloting or deploying such systems. Success factors include clear governance frameworks and integration strategies.',
        results: [
          {
            title: 'Multi-Agent AI: The Next Frontier in Enterprise Intelligence',
            url: 'https://mit.edu/research/multi-agent-ai-enterprise',
            content: 'MIT research reveals that multi-agent systems outperform single-model approaches by 45% on complex analytical tasks.',
            excerpt: 'Multi-agent systems outperform single-model approaches by 45%...',
            fullContent: 'MIT research reveals that multi-agent systems outperform single-model approaches by 45% on complex analytical tasks. Our two-year study examined how enterprises are deploying these systems across functions including strategy, operations, and customer service. Key findings highlight the importance of agent specialization, with the most effective deployments using 3-5 distinct AI models with complementary capabilities.',
            rawContent: 'MIT research reveals that multi-agent systems outperform single-model approaches...',
            score: 0.94,
            publishedDate: '2025-01-14',
            domain: 'mit.edu',
            metadata: {
              author: 'Prof. David Kim',
              readingTime: 20,
              wordCount: 5500,
              description: 'MIT Computer Science research on multi-agent AI systems.',
              faviconUrl: 'https://mit.edu/favicon.ico',
            },
          },
          {
            title: 'Gartner: Multi-Agent AI Adoption Accelerates in 2025',
            url: 'https://gartner.com/en/newsroom/multi-agent-ai-adoption-2025',
            content: '67% of Fortune 500 companies now piloting or deploying multi-agent AI systems, up from 23% in 2024.',
            excerpt: '67% of Fortune 500 companies piloting multi-agent AI...',
            fullContent: '67% of Fortune 500 companies now piloting or deploying multi-agent AI systems, up from 23% in 2024. Gartner predicts this figure will reach 85% by 2026. Industries leading adoption include financial services (78%), healthcare (72%), and technology (89%). Implementation challenges remain around governance, model coordination, and measuring ROI across distributed AI investments.',
            rawContent: '67% of Fortune 500 companies now piloting or deploying multi-agent AI systems...',
            score: 0.90,
            publishedDate: '2025-01-11',
            domain: 'gartner.com',
            metadata: {
              author: 'Gartner Research',
              readingTime: 5,
              wordCount: 1200,
              description: 'Gartner analysis of enterprise multi-agent AI adoption trends.',
              faviconUrl: 'https://gartner.com/favicon.ico',
            },
          },
        ],
        responseTime: 1150,
      },
    ],
    analysis: 'Comprehensive search across multiple authoritative sources reveals three core trends: multi-agent orchestration, real-time synthesis, and adaptive context management as the defining characteristics of modern AI collaboration platforms. Enterprise adoption is accelerating, with research indicating significant productivity gains and ROI for organizations implementing these systems strategically.',
    successCount: 3,
    failureCount: 0,
    totalResults: 7,
    totalTime: 3380,
  },
  createdAt: new Date(),
  completedAt: new Date(),
};

export const MOCK_PARTICIPANT_MESSAGES: Array<{
  id: string;
  role: 'assistant';
  parts: MessagePart[];
  status: typeof MessageStatuses.COMPLETE;
  participantIndex: number;
  metadata: {
    role: 'assistant';
    roundNumber: number;
    participantId: string;
    participantIndex: number;
    participantRole: string | null;
    model: string;
    finishReason: 'stop';
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    hasError: boolean;
    model_tier: string;
    isTransient: boolean;
    isPartialResponse: boolean;
  };
}> = [
  {
    id: 'msg-demo-participant-0',
    role: 'assistant',
    parts: [
      {
        type: MessagePartTypes.TEXT,
        text: `Based on the latest research, I see three major trends shaping AI collaboration:

**1. Multi-Agent Orchestration**
The shift from single AI assistants to coordinated teams of specialized agents is transformative. Each agent brings unique strengths - one excels at strategic thinking, another at creative problem-solving, and a third at technical implementation.

**2. Real-Time Knowledge Synthesis**
Advanced web search capabilities that don't just retrieve information but synthesize it into actionable insights are becoming table stakes. The ability to process multiple sources and extract key patterns in seconds is a game-changer.

**3. Adaptive Context Management**
Modern tools understand conversation history and maintain context across extended sessions, enabling more natural and productive interactions over time.`,
      },
    ],
    status: MessageStatuses.COMPLETE,
    participantIndex: 0,
    metadata: {
      role: 'assistant' as const,
      roundNumber: 1,
      participantId: 'participant-0',
      participantIndex: 0,
      participantRole: 'Strategic Analyst',
      model: 'anthropic/claude-3-5-sonnet-20241022',
      finishReason: 'stop' as const,
      usage: {
        promptTokens: 850,
        completionTokens: 420,
        totalTokens: 1270,
      },
      hasError: false,
      model_tier: 'premium',
      isTransient: false,
      isPartialResponse: false,
    },
  },
  {
    id: 'msg-demo-participant-1',
    role: 'assistant',
    parts: [
      {
        type: MessagePartTypes.TEXT,
        text: `I'd add a creative perspective on where this is heading:

**The Human-AI Creative Loop**
What excites me most is how these tools are enabling a new creative process. Humans provide the vision and strategic direction, while AI agents rapidly explore possibilities, generate alternatives, and identify blind spots.

**Diversity of Thought**
Having multiple AI models with different training and strengths is like assembling a diverse team - you get richer discussions and more innovative solutions. One model might approach a problem analytically, while another brings creative intuition.

**Visual and Multimodal Integration**
The next frontier is seamless integration of text, images, code, and data visualization in collaborative workflows. Imagine brainstorming where AI can instantly generate mockups, diagrams, or prototypes to illustrate ideas.`,
      },
    ],
    status: MessageStatuses.COMPLETE,
    participantIndex: 1,
    metadata: {
      role: 'assistant' as const,
      roundNumber: 1,
      participantId: 'participant-1',
      participantIndex: 1,
      participantRole: 'Creative Director',
      model: 'openai/gpt-4o',
      finishReason: 'stop' as const,
      usage: {
        promptTokens: 820,
        completionTokens: 390,
        totalTokens: 1210,
      },
      hasError: false,
      model_tier: 'premium',
      isTransient: false,
      isPartialResponse: false,
    },
  },
  {
    id: 'msg-demo-participant-2',
    role: 'assistant',
    parts: [
      {
        type: MessagePartTypes.TEXT,
        text: `From a technical standpoint, here are the critical implementation considerations:

**Scalability and Performance**
Modern collaboration platforms need to handle multiple concurrent AI streams, maintain sub-second response times, and gracefully manage network interruptions. This requires sophisticated state management and resilient architectures.

**Security and Privacy**
Enterprise adoption hinges on robust data protection, with features like:
- End-to-end encryption for sensitive conversations
- Granular access controls
- Audit trails for compliance
- Data residency options for regulated industries

**Integration Ecosystem**
The most successful tools offer extensive APIs and integrations - connecting with project management systems, code repositories, design tools, and business intelligence platforms. This creates a unified workspace where AI augments every aspect of the workflow.`,
      },
    ],
    status: MessageStatuses.COMPLETE,
    participantIndex: 2,
    metadata: {
      role: 'assistant' as const,
      roundNumber: 1,
      participantId: 'participant-2',
      participantIndex: 2,
      participantRole: 'Technical Expert',
      model: 'google/gemini-2.0-flash-exp',
      finishReason: 'stop' as const,
      usage: {
        promptTokens: 880,
        completionTokens: 410,
        totalTokens: 1290,
      },
      hasError: false,
      model_tier: 'standard',
      isTransient: false,
      isPartialResponse: false,
    },
  },
];

export const MOCK_ANALYSIS: StoredModeratorAnalysis = {
  id: 'analysis-demo-001',
  threadId: 'demo-thread',
  roundNumber: 1,
  mode: 'analyzing',
  userQuestion: 'What are the latest trends in AI-powered collaboration tools?',
  participantMessageIds: ['msg-demo-participant-0', 'msg-demo-participant-1', 'msg-demo-participant-2'],
  status: AnalysisStatuses.COMPLETE,
  errorMessage: null,
  createdAt: new Date(),
  completedAt: new Date(),
  analysisData: {
    // Round Confidence Header
    roundConfidence: 78,
    confidenceWeighting: ConfidenceWeightings.BALANCED,

    // Consensus Evolution - Timeline showing consensus at each debate phase
    consensusEvolution: [
      { phase: DebatePhases.OPENING, percentage: 45, label: 'Opening' },
      { phase: DebatePhases.REBUTTAL, percentage: 52, label: 'Rebuttal' },
      { phase: DebatePhases.CROSS_EXAM, percentage: 61, label: 'Cross-Exam' },
      { phase: DebatePhases.SYNTHESIS, percentage: 72, label: 'Synthesis' },
      { phase: DebatePhases.FINAL_VOTE, percentage: 78, label: 'Final Vote' },
    ],

    // Key Insights & Recommendations
    summary: 'The conversation revealed a comprehensive view of AI collaboration trends from three complementary perspectives. Strategic analysis provided structure through multi-agent orchestration, creative insights highlighted the human-AI creative loop potential, and technical depth ensured practical considerations around security and integration.',
    recommendations: [
      {
        title: 'Explore cost-benefit analysis of multi-agent systems',
        description: 'Multiple participants highlighted the value but didn\'t address cost implications. Analyze typical ROI timelines and budget considerations.',
        suggestedModels: ['anthropic/claude-3-5-sonnet-20241022'],
        suggestedRoles: ['Financial Analyst'],
        suggestedMode: 'analyzing',
      },
      {
        title: 'Address ethical considerations and potential risks',
        description: 'Ethical dimensions were not covered in technical or creative analyses. Examine bias, transparency, and responsible AI practices.',
        suggestedModels: ['anthropic/claude-3-5-sonnet-20241022'],
        suggestedRoles: ['Ethics Advisor'],
        suggestedMode: 'analyzing',
      },
    ],

    // Contributor Perspectives - Multi-AI Deliberation
    contributorPerspectives: [
      {
        participantIndex: 0,
        role: 'Strategic Analyst',
        modelId: 'anthropic/claude-3-5-sonnet-20241022',
        modelName: 'Claude 3.5 Sonnet',
        scorecard: {
          logic: 95,
          riskAwareness: 88,
          creativity: 85,
          evidence: 92,
          consensus: 90,
        },
        stance: 'Delivered a well-structured strategic analysis that effectively synthesized research findings into a clear framework of three major trends: multi-agent orchestration, real-time knowledge synthesis, and adaptive learning interfaces.',
        evidence: [
          'Provided numbered framework with clear structure',
          'Used evidence-based insights from web search data',
          'Comprehensive coverage of major collaboration trends',
        ],
        vote: VoteTypes.APPROVE,
      },
      {
        participantIndex: 1,
        role: 'Creative Director',
        modelId: 'openai/gpt-4o',
        modelName: 'GPT-4o',
        scorecard: {
          logic: 87,
          riskAwareness: 75,
          creativity: 98,
          evidence: 82,
          consensus: 85,
        },
        stance: 'Brought a refreshing creative lens focusing on the human-AI creative loop and future possibilities in multimodal collaboration. Emphasized innovative approaches to user experience.',
        evidence: [
          'Unique perspective on human-AI interaction patterns',
          'Forward-looking vision of multimodal integration',
          'Complementary insights building on strategic foundation',
        ],
        vote: VoteTypes.APPROVE,
      },
      {
        participantIndex: 2,
        role: 'Technical Expert',
        modelId: 'google/gemini-2.0-flash-exp',
        modelName: 'Gemini 2.0 Flash',
        scorecard: {
          logic: 92,
          riskAwareness: 95,
          creativity: 78,
          evidence: 90,
          consensus: 88,
        },
        stance: 'Provided essential technical depth covering scalability, security, and integration concerns critical for enterprise adoption. Strong focus on implementation realities.',
        evidence: [
          'Deep technical implementation considerations',
          'Security and enterprise needs analysis',
          'Practical integration ecosystem assessment',
        ],
        vote: VoteTypes.CAUTION,
      },
    ],

    // Consensus Analysis
    consensusAnalysis: {
      alignmentSummary: {
        totalClaims: 8,
        majorAlignment: 6,
        contestedClaims: 2,
        contestedClaimsList: [
          { claim: 'Implementation timeline expectations', status: 'contested' },
          { claim: 'Technical complexity vs. user accessibility', status: 'contested' },
        ],
      },
      agreementHeatmap: [
        {
          claim: 'Multi-agent systems are transformative',
          perspectives: {
            'Strategic Analyst': AgreementStatuses.AGREE,
            'Creative Director': AgreementStatuses.AGREE,
            'Technical Expert': AgreementStatuses.AGREE,
          },
        },
        {
          claim: 'Real-time synthesis is essential',
          perspectives: {
            'Strategic Analyst': AgreementStatuses.AGREE,
            'Creative Director': AgreementStatuses.AGREE,
            'Technical Expert': AgreementStatuses.CAUTION,
          },
        },
        {
          claim: 'Security remains a critical concern',
          perspectives: {
            'Strategic Analyst': AgreementStatuses.CAUTION,
            'Creative Director': AgreementStatuses.DISAGREE,
            'Technical Expert': AgreementStatuses.AGREE,
          },
        },
      ],
      argumentStrengthProfile: {
        'Strategic Analyst': {
          logic: 95,
          evidence: 92,
          riskAwareness: 88,
          consensus: 90,
          creativity: 85,
        },
        'Creative Director': {
          logic: 87,
          evidence: 82,
          riskAwareness: 75,
          consensus: 85,
          creativity: 98,
        },
        'Technical Expert': {
          logic: 92,
          evidence: 90,
          riskAwareness: 95,
          consensus: 88,
          creativity: 78,
        },
      },
    },

    // Evidence & Reasoning
    evidenceAndReasoning: {
      reasoningThreads: [
        {
          claim: 'Multi-agent systems dominate AI collaboration',
          synthesis: 'All three participants referenced multi-agent orchestration as a core trend, with Strategic Analyst providing framework analysis, Creative Director exploring user experience implications, and Technical Expert addressing implementation requirements.',
        },
        {
          claim: 'Real-time knowledge synthesis is critical',
          synthesis: 'Consensus emerged around real-time capabilities, though Technical Expert raised valid concerns about latency and infrastructure requirements that warrant further investigation.',
        },
        {
          claim: 'Integration ecosystems determine success',
          synthesis: 'Technical Expert\'s focus on integration aligned with Strategic Analyst\'s framework, while Creative Director emphasized the importance of seamless user workflows.',
        },
      ],
      evidenceCoverage: [
        {
          claim: 'Multi-agent orchestration is key trend',
          strength: EvidenceStrengths.STRONG,
          percentage: 92,
        },
        {
          claim: 'Security requires careful attention',
          strength: EvidenceStrengths.STRONG,
          percentage: 78,
        },
        {
          claim: 'Creative workflows enable innovation',
          strength: EvidenceStrengths.MODERATE,
          percentage: 65,
        },
        {
          claim: 'Implementation timeline is flexible',
          strength: EvidenceStrengths.WEAK,
          percentage: 45,
        },
      ],
    },

    // Explore Alternatives
    alternatives: [
      {
        scenario: 'Enterprise adoption with phased rollout',
        confidence: 85,
      },
      {
        scenario: 'Startup rapid deployment with MVP approach',
        confidence: 72,
      },
      {
        scenario: 'Hybrid approach balancing innovation and stability',
        confidence: 90,
      },
    ],

    // Round Summary
    roundSummary: {
      participation: {
        approved: 2,
        cautioned: 1,
        rejected: 0,
      },
      keyThemes: 'Multi-agent collaboration, real-time synthesis, enterprise security, human-AI workflows, integration ecosystems',
      unresolvedQuestions: [
        'What are the typical ROI timelines for multi-agent system implementation?',
        'How should teams balance technical complexity with user accessibility?',
        'What ethical frameworks should govern AI collaboration platforms?',
      ],
      generated: new Date().toISOString(),
    },
  },
};
