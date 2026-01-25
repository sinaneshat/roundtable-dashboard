# CLAUDE.md

Be concise. Sacrifice grammar.

Roundtable: collaborative AI brainstorming platform.

## Docs

- `/docs/type-inference-patterns.md` - TYPE SAFETY (mandatory)
- `/docs/backend-patterns.md` - backend source of truth
- `/docs/frontend-patterns.md` - frontend source of truth

## Type Safety Rules

**FORBIDDEN:**
- `.passthrough()` in Zod
- `any`, `unknown`, `Record<string, unknown>` overgeneralization
- `as` type casting
- inline type extensions (`& { extra: Type }`)
- hardcoded types - use `z.infer<typeof Schema>`
- manual type guards - use `.safeParse()`/`.parse()`
- TODO comments for migrations
- legacy/deprecated/backwards-compatible code
- re-exports (except barrel index.ts)

**REQUIRED:**
- 5-part enum pattern (array → default → schema → type → constant object)
- `z.infer<>` for all types
- discriminated unions for metadata
- single source of truth for exports

## Skills

Invoke: `/skill-name`

**Backend:** drizzle-orm-d1, cloudflare-d1, cloudflare, cloudflare-kv, cloudflare-r2, cloudflare-queues, cloudflare-durable-objects, cloudflare-vectorize, wrangler, using-drizzle-queries, durable-objects, software-architecture

**Frontend:** shadcn-ui, tanstack-query, react-hook-form-zod, zustand-state-management, react-state-management, frontend-design, component-refactoring, react-modernization, software-architecture

**General:** pdf, agent-md-refactor

## Agents

`.claude/agents/`:
- **backend-agent**: Hono + Workers + Drizzle (12 skills)
- **frontend-agent**: TanStack Start + shadcn + Query (9 skills)

## Commands

```bash
bun run dev|build|lint|check-types           # Dev
bun run db:generate|db:migrate:local|db:studio:local|db:full-reset:local  # DB
bun run deploy:preview|deploy:production     # Deploy
bun run test|test:watch                      # Test
```

## Structure

```
apps/
├── web/src/           # TanStack Start (Pages)
│   ├── routes/        # file-based routing
│   ├── components/    # ui/ for shadcn
│   ├── hooks/         # queries/, mutations/
│   └── stores/        # Zustand
├── api/src/           # Hono (Workers)
│   ├── routes/        # route.ts + handler.ts + schema.ts
│   ├── services/      # business logic
│   └── db/            # Drizzle + D1
└── packages/shared/   # shared types
```

## Backend

- 3-file route: `route.ts` (OpenAPI) + `handler.ts` (`createHandler`) + `schema.ts`
- `db.batch()` for atomicity (NEVER `db.transaction()`)
- `createHandlerWithBatch()` for auto-batching

## Frontend

- TanStack Router: `__root.tsx`, `_protected.tsx`, `$param.tsx`
- shadcn/ui from `/apps/web/src/components/ui/`
- hooks in `hooks/queries/` + `hooks/mutations/`
- Zustand v5: `createStore()` + `useShallow`
- `useTranslations()` for all text

## Quality

Pre-commit: `bun run lint && bun run check-types`

**Rules:**
- NO re-exports except barrel index.ts
- NO `any` or casting
- NO hardcoded UI strings
- NO `db.transaction()`
