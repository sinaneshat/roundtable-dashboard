# Translation Patterns - Updated for English-Only

> ℹ️ **UPDATED FOR ENGLISH-ONLY APPLICATION**
>
> **The application now uses English-only translation keys** via dynamic `useTranslations()` hooks.
>
> **For current translation key patterns, refer to:**
> - **i18n Agent**: `.claude/agents/i18n-translation-manager.md` - Translation key management
> - **Frontend patterns**: `/docs/frontend-patterns.md` - Component implementation
> - **Translation keys**: `/src/i18n/locales/en/common.json` - All English keys

## Current Status (English-Only with Dynamic Keys)

The application uses **English-only** translation keys with the following configuration:

### What Was Removed
- ❌ Multi-language support (no Persian/Farsi)
- ❌ RTL (right-to-left) support
- ❌ Locale switching
- ❌ Currency conversion (USD-only)

### What Is MAINTAINED
- ✅ **Dynamic translation keys** via `useTranslations()` - **NO hardcoded strings allowed**
- ✅ Single locale: `en` (US English)
- ✅ Translation keys in `/src/i18n/locales/en/common.json`
- ✅ Single currency: `USD` (US Dollar)
- ✅ LTR (left-to-right) layout only
- ✅ Dark theme only (no theme switching)

### Why Keep Translation Keys (English-Only)?

Even though we only support English, we **maintain the dynamic translation key system** because:
1. **Centralized text management** in JSON files
2. **Easier bulk text updates** and maintenance
3. **Clear separation** of content from component logic
4. **Consistent pattern** across the codebase
5. **NO hardcoded strings** - all text must use `t()` function
6. **Future-proof** if multi-language support is needed

### REQUIRED Usage in Components

**❌ NEVER use hardcoded strings:**
```tsx
// ❌ WRONG - Hardcoded string
<Button>Save Changes</Button>
```

**✅ ALWAYS use translation keys:**
```tsx
import { useTranslations } from '@/lib/compat';

export function MyComponent() {
  const t = useTranslations('namespace');

  return (
    <div>
      <h1>{t('title')}</h1>
      <Button>{t('actions.save')}</Button>
    </div>
  );
}
```

## Historical Context

This document previously contained comprehensive guidelines for multi-language support, including:
- RTL layout support
- Multi-locale calendar integration
- Multi-currency formatting
- Locale-specific number formatting

**These patterns are no longer applicable** as the application has been streamlined to English-only with USD currency.

---

**For current content management patterns, see:**
- `/docs/frontend-patterns.md` - Component and UI patterns
- `.claude/agents/frontend-ui-expert.md` - Frontend implementation guide
- `.claude/agents/i18n-translation-manager.md` - Translation key management (English-only)
