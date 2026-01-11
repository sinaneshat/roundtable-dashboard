# CLAUDE.md

- In all interactions and commit messages, be extremely concise and sacrifice grammar for the sake of concision. 

Project guidance for Claude Code specialized agents working on Roundtable - a collaborative AI brainstorming platform where multiple AI models work together to solve problems and generate ideas.

## 🚨 DOCUMENTATION HIERARCHY

**TYPE SAFETY & INFERENCE PATTERNS** (ALL AGENTS MUST READ):
- **🚨 MANDATORY**: `/docs/type-inference-patterns.md`
- **Defines**: Enum 5-part pattern, metadata type safety chain, query keys, Zod schemas, type inference
- **Enforces**: Single source of truth, Zod-first pattern, no escape hatches, discriminated unions
- **ALL agents MUST follow these patterns without deviation**

**BACKEND DEVELOPMENT**:
- **🚨 SINGLE SOURCE OF TRUTH**: `/docs/backend-patterns.md`
- **ALL backend agents MUST read this document FIRST before any implementation**
- **NO backend work should deviate from patterns defined in this document**
- **This document supersedes all other backend guidance**

**FRONTEND DEVELOPMENT**:
- **🚨 SINGLE SOURCE OF TRUTH**: `/docs/frontend-patterns.md`
- **ALL frontend agents MUST read this document FIRST before any implementation**
- **NO frontend work should deviate from patterns defined in this document**
- **This document supersedes all other frontend guidance**

**Other Documentation**:
- Database schema: Reference `/src/db/tables/` but follow patterns from backend-patterns.md
- Configuration: Use `/wrangler.jsonc` and environment setup guides

## Essential Commands

```bash
# Development
pnpm dev                    # Start development with turbo
pnpm build                  # Build for production
pnpm lint                   # Run ESLint
pnpm lint:fix               # Fix ESLint issues
pnpm check-types            # TypeScript type checking
pnpm lint:modified          # Lint only modified files

# Database Management
pnpm db:generate            # Generate Drizzle migrations
pnpm db:migrate:local       # Apply migrations locally
pnpm db:migrate:preview     # Apply migrations to preview
pnpm db:migrate:prod        # Apply migrations to production
pnpm db:studio:local        # Open Drizzle Studio
pnpm db:full-reset:local    # Full reset: wipe all state (D1, R2, KV), migrate, seed
pnpm local:wipe-state       # Clear all Wrangler state (D1, R2, KV, tmp)
pnpm local:nuclear-reset    # Nuclear: clear Next.js cache + all Wrangler state + migrate + seed

# Cloudflare Deployment
pnpm cf-typegen            # Generate CloudflareEnv types
pnpm preview               # Build and preview worker locally
pnpm deploy:preview        # Deploy to preview environment
pnpm deploy:production     # Deploy to production

# Testing
pnpm test                  # Run all tests
pnpm test:watch            # Run tests in watch mode
pnpm test:coverage         # Run tests with coverage
pnpm test:ci               # Run tests in CI mode

# Testing & Quality
pnpm i18n:full-check       # Check all i18n translation keys
pnpm i18n:validate         # Validate translation structure
pnpm i18n:check-unused     # Find unused translation keys
```

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (app)/chat/   # Protected chat
│   ├── auth/              # Authentication pages
│   └── api/               # Next.js API routes (proxy)
├── api/                   # Hono API implementation
│   ├── routes/            # Domain-specific routes
│   │   └── auth/          # Better Auth integration
│   ├── services/          # Business logic
│   └── middleware/        # Auth, CORS, rate limiting
├── components/            # React components
│   ├── ui/                # shadcn/ui base components
│   └── auth/              # Authentication UI
├── db/                    # Database layer
│   ├── tables/            # Drizzle schema definitions
│   │   └── auth.ts        # Users, sessions, accounts, verification
│   ├── validation/        # Schema validation
│   └── migrations/        # SQL migration files
├── hooks/                 # React Query data fetching
├── lib/                   # Utility libraries
├── i18n/                  # Internationalization (English-only, dynamic keys)
│   └── locales/           # en/common.json translation keys
├── __tests__/             # Test files
│   └── README.md          # Testing documentation
└── lib/
    └── testing/           # Testing utilities
        ├── index.ts       # Barrel export
        ├── render.tsx     # Custom render with providers
        └── helpers.ts     # Test helpers and utilities
