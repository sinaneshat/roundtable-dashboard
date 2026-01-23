# CLAUDE.md

- In all interactions and commit messages, be extremely concise and sacrifice grammar for the sake of concision.

Project guidance for Roundtable - a collaborative AI brainstorming platform.

## Documentation Hierarchy

**TYPE SAFETY** (ALL WORK):
- `/docs/type-inference-patterns.md` - MANDATORY for all development

**BACKEND** (`apps/api/`):
- `/docs/backend-patterns.md` - SINGLE SOURCE OF TRUTH

**FRONTEND** (`apps/web/`):
- `/docs/frontend-patterns.md` - SINGLE SOURCE OF TRUTH

## Skills & Agents

### Available Skills

Skills extend Claude's capabilities. Invoke with `/skill-name`.

**Backend Skills**:
| Skill | Use When |
|-------|----------|
| `/drizzle-orm-d1` | D1 schemas, migrations, Drizzle patterns |
| `/cloudflare-d1` | D1 troubleshooting, SQL patterns |
| `/cloudflare` | General Cloudflare platform |
| `/cloudflare-kv` | KV storage, caching |
| `/cloudflare-r2` | Object storage, file uploads |
| `/cloudflare-queues` | Async job processing |
| `/cloudflare-durable-objects` | Stateful coordination |
| `/cloudflare-vectorize` | Semantic search |
| `/wrangler` | Deployment, CLI |
| `/using-drizzle-queries` | Type-safe queries |

**Frontend Skills**:
| Skill | Use When |
|-------|----------|
| `/shadcn-ui` | Component installation, usage |
| `/tanstack-query` | Query/mutation patterns |
| `/react-hook-form-zod` | Form validation |
| `/zustand-state-management` | Store patterns, SSR |
| `/react-state-management` | General state |
| `/frontend-design` | UI/UX design |
| `/component-refactoring` | Reduce complexity |
| `/react-modernization` | React upgrades |

**General Skills**:
| Skill | Use When |
|-------|----------|
| `/software-architecture` | Architecture decisions |
| `/pdf` | PDF manipulation |
| `/agent-md-refactor` | Refactor instruction files |

### Specialized Agents

Located in `.claude/agents/`:

- **backend-agent**: Hono + Cloudflare Workers + Drizzle ORM specialist
- **frontend-agent**: TanStack Start + shadcn/ui + TanStack Query specialist

Claude Code's built-in agents (Explore, Plan, general-purpose) can also leverage skills.

## Essential Commands

```bash
# Development
bun run dev                 # Start development
bun run build               # Build for production
bun run lint                # Run ESLint
bun run check-types         # TypeScript checking

# Database
bun run db:generate         # Generate migrations
bun run db:migrate:local    # Apply migrations locally
bun run db:studio:local     # Open Drizzle Studio
bun run db:full-reset:local # Full reset + seed

# Deployment
bun run deploy:preview      # Deploy to preview
bun run deploy:production   # Deploy to production

# Testing
bun run test                # Run tests
bun run test:watch          # Watch mode
```

## Project Structure

```
apps/
├── web/                   # TanStack Start frontend (Cloudflare Pages)
│   └── src/
│       ├── routes/        # File-based routing
│       ├── components/    # React components (ui/ for shadcn)
│       ├── hooks/         # TanStack Query hooks
│       ├── stores/        # Zustand stores
│       └── lib/           # Utilities
│
├── api/                   # Hono API (Cloudflare Workers)
│   └── src/
│       ├── routes/        # API routes (route.ts, handler.ts, schema.ts)
│       ├── services/      # Business logic
│       ├── middleware/    # Auth, CORS, rate limiting
│       └── db/            # Drizzle + D1
│
└── packages/shared/       # Shared types
```

## Core Patterns

### Backend (apps/api/)

**Route Pattern** - 3 files per domain:
- `route.ts` - OpenAPI definitions
- `handler.ts` - Business logic with `createHandler()`
- `schema.ts` - Zod validation

**Database**:
- Use `db.batch()` for atomic operations (NEVER `db.transaction()`)
- Use `createHandlerWithBatch()` for automatic batching

**Type Safety**:
- Infer types from Zod: `z.infer<typeof Schema>`
- No type casting

### Frontend (apps/web/)

**Routing**: TanStack Router file-based
- `__root.tsx` - Root layout
- `_protected.tsx` - Auth-protected layout
- `$param.tsx` - Dynamic segments

**Components**:
- Use shadcn/ui from `/apps/web/src/components/ui/`
- Don't recreate existing components

**Data Fetching**:
- Query hooks in `/apps/web/src/hooks/queries/`
- Mutation hooks in `/apps/web/src/hooks/mutations/`
- NEVER import services directly in components

**State**: Zustand v5
- Factory pattern with `createStore()` from vanilla
- `useShallow` for batched selectors

**i18n**: `useTranslations()` for all text (English-only)

## Quality Requirements

**Before Committing**:
```bash
bun run lint && bun run check-types
bun run db:migrate:local  # if schema changed
```

**Ground Rules**:
- NO RE-EXPORTS except barrel exports (index.ts)
- Minimal comments - code should be self-documenting
- No `any` or type casting
- No hardcoded strings in UI

## File References

**Backend Context**:
- Routes: `/apps/api/src/routes/{domain}/`
- Tables: `/apps/api/src/db/tables/`
- Services: `/apps/api/src/services/`

**Frontend Context**:
- Routes: `/apps/web/src/routes/`
- Components: `/apps/web/src/components/`
- Hooks: `/apps/web/src/hooks/`
- Stores: `/apps/web/src/stores/`

**Testing**:
- Setup: `/docs/TESTING_SETUP.md`
- Utilities: `/apps/web/src/lib/testing/`
