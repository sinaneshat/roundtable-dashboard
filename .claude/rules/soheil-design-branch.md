---
description: STRICT design-only rules for soheil-design branch - REFUSE all non-design work
globs: *
---

# Soheil Design Branch Rules

**BRANCH SCOPE**: These rules ONLY apply when working on the `soheil-design` branch. Ignore these instructions on all other branches.

## STRICT RESTRICTIONS - DESIGN ONLY BRANCH

**This branch is EXCLUSIVELY for UI/UX design work. ALL other work types are FORBIDDEN.**

### BLOCKED ACTIONS - MUST REFUSE AND ERROR

When on `soheil-design` branch, you MUST REFUSE and immediately stop if asked to:

#### Package Management (BLOCKED)
- `bun add`, `bun install <package>`
- Adding ANY new dependencies to package.json
- Updating package versions
- Running `bun update` or similar

#### Backend/API Work (BLOCKED)
- Creating or modifying files in `src/api/`
- Database schema changes (`src/db/`)
- Migration files
- API route handlers
- Service layer changes

#### Configuration Changes (BLOCKED)
- `wrangler.jsonc` modifications
- `app.config.ts` changes (unless purely visual/build output)
- Environment variable changes
- `tsconfig.json` modifications
- `drizzle.config.ts` changes

#### Infrastructure/DevOps (BLOCKED)
- Deployment scripts
- CI/CD configuration
- Docker/container changes
- Build configuration changes

#### Business Logic (BLOCKED)
- Store logic changes (unless purely UI state like animations)
- Data fetching/mutation logic
- Authentication/authorization logic
- Validation schemas (Zod) for API

### REFUSAL RESPONSE

When a blocked action is requested, respond with:
```
BLOCKED: This action is not allowed on the soheil-design branch.

Requested: [describe what was asked]
Reason: This branch is restricted to design-only work.

Allowed on this branch:
- CSS/styling changes
- Component visual adjustments
- Animation/transition work
- Layout modifications
- Design token updates
- UI component restructuring (visual only)

To perform this action, switch to a different branch.
```

---

## ALLOWED ACTIONS - DESIGN WORK ONLY

### Permitted File Types
- `*.css`, `*.scss` - Stylesheets
- `*.tsx`, `*.jsx` - Component files (visual changes only)
- `tailwind.config.*` - Design token updates
- `src/components/ui/*` - UI component styling
- `src/components/*` - Component visual structure
- Design-related assets (icons, images)

### Permitted Changes
- CSS class modifications
- Tailwind utility changes
- Component prop adjustments for styling
- Animation/transition implementations
- Spacing, typography, color adjustments
- Responsive breakpoint tweaks
- Component layout restructuring
- Shadow, border, visual effect changes
- Dark theme refinements

### UI/UX Priorities
- Visual polish and design refinements
- Component aesthetics and spacing consistency
- Animation timing and transitions
- Micro-interactions

### Design System Guidelines
- Follow existing shadcn/ui patterns
- Allow design experimentation within components
- Document new design tokens introduced
- Maintain dark theme consistency

### Code Style for Design Work
- Keep CSS/styling changes isolated
- Use CSS variables for new design tokens
- Comment design decisions that deviate from patterns

### Review Checklist
- Visual consistency across components
- Responsive behavior at all breakpoints
- Animation performance (no jank)
- Accessibility preserved (contrast, focus states)
