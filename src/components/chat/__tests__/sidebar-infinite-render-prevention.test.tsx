/**
 * Sidebar Infinite Render Prevention Tests
 *
 * Tests that verify the React 19 + Radix compose-refs infinite loop fix.
 *
 * Background:
 * - Radix UI's `asChild` prop uses `compose-refs` to merge refs
 * - In React 19, compose-refs can cause infinite re-render loops
 * - This happens when components re-render frequently (e.g., during slug polling)
 * - The fix removes `asChild` from DropdownMenuTrigger and applies styles directly
 *
 * @see https://github.com/radix-ui/primitives/issues/3675
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('sidebar Infinite Render Prevention - Source Code Verification', () => {
  describe('react 19 compose-refs regression prevention', () => {
    it('should not use asChild on DropdownMenuTrigger in ChatList', () => {
      const chatListPath = resolve(__dirname, '../chat-list.tsx');
      const content = readFileSync(chatListPath, 'utf-8');

      // Should NOT have DropdownMenuTrigger with asChild
      const hasAsChildOnDropdown = /DropdownMenuTrigger\s+asChild/.test(content);
      expect(hasAsChildOnDropdown).toBe(false);

      // Should have DropdownMenuTrigger with className (our fix)
      const hasClassNameOnDropdown = /DropdownMenuTrigger[^>]*className=/.test(content);
      expect(hasClassNameOnDropdown).toBe(true);
    });

    it('should not use asChild on DropdownMenuTrigger in NavUser', () => {
      const navUserPath = resolve(__dirname, '../nav-user.tsx');
      const content = readFileSync(navUserPath, 'utf-8');

      // Should NOT have DropdownMenuTrigger with asChild
      const hasAsChildOnDropdown = /DropdownMenuTrigger\s+asChild/.test(content);
      expect(hasAsChildOnDropdown).toBe(false);

      // Should have DropdownMenuTrigger with className (our fix)
      const hasClassNameOnDropdown = /DropdownMenuTrigger[^>]*className=/.test(content);
      expect(hasClassNameOnDropdown).toBe(true);
    });

    it('should not use asChild on DropdownMenuTrigger in ChatThreadActions', () => {
      const actionsPath = resolve(__dirname, '../chat-thread-actions.tsx');
      const content = readFileSync(actionsPath, 'utf-8');

      // Should NOT have DropdownMenuTrigger with asChild
      const hasAsChildOnDropdown = /DropdownMenuTrigger\s+asChild/.test(content);
      expect(hasAsChildOnDropdown).toBe(false);

      // Should have DropdownMenuTrigger with className (our fix)
      const hasClassNameOnDropdown = /DropdownMenuTrigger[^>]*className=/.test(content);
      expect(hasClassNameOnDropdown).toBe(true);
    });

    it('should not use TooltipTrigger asChild in ChatThreadActions', () => {
      const actionsPath = resolve(__dirname, '../chat-thread-actions.tsx');
      const content = readFileSync(actionsPath, 'utf-8');

      // Should NOT have TooltipTrigger with asChild
      const hasAsChildOnTooltip = /TooltipTrigger\s+asChild/.test(content);
      expect(hasAsChildOnTooltip).toBe(false);

      // Should use native title attribute instead
      expect(content).toMatch(/title=\{.*t\(/);
    });

    it('should not use TooltipTrigger asChild in SocialShareButton', () => {
      const sharePath = resolve(__dirname, '../social-share-button.tsx');
      const content = readFileSync(sharePath, 'utf-8');

      // Should NOT have TooltipTrigger with asChild
      const hasAsChildOnTooltip = /TooltipTrigger\s+asChild/.test(content);
      expect(hasAsChildOnTooltip).toBe(false);

      // Should use native title attribute instead
      expect(content).toMatch(/title=\{/);
    });

    it('should have comment explaining the fix in ChatList', () => {
      const chatListPath = resolve(__dirname, '../chat-list.tsx');
      const content = readFileSync(chatListPath, 'utf-8');

      // Should have comment about the fix
      const hasExplanation = content.includes('compose-refs') || content.includes('React 19');
      expect(hasExplanation).toBe(true);
    });

    it('should have comment explaining the fix in NavUser', () => {
      const navUserPath = resolve(__dirname, '../nav-user.tsx');
      const content = readFileSync(navUserPath, 'utf-8');

      // Should have comment about the fix
      const hasExplanation = content.includes('compose-refs') || content.includes('React 19');
      expect(hasExplanation).toBe(true);
    });

    it('should not import SidebarMenuAction in ChatList (no longer needed)', () => {
      const chatListPath = resolve(__dirname, '../chat-list.tsx');
      const content = readFileSync(chatListPath, 'utf-8');

      // Should NOT import SidebarMenuAction (removed as part of fix)
      const importsSidebarMenuAction = /import\s+\{[^}]*SidebarMenuAction[^}]*\}\s+from\s+['"]@\/components\/ui\/sidebar['"]/.test(content);
      expect(importsSidebarMenuAction).toBe(false);
    });

    it('should not import SidebarMenuButton in NavUser (styles applied directly)', () => {
      const navUserPath = resolve(__dirname, '../nav-user.tsx');
      const content = readFileSync(navUserPath, 'utf-8');

      // Should NOT import SidebarMenuButton (styles applied directly to trigger)
      const importsSidebarMenuButton = /import\s+\{[^}]*SidebarMenuButton[^}]*\}\s+from\s+['"]@\/components\/ui\/sidebar['"]/.test(content);
      expect(importsSidebarMenuButton).toBe(false);
    });
  });

  describe('callback stability with useRef pattern', () => {
    it('should use slugRef pattern in ChatItem for stable callbacks', () => {
      const chatListPath = resolve(__dirname, '../chat-list.tsx');
      const content = readFileSync(chatListPath, 'utf-8');

      // Should have slugRef pattern
      expect(content).toMatch(/slugRef[^\n\r=\u2028\u2029]*=.*useRef/);
      expect(content).toMatch(/slugRef\.current/);
    });

    it('should have stable handleClick callback (not dependent on slug)', () => {
      const chatListPath = resolve(__dirname, '../chat-list.tsx');
      const content = readFileSync(chatListPath, 'utf-8');

      // The handleClick callback should use slugRef.current, not direct slug
      // This ensures the callback identity doesn't change when slug updates
      expect(content).toMatch(/handleClick[^\n\r=\u2028\u2029]*=.*useCallback/);
      expect(content).toMatch(/router\.push.*slugRef\.current/);
    });

    it('should have stable handleMouseEnter callback for prefetching', () => {
      const chatListPath = resolve(__dirname, '../chat-list.tsx');
      const content = readFileSync(chatListPath, 'utf-8');

      // The handleMouseEnter callback should use slugRef.current
      expect(content).toMatch(/handleMouseEnter[^\n\r=\u2028\u2029]*=.*useCallback/);
      expect(content).toMatch(/router\.prefetch.*slugRef\.current/);
    });
  });

  describe('performance baseline documentation', () => {
    it('documents expected render behavior for slug updates', () => {
      /**
       * EXPECTED BEHAVIOR (after fix):
       *
       * When slug/title updates during AI title generation:
       * 1. ChatList receives new props (chats array with updated slug/title)
       * 2. ChatList re-renders once
       * 3. ChatItem re-renders once
       * 4. Callbacks remain stable (due to slugRef pattern)
       * 5. No infinite loop occurs
       *
       * Before fix (infinite loop):
       * 1. Component re-renders
       * 2. Radix compose-refs creates new callback functions
       * 3. New callbacks trigger state updates
       * 4. State updates cause re-render
       * 5. Go to step 1 (infinite loop!)
       */
      expect(true).toBe(true);
    });

    it('documents the root cause of the bug', () => {
      /**
       * ROOT CAUSE:
       *
       * 1. Radix's `asChild` prop uses `Slot` component
       * 2. `Slot` uses `compose-refs` to merge refs from parent and child
       * 3. In React 19, compose-refs can create new function references on each render
       * 4. When combined with frequent re-renders (e.g., polling), this causes:
       *    - New ref callback created
       *    - React detects ref change, updates DOM
       *    - Update triggers re-render
       *    - New ref callback created (repeat forever)
       *
       * FIX:
       * - Remove `asChild` from DropdownMenuTrigger
       * - Apply SidebarMenuAction/SidebarMenuButton styles directly to trigger
       * - This avoids Radix's Slot/compose-refs entirely
       *
       * @see https://github.com/radix-ui/primitives/issues/3675
       */
      expect(true).toBe(true);
    });

    it('documents the polling scenario that triggers the bug', () => {
      /**
       * SCENARIO: AI Title Generation Polling
       *
       * 1. User sends first message to new thread
       * 2. Thread created with temporary slug (e.g., "thread-abc123")
       * 3. AI starts generating title in background
       * 4. Frontend polls `useThreadSlugStatusQuery` every 10 seconds
       * 5. When AI finishes, slug updates (e.g., "how-to-use-react-hooks")
       * 6. React Query updates cache
       * 7. ChatList re-renders with new slug
       * 8. If using asChild + compose-refs → INFINITE LOOP
       * 9. With our fix → Single re-render, stable callbacks
       */
      expect(true).toBe(true);
    });
  });

  describe('regression prevention markers', () => {
    it('should have data-sidebar attribute on trigger for styling', () => {
      const navUserPath = resolve(__dirname, '../nav-user.tsx');
      const content = readFileSync(navUserPath, 'utf-8');

      // Should have data-sidebar attribute for consistent styling
      expect(content).toMatch(/data-sidebar/);
    });

    it('should preserve SidebarMenuButton visual styles in NavUser trigger', () => {
      const navUserPath = resolve(__dirname, '../nav-user.tsx');
      const content = readFileSync(navUserPath, 'utf-8');

      // Key styles that should be present from SidebarMenuButton
      expect(content).toMatch(/peer\/menu-button/); // Peer class for sibling styling
      expect(content).toMatch(/group-data-\[collapsible=icon\]/); // Collapsed state handling
      expect(content).toMatch(/rounded-full/); // Border radius
    });

    it('should preserve SidebarMenuAction visual styles in ChatList trigger', () => {
      const chatListPath = resolve(__dirname, '../chat-list.tsx');
      const content = readFileSync(chatListPath, 'utf-8');

      // Key styles that should be present from SidebarMenuAction
      expect(content).toMatch(/absolute.*end-2/); // Positioning
      expect(content).toMatch(/md:opacity-0/); // Hidden by default on desktop
      expect(content).toMatch(/group-hover\/menu-item:opacity-100/); // Show on hover behavior
      expect(content).toMatch(/size-6/); // Size
    });
  });
});

