# Documentation Index

**Last Updated**: January 2025

## 📚 Documentation Hierarchy

### 🚨 MANDATORY READING (All Developers & Agents)

1. **[type-inference-patterns.md](./type-inference-patterns.md)** - **SINGLE SOURCE OF TRUTH**
   - ✅ Enum 5-part pattern (array constant → Zod → TypeScript → constant object)
   - ✅ Metadata type safety chain (discriminated unions, extraction functions, builders)
   - ✅ Query keys pattern (hierarchical factory with `as const`)
   - ✅ Zod schema patterns (CoreSchemas, discriminated unions, composition)
   - ✅ Type inference chain (Database → Zod → TypeScript → OpenAPI → Frontend)
   - ✅ Best practices and anti-patterns
   - **ALL code MUST follow these patterns**

2. **[backend-patterns.md](./backend-patterns.md)** - Backend Implementation Guide
   - Hono.js API routes
   - Handler factory patterns
   - Database operations (Drizzle + D1 batch operations)
   - Authentication patterns (Better Auth integration)
   - Middleware patterns (CORS, rate limiting, CSRF)
   - **References**: `type-inference-patterns.md` for type safety

3. **[frontend-patterns.md](./frontend-patterns.md)** - Frontend Implementation Guide
   - TanStack Start (React Router) patterns
   - Component architecture (shadcn/ui)
   - Data fetching (TanStack Query v5)
   - Container/screen patterns
   - i18n patterns (custom implementation in `@/lib/compat`)
   - **References**: `type-inference-patterns.md` for type safety

### 📖 Supporting Documentation

#### Testing
- **[TESTING_SETUP.md](./TESTING_SETUP.md)** - Vitest + React Testing Library setup
- **[TESTING_AUDIT.md](./TESTING_AUDIT.md)** - Testing audit and coverage analysis

#### User Flows
- **[FLOW_DOCUMENTATION.md](./FLOW_DOCUMENTATION.md)** - Complete user journey documentation
  - Chat creation flow
  - Multi-round conversations
  - Pre-search functionality
  - Analysis generation
  - Configuration changes

#### Infrastructure
- **[SETUP.md](./SETUP.md)** - Project setup and installation
- **[environment-variables.md](./environment-variables.md)** - Environment configuration
- **[cloudflare-development-workflow.md](./cloudflare-development-workflow.md)** - Cloudflare Workers development
- **[cloudflare-isr-setup.md](./cloudflare-isr-setup.md)** - Incremental Static Regeneration setup
- **[database-foreign-keys.md](./database-foreign-keys.md)** - Database schema and relationships

#### Specialized Guides
- **[translation-patterns.md](./translation-patterns.md)** - i18n translation management (English-only)
- **[seo-metadata-guide.md](./seo-metadata-guide.md)** - SEO & Open Graph metadata
- **[local-development-warnings.md](./local-development-warnings.md)** - Local development tips
- **[ROUNDTABLE_MIGRATION_GUIDE.md](./ROUNDTABLE_MIGRATION_GUIDE.md)** - Historical migration guide

## 🔄 Cross-References

All documentation files reference `type-inference-patterns.md` for:
- ✅ Enum patterns → Section 2
- ✅ Metadata patterns → Section 3
- ✅ Query keys → Section 4
- ✅ Type inference → Section 5
- ✅ Zod schemas → Section 6
- ✅ Anti-patterns → Section 13

## 📝 Quick Reference

### Type Safety
```typescript
// ✅ CORRECT: Use enum constants
import { ChatModes } from '@/api/core/enums';
if (mode === ChatModes.ANALYZING) { }

// ✅ CORRECT: Use metadata extraction
import { getRoundNumber } from '@/lib/utils/metadata';
const roundNumber = getRoundNumber(metadata);

// ✅ CORRECT: Use metadata builder
import { createParticipantMetadata } from '@/lib/utils/metadata-builder';
const metadata = createParticipantMetadata({ /* all required fields */ });
```

### Anti-Patterns
```typescript
// ❌ WRONG: Hardcoded strings
if (mode === 'analyzing') { }

// ❌ WRONG: Unsafe casting
const roundNumber = (metadata as Record<string, unknown>)?.roundNumber;

// ❌ WRONG: Inline construction
const metadata = { role: 'assistant', roundNumber: 1 };
```

## 🎯 When to Read What

| Task | Read This |
|------|-----------|
| Adding new enum | `type-inference-patterns.md` Section 2 |
| Working with message metadata | `type-inference-patterns.md` Section 3 |
| Creating TanStack Query hooks | `type-inference-patterns.md` Section 4 |
| Building API endpoint | `backend-patterns.md` + `type-inference-patterns.md` |
| Creating UI component | `frontend-patterns.md` + `type-inference-patterns.md` |
| Writing tests | `TESTING_SETUP.md` |
| Understanding user flow | `FLOW_DOCUMENTATION.md` |

## 🚀 Getting Started

1. **Read**: `type-inference-patterns.md` (mandatory)
2. **Read**: Your domain guide (`backend-patterns.md` or `frontend-patterns.md`)
3. **Reference**: Supporting docs as needed

---

**Rule**: When in doubt, check `type-inference-patterns.md` first.
