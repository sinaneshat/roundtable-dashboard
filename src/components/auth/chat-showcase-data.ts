/**
 * Mock data for chat showcase on login page
 * Simulates a complete chat round with web search, multiple participants, and analysis
 */

import { AnalysisStatuses, MessagePartTypes, MessageStatuses, WebSearchDepths } from '@/api/core/enums';
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
  id: 'msg-user-1',
  role: 'user' as const,
  content: 'What are the latest trends in AI-powered collaboration tools?',
  createdAt: new Date(),
  metadata: {
    role: 'user' as const,
    roundNumber: 1,
  },
};

export const MOCK_PRE_SEARCH: StoredPreSearch = {
  id: 'pre-search-1',
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
        total: 2,
      },
      {
        query: 'AI team productivity features comparison',
        rationale: 'Compare key features across platforms',
        searchDepth: WebSearchDepths.BASIC,
        index: 1,
        total: 2,
      },
    ],
    results: [
      {
        query: 'latest AI collaboration tools 2025',
        answer: 'The AI collaboration landscape in 2025 is dominated by multi-agent systems, real-time knowledge synthesis, and adaptive learning interfaces.',
        results: [
          {
            title: 'The Future of AI Collaboration - TechCrunch',
            url: 'https://techcrunch.com/ai-collaboration-2025',
            content: 'Multi-agent AI systems are revolutionizing how teams work together...',
            score: 0.95,
          },
          {
            title: 'Top 10 AI Tools for Teams - Forbes',
            url: 'https://forbes.com/ai-tools-teams',
            content: 'Leading platforms now offer real-time synthesis of multiple AI perspectives...',
            score: 0.89,
          },
        ],
        responseTime: 1250,
      },
      {
        query: 'AI team productivity features comparison',
        answer: 'Key differentiators include multi-model orchestration, context-aware responses, and seamless human-AI collaboration workflows.',
        results: [
          {
            title: 'AI Productivity Tools Compared - Wired',
            url: 'https://wired.com/ai-productivity',
            content: 'The best tools combine multiple AI models to provide diverse perspectives...',
            score: 0.87,
          },
        ],
        responseTime: 980,
      },
    ],
    analysis: 'Comprehensive search across multiple sources reveals three core trends: multi-agent orchestration, real-time synthesis, and adaptive context management as the defining characteristics of modern AI collaboration platforms.',
    successCount: 2,
    failureCount: 0,
    totalResults: 3,
    totalTime: 2230,
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
    id: 'msg-participant-0',
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
    id: 'msg-participant-1',
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
    id: 'msg-participant-2',
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
  id: 'analysis-1',
  threadId: 'demo-thread',
  roundNumber: 1,
  mode: 'analyzing',
  userQuestion: 'What are the latest trends in AI-powered collaboration tools?',
  participantMessageIds: ['msg-participant-0', 'msg-participant-1', 'msg-participant-2'],
  status: AnalysisStatuses.COMPLETE,
  errorMessage: null,
  createdAt: new Date(),
  completedAt: new Date(),
  analysisData: {
    leaderboard: [
      {
        participantIndex: 0,
        participantRole: 'Strategic Analyst',
        modelId: 'anthropic/claude-3-5-sonnet-20241022',
        modelName: 'Claude 3.5 Sonnet',
        rank: 1,
        overallRating: 9.5,
        badge: 'Most Comprehensive',
      },
      {
        participantIndex: 1,
        participantRole: 'Creative Director',
        modelId: 'openai/gpt-4o',
        modelName: 'GPT-4o',
        rank: 2,
        overallRating: 9.0,
        badge: 'Most Creative',
      },
      {
        participantIndex: 2,
        participantRole: 'Technical Expert',
        modelId: 'google/gemini-2.0-flash-exp',
        modelName: 'Gemini 2.0 Flash',
        rank: 3,
        overallRating: 8.8,
        badge: 'Most Technical',
      },
    ],
    participantAnalyses: [
      {
        participantIndex: 0,
        participantRole: 'Strategic Analyst',
        modelId: 'anthropic/claude-3-5-sonnet-20241022',
        modelName: 'Claude 3.5 Sonnet',
        overallRating: 9.5,
        skillsMatrix: [
          { skillName: 'Clarity', rating: 9.5 },
          { skillName: 'Depth', rating: 9.0 },
          { skillName: 'Creativity', rating: 8.5 },
          { skillName: 'Accuracy', rating: 9.5 },
          { skillName: 'Relevance', rating: 9.5 },
        ],
        pros: [
          'Exceptional structure with numbered framework',
          'Clear evidence-based insights from web search',
          'Comprehensive coverage of major trends',
        ],
        cons: [
          'Could explore more specific implementation examples',
        ],
        summary: 'Delivered a well-structured strategic analysis that effectively synthesized research findings into a clear framework of three major trends.',
      },
      {
        participantIndex: 1,
        participantRole: 'Creative Director',
        modelId: 'openai/gpt-4o',
        modelName: 'GPT-4o',
        overallRating: 9.0,
        skillsMatrix: [
          { skillName: 'Clarity', rating: 9.0 },
          { skillName: 'Depth', rating: 8.0 },
          { skillName: 'Creativity', rating: 9.5 },
          { skillName: 'Accuracy', rating: 8.5 },
          { skillName: 'Relevance', rating: 9.0 },
        ],
        pros: [
          'Unique creative perspective on human-AI interaction',
          'Forward-looking vision of multimodal integration',
          'Complementary insights building on strategic analysis',
        ],
        cons: [
          'Slightly less technical depth than other responses',
        ],
        summary: 'Brought a refreshing creative lens focusing on the human-AI creative loop and future possibilities in multimodal collaboration.',
      },
      {
        participantIndex: 2,
        participantRole: 'Technical Expert',
        modelId: 'google/gemini-2.0-flash-exp',
        modelName: 'Gemini 2.0 Flash',
        overallRating: 8.8,
        skillsMatrix: [
          { skillName: 'Clarity', rating: 8.5 },
          { skillName: 'Depth', rating: 9.5 },
          { skillName: 'Creativity', rating: 8.0 },
          { skillName: 'Accuracy', rating: 9.0 },
          { skillName: 'Relevance', rating: 9.0 },
        ],
        pros: [
          'Deep technical implementation considerations',
          'Strong focus on security and enterprise needs',
          'Practical integration ecosystem analysis',
        ],
        cons: [
          'Could balance technical detail with accessibility',
        ],
        summary: 'Provided essential technical depth covering scalability, security, and integration concerns critical for enterprise adoption.',
      },
    ],
    roundSummary: {
      keyInsights: [
        'Multi-agent systems are the dominant trend in AI collaboration',
        'Real-time knowledge synthesis is becoming essential',
        'Security and privacy remain critical for enterprise adoption',
        'The human-AI creative loop enables new workflows',
        'Integration ecosystems determine platform success',
      ],
      consensusPoints: [
        'All participants emphasized the importance of diverse AI perspectives',
        'Consensus on real-time capabilities being transformative',
        'Shared view on adaptive context management as foundational',
      ],
      divergentApproaches: [
        {
          topic: 'Implementation Focus',
          perspectives: [
            'Strategic: Framework-oriented analysis',
            'Creative: Human-centric vision',
            'Technical: Enterprise requirements',
          ],
        },
      ],
      comparativeAnalysis: {
        strengthsByCategory: [
          {
            category: 'Strategic Thinking',
            participants: ['Strategic Analyst'],
          },
          {
            category: 'Creative Vision',
            participants: ['Creative Director'],
          },
          {
            category: 'Technical Depth',
            participants: ['Technical Expert'],
          },
        ],
        tradeoffs: [
          'Strategic analysis provides structure but may lack creative spark',
          'Creative vision inspires innovation but needs technical grounding',
          'Technical depth ensures viability but requires accessibility improvements',
        ],
      },
      decisionFramework: {
        criteriaToConsider: [
          'Implementation timeline and complexity',
          'Team skill level and resources',
          'Enterprise vs. startup needs',
          'Budget constraints',
        ],
        scenarioRecommendations: [
          {
            scenario: 'Enterprise adoption',
            recommendation: 'Prioritize Technical Expert insights on security and integration',
          },
          {
            scenario: 'Product innovation',
            recommendation: 'Lead with Creative Director vision for human-AI collaboration',
          },
          {
            scenario: 'Strategic planning',
            recommendation: 'Start with Strategic Analyst framework for comprehensive overview',
          },
        ],
      },
      overallSummary: 'The conversation revealed a comprehensive view of AI collaboration trends from three complementary perspectives. Strategic analysis provided structure through the multi-agent orchestration framework, creative insights highlighted the human-AI creative loop potential, and technical depth ensured practical considerations around security and integration. Together, these perspectives demonstrate that successful AI collaboration platforms must balance innovation with implementation realities.',
      conclusion: 'For organizations evaluating AI collaboration tools, the ideal approach combines all three perspectives: strategic framework for planning, creative vision for differentiation, and technical rigor for execution. The convergence of these viewpoints suggests that multi-agent systems with real-time synthesis are becoming the standard, but success requires careful attention to security, integration, and user experience.',
      recommendedActions: [
        {
          action: 'Can you explore the cost-benefit analysis of implementing multi-agent systems? What are the typical ROI timelines and budget considerations?',
          rationale: 'Multiple participants highlighted the value but didn\'t address cost implications',
          suggestedModels: ['anthropic/claude-3-5-sonnet-20241022'],
          suggestedRoles: ['Financial Analyst'],
          suggestedMode: '',
        },
        {
          action: 'What are the ethical considerations and potential risks in AI collaboration systems? How should teams address bias and transparency?',
          rationale: 'Ethical dimensions were not covered in technical or creative analyses',
          suggestedModels: [],
          suggestedRoles: ['Ethics Advisor'],
          suggestedMode: '',
        },
      ],
    },
  },
};
