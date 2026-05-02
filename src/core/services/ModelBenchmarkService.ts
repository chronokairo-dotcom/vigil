import { Logger } from '../utils/Logger';
import { MetricsService, MetricsSnapshot, ModelMetrics } from './MetricsService';

/**
 * Model Benchmark Service
 * 
 * Provides comparative analysis of different LLMs based on performance metrics
 */

export interface BenchmarkReport {
  timestamp: Date;
  summary: string;
  bestModel: {
    bySuccessRate: string;
    byLatency: string;
    byCostEfficiency: string;
  };
  models: Array<{
    id: string;
    metrics: ModelMetrics;
    score: number; // Normalized score 0-100
  }>;
}

export class ModelBenchmarkService {
  private static instance: ModelBenchmarkService;
  private logger = Logger.getInstance();

  private constructor(private metricsService: MetricsService) {}

  public static getInstance(metricsService: MetricsService): ModelBenchmarkService {
    if (!ModelBenchmarkService.instance) {
      ModelBenchmarkService.instance = new ModelBenchmarkService(metricsService);
    }
    return ModelBenchmarkService.instance;
  }

  /**
   * Generate a benchmark report comparing all models
   */
  generateReport(period: 'hour' | 'day' | 'week' = 'day'): BenchmarkReport {
    const metrics = this.metricsService.getMetrics(period);
    const modelIds = Object.keys(metrics.byModel);

    if (modelIds.length === 0) {
      return this.getEmptyReport();
    }

    const modelsWithScores = modelIds.map(id => {
      const modelMetrics = metrics.byModel[id];
      return {
        id,
        metrics: modelMetrics,
        score: this.calculateModelScore(modelMetrics),
      };
    });

    // Sort by score descending
    modelsWithScores.sort((a, b) => b.score - a.score);

    // Determine best models
    const bestBySuccess = [...modelsWithScores].sort((a, b) => b.metrics.successRate - a.successRate)[0].id;
    const bestByLatency = [...modelsWithScores].sort((a, b) => a.metrics.avgDuration - b.metrics.avgDuration)[0].id;
    const bestByCost = [...modelsWithScores].sort((a, b) => a.metrics.avgTokensPerTask - b.metrics.avgTokensPerTask)[0].id;

    return {
      timestamp: new Date(),
      summary: `Analyzed ${modelIds.length} models over the last ${period}.`,
      bestModel: {
        bySuccessRate: bestBySuccess,
        byLatency: bestByLatency,
        byCostEfficiency: bestByCost,
      },
      models: modelsWithScores,
    };
  }

  /**
   * Calculate a normalized score for a model (0-100)
   * Weighted average of success rate, inverse latency, and inverse token usage
   */
  private calculateModelScore(metrics: ModelMetrics): number {
    // Weights
    const W_SUCCESS = 0.5;
    const W_LATENCY = 0.3;
    const W_TOKENS = 0.2;

    // Normalization factors (hypothetical benchmarks)
    const MAX_LATENCY = 60000; // 60s
    const MAX_TOKENS = 10000; // 10k tokens

    const successScore = metrics.successRate; // Already 0-100
    const latencyScore = Math.max(0, 100 * (1 - metrics.avgDuration / MAX_LATENCY));
    const tokenScore = Math.max(0, 100 * (1 - metrics.avgTokensPerTask / MAX_TOKENS));

    return (successScore * W_SUCCESS) + (latencyScore * W_LATENCY) + (tokenScore * W_TOKENS);
  }

  private getEmptyReport(): BenchmarkReport {
    return {
      timestamp: new Date(),
      summary: 'No data available for benchmarking.',
      bestModel: {
        bySuccessRate: 'N/A',
        byLatency: 'N/A',
        byCostEfficiency: 'N/A',
      },
      models: [],
    };
  }
}