```

## Core Architecture Patterns

### Database Layer (Drizzle + Cloudflare D1)
**Critical Tables** (`src/db/tables/`):
- **auth.ts**: `user`, `session`, `account`, `verification`

**Essential Patterns**:
- Use `createSelectSchema`/`createInsertSchema` from drizzle-zod for type safety
- Multi-table operations require `db.transaction()` for consistency
- Indexes optimized for queries and reporting
- Schema validation in `src/db/validation/`

**Key Relationships**:
- Users → Sessions (one-to-many)
- Users → Accounts (one-to-many for OAuth providers)
- Users → Verification tokens (one-to-many)

### API Layer (Hono + OpenAPI + Zod)
**Structure Pattern**: `src/api/routes/{domain}/`
- **route.ts**: OpenAPI route definitions with Zod schemas
- **handler.ts**: Business logic implementation
- **schema.ts**: Request/response validation schemas

**Required Implementation**:
- Every endpoint needs Zod request/response schemas
- Use `createApiResponseSchema()` for consistent API responses
- Session middleware via `getSessionUser()` for authentication
- Comprehensive error handling through middleware chain
- OpenAPI documentation auto-generated at `/api/v1/scalar`

### Frontend Layer (Next.js 15 + shadcn/ui + TanStack Query)
**Component Structure**: `src/components/{domain}/{component}.tsx`
- Reuse existing shadcn/ui components from `src/components/ui/`
- TanStack Query hooks in `src/hooks/` for server state
- All user text through `useTranslations()` - NO hardcoded strings (English-only)
- Dark theme only (no theme switching)

### State Management Layer (Zustand v5)
**🚨 MANDATORY**: Use `/store-fix` command for ALL store-related work.
**Reference**: Context7 MCP `/pmndrs/zustand` for official patterns - fetch latest docs before implementation.

**Ground Rules** (from official Zustand + Next.js docs):
1. **NO Global Stores**: Factory function (`createChatStore()`) + Context, NOT module-level `create()`
2. **Vanilla Store**: Use `createStore()` from `zustand/vanilla` for SSR isolation
3. **Context + useRef**: Provider uses `useRef` to create store once per instance
4. **RSC Forbidden**: React Server Components cannot read/write store - client only
5. **StateCreator Chain**: All slices typed with `[['zustand/devtools', never]]` middleware chain
6. **Action Names**: ALL `set()` calls MUST have third param `set({}, undefined, 'slice/action')`
7. **useShallow**: Batch object/array selectors - individual selectors cause re-renders
8. **Middleware at Combined Level**: Never apply devtools/persist inside individual slices

**Store Architecture** (`src/stores/{domain}/`):
- `store.ts`: Slice implementations + vanilla factory (`createStore()`)
- `store-schemas.ts`: Zod schemas → type inference (SINGLE SOURCE OF TRUTH)
- `store-action-types.ts`: Explicit action function type definitions
- `store-defaults.ts`: Default values + reset state groups
- `actions/`: Complex action logic extracted (form-actions, thread-actions)
- `hooks/`: Reusable selector hooks with useShallow batching

**File Structure**:
```
src/stores/{domain}/
├── index.ts              # Public API exports only
├── store.ts              # Slices + createStore factory + devtools
├── store-schemas.ts      # Zod schemas + z.infer types
├── store-action-types.ts # Action type definitions
├── store-defaults.ts     # Defaults + reset groups (STREAMING_STATE_RESET, etc.)
├── store-constants.ts    # Enums, animation indices
├── actions/              # Complex action hooks
├── hooks/                # Selector hooks (useShallow)
└── utils/                # Pure utility functions
```

**Forbidden Patterns** (IMMEDIATE FIX):
- `create()` hook → use `createStore()` vanilla
- `set()` without action name → add `'slice/action'` third param
- `StateCreator<Store>` → add `[['zustand/devtools', never]]` chain
- Multiple individual selectors → batch with `useShallow`
- Manual interfaces → use Zod `z.infer<>`
- `any` or `as Type` casts in store code
- Global module stores → factory + Context
- RSC store access → client components only

### Testing Layer (Vitest + React Testing Library)
**Test Infrastructure** (`vitest.config.ts`, `vitest.setup.ts`):
- Vitest v4 configured with Vite for Next.js support
- JSDOM environment for DOM testing
- Global mocks: `matchMedia`, `IntersectionObserver`, `ResizeObserver`
- Testing utilities in `src/lib/testing/` following project architecture

**Testing Patterns**:
- Use `render` from `@/lib/testing` for consistent provider setup
- Prefer user-centric queries (`getByRole`, `getByLabelText`)
- Use `userEvent` for realistic user interactions
- Test behavior, not implementation details
- Focus on what users see and do

**Test Organization**:
- `src/__tests__/` - General test files
- `src/components/{domain}/__tests__/` - Component tests
- `src/stores/{domain}/__tests__/` - Store tests
- `src/lib/testing/` - Shared test utilities (render, helpers, etc.)

**Documentation**: See `docs/TESTING_SETUP.md` and `src/__tests__/README.md`

## Email System

**React Email Template System** (`src/emails/`):
- Component-based email templates in `src/emails/components/`
- Template compositions in `src/emails/templates/`
- Email utility functions in `src/lib/email/`
- Auth-related emails (verification, magic link, etc.)

## Icon Management

**Icon System** (`src/icons/`):
- Lucide React for standard icons
- Custom SVG icons in `src/icons/svg/`
- Icon components in `src/icons/component/`

## Environment Configuration

**Critical Variables**:
```bash
# Application Environment
NODE_ENV=development
NEXT_PUBLIC_WEBAPP_ENV=local|preview|prod  # Environment detection
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Authentication - Session encryption
BETTER_AUTH_SECRET=your-better-auth-secret-32-chars-minimum
BETTER_AUTH_URL=http://localhost:3000

