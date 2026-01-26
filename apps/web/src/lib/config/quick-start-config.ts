import type { ChatMode } from '@roundtable/shared';
import { ChatModes } from '@roundtable/shared';

export type PromptTemplate = {
  title: string;
  prompt: string;
  mode: ChatMode;
  roles: string[];
};

export const PROMPT_POOL: PromptTemplate[] = [
  // CEO/Executive
  {
    mode: ChatModes.DEBATING,
    prompt: 'We\'re a $4M ARR B2B SaaS (project management, 40 employees). Our main competitor just got acquired by Microsoft for $200M. We have 18 months runway and 15% MoM growth. Seek acquisition while market is hot, raise Series A to compete, or stay bootstrapped and niche down?',
    roles: ['Strategic Advisor', 'M&A Expert', 'Growth Strategist'],
    title: 'Our competitor got acquired. Seek a buyer or raise to compete?',
  },
  {
    mode: ChatModes.ANALYZING,
    prompt: 'We\'re a $6M ARR fintech startup, profitable at $400K/year but growth dropped from 8% to 3% MoM. We have $2M in the bank, 50 employees. Cut 20% of staff to extend runway to 3 years, or spend reserves on sales/marketing to reignite growth?',
    roles: ['CFO Advisor', 'Growth Expert', 'Operations Analyst'],
    title: 'Cash-flow positive but growth slowing. Cut costs or invest?',
  },
  {
    mode: ChatModes.DEBATING,
    prompt: 'Our VP of Engineering (5 years, built the whole platform) just got a $450K offer from our main competitor. He currently makes $280K + 1.5% equity. Counter-offer with a $350K + 0.5% refresh, let him go gracefully, or remind him of his 2-year non-compete?',
    roles: ['HR Strategist', 'Legal Counsel', 'Culture Advisor'],
    title: 'Key executive leaving for competitor. Counter-offer or let go?',
  },
  {
    mode: ChatModes.ANALYZING,
    prompt: 'We\'re #3 in our market ($8M ARR). #1 and #2 just merged. A smaller competitor ($2M ARR) is available for $5M. We have $3M cash. Take debt to acquire them and become #2, focus on profitability to become attractive acquisition target, or keep competing as is?',
    roles: ['M&A Advisor', 'Market Analyst', 'Strategic Planner'],
    title: 'Market consolidating. Acquire a smaller player or be acquired?',
  },
  // Product Management
  {
    mode: ChatModes.DEBATING,
    prompt: 'Our top 5 enterprise customers ($1.2M combined ARR) are demanding Salesforce integration. Building it requires 3 months and pulls us away from our AI roadmap which we believe is our moat. They\'ve hinted they\'ll churn without it. Build the integration, hold firm on AI strategy, or offer a discount to buy time?',
    roles: ['Product Strategist', 'Customer Success Lead', 'Tech Lead'],
    title: 'Users want feature X, but it conflicts with strategy. Build it?',
  },
  {
    mode: ChatModes.ANALYZING,
    prompt: 'We planned to launch AI-powered analytics next quarter—our main differentiator. Competitor just shipped it last week, getting press coverage. We\'re 2 months from launch with arguably better implementation. Ship anyway and compete on quality, pivot to a different AI feature, or accelerate launch and cut scope?',
    roles: ['Competitive Analyst', 'Product Lead', 'UX Strategist'],
    title: 'Competitor launched our roadmap feature. Pivot or execute better?',
  },
  {
    mode: ChatModes.DEBATING,
    prompt: 'Three Fortune 500 prospects ($800K combined ACV) require on-premises deployment. Engineering estimates 6 months to build and 40% slower feature velocity ongoing. Current ARR is $3M, all cloud. Accept the architectural complexity for $800K, decline and stay cloud-only, or offer a hybrid compromise?',
    roles: ['Enterprise Advisor', 'Engineering Lead', 'Revenue Strategist'],
    title: 'Enterprise wants on-prem but it slows velocity 40%. Worth it?',
  },
  {
    mode: ChatModes.ANALYZING,
    prompt: 'Our free tier has 50K users with 2% converting to paid ($50/mo). Conversion dropped from 4% as free features expanded. Free users cost $3/mo to serve. Kill free tier entirely, add aggressive limits (storage, exports), or double down on viral features hoping volume compensates?',
    roles: ['Growth Analyst', 'Monetization Expert', 'Product Strategist'],
    title: 'Free tier cannibalizing paid. Kill it or lean into viral growth?',
  },
  // Legal
  {
    mode: ChatModes.DEBATING,
    prompt: 'We\'re \'Beacon Analytics\' (2 years old, $2M brand investment). Received C&D from \'Beacon Insurance\' (Fortune 500). Our lawyer says we\'d likely win (different industries) but litigation costs $300K+. Rebrand for ~$500K, fight it, or offer coexistence agreement with geographic/industry restrictions?',
    roles: ['IP Attorney', 'Brand Strategist', 'Risk Advisor'],
    title: 'Cease & desist on trademark. Fight, rebrand, or negotiate?',
  },
  {
    mode: ChatModes.ANALYZING,
    prompt: 'Terminated employee (sales, 18 months tenure, documented performance issues) is threatening wrongful termination suit claiming discrimination. Their lawyer is asking $150K to settle. Our lawyer estimates $80K to litigate with 70% win probability. Settle quickly to avoid PR, litigate to avoid setting precedent, or counter-offer at $75K?',
    roles: ['Employment Counsel', 'HR Advisor', 'PR Strategist'],
    title: 'Employee alleges wrongful termination. Settle or litigate?',
  },
  {
    mode: ChatModes.DEBATING,
    prompt: 'Patent troll is suing us for $2M over a vague \'data synchronization\' patent. They\'ve settled with 12 other companies for $200-400K each. Our tech clearly differs but litigation costs $500K+. Pay $300K to settle, fight to set precedent for the industry, or spend $100K on prior art search first?',
    roles: ['Patent Attorney', 'Litigation Strategist', 'Technical Expert'],
    title: 'Patent troll lawsuit. Settle, fight, or find prior art?',
  },
  // Healthcare
  {
    mode: ChatModes.ANALYZING,
    prompt: 'Stage 4 pancreatic cancer patient, 68yo, otherwise healthy. Standard chemo offers 8% 2-year survival. New immunotherapy trial shows 22% in early data (n=45) but severe side effects in 30% of cases. Patient has good insurance, wants to fight. Recommend trial, standard treatment, or palliative care focus?',
    roles: ['Oncologist', 'Medical Ethicist', 'Patient Advocate'],
    title: 'New treatment promising but limited data. Recommend to patient?',
  },
  {
    mode: ChatModes.DEBATING,
    prompt: 'Patient with complex cardiac + kidney issues. Cardiologist recommends surgery (15% mortality risk, fixes heart). Nephrologist says surgery will accelerate kidney failure requiring dialysis within a year. Patient is 58, active, values quality of life. Surgery with kidney risk, medical management only, or seek third opinion and delay?',
    roles: ['Chief Medical Officer', 'Care Coordinator', 'Risk Analyst'],
    title: 'Conflicting specialist opinions on treatment. How to proceed?',
  },
  {
    mode: ChatModes.ANALYZING,
    prompt: 'ICU at 95% capacity for 8 weeks. Nursing turnover hit 40% annually. Travel nurses cost $150/hr vs $45/hr for staff. Options: reduce beds by 20% (losing $2M/month revenue), hire travel nurses ($800K/month extra), or mandatory overtime with retention bonuses ($200K/month). Which approach for the next 6 months?',
    roles: ['Healthcare Administrator', 'HR Director', 'Finance Lead'],
    title: 'Staff burnout crisis. Cut capacity or hire expensive travel nurses?',
  },
  // General Board Room
  {
    mode: ChatModes.ANALYZING,
    prompt: 'Board mandated 20% cost reduction ($2M annually). Current spend: Engineering $4M, Sales $3M, Marketing $1.5M, G&A $1.5M. Growth is 30% YoY, mostly from sales team. Cut engineering (slow product), cut sales (slow growth), cut marketing (hurt brand), or across-the-board 20% including layoffs?',
    roles: ['CFO Advisor', 'Operations Expert', 'Strategic Planner'],
    title: 'Need to cut 20% of costs. Where do we cut without killing growth?',
  },
  {
    mode: ChatModes.DEBATING,
    prompt: 'We run a $10M content writing agency (200 writers). AI tools now produce 70% quality content at 5% of our cost. Revenue down 15% this year. Options: pivot to AI-assisted premium content (layoff 150 writers), become an AI tools reseller, double down on human-only quality positioning, or exit the business while we still can?',
    roles: ['Innovation Lead', 'Industry Analyst', 'Strategy Advisor'],
    title: 'Our industry is being disrupted by AI. Adapt, pivot, or ignore?',
  },
  {
    mode: ChatModes.DEBATING,
    prompt: 'Our largest customer ($3M of $7.5M ARR) wants exclusive rights to our product in their industry for 3 years. They\'ll pay 25% premium ($750K/year extra). But it blocks us from 4 known prospects worth ~$1M ARR combined. Accept exclusivity, negotiate narrower terms, or decline and risk them churning?',
    roles: ['Revenue Strategist', 'Risk Advisor', 'Legal Counsel'],
    title: 'Key customer with 40% revenue demanding exclusivity. Accept terms?',
  },
  {
    mode: ChatModes.ANALYZING,
    prompt: 'Our COO (co-founder, 10 years) accused of harassment by former employee. Story broke on Twitter, 500K views. No police report, but two other employees corroborated privately. COO denies everything. Suspend immediately pending investigation, issue statement supporting COO, hire external investigator and say nothing, or ask for resignation?',
    roles: ['Crisis Manager', 'Legal Counsel', 'Communications Lead'],
    title: 'PR crisis: executive misconduct allegation. Response strategy?',
  },
];

export type QuickStartData = {
  promptIndices: number[];
  providerOffset: number;
};

/**
 * Server-side random selection for quick start suggestions.
 * Called in route loader - ensures consistent data on SSR and hydration.
 */
export function getServerQuickStartData(): QuickStartData {
  // Fisher-Yates shuffle indices
  const indices = Array.from({ length: PROMPT_POOL.length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = indices[i];
    const swapValue = indices[j];
    // Array bounds guaranteed by loop: i < length, j <= i
    if (temp !== undefined && swapValue !== undefined) {
      indices[i] = swapValue;
      indices[j] = temp;
    }
  }

  return {
    promptIndices: indices.slice(0, 3),
    providerOffset: Math.floor(Math.random() * 10),
  };
}

/**
 * Get prompt templates by pre-selected indices (from server loader data).
 */
export function getPromptsByIndices(indices: number[]): PromptTemplate[] {
  return indices
    .map(idx => PROMPT_POOL[idx])
    .filter((p): p is PromptTemplate => p !== undefined);
}
