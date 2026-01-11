/// <reference path="./cloudflare-env.d.ts" />

import '@testing-library/jest-dom/vitest';

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'node:util';

import { afterAll, afterEach, vi } from 'vitest';

if (typeof globalThis.require === 'undefined') {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const nodeRequire = createRequire(import.meta.url);

  const customRequire = (id: string) => {
    if (id.startsWith('@/')) {
      const relativePath = id.substring(2);
      const absolutePath = path.resolve(__dirname, 'src', relativePath);
      const extensions = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts'];

      for (const ext of extensions) {
        try {
          return nodeRequire(absolutePath + ext);
        } catch {
          continue;
        }
      }

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

vi.mock('*.css', () => ({}));
vi.mock('*.scss', () => ({}));
vi.mock('server-only', () => ({}));

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

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({
    env: {},
    cf: {},
    ctx: {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    },
  }),
}));

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
  useSession: vi.fn(() => ({
    data: null,
    isPending: false,
    error: null,
  })),
  signOut: vi.fn(),
  signIn: vi.fn(),
}));

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

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn(),
    getAll: vi.fn(() => []),
    toString: vi.fn(() => ''),
  })),
  headers: vi.fn(async () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn(),
    getAll: vi.fn(() => []),
    entries: vi.fn(() => []),
  })),
}));

process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
process.env.NEXT_PUBLIC_WEBAPP_ENV = 'local';

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: ReadonlyArray<number> = [];

  disconnect(): void {}

  observe(): void {}

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  unobserve(): void {}
}

globalThis.IntersectionObserver = MockIntersectionObserver;

class MockResizeObserver implements ResizeObserver {
  disconnect(): void {}
  observe(): void {}
  unobserve(): void {}
}

globalThis.ResizeObserver = MockResizeObserver;

if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = vi.fn();
}

if (typeof globalThis.ReadableStream === 'undefined') {
  class MockReadableStream<R = Uint8Array> implements ReadableStream<R> {
    readonly locked = false;

    cancel(): Promise<void> {
      return Promise.resolve();
    }

    getReader(_options?: { mode?: undefined }): ReadableStreamDefaultReader<R>;
    getReader(_options: { mode: 'byob' }): ReadableStreamBYOBReader;
    getReader(): ReadableStreamDefaultReader<R> {
      return {
        read: async () => ({ done: true, value: undefined }) as ReadableStreamReadDoneResult<R>,
        releaseLock: () => {},
        closed: Promise.resolve(undefined),
        cancel: async () => {},
      };
    }

    pipeThrough<T>(): ReadableStream<T> {
      return new MockReadableStream<T>();
    }

    pipeTo(): Promise<void> {
      return Promise.resolve();
    }

    tee(): [ReadableStream<R>, ReadableStream<R>] {
      return [new MockReadableStream<R>(), new MockReadableStream<R>()];
    }

    values(): ReadableStreamAsyncIterator<R> {
      return {
        next: async () => ({ done: true, value: undefined }) as IteratorResult<R>,
        return: async () => ({ done: true, value: undefined }) as IteratorResult<R>,
        [Symbol.asyncIterator]() {
          return this;
        },
        [Symbol.asyncDispose]: async () => {},
      };
    }

    [Symbol.asyncIterator](): ReadableStreamAsyncIterator<R> {
      return this.values();
    }
  }

  Object.defineProperty(globalThis, 'ReadableStream', {
    value: MockReadableStream,
    writable: true,
    configurable: true,
  });
}

if (typeof globalThis.WritableStream === 'undefined') {
  class MockWritableStream<W = Uint8Array> implements WritableStream<W> {
    readonly locked = false;

    abort(): Promise<void> {
      return Promise.resolve();
    }

    close(): Promise<void> {
      return Promise.resolve();
    }

    getWriter(): WritableStreamDefaultWriter<W> {
      return {
        write: async () => {},
        close: async () => {},
        abort: async () => {},
        closed: Promise.resolve(undefined),
        desiredSize: null,
        ready: Promise.resolve(undefined),
        releaseLock: () => {},
      };
    }
  }

  globalThis.WritableStream = MockWritableStream;
}

if (typeof globalThis.TransformStream === 'undefined') {
  class MockTransformStream<I = Uint8Array, O = Uint8Array> implements TransformStream<I, O> {
    readonly readable: ReadableStream<O>;
    readonly writable: WritableStream<I>;

    constructor() {
      this.readable = new globalThis.ReadableStream<O>();
      this.writable = new globalThis.WritableStream<I>();
    }
  }

  globalThis.TransformStream = MockTransformStream;
}

function tryGC() {
  if (typeof globalThis.gc === 'function') {
    globalThis.gc();
  }
}

afterEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  tryGC();
});