# Google OAuth - Get from Google Cloud Console
AUTH_GOOGLE_ID=your-google-client-id.apps.googleusercontent.com
AUTH_GOOGLE_SECRET=your-google-client-secret

# AWS SES Email - Get from AWS Console
AWS_SES_ACCESS_KEY_ID=your-aws-ses-access-key-id
AWS_SES_SECRET_ACCESS_KEY=your-aws-ses-secret-access-key
NEXT_PUBLIC_AWS_SES_REGION=your-aws-region
NEXT_PUBLIC_FROM_EMAIL=noreply@your-domain.com
NEXT_PUBLIC_SES_REPLY_TO_EMAIL=support@your-domain.com
NEXT_PUBLIC_SES_VERIFIED_EMAIL=noreply@your-domain.com

# Database: Uses Cloudflare D1 bindings (env.DB) in production, ./local.db for local development
```

**Cloudflare Bindings** (wrangler.jsonc):
- **DB**: D1 database with separate local/preview/prod instances
- **KV**: Key-value storage for caching
- **UPLOADS_R2_BUCKET**: File upload storage
- **NEXT_INC_CACHE_R2_BUCKET**: Next.js incremental cache

## Document Context References

**Context Prime Pattern**: Agents must consult these specific directories and files as primary context before implementing any changes. Always reference documents using the pattern `directory/file:line_number` when citing specific code examples or patterns.

### Backend Development Context (`backend-pattern-expert`)
**Primary Context Documents**:

- **🚨 SINGLE SOURCE OF TRUTH**: `/docs/backend-patterns.md` - **THE DEFINITIVE backend guide**
  - **MANDATORY FIRST READ**: Single authoritative source for ALL backend development
  - **Complete pattern consolidation** from 10 specialized agent analyses
  - **Implementation guidelines** with specific file references and line numbers
  - **NO OTHER BACKEND DOCUMENTATION SUPERSEDES THIS DOCUMENT**
  - **ALL BACKEND AGENTS MUST REFERENCE THIS DOCUMENT FIRST**

- **Route Patterns**: `/src/api/routes/{domain}/` - Study existing route implementations
  - `/src/api/routes/auth/` - Authentication and session handling patterns
  - `/src/api/routes/currency/` - Currency management endpoints
  - `/src/api/routes/emails/` - Email operation endpoints
  - `/src/api/routes/system/` - System health and status endpoints

- **Database Schema**: `/src/db/tables/` - All database entity definitions
  - `/src/db/tables/auth.ts` - User authentication and session tables

- **Service Layer**: `/src/api/services/` - Business logic implementations

- **Core Patterns**: `/src/api/core/` - Framework foundations
- **Common Utilities**: `/src/api/common/` - Shared API utilities

- **Middleware Patterns**: `/src/api/middleware/` - Authentication, CORS, rate limiting
- **Migration Examples**: `/src/db/migrations/` - Database change patterns

### Frontend Development Context (`frontend-ui-expert`)
**Primary Context Documents**:

- **🚨 SINGLE SOURCE OF TRUTH**: `/docs/frontend-patterns.md` - **THE DEFINITIVE frontend guide**
  - **MANDATORY FIRST READ**: Single authoritative source for ALL frontend development
  - **Complete pattern consolidation** from 10 specialized agent analyses
  - **Implementation guidelines** with specific file references and line numbers
  - **NO OTHER FRONTEND DOCUMENTATION SUPERSEDES THIS DOCUMENT**
  - **ALL FRONTEND AGENTS MUST REFERENCE THIS DOCUMENT FIRST**

- **Component Patterns**: `/src/components/` - Established UI component architecture
  - `/src/components/ui/` - shadcn/ui base components (Button, Card, Dialog, etc.)
  - `/src/components/auth/` - Authentication flow components

- **Page Layouts**: `/src/app/` - Next.js App Router structure
  - `/src/app/(app)/chat/` - Protected chat pages and layouts
  - `/src/app/auth/` - Authentication pages (login, register, callback)

- **Data Fetching**: `/src/hooks/` - TanStack Query patterns for server state
- **Utility Functions**: `/src/lib/` - Shared utilities, validation, formatting
- **Styling Patterns**: `/src/components/ui/` - Design system implementation

### Internationalization Context (`i18n-translation-manager`)
**Primary Context Documents**:
- **Translation Files**: `/src/i18n/locales/` - Translation key management (English-only)
  - `/src/i18n/locales/en/common.json` - English translations (single locale)
- **Component Usage**: `/src/components/` - Scan for hardcoded strings and ensure `useTranslations()` usage
- **Translation Patterns**: All user-facing text must use `useTranslations()` hooks and `t()` function
- **Note**: Application is English-only, but translation keys are maintained for consistency and maintainability

### Testing Context (`test-expert`)
**Primary Context Documents**:
- **Testing Documentation**: `/docs/TESTING_SETUP.md` - Comprehensive testing setup guide
  - `/src/__tests__/README.md` - Testing patterns and examples
- **Configuration Files**:
  - `/vitest.config.ts` - Vitest v4 configuration with Next.js integration
  - `/vitest.setup.ts` - Global test setup and mocks
- **Testing Utilities**: `/src/lib/testing/` - Testing library following project architecture
  - `index.ts` - Barrel export for all testing utilities
  - `render.tsx` - Custom render utilities with providers
  - `helpers.ts` - Mock factories, async utilities, localStorage mocks
- **Component Tests**: `/src/components/{domain}/__tests__/` - Domain-specific component tests
- **Store Tests**: `/src/stores/{domain}/__tests__/` - State management tests
- **Testing Patterns**:
  - Use `render` from `@/lib/testing` for provider setup
  - Prefer semantic queries (`getByRole`, `getByLabelText`)
  - Use `userEvent` for user interactions
  - Test behavior, not implementation
  - Focus on user experience

### Configuration Context (All Agents)
**Primary Context Documents**:
- **📋 Project Documentation**: `/docs/` - Essential implementation guides
  - **🚨 `/docs/type-inference-patterns.md` - MANDATORY for ALL agents - Enum 5-part pattern, metadata type safety, query keys, Zod schemas**
  - **🚨 `/docs/backend-patterns.md` - THE SINGLE SOURCE OF TRUTH for ALL backend development**
  - **🚨 `/docs/frontend-patterns.md` - THE SINGLE SOURCE OF TRUTH for ALL frontend development**
- **Environment Setup**: `/wrangler.jsonc` - Cloudflare Workers configuration and bindings
- **Package Dependencies**: `/package.json` - Available libraries and scripts
- **TypeScript Config**: `/tsconfig.json` - Compiler options and path mappings
- **Database Config**: `/drizzle.config.ts` - Drizzle ORM configuration
- **Agent Specifications**: `.claude/agents/{agent-name}.md` - Agent-specific patterns and workflows

### Research Context (`research-analyst`)
**Primary Context Documents**:
- **API Documentation**: Look for existing API integrations in `/src/api/services/`
- **Environment Variables**: Check `/.env.example` and `/wrangler.jsonc` for configuration patterns
- **Business Logic**: Analyze `/src/db/tables/` for domain understanding
- **Integration Patterns**: Review `/src/api/routes/` for third-party integration examples

## Context Prime Workflow Patterns

**Mandatory Pre-Implementation Steps** - All agents must follow this sequence:

### 1. Document Discovery Phase
```bash
# Agent reads relevant context documents BEFORE any implementation
1. Read primary context documents for the specific domain
2. Examine 2-3 similar existing implementations
3. Identify established patterns and conventions
4. Note any domain-specific requirements or constraints
```

### 2. Pattern Analysis Phase
```bash
# Agent analyzes existing code to understand patterns
1. Study file structure and naming conventions
2. Examine middleware chains and error handling patterns
3. Identify type safety and validation approaches
4. Review integration points and data flows
```

### 3. Implementation Alignment Phase
```bash
# Agent ensures new code follows discovered patterns
1. Extend existing patterns rather than creating new ones
2. Maintain consistency with established conventions
3. Preserve type safety chains and validation flows
4. Follow the same error handling and response patterns
```

### 4. Reference Documentation Pattern
When implementing or referencing code:
- **File References**: Use `src/api/routes/auth/route.ts:45` format for specific lines
- **Pattern References**: Cite `"following the pattern established in src/api/routes/auth/"`
- **Schema References**: Reference `"extending the schema pattern from src/db/tables/auth.ts:112"`
- **Example References**: Point to `"similar implementation in src/components/ui/Card.tsx"`

### 5. Quality Verification Pattern
```bash
# Agent validates implementation against context
1. Verify consistency with referenced patterns
2. Ensure all dependencies and imports follow project conventions
3. Confirm middleware chains and error handling are complete
4. Validate that OpenAPI schemas and type inference work end-to-end
```

### Context Prime Example Workflow

**Backend Agent Task**: "Add new user profile endpoint"

```bash
1. READ CONTEXT PRIME: /docs/backend-patterns.md - THE SINGLE SOURCE OF TRUTH for backend implementation
2. FOLLOW ALL PATTERNS: Every implementation MUST follow the patterns documented in backend-patterns.md
3. READ CONTEXT: /src/api/routes/auth/ or /src/api/routes/system/ existing endpoints
4. ANALYZE PATTERN: route.ts + handler.ts + schema.ts structure
5. EXAMINE SCHEMA: /src/db/tables/auth.ts user table
6. STUDY SERVICES: /src/api/services/ existing service patterns (if applicable)
7. IMPLEMENT: Using ONLY patterns from docs/backend-patterns.md (no deviations allowed)
8. REFERENCE: "This endpoint follows the backend-patterns.md patterns and src/api/routes/auth/route.ts:8 or src/api/routes/system/route.ts:6"
```

**Frontend Agent Task**: "Create user status card component"

```bash
1. READ CONTEXT PRIME: /docs/frontend-patterns.md - THE SINGLE SOURCE OF TRUTH for frontend implementation
2. FOLLOW ALL PATTERNS: Every implementation MUST follow the patterns documented in frontend-patterns.md
3. READ CONTEXT: /src/components/chat/ existing chat components
4. ANALYZE PATTERN: /src/components/ui/ shadcn component structure
5. EXAMINE HOOKS: /src/hooks/ data fetching patterns
6. STUDY LAYOUTS: /src/containers/screens/chat/ screen patterns
7. IMPLEMENT: Using ONLY patterns from docs/frontend-patterns.md (no deviations allowed)
8. REFERENCE: "This component follows the frontend-patterns.md:component-architecture specification and src/components/ui/card.tsx:15"
```

## Specialized Agent Context

Located in `.claude/agents/` - See **`.claude/agents/README.md`** for complete workflows.

Each agent has domain-specific expertise:

**backend-pattern-expert.md**: Hono + Cloudflare Workers + Drizzle ORM specialist
- **🚨 MANDATORY FIRST ACTION**: Read `/docs/backend-patterns.md` - THE ONLY authoritative backend guide
- **NO BACKEND WORK WITHOUT READING THIS DOCUMENT FIRST**
- **Must consult**: `/src/api/routes/{domain}/` patterns (auth, currency, emails, system), `/src/db/tables/auth.ts` schema
- Database schema changes and migrations (`/src/db/migrations/` examples)
- API endpoint creation following established patterns (`/src/api/routes/` structure)
- Service layer patterns (`/src/api/services/` if services exist for domain)

**frontend-ui-expert.md**: Next.js + shadcn/ui + TanStack Query specialist
- **🚨 MANDATORY FIRST ACTION**: Read `/docs/frontend-patterns.md` - THE ONLY authoritative frontend guide
- **NO FRONTEND WORK WITHOUT READING THIS DOCUMENT FIRST**
- **Must consult**: `/src/components/ui/` patterns, `/src/containers/` layouts and screens, `/src/hooks/` utilities
- Component creation following design system (`/src/components/ui/` base components)
- Container patterns (`/src/containers/layouts/` and `/src/containers/screens/`)
- Email templates (`/src/emails/templates/` and `/src/emails/components/`)
- Direct TanStack Query usage until hook abstraction layer is built
- Responsive UI with accessibility standards

**i18n-translation-manager.md**: Translation key management specialist (English-only)
- **Must consult**: `/src/i18n/locales/en/common.json` for translation keys
- Translation key management and validation in English locale
- Hardcoded string detection and replacement with `useTranslations()`
- Maintain consistent translation key naming conventions
- **Note**: English-only application, but translation keys maintained for consistency

**research-analyst.md**: Documentation and analysis specialist
- **Must consult**: `/src/api/` for backend patterns, `/wrangler.jsonc` for configuration
- Project documentation and planning (`.claude/agents/` specifications)
- API research and integration analysis
- Best practices research and recommendations (`/src/db/tables/` domain modeling)

**test-expert.md**: Jest + React Testing Library specialist
- **Must consult**: `/docs/TESTING_SETUP.md`, `src/__tests__/README.md` for testing patterns
- Write unit and integration tests following RTL best practices
- Test chat participant behavior, turn-taking, and UI state updates
- Use custom `render` from `@/lib/testing` for provider setup
- Focus on user behavior, not implementation details
- Testing utilities located in `/src/lib/testing/` following project architecture
- Follow semantic queries (`getByRole`, `getByLabelText`)
- Use `userEvent` for realistic user interactions
- Maintain high test coverage without testing implementation

## Agent Chaining Examples

**Database → Backend → Frontend → Testing**:
1. Schema changes trigger migration generation
2. Backend agent updates API endpoints with new schemas
3. Frontend agent updates React Query hooks and UI components
4. Test agent writes tests for new functionality

**Feature Development Workflow**:
1. Research agent analyzes requirements and APIs
2. Backend agent implements database schema and API endpoints
3. Frontend agent creates UI components and data fetching
4. i18n agent ensures all text uses translation keys (English-only)
5. Test agent writes comprehensive tests for the feature

**External Integration Pattern**:
1. Backend agent implements external API integration
2. Database operations for data tracking and audit trails
3. Frontend agent creates UI and status handling
4. Test agent writes tests with mocked API responses
5. Real-time updates via polling or server-sent events

**Testing Workflow**:
1. Test agent reviews component/feature requirements
2. Examines existing tests for patterns
3. Creates test utilities and helpers as needed
4. Writes unit tests for components and stores
5. Writes integration tests for user flows
6. Ensures accessibility and error state coverage

## Advanced Agent Orchestration Patterns

### Parallel Agent Execution

**Multi-Agent Concurrency**: Execute multiple specialized agents simultaneously for independent but related tasks.

```bash
# Example: Feature development with parallel agents
> Use the research-analyst agent to research external API patterns while the backend-pattern-expert agent analyzes our current data flow, and have the i18n-translation-manager agent audit the existing forms for translation key coverage

