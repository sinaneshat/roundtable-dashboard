// Learn more: https://vitest.dev/guide/
import '@testing-library/jest-dom/vitest';

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'node:util';

import { vi } from 'vitest';

// ✅ Enable require() in ES modules for orchestrator-factory dynamic imports
// This allows the orchestrator to use require() to avoid circular dependencies
if (typeof globalThis.require === 'undefined') {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const nodeRequire = createRequire(import.meta.url);

  // Wrap nodeRequire to handle @/ path alias
  const customRequire = (id: string) => {
    if (id.startsWith('@/')) {
      // Convert @/ alias to absolute path based on project root
      const relativePath = id.substring(2); // Remove '@/'
      const absolutePath = path.resolve(__dirname, 'src', relativePath);

      // Try different extensions if base path doesn't exist
      const extensions = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts'];
      for (const ext of extensions) {
        try {
          const testPath = absolutePath + ext;
          return nodeRequire(testPath);
        } catch {
          // Try next extension
        }
      }

      // If no extension works, try the original path
      return nodeRequire(absolutePath);
    }
    return nodeRequire(id);
  };

  Object.defineProperty(globalThis, 'require', {
    value: customRequire,
    writable: true,
    configurable: true,
  });
}

// Mock CSS imports (CSS modules, regular CSS, etc.)
vi.mock('*.css', () => ({}));
vi.mock('*.scss', () => ({}));

// Polyfill TextDecoder/TextEncoder for streaming tests
// Node.js and DOM types are compatible at runtime but slightly different in TypeScript
// Using Object.defineProperty to avoid type mismatch while maintaining runtime compatibility
Object.defineProperty(globalThis, 'TextDecoder', {
  value: NodeTextDecoder,
  writable: true,
  configurable: true,
});

Object.defineProperty(globalThis, 'TextEncoder', {
  value: NodeTextEncoder,
  writable: true,
  configurable: true,
});

// ✅ REMOVED: next-intl mock - using real NextIntlClientProvider from test-providers.tsx
// The test-providers.tsx provides proper translations via NextIntlClientProvider with full messages

// Mock @opennextjs/cloudflare - ESM-only package
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({
    env: {},
    cf: {},
    ctx: {
      waitUntil: () => {},
      passThroughOnException: () => {},
    },
  }),
}));

// Mock better-auth - requires Request API which isn't available in Vitest
vi.mock('@/lib/auth/client', () => ({
  authClient: {
    signIn: {
      social: vi.fn(),
      email: vi.fn(),
    },
    signOut: vi.fn(),
    useSession: vi.fn(() => ({
      data: null,
      isPending: false,
      error: null,
    })),
  },
  // Export named exports as well for direct imports
  useSession: vi.fn(() => ({
    data: null,
    isPending: false,
    error: null,
  })),
  signOut: vi.fn(),
  signIn: vi.fn(),
}));

// Mock next/navigation - required for Next.js 13+ App Router
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  })),
  useSearchParams: vi.fn(() => ({
    get: vi.fn(),
    getAll: vi.fn(),
    has: vi.fn(),
    toString: vi.fn(),
  })),
  usePathname: vi.fn(() => '/'),
  useParams: vi.fn(() => ({})),
  useSelectedLayoutSegment: vi.fn(),
  useSelectedLayoutSegments: vi.fn(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

// Mock environment variables for testing
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
process.env.NEXT_PUBLIC_WEBAPP_ENV = 'local';

// Mock window.matchMedia (only in browser/jsdom environment)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// Mock IntersectionObserver - properly typed implementation
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];

  constructor(
    _callback: IntersectionObserverCallback,
    _options?: IntersectionObserverInit,
  ) {}

  disconnect(): void {}
  observe(_target: Element): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  unobserve(_target: Element): void {}
}

globalThis.IntersectionObserver = MockIntersectionObserver;

