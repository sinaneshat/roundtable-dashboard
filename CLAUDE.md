# CLAUDE.md

Be concise. Sacrifice grammar.

Roundtable: collaborative AI brainstorming platform.

## Docs

- `/docs/type-inference-patterns.md` - TYPE SAFETY (mandatory)
- `/docs/backend-patterns.md` - backend source of truth
- `/docs/frontend-patterns.md` - frontend source of truth

---

## Behavior Rules

### REUSE OVER CREATE

**Always reuse existing code. Never recreate or duplicate.**

Before writing anything new:
1. Search codebase for existing implementations (`Grep`, `Glob`)
2. Look for similar patterns in other files
3. Extend or build on what exists rather than creating from scratch
4. Import and reuse existing helpers, utilities, services, schemas
5. Only create new code when nothing similar exists

This applies to: helpers, utilities, patterns, schemas, services, components, hooks, types, constants, configs - everything.

---

## Type Safety Rules

### FORBIDDEN

| Anti-Pattern | Fix |
|--------------|-----|
| `.passthrough()` in Zod | Define all fields explicitly |
| `any`, `unknown`, `Record<string, unknown>` | Use specific types or discriminated unions |
| `as` type casting | Use Zod `.parse()` or `.safeParse()` |
| Inline type extensions (`& { extra }`) | Extend Zod schemas with `.extend()` |
| Hardcoded types/interfaces | Use `z.infer<typeof Schema>` |
| Manual type guards | Use `.safeParse()` or `.parse()` |
| `db.transaction()` | Use `db.batch()` (D1 limitation) |
| `// @ts-ignore`, `// @ts-expect-error` | Fix the underlying type issue |
| Explicit return types | Lean on inference; omit unless necessary |
| Creating duplicate helpers | Search for existing utilities first |

### REQUIRED

**5-Part Enum Pattern**:
```typescript
export const STATUS_VALUES = ['pending', 'active'] as const;
export const DEFAULT_STATUS: Status = 'pending';
export const StatusSchema = z.enum(STATUS_VALUES);
export type Status = z.infer<typeof StatusSchema>;
export const Statuses = { PENDING: 'pending', ACTIVE: 'active' } as const;
```

**Type Inference Chain**: `Drizzle Table → createSelectSchema() → z.infer<> → TypeScript Type`

---

## Skills

Invoke via `/skill-name` or Skill tool.

### Backend (Cloudflare + Hono + Drizzle)
| Skill | Use |
|-------|-----|
| `/drizzle-orm-d1` | D1 schemas, migrations |
| `/cloudflare-d1` | D1 SQL patterns |
| `/cloudflare` | Workers, bindings |
| `/cloudflare-kv` | KV caching |
| `/cloudflare-r2` | Object storage |
| `/cloudflare-queues` | Async jobs |
| `/cloudflare-durable-objects` | Stateful coordination |
| `/cloudflare-vectorize` | Vector search |
| `/wrangler` | CLI, deployment |
| `/using-drizzle-queries` | Query patterns |
| `/durable-objects` | DO patterns |
| `/hono` | API framework |
| `/hono-rpc` | Type-safe client |

### Frontend (TanStack + React + shadcn)
| Skill | Use |
|-------|-----|
| `/shadcn-ui` | Components |
| `/tanstack-query` | Data fetching |
| `/react-hook-form-zod` | Forms |
| `/zustand-state-management` | Global state |
| `/react-state-management` | State patterns |
| `/component-refactoring` | Reduce complexity |
| `/react-modernization` | React upgrades |
| `/motion` | Animations |

### AI & Integrations
| Skill | Use |
|-------|-----|
| `/ai-sdk` | Vercel AI SDK |
| `/ai-sdk-core` | AI SDK v6 backend |
| `/posthog-analytics` | Analytics, feature flags |

### Architecture
| Skill | Use |
|-------|-----|
| `/software-architecture` | Architecture decisions |
| `/seo-audit` | Technical SEO |

---

## MCP Servers

### context7
```
resolve-library-id("tanstack query") → "/tanstack/query"
query-docs("/tanstack/query", "invalidate queries")
```

### shadcn
```
search_items_in_registries(["@shadcn"], "button")
get_add_command_for_items(["@shadcn/button"])
```

### tanstack
```
search_docs("useQuery", library: "query")
doc("router", "framework/react/guide/file-based-routing")
```

---

## Commands

```bash
bun run dev              # Dev server
bun run build            # Production build
bun run lint             # ESLint
bun run check-types      # TypeScript

bun run db:generate      # Generate migrations
bun run db:migrate:local # Apply migrations
bun run db:studio:local  # Drizzle Studio

bun run test             # Run tests
```

---

## Project Structure

```
apps/
├── api/src/              # Hono (Cloudflare Workers)
│   ├── routes/           # route.ts + handler.ts + schema.ts
│   ├── services/         # Business logic
│   └── db/               # Drizzle + D1
│
├── web/src/              # TanStack Start
│   ├── routes/           # File-based routing
│   ├── components/       # React + shadcn/ui
│   ├── hooks/            # queries/ + mutations/
│   └── stores/           # Zustand
│
└── packages/shared/      # Shared enums, constants, validation
```

---

## Core Patterns

**Backend**: 3-file route (`route.ts` + `handler.ts` + `schema.ts`), `db.batch()` for atomicity, all types via `z.infer<>`

**Frontend**: File-based routing with loaders, hooks in `hooks/queries/` and `hooks/mutations/`, Zustand v5 with `createStore()`, `useTranslations()` for text