# Claude Code will execute all three agents in parallel:
# 1. research-analyst: External API documentation research
# 2. backend-pattern-expert: Current data flow analysis
# 3. i18n-translation-manager: Translation key audit of forms
```

**Parallel Task Decomposition**:
- **Independent Context**: Each agent operates in isolated context windows
- **Concurrent Execution**: Multiple agents run simultaneously to reduce total completion time
- **Aggregated Results**: Main thread consolidates findings from all parallel agents
- **Tool Resource Management**: Agents share file system access but maintain separate execution contexts

### Sequential Agent Chaining with Context Handoff

**Information Flow Patterns**: Structure agent chains to pass refined context between specialized agents.

```bash
# Pattern 1: Discovery → Implementation → Validation
1. research-analyst: "Analyze current resource management patterns and identify gaps"
   → Output: Findings document with specific implementation recommendations

2. backend-pattern-expert: "Implement resource automation using research findings"
   → Input: Research agent's findings and recommendations
   → Output: API endpoints, database schema changes, service implementations

3. frontend-ui-expert: "Create UI components for the new resource management features"
   → Input: Backend agent's API specifications and data models
   → Output: React components, TanStack Query hooks, user flows

4. i18n-translation-manager: "Ensure all new UI text uses translation keys"
   → Input: Frontend agent's components and user-facing text
   → Output: Translation keys in en/common.json, compliance report