// Mock ResizeObserver - properly typed implementation
class MockResizeObserver implements ResizeObserver {
  constructor(_callback: ResizeObserverCallback) {}

  disconnect(): void {}
  observe(_target: Element, _options?: ResizeObserverOptions): void {}
  unobserve(_target: Element): void {}
}

globalThis.ResizeObserver = MockResizeObserver;

// Mock Element.scrollIntoView for cmdk component (only in browser/jsdom environment)
if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = vi.fn();
}

// Mock ReadableStream for streaming tests - defined first as it's used by TransformStream
if (typeof globalThis.ReadableStream === 'undefined') {
  class MockReadableStream<R = unknown> implements ReadableStream<R> {
    readonly locked: boolean = false;

    constructor(
      _underlyingSource?: UnderlyingSource<R> | UnderlyingByteSource,
      _strategy?: QueuingStrategy<R>,
    ) {}

    cancel(_reason?: unknown): Promise<void> {
      return Promise.resolve();
    }

    getReader(_options?: { mode?: undefined }): ReadableStreamDefaultReader<R>;
    getReader(options: { mode: 'byob' }): ReadableStreamBYOBReader;
    getReader(_options?: ReadableStreamGetReaderOptions): ReadableStreamReader<R> {
      const reader: ReadableStreamDefaultReader<R> = {
        read: async (): Promise<ReadableStreamReadResult<R>> => {
          const result: ReadableStreamReadDoneResult<R> = {
            done: true,
            value: undefined,
          };
          return result;
        },
        releaseLock: () => {},
        closed: Promise.resolve(undefined),
        cancel: async () => {},
      };
      return reader;
    }

    pipeThrough<T>(
      _transform: ReadableWritablePair<T, R>,
      _options?: StreamPipeOptions,
    ): ReadableStream<T> {
      return new MockReadableStream<T>();
    }

    pipeTo(
      _destination: WritableStream<R>,
      _options?: StreamPipeOptions,
    ): Promise<void> {
      return Promise.resolve();
    }

    tee(): [ReadableStream<R>, ReadableStream<R>] {
      return [new MockReadableStream<R>(), new MockReadableStream<R>()];
    }

    async* [Symbol.asyncIterator](): AsyncIterableIterator<R> {
      // Empty async generator - yields nothing
    }
  }

  Object.defineProperty(globalThis, 'ReadableStream', {
    value: MockReadableStream,
    writable: true,
    configurable: true,
  });
}

// Mock WritableStream for TransformStream
if (typeof globalThis.WritableStream === 'undefined') {
  class MockWritableStream<W = unknown> implements WritableStream<W> {
    readonly locked: boolean = false;

    constructor(_underlyingSink?: UnderlyingSink<W>) {}

    abort(_reason?: unknown): Promise<void> {
      return Promise.resolve();
    }

    close(): Promise<void> {
      return Promise.resolve();
    }

    getWriter(): WritableStreamDefaultWriter<W> {
      const writer: WritableStreamDefaultWriter<W> = {
        write: async () => {},
        close: async () => {},
        abort: async () => {},
        closed: Promise.resolve(undefined),
        desiredSize: null,
        ready: Promise.resolve(undefined),
        releaseLock: () => {},
      };
      return writer;
    }
  }

  globalThis.WritableStream = MockWritableStream;
}

// Mock TransformStream for AI SDK
if (typeof globalThis.TransformStream === 'undefined') {
  class MockTransformStream<I = unknown, O = unknown> implements TransformStream<I, O> {
    readonly readable: ReadableStream<O>;
    readonly writable: WritableStream<I>;

    constructor() {
      const MockReadableStreamClass = globalThis.ReadableStream;
      const MockWritableStreamClass = globalThis.WritableStream;

      this.readable = new MockReadableStreamClass<O>();
      this.writable = new MockWritableStreamClass<I>();
    }
  }

  globalThis.TransformStream = MockTransformStream;
}
