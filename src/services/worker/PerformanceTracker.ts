/**
 * PerformanceTracker
 *
 * Tracks system performance metrics for the dashboard:
 * - Queue depth over time
 * - Observation processing times
 * - Moving averages and percentiles
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface QueueHistoryPoint {
  timestamp: number;
  queueDepth: number;
  activeSessions: number;
}

export interface ProcessingTimeRecord {
  timestamp: number;
  duration: number; // milliseconds
  toolName: string;
  discoveryTokens: number;
  observationCount: number; // Number of observations in this processing batch
}

export interface PerformanceStats {
  avgProcessingTime: number;
  p50ProcessingTime: number;
  p95ProcessingTime: number;
  avgQueueDepth: number;
  peakQueueDepth: number;
  observationsPerMinute: number;
}

export interface QueueHistoryResponse {
  history: QueueHistoryPoint[];
  stats: {
    avgQueueDepth: number;
    peakQueueDepth: number;
  };
}

export interface ProcessingTimesResponse {
  times: ProcessingTimeRecord[];
  stats: PerformanceStats;
}

// ============================================================================
// PerformanceTracker Class
// ============================================================================

export class PerformanceTracker {
  private queueHistory: QueueHistoryPoint[] = [];
  private processingTimes: ProcessingTimeRecord[] = [];

  // Configuration
  private readonly MAX_QUEUE_HISTORY = 1000; // ~1 hour at 1 point per 3.6s
  private readonly MAX_PROCESSING_TIMES = 500;
  private readonly SAMPLE_INTERVAL_MS = 5000; // 5 seconds between queue samples

  private lastSampleTime = 0;

  /**
   * Record a queue depth sample (call periodically)
   */
  recordQueueSample(queueDepth: number, activeSessions: number): void {
    const now = Date.now();

    // Throttle sampling to avoid too many points
    if (now - this.lastSampleTime < this.SAMPLE_INTERVAL_MS) {
      return;
    }
    this.lastSampleTime = now;

    this.queueHistory.push({
      timestamp: now,
      queueDepth,
      activeSessions,
    });

    // Trim old entries
    if (this.queueHistory.length > this.MAX_QUEUE_HISTORY) {
      this.queueHistory.shift();
    }
  }

  /**
   * Record observation processing time
   */
  recordProcessingTime(record: ProcessingTimeRecord): void {
    this.processingTimes.push(record);

    // Trim old entries
    if (this.processingTimes.length > this.MAX_PROCESSING_TIMES) {
      this.processingTimes.shift();
    }
  }

  /**
   * Get queue history with optional time filter
   */
  getQueueHistory(since?: string, limit = 100): QueueHistoryResponse {
    const sinceEpoch = this.parseSince(since) || (Date.now() - 60 * 60 * 1000); // Default 1 hour

    const filtered = this.queueHistory
      .filter(p => p.timestamp >= sinceEpoch)
      .slice(-limit);

    const depths = filtered.map(p => p.queueDepth);
    const avgQueueDepth = depths.length > 0
      ? Math.round((depths.reduce((a, b) => a + b, 0) / depths.length) * 10) / 10
      : 0;
    const peakQueueDepth = depths.length > 0
      ? Math.max(...depths)
      : 0;

    return {
      history: filtered,
      stats: {
        avgQueueDepth,
        peakQueueDepth,
      },
    };
  }

  /**
   * Get processing time history with stats
   */
  getProcessingTimes(since?: string, limit = 100): ProcessingTimesResponse {
    const sinceEpoch = this.parseSince(since) || (Date.now() - 24 * 60 * 60 * 1000); // Default 24 hours

    const filtered = this.processingTimes
      .filter(p => p.timestamp >= sinceEpoch)
      .slice(-limit);

    const durations = filtered.map(p => p.duration).sort((a, b) => a - b);

    const stats: PerformanceStats = {
      avgProcessingTime: 0,
      p50ProcessingTime: 0,
      p95ProcessingTime: 0,
      avgQueueDepth: 0,
      peakQueueDepth: 0,
      observationsPerMinute: 0,
    };

    if (durations.length > 0) {
      stats.avgProcessingTime = Math.round(
        durations.reduce((a, b) => a + b, 0) / durations.length
      );
      stats.p50ProcessingTime = this.percentile(durations, 50);
      stats.p95ProcessingTime = this.percentile(durations, 95);

      // Calculate observations per minute (using actual observation count, not record count)
      const timeSpan = filtered[filtered.length - 1].timestamp - filtered[0].timestamp;
      const effectiveTimeSpan = Math.max(timeSpan, 1); // Guard against zero timespan
      const totalObservations = filtered.reduce((sum, r) => sum + (r.observationCount || 1), 0);
      stats.observationsPerMinute =
        Math.round((totalObservations / (effectiveTimeSpan / 60000)) * 10) / 10;
    }

    // Include queue stats if available
    const queueStats = this.getQueueHistory(since);
    stats.avgQueueDepth = queueStats.stats.avgQueueDepth;
    stats.peakQueueDepth = queueStats.stats.peakQueueDepth;

    return {
      times: filtered,
      stats,
    };
  }

  /**
   * Get current performance stats summary
   */
  getCurrentStats(): PerformanceStats {
    const result = this.getProcessingTimes('1h');
    return result.stats;
  }

  /**
   * Clear all history (for testing)
   */
  clear(): void {
    this.queueHistory = [];
    this.processingTimes = [];
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private parseSince(since?: string): number | null {
    if (!since) return null;

    const now = Date.now();
    const match = since.match(/^(\d+)(h|d|w)$/);
    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2];
      const ms =
        unit === 'h' ? value * 60 * 60 * 1000 :
        unit === 'd' ? value * 24 * 60 * 60 * 1000 :
        value * 7 * 24 * 60 * 60 * 1000;
      return now - ms;
    }

    const date = Date.parse(since);
    if (!isNaN(date)) return date;

    return null;
  }

  private percentile(sortedArray: number[], p: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }
}