```

**Context Handoff Strategies**:
- **Artifact Preservation**: Key findings, schemas, and implementations are preserved between agent transitions
- **Reference Linking**: Agents reference specific files and line numbers from previous agents' work
- **Incremental Refinement**: Each agent builds upon and refines the previous agent's output
- **Validation Loops**: Later agents can identify issues that require re-execution of earlier agents

### Multiple Agent Instances and Specialization

**Domain-Specific Agent Instances**: Deploy multiple instances of the same agent type for different domains or contexts.

```bash
# Example: Multiple backend agents for different domains
> Use one backend-pattern-expert agent to implement resource endpoints while another backend-pattern-expert agent implements user management endpoints

# Agent Instance Differentiation:
# Instance 1: backend-pattern-expert (email domain)
#   - Context: src/api/routes/emails/, src/db/tables/auth.ts
#   - Focus: Email operations, template rendering, notifications
#
# Instance 2: backend-pattern-expert (users domain)
#   - Context: src/api/routes/users/, src/api/services/integration.ts
#   - Focus: User management, authentication, CRUD operations
```

**Specialized Agent Configurations**:
- **Scoped Tool Access**: Different instances can have different tool permissions
- **Model Selection**: Critical agents can use higher-capability models (`opus`), while routine tasks use efficient models (`haiku`)
- **Context Boundaries**: Each instance maintains focused context relevant to its specific domain
- **Resource Optimization**: Multiple lightweight agents can be more efficient than one complex agent

### Dynamic Agent Delegation and Selection

**Intelligent Agent Routing**: Claude Code automatically selects and chains agents based on task complexity and requirements.

```bash
# Trigger Patterns for Automatic Agent Selection:

