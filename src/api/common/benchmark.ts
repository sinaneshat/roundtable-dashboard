/**
 * Database Query Benchmark Utility
 *
 * Uses performance.now() for timing (advances after I/O in Workers).
 * Provides min/max/avg/p95 statistics for query performance analysis.
 */

export interface BenchmarkResult {
  name: string;
  iterations: number;
  timings: {
    min: number;
    max: number;
    avg: number;
    p95: number;
    total: number;
  };
  /** Individual run times in ms */
  runs: number[];
}

export interface BenchmarkSuite {
  startedAt: string;
  completedAt: string;
  totalDuration: number;
  results: BenchmarkResult[];
}

/**
 * Benchmark a single async operation
 */
export async function benchmark<T>(
  name: string,
  fn: () => Promise<T>,
  iterations = 5,
): Promise<BenchmarkResult> {
  const runs: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    runs.push(end - start);
  }

  // Sort for percentile calculation
  const sorted = [...runs].sort((a, b) => a - b);
  const p95Index = Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1);

  const minVal = sorted[0] ?? 0;
  const maxVal = sorted[sorted.length - 1] ?? 0;
  const p95Val = sorted[p95Index] ?? 0;

  return {
    name,
    iterations,
    timings: {
      min: Math.round(minVal * 100) / 100,
      max: Math.round(maxVal * 100) / 100,
      avg: Math.round((runs.reduce((a, b) => a + b, 0) / runs.length) * 100) / 100,
      p95: Math.round(p95Val * 100) / 100,
      total: Math.round(runs.reduce((a, b) => a + b, 0) * 100) / 100,
    },
    runs: runs.map(r => Math.round(r * 100) / 100),
  };
}

/**
 * Run multiple benchmarks and aggregate results
 */
export async function runBenchmarkSuite(
  benchmarks: Array<{ name: string; fn: () => Promise<unknown>; iterations?: number }>,
): Promise<BenchmarkSuite> {
  const startedAt = new Date().toISOString();
  const suiteStart = performance.now();

  const results: BenchmarkResult[] = [];

  for (const { name, fn, iterations } of benchmarks) {
    const result = await benchmark(name, fn, iterations ?? 3);
    results.push(result);
  }

  const suiteEnd = performance.now();

  return {
    startedAt,
    completedAt: new Date().toISOString(),
    totalDuration: Math.round((suiteEnd - suiteStart) * 100) / 100,
    results,
  };
}

/**
 * Format benchmark results as a readable string
 */
export function formatBenchmarkResults(suite: BenchmarkSuite): string {
  const lines: string[] = [
    `Benchmark Suite`,
    `===============`,
    `Started: ${suite.startedAt}`,
    `Total Duration: ${suite.totalDuration}ms`,
    ``,
  ];

  for (const result of suite.results) {
    lines.push(`${result.name} (${result.iterations} iterations)`);
    lines.push(`  Min: ${result.timings.min}ms`);
    lines.push(`  Max: ${result.timings.max}ms`);
    lines.push(`  Avg: ${result.timings.avg}ms`);
    lines.push(`  P95: ${result.timings.p95}ms`);
    lines.push(``);
  }

  return lines.join('\n');
}
