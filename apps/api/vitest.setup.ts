import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'node:util';

import { afterAll, afterEach, vi } from 'vitest';

// Mock cloudflare:workers module
vi.mock('cloudflare:workers', () => ({
  env: {},
}));

// TextEncoder/TextDecoder polyfills
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

// Environment variables for testing
process.env.APP_URL = 'http://localhost:8787';
process.env.WEBAPP_ENV = 'local';
process.env.BETTER_AUTH_URL = 'http://localhost:8787';

// Mock ReadableStream if not available
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

// Mock WritableStream if not available
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

// Mock TransformStream if not available
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