# Code Quality Tasks → Automatic code-reviewer delegation
"Review my recent data processing changes"
→ Automatically invokes code-reviewer agent proactively

# Data Analysis Tasks → Automatic research-analyst delegation
"What's the best approach for handling failed operations?"
→ Automatically invokes research-analyst for API research and best practices

# UI Implementation → Automatic frontend-ui-expert delegation
"Add a resource status dashboard"
→ Automatically invokes frontend-ui-expert for component implementation

# Complex Multi-Domain → Automatic agent chaining
"Implement automated resource management"
→ Automatically chains: research-analyst → backend-pattern-expert → frontend-ui-expert → i18n-translation-manager
```

**Selection Criteria**:
- **Task Complexity**: Multi-step tasks trigger agent chaining automatically
- **Domain Keywords**: Specific terminology triggers appropriate specialized agents
- **Context Analysis**: Current conversation context influences agent selection
- **Failure Recovery**: If an agent encounters domain-specific issues, Claude Code can automatically delegate to a more specialized agent

### Context Sharing and Information Architecture

**Cross-Agent Information Flow**: Structured patterns for sharing context and findings between agents.

```bash
# Information Sharing Patterns:

# 1. Artifact-Based Sharing
Agent A creates → implementation files, documentation, schemas
Agent B consumes → reads Agent A's outputs, builds upon them
Agent C validates → reviews Agent A & B outputs, provides feedback