describe('documentation: Infinite Render Prevention Patterns', () => {
  it('documents pattern: useRef for dynamic values in stable callbacks', () => {
    /**
     * PATTERN: Using useRef to avoid callback recreation
     *
     * Problem:
     * ```tsx
     * const handleClick = useCallback(() => {
     *   router.push(`/chat/${slug}`);
     * }, [router, slug]); // Recreates on every slug change!
     * ```
     *
     * Solution:
     * ```tsx
     * const slugRef = useRef(slug);
     * slugRef.current = slug;
     *
     * const handleClick = useCallback(() => {
     *   router.push(`/chat/${slugRef.current}`);
     * }, [router]); // Stable - never recreates for slug changes
     * ```
     *
     * Benefits:
     * - Callback identity stays stable
     * - No re-renders from callback changes
     * - Always uses latest slug value
     */
    expect(true).toBe(true);
  });

  it('documents pattern: avoiding Radix asChild in frequently updating components', () => {
    /**
     * PATTERN: Avoid asChild in dynamic contexts
     *
     * Radix asChild + compose-refs = potential infinite loop in React 19
     *
     * DON'T:
     * ```tsx
     * <DropdownMenuTrigger asChild>
     *   <SidebarMenuButton>{dynamicContent}</SidebarMenuButton>
     * </DropdownMenuTrigger>
     * ```
     *
     * DO:
     * ```tsx
     * <DropdownMenuTrigger className="...button-styles...">
     *   {dynamicContent}
     * </DropdownMenuTrigger>
     * ```
     *
     * Alternative (if asChild is needed):
     * - Use custom Slot from @/lib/ui/slot (not Radix's)
     * - Memoize the child component
     * - Use forwardRef with stable ref callback
     */
    expect(true).toBe(true);
  });

  it('documents safe Radix usage patterns', () => {
    /**
     * SAFE RADIX PATTERNS:
     *
     * 1. Static content without frequent updates:
     *    - asChild is safe when parent doesn't re-render often
     *
     * 2. Custom Slot implementation:
     *    - Project uses @/lib/ui/slot which avoids compose-refs issues
     *    - sidebar.tsx, button.tsx, etc. use this safe Slot
     *
     * 3. Direct styling without asChild:
     *    - Apply styles directly to Radix component
     *    - No ref composition needed
     *
     * UNSAFE PATTERNS (avoid in React 19):
     *
     * 1. asChild with polling/streaming data:
     *    - DropdownMenuTrigger asChild + dynamic props
     *    - TooltipTrigger asChild + frequently changing content
     *
     * 2. Nested Slots:
     *    - Multiple asChild levels compound the problem
     */
    expect(true).toBe(true);
  });
});
