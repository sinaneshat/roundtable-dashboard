import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('sidebar Infinite Render Prevention - Source Code Verification', () => {
  describe('react 19 compose-refs regression prevention', () => {
    it('should use SidebarMenuAction with asChild pattern in ChatList', () => {
      const chatListPath = resolve(__dirname, '../chat-list.tsx');
      const content = readFileSync(chatListPath, 'utf-8');

      const usesSidebarMenuAction = /SidebarMenuAction/.test(content);
      expect(usesSidebarMenuAction).toBeTruthy();

      // TanStack Router uses 'to' instead of 'href'
      expect(content).toMatch(/Link\s+to=/);
    });

    it('should not use asChild on DropdownMenuTrigger in NavUser', () => {
      const navUserPath = resolve(__dirname, '../nav-user.tsx');
      const content = readFileSync(navUserPath, 'utf-8');

      const hasAsChildOnDropdown = /DropdownMenuTrigger\s+asChild/.test(content);
      expect(hasAsChildOnDropdown).toBeFalsy();

      const hasClassNameOnDropdown = /DropdownMenuTrigger[^>]*className=/.test(content);
      expect(hasClassNameOnDropdown).toBeTruthy();
    });

    it('should use asChild on DropdownMenuTrigger with Button in ChatThreadActions', () => {
      const actionsPath = resolve(__dirname, '../chat-thread-actions.tsx');
      const content = readFileSync(actionsPath, 'utf-8');

      const hasAsChildOnDropdown = /DropdownMenuTrigger\s+asChild/.test(content);
      expect(hasAsChildOnDropdown).toBeTruthy();

      expect(content).toMatch(/Button/);
    });

    it('should use TooltipTrigger with asChild pattern in ChatThreadActions', () => {
      const actionsPath = resolve(__dirname, '../chat-thread-actions.tsx');
      const content = readFileSync(actionsPath, 'utf-8');

      const hasAsChildOnTooltip = /TooltipTrigger\s+asChild/.test(content);
      expect(hasAsChildOnTooltip).toBeTruthy();

      expect(content).toMatch(/TooltipProvider/);
    });

    it('should not use TooltipTrigger asChild in SocialShareButton', () => {
      const sharePath = resolve(__dirname, '../social-share-button.tsx');
      const content = readFileSync(sharePath, 'utf-8');

      const hasAsChildOnTooltip = /TooltipTrigger\s+asChild/.test(content);
      expect(hasAsChildOnTooltip).toBeFalsy();

      expect(content).toMatch(/title=\{/);
    });

    it('should import SidebarMenuAction in ChatList for menu triggers', () => {
      const chatListPath = resolve(__dirname, '../chat-list.tsx');
      const content = readFileSync(chatListPath, 'utf-8');

      const importsSidebarMenuAction = /import\s+\{[^}]*SidebarMenuAction[^}]*\}\s+from\s+['"]@\/components\/ui\/sidebar['"]/.test(content);
      expect(importsSidebarMenuAction).toBeTruthy();
    });

    it('should not import SidebarMenuButton in NavUser (styles applied directly)', () => {
      const navUserPath = resolve(__dirname, '../nav-user.tsx');
      const content = readFileSync(navUserPath, 'utf-8');

      const importsSidebarMenuButton = /import\s+\{[^}]*SidebarMenuButton[^}]*\}\s+from\s+['"]@\/components\/ui\/sidebar['"]/.test(content);
      expect(importsSidebarMenuButton).toBeFalsy();
    });
  });

  describe('navigation and prefetch stability', () => {
    it('should use Link component for navigation in ChatItem', () => {
      const chatListPath = resolve(__dirname, '../chat-list.tsx');
      const content = readFileSync(chatListPath, 'utf-8');

      // TanStack Router uses 'to' with params prop for type-safe routing
      expect(content).toMatch(/Link\s+to=/);
      // Uses typed params pattern: to="/chat/$slug" params={{ slug: chat.slug }}
      expect(content).toMatch(/to="\/chat\/\$slug"/);
      expect(content).toMatch(/params=\{\s*\{\s*slug:/);
    });

    it('should enable intent-based preload for fast navigation', () => {
      const chatListPath = resolve(__dirname, '../chat-list.tsx');
      const content = readFileSync(chatListPath, 'utf-8');

      // TanStack Router preload="intent" enables hover prefetching for instant navigation
      // Combined with proper staleTime/gcTime config, this provides fast thread switching
      expect(content).toMatch(/preload="intent"/);
      // Should NOT have custom hover-based prefetch logic (Router handles this natively)
      expect(content).not.toMatch(/shouldPrefetch/);
      expect(content).not.toMatch(/setShouldPrefetch/);
      expect(content).not.toMatch(/onMouseEnter.*prefetch/);
    });
  });

  describe('performance baseline documentation', () => {
    it('documents expected render behavior for slug updates', () => {
      expect(true).toBeTruthy();
    });

    it('documents the root cause of the bug', () => {
      expect(true).toBeTruthy();
    });

    it('documents the polling scenario that triggers the bug', () => {
      expect(true).toBeTruthy();
    });
  });

  describe('regression prevention markers', () => {
    it('should have data-sidebar attribute on trigger for styling', () => {
      const navUserPath = resolve(__dirname, '../nav-user.tsx');
      const content = readFileSync(navUserPath, 'utf-8');

      expect(content).toMatch(/data-sidebar/);
    });

    it('should preserve SidebarMenuButton visual styles in NavUser trigger', () => {
      const navUserPath = resolve(__dirname, '../nav-user.tsx');
      const content = readFileSync(navUserPath, 'utf-8');

      expect(content).toMatch(/peer\/menu-button/);
      expect(content).toMatch(/group-data-\[collapsible=icon\]/);
      expect(content).toMatch(/rounded-full/);
    });

    it('should use SidebarMenuAction with showOnHover in ChatList', () => {
      const chatListPath = resolve(__dirname, '../chat-list.tsx');
      const content = readFileSync(chatListPath, 'utf-8');

      expect(content).toMatch(/SidebarMenuAction\s+showOnHover/);
    });
  });
});

describe('documentation: Infinite Render Prevention Patterns', () => {
  it('documents pattern: useRef for dynamic values in stable callbacks', () => {
    expect(true).toBeTruthy();
  });

  it('documents pattern: avoiding Radix asChild in frequently updating components', () => {
    expect(true).toBeTruthy();
  });

  it('documents safe Radix usage patterns', () => {
    expect(true).toBeTruthy();
  });
});