# 2. Reference-Based Sharing
Agent A provides → "Following patterns from src/api/routes/auth/route.ts:23"
Agent B extends → "Building on Agent A's auth pattern, implementing user data flow"
Agent C integrates → "Connecting Agent A's auth system with Agent B's user data processing in UI"

# 3. Context Cascade Sharing
Agent A establishes → Core domain understanding and constraints
Agent B inherits → Domain knowledge + adds implementation details
Agent C inherits → Domain + implementation + adds user experience layer
```

**Structured Context Documents**:
- **Findings Reports**: Research agents create structured reports that implementation agents can consume
- **Implementation Logs**: Backend agents document their changes for frontend agents to reference
- **Pattern Documentation**: Agents update CLAUDE.md with new patterns they establish
- **Cross-Reference Maps**: Agents maintain references to related work from other agents

### Error Handling and Recovery Patterns

**Agent Failure Recovery**: Robust patterns for handling agent failures and ensuring task completion.

```bash
# Recovery Strategies:

# 1. Agent Retry with Enhanced Context
Primary agent fails → Retry with additional context and constraints
Still fails → Escalate to more specialized agent or different approach

# 2. Parallel Agent Validation
Critical task → Multiple agents work on same problem with different approaches
Compare outputs → Select best solution or hybrid approach
Validation agent → Reviews multiple solutions and recommends final implementation

# 3. Progressive Agent Specialization
General agent attempts task → Identifies specific domain complexity
Specialized agent takes over → Focuses on complex domain-specific aspects
General agent resumes → Handles remaining general implementation tasks
```

**Failure Prevention Patterns**:
- **Pre-flight Context Validation**: Agents verify they have sufficient context before starting
- **Incremental Checkpoints**: Complex tasks broken into smaller validatable steps
- **Cross-Agent Code Review**: Implementation agents automatically trigger review agents
- **Rollback Capabilities**: Agents can revert changes if subsequent agents identify issues

### Performance Optimization for Agent Orchestration

**Efficiency Patterns**: Optimize agent execution for speed and resource usage.

```bash
# Optimization Strategies:

# 1. Parallel Execution Batching
Group independent tasks → Execute simultaneously rather than sequentially
Reduce total latency → Multiple agents complete faster than sequential execution
Context efficiency → Each agent maintains focused, minimal context

# 2. Selective Agent Activation
Lightweight tasks → Use efficient agents (haiku model) for routine operations
Complex tasks → Reserve high-capability agents (opus model) for critical work
Hybrid approach → Start with efficient agent, escalate to powerful agent if needed

# 3. Context Pre-loading
Agent preparation → Pre-load relevant context documents before agent activation
Shared context pool → Multiple agents access same prepared context efficiently
Incremental context building → Each agent adds to shared context for subsequent agents
```

**Resource Management**:
- **Tool Access Optimization**: Restrict agents to only necessary tools to improve focus and performance
- **Model Selection Strategy**: Use appropriate model capabilities for each agent's complexity requirements
- **Context Window Management**: Maintain clean, focused context to prevent context window exhaustion
- **Concurrent Agent Limits**: Balance parallel execution with system resource constraints

### Agent Orchestration Examples for Dashboard

**Complete Feature Implementation Pattern**:
```bash
# Task: "Implement resource pause/resume functionality"

# Automatic Agent Orchestration:
1. research-analyst (parallel) → Research pause/resume best practices, external API implications
2. backend-pattern-expert (after research) → Implement API endpoints, database schema updates
3. frontend-ui-expert (parallel with backend) → Design pause/resume UI components
4. i18n-translation-manager (after frontend) → Add translation keys for pause/resume messaging
5. code-reviewer (after all) → Review complete implementation for quality and security

# Context Flow:
research-analyst findings → backend-pattern-expert implementation → frontend-ui-expert integration → i18n validation → code quality review
```

**Performance-Critical Implementation Pattern**:
```bash
# Task: "Optimize data processing performance"

# Strategic Agent Deployment:
1. Multiple research-analyst instances (parallel) →
   - Instance A: Database query optimization research
   - Instance B: External API performance best practices
   - Instance C: Caching strategy research

2. backend-pattern-expert (sequential) → Implement optimizations based on research
3. Performance validation agent → Benchmark improvements and validate performance gains
```

## Quality Requirements

**Before Committing**:
- Run `pnpm lint && pnpm check-types` for code quality
- Execute `pnpm i18n:full-check` for translation key completeness
- Test database migrations with `pnpm db:migrate:local`
- Verify API documentation at `http://localhost:3000/api/v1/scalar`

**Security Considerations**:
- All routes protected with CSRF middleware
- Rate limiting on authentication endpoints
- No secrets in environment files (use wrangler secrets)
- Audit trail for all operations via event logging system

**Export Patterns (GROUND RULE)**:
- **NO RE-EXPORTS except barrel exports (index.ts)**: Code must be exported once from its source file OR re-exported from a barrel (index.ts) file only
- **Barrel exports are the ONLY valid re-export pattern**: `export { X } from './x'` is only valid in index.ts files
- **Non-barrel files must NOT re-export**: Don't use `export { X } from './other'` in non-index files
- **Single source of truth**: Each export should have ONE canonical source - consumers import from there or from the barrel
- **No aliased re-exports**: Don't rename exports across files (`export { X as Y } from ...`) - use the original name
- **Migration required**: If you find re-exports, migrate all consumers to import from the single source of truth

**Code Comments (GROUND RULE)**:
- **Minimal comments**: Code should be self-documenting; only add comments when logic isn't self-evident
- **No stale/deprecated comments**: Remove outdated comments immediately - stale comments are worse than no comments
- **No "LEGACY" or "TODO: migrate" comments**: Fix the issue instead of leaving warning comments for later
- **No redundant comments**: Don't comment what the code already says (e.g., `// Import X` above an import statement)
- **No backwards-compatibility comments**: Don't leave comments like `// removed`, `// deprecated`, `// available from X` - just delete the code
- **Update or delete**: When changing code, update related comments or delete them entirely - never leave them stale
- **JSDoc for public APIs only**: Use JSDoc for exported functions/types that need documentation, not for internal implementation