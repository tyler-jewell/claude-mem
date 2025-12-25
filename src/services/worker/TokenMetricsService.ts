/**
 * TokenMetricsService
 *
 * Provides token economics calculations and aggregations for the dashboard.
 * Ports logic from scripts/endless-mode-token-calculator.js to work with live database data.
 */

import type { SessionStore } from '../sqlite/SessionStore.js';

// Heuristic: 1 token ≈ 4 characters for English text
const CHARS_PER_TOKEN = 4;

// Cache TTL in milliseconds
const CACHE_TTL_MS = 30000; // 30 seconds for summary data
const PROJECTION_CACHE_TTL_MS = 300000; // 5 minutes for expensive projections

// ============================================================================
// Type Definitions
// ============================================================================

export interface TokenSummary {
  totalObservations: number;
  totalReadTokens: number;
  totalDiscoveryTokens: number;
  savings: number;
  savingsPercent: number;
  efficiencyGain: number;
  avgReadTokensPerObs: number;
  avgDiscoveryTokensPerObs: number;
}

export interface TokensByProject {
  project: string;
  observations: number;
  readTokens: number;
  discoveryTokens: number;
  savings: number;
  savingsPercent: number;
}

export interface TokensByType {
  type: string;
  count: number;
  readTokens: number;
  discoveryTokens: number;
  avgReadTokens: number;
  avgDiscoveryTokens: number;
}

export interface TokenTimeSeries {
  date: string;
  observations: number;
  readTokens: number;
  discoveryTokens: number;
  cumulativeRead: number;
  cumulativeDiscovery: number;
}

export interface CompressionMetrics {
  avgCompressionRatio: number;
  totalOriginalSize: number;
  totalCompressedSize: number;
  compressionByType: Record<string, number>;
}

export interface EndlessModeProjection {
  withoutEndlessMode: {
    totalTokens: number;
    discoveryTokens: number;
    continuationTokens: number;
  };
  withEndlessMode: {
    totalTokens: number;
    discoveryTokens: number;
    continuationTokens: number;
  };
  tokensSaved: number;
  percentSaved: number;
  efficiencyGain: number;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface ObservationRow {
  id: number;
  type: string | null;
  title: string | null;
  subtitle: string | null;
  narrative: string | null;
  facts: string | null;
  discovery_tokens: number | null;
  created_at_epoch: number;
  project: string | null;
}

// ============================================================================
// TokenMetricsService Class
// ============================================================================

export class TokenMetricsService {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private lastBroadcastTime = 0;
  private readonly BROADCAST_THROTTLE_MS = 1000;

  constructor(private sessionStore: SessionStore) {}

  // ==========================================================================
  // Cache Management
  // ==========================================================================

  private getCached<T>(key: string, ttl: number): T | null {
    const entry = this.cache.get(key);
    if (entry && (Date.now() - entry.timestamp) < ttl) {
      return entry.data as T;
    }
    return null;
  }

  private setCache<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Invalidate cache when new observations arrive
   */
  invalidateCache(project?: string): void {
    for (const key of this.cache.keys()) {
      if (!project || key.includes(project) || key.startsWith('summary:')) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Check if we should broadcast (throttle to avoid flooding SSE)
   */
  shouldBroadcast(): boolean {
    const now = Date.now();
    if (now - this.lastBroadcastTime >= this.BROADCAST_THROTTLE_MS) {
      this.lastBroadcastTime = now;
      return true;
    }
    return false;
  }

  // ==========================================================================
  // Token Calculation Helpers
  // ==========================================================================

  /**
   * Calculate read tokens from observation text content
   * Parses JSON arrays to get actual content length (excluding brackets/quotes)
   */
  private calculateReadTokens(obs: ObservationRow): number {
    // Helper to get content length from JSON array string
    const getJsonArrayContentLength = (jsonStr: string | null | undefined): number => {
      if (!jsonStr) return 0;
      try {
        const arr = JSON.parse(jsonStr);
        if (Array.isArray(arr)) {
          return arr.join('').length;
        }
        return jsonStr.length; // Fallback if not an array
      } catch {
        return jsonStr.length; // Fallback on parse error
      }
    };

    const size =
      (obs.title?.length || 0) +
      (obs.subtitle?.length || 0) +
      (obs.narrative?.length || 0) +
      getJsonArrayContentLength(obs.facts) +
      getJsonArrayContentLength(obs.concepts) +
      getJsonArrayContentLength(obs.files_read) +
      getJsonArrayContentLength(obs.files_modified);
    return Math.ceil(size / CHARS_PER_TOKEN);
  }

  /**
   * Estimate original tool output size from discovery tokens
   * Heuristic: If it took N tokens to analyze, original was ~2N tokens
   */
  private estimateOriginalSize(discoveryTokens: number): number {
    return discoveryTokens * 2;
  }

  /**
   * Parse 'since' parameter to epoch milliseconds
   */
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

    // Try parsing as ISO date
    const date = Date.parse(since);
    if (!isNaN(date)) return date;

    return null;
  }

  // ==========================================================================
  // Public API Methods
  // ==========================================================================

  /**
   * Get overall token summary
   */
  getSummary(project?: string, since?: string): TokenSummary {
    const cacheKey = `summary:${project || 'all'}:${since || 'all'}`;
    const cached = this.getCached<TokenSummary>(cacheKey, CACHE_TTL_MS);
    if (cached) return cached;

    const sinceEpoch = this.parseSince(since);
    const db = this.sessionStore.db;

    // Build WHERE clause
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (project) {
      conditions.push('project = ?');
      params.push(project);
    }
    if (sinceEpoch) {
      conditions.push('created_at_epoch >= ?');
      params.push(sinceEpoch);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Query observations
    const observations = db.prepare(`
      SELECT id, type, title, subtitle, narrative, facts, discovery_tokens, created_at_epoch, project
      FROM observations
      ${whereClause}
    `).all(...params) as ObservationRow[];

    // Calculate metrics
    let totalReadTokens = 0;
    let totalDiscoveryTokens = 0;

    for (const obs of observations) {
      totalReadTokens += this.calculateReadTokens(obs);
      totalDiscoveryTokens += obs.discovery_tokens || 0;
    }

    const totalObservations = observations.length;
    const savings = totalDiscoveryTokens - totalReadTokens;
    const savingsPercent = totalDiscoveryTokens > 0
      ? Math.round((savings / totalDiscoveryTokens) * 100)
      : 0;
    const efficiencyGain = totalReadTokens > 0
      ? Math.round((totalDiscoveryTokens / totalReadTokens) * 10) / 10
      : 0;

    const result: TokenSummary = {
      totalObservations,
      totalReadTokens,
      totalDiscoveryTokens,
      savings,
      savingsPercent,
      efficiencyGain,
      avgReadTokensPerObs: totalObservations > 0
        ? Math.round(totalReadTokens / totalObservations)
        : 0,
      avgDiscoveryTokensPerObs: totalObservations > 0
        ? Math.round(totalDiscoveryTokens / totalObservations)
        : 0,
    };

    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * Get token breakdown by project
   */
  getByProject(limit = 10, since?: string): { projects: TokensByProject[]; totalProjects: number } {
    const cacheKey = `by-project:${limit}:${since || 'all'}`;
    const cached = this.getCached<{ projects: TokensByProject[]; totalProjects: number }>(cacheKey, CACHE_TTL_MS);
    if (cached) return cached;

    const sinceEpoch = this.parseSince(since);
    const db = this.sessionStore.db;

    const sinceCondition = sinceEpoch ? 'AND created_at_epoch >= ?' : '';
    const params = sinceEpoch ? [sinceEpoch, limit] : [limit];

    const rows = db.prepare(`
      SELECT
        project,
        COUNT(*) as count,
        SUM(discovery_tokens) as discovery_tokens,
        SUM(
          CAST(
            (LENGTH(COALESCE(title, '')) +
             LENGTH(COALESCE(subtitle, '')) +
             LENGTH(COALESCE(narrative, '')) +
             LENGTH(COALESCE(facts, '[]'))) / ${CHARS_PER_TOKEN}.0
          AS INTEGER)
        ) as read_tokens
      FROM observations
      WHERE project IS NOT NULL ${sinceCondition}
      GROUP BY project
      ORDER BY discovery_tokens DESC
      LIMIT ?
    `).all(...params) as Array<{
      project: string;
      count: number;
      discovery_tokens: number;
      read_tokens: number;
    }>;

    // Get total project count
    const totalRow = db.prepare(`
      SELECT COUNT(DISTINCT project) as total
      FROM observations
      WHERE project IS NOT NULL ${sinceCondition}
    `).get(...(sinceEpoch ? [sinceEpoch] : [])) as { total: number };

    const projects: TokensByProject[] = rows.map(row => {
      const savings = (row.discovery_tokens || 0) - (row.read_tokens || 0);
      const savingsPercent = row.discovery_tokens > 0
        ? Math.round((savings / row.discovery_tokens) * 100)
        : 0;

      return {
        project: row.project,
        observations: row.count,
        readTokens: row.read_tokens || 0,
        discoveryTokens: row.discovery_tokens || 0,
        savings,
        savingsPercent,
      };
    });

    const result = { projects, totalProjects: totalRow.total };
    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * Get token breakdown by observation type
   */
  getByType(project?: string, since?: string): TokensByType[] {
    const cacheKey = `by-type:${project || 'all'}:${since || 'all'}`;
    const cached = this.getCached<TokensByType[]>(cacheKey, CACHE_TTL_MS);
    if (cached) return cached;

    const sinceEpoch = this.parseSince(since);
    const db = this.sessionStore.db;

    const conditions: string[] = ['type IS NOT NULL'];
    const params: (string | number)[] = [];

    if (project) {
      conditions.push('project = ?');
      params.push(project);
    }
    if (sinceEpoch) {
      conditions.push('created_at_epoch >= ?');
      params.push(sinceEpoch);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const rows = db.prepare(`
      SELECT
        type,
        COUNT(*) as count,
        SUM(discovery_tokens) as discovery_tokens,
        AVG(discovery_tokens) as avg_discovery_tokens,
        SUM(
          CAST(
            (LENGTH(COALESCE(title, '')) +
             LENGTH(COALESCE(subtitle, '')) +
             LENGTH(COALESCE(narrative, '')) +
             LENGTH(COALESCE(facts, '[]'))) / ${CHARS_PER_TOKEN}.0
          AS INTEGER)
        ) as read_tokens
      FROM observations
      ${whereClause}
      GROUP BY type
      ORDER BY discovery_tokens DESC
    `).all(...params) as Array<{
      type: string;
      count: number;
      discovery_tokens: number;
      avg_discovery_tokens: number;
      read_tokens: number;
    }>;

    const result: TokensByType[] = rows.map(row => ({
      type: row.type,
      count: row.count,
      readTokens: row.read_tokens || 0,
      discoveryTokens: row.discovery_tokens || 0,
      avgReadTokens: row.count > 0 ? Math.round((row.read_tokens || 0) / row.count) : 0,
      avgDiscoveryTokens: Math.round(row.avg_discovery_tokens || 0),
    }));

    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * Get time series token data for charts
   */
  getTimeSeries(
    project?: string,
    since = '30d',
    granularity: 'hour' | 'day' | 'week' = 'day'
  ): { series: TokenTimeSeries[]; granularity: string } {
    const cacheKey = `time-series:${project || 'all'}:${since}:${granularity}`;
    const cached = this.getCached<{ series: TokenTimeSeries[]; granularity: string }>(cacheKey, CACHE_TTL_MS);
    if (cached) return cached;

    const sinceEpoch = this.parseSince(since) || (Date.now() - 30 * 24 * 60 * 60 * 1000);
    const db = this.sessionStore.db;

    // SQLite date grouping based on granularity
    const dateFormat = granularity === 'hour'
      ? "strftime('%Y-%m-%d %H:00', datetime(created_at_epoch / 1000, 'unixepoch'))"
      : granularity === 'week'
      ? "strftime('%Y-W%W', datetime(created_at_epoch / 1000, 'unixepoch'))"
      : "date(datetime(created_at_epoch / 1000, 'unixepoch'))";

    const conditions: string[] = [`created_at_epoch >= ?`];
    const params: (string | number)[] = [sinceEpoch];

    if (project) {
      conditions.push('project = ?');
      params.push(project);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const rows = db.prepare(`
      SELECT
        ${dateFormat} as date,
        COUNT(*) as observations,
        SUM(discovery_tokens) as discovery_tokens,
        SUM(
          CAST(
            (LENGTH(COALESCE(title, '')) +
             LENGTH(COALESCE(subtitle, '')) +
             LENGTH(COALESCE(narrative, '')) +
             LENGTH(COALESCE(facts, '[]'))) / ${CHARS_PER_TOKEN}.0
          AS INTEGER)
        ) as read_tokens
      FROM observations
      ${whereClause}
      GROUP BY date
      ORDER BY date ASC
    `).all(...params) as Array<{
      date: string;
      observations: number;
      discovery_tokens: number;
      read_tokens: number;
    }>;

    // Calculate cumulative values
    let cumulativeRead = 0;
    let cumulativeDiscovery = 0;

    const series: TokenTimeSeries[] = rows.map(row => {
      cumulativeRead += row.read_tokens || 0;
      cumulativeDiscovery += row.discovery_tokens || 0;

      return {
        date: row.date,
        observations: row.observations,
        readTokens: row.read_tokens || 0,
        discoveryTokens: row.discovery_tokens || 0,
        cumulativeRead,
        cumulativeDiscovery,
      };
    });

    const result = { series, granularity };
    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * Get compression metrics
   */
  getCompressionMetrics(project?: string, since?: string): CompressionMetrics {
    const cacheKey = `compression:${project || 'all'}:${since || 'all'}`;
    const cached = this.getCached<CompressionMetrics>(cacheKey, CACHE_TTL_MS);
    if (cached) return cached;

    const sinceEpoch = this.parseSince(since);
    const db = this.sessionStore.db;

    const conditions: string[] = ['discovery_tokens > 0'];
    const params: (string | number)[] = [];

    if (project) {
      conditions.push('project = ?');
      params.push(project);
    }
    if (sinceEpoch) {
      conditions.push('created_at_epoch >= ?');
      params.push(sinceEpoch);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Get overall compression
    const overall = db.prepare(`
      SELECT
        SUM(discovery_tokens * 2) as total_original,
        SUM(
          CAST(
            (LENGTH(COALESCE(title, '')) +
             LENGTH(COALESCE(subtitle, '')) +
             LENGTH(COALESCE(narrative, '')) +
             LENGTH(COALESCE(facts, '[]'))) / ${CHARS_PER_TOKEN}.0
          AS INTEGER)
        ) as total_compressed
      FROM observations
      ${whereClause}
    `).get(...params) as { total_original: number; total_compressed: number };

    // Get compression by type
    const byType = db.prepare(`
      SELECT
        type,
        AVG(
          1.0 - (
            CAST(
              (LENGTH(COALESCE(title, '')) +
               LENGTH(COALESCE(subtitle, '')) +
               LENGTH(COALESCE(narrative, '')) +
               LENGTH(COALESCE(facts, '[]'))) / ${CHARS_PER_TOKEN}.0
            AS REAL)
          ) / NULLIF(discovery_tokens * 2.0, 0)
        ) as compression_ratio
      FROM observations
      ${whereClause} AND type IS NOT NULL
      GROUP BY type
    `).all(...params) as Array<{ type: string; compression_ratio: number }>;

    const totalOriginal = overall.total_original || 0;
    const totalCompressed = overall.total_compressed || 0;
    const avgCompressionRatio = totalOriginal > 0
      ? Math.round((1 - totalCompressed / totalOriginal) * 100) / 100
      : 0;

    const compressionByType: Record<string, number> = {};
    for (const row of byType) {
      compressionByType[row.type] = Math.round((row.compression_ratio || 0) * 100) / 100;
    }

    const result: CompressionMetrics = {
      avgCompressionRatio,
      totalOriginalSize: totalOriginal,
      totalCompressedSize: totalCompressed,
      compressionByType,
    };

    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * Calculate Endless Mode projection (expensive - use longer cache)
   * Ports logic from scripts/endless-mode-token-calculator.js
   */
  getEndlessModeProjection(project?: string, observationCount = 50): EndlessModeProjection {
    const cacheKey = `projection:${project || 'all'}:${observationCount}`;
    const cached = this.getCached<EndlessModeProjection>(cacheKey, PROJECTION_CACHE_TTL_MS);
    if (cached) return cached;

    const db = this.sessionStore.db;

    // Get recent observations
    const whereClause = project ? 'WHERE project = ?' : '';
    const params = project ? [project, observationCount] : [observationCount];

    const observations = db.prepare(`
      SELECT id, type, title, subtitle, narrative, facts, discovery_tokens
      FROM observations
      ${whereClause}
      ORDER BY created_at_epoch DESC
      LIMIT ?
    `).all(...params) as ObservationRow[];

    if (observations.length === 0) {
      const empty: EndlessModeProjection = {
        withoutEndlessMode: { totalTokens: 0, discoveryTokens: 0, continuationTokens: 0 },
        withEndlessMode: { totalTokens: 0, discoveryTokens: 0, continuationTokens: 0 },
        tokensSaved: 0,
        percentSaved: 0,
        efficiencyGain: 0,
      };
      this.setCache(cacheKey, empty);
      return empty;
    }

    // Simulate WITHOUT Endless Mode
    let withoutCumulativeContext = 0;
    let withoutTotalDiscovery = 0;
    let withoutTotalContinuation = 0;

    for (const obs of observations) {
      const discoveryTokens = obs.discovery_tokens || 0;
      const originalSize = this.estimateOriginalSize(discoveryTokens);

      withoutTotalDiscovery += discoveryTokens;
      withoutCumulativeContext += originalSize;
      withoutTotalContinuation += withoutCumulativeContext;
    }

    // Simulate WITH Endless Mode
    let withCumulativeContext = 0;
    let withTotalDiscovery = 0;
    let withTotalContinuation = 0;

    for (const obs of observations) {
      const discoveryTokens = obs.discovery_tokens || 0;
      const compressedSize = this.calculateReadTokens(obs);

      withTotalDiscovery += discoveryTokens;
      withCumulativeContext += compressedSize;
      withTotalContinuation += withCumulativeContext;
    }

    const withoutTotal = withoutTotalDiscovery + withoutTotalContinuation;
    const withTotal = withTotalDiscovery + withTotalContinuation;
    const tokensSaved = withoutTotal - withTotal;
    const percentSaved = withoutTotal > 0
      ? Math.round((tokensSaved / withoutTotal) * 1000) / 10
      : 0;
    const efficiencyGain = withTotal > 0
      ? Math.round((withoutTotal / withTotal) * 10) / 10
      : 0;

    const result: EndlessModeProjection = {
      withoutEndlessMode: {
        totalTokens: withoutTotal,
        discoveryTokens: withoutTotalDiscovery,
        continuationTokens: withoutTotalContinuation,
      },
      withEndlessMode: {
        totalTokens: withTotal,
        discoveryTokens: withTotalDiscovery,
        continuationTokens: withTotalContinuation,
      },
      tokensSaved,
      percentSaved,
      efficiencyGain,
    };

    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * Get a quick summary for SSE broadcasts (lightweight, no cache)
   */
  getQuickSummary(): {
    totalDiscoveryTokens: number;
    totalReadTokens: number;
    savings: number;
    savingsPercent: number;
  } {
    const db = this.sessionStore.db;

    const row = db.prepare(`
      SELECT
        SUM(discovery_tokens) as discovery,
        SUM(
          CAST(
            (LENGTH(COALESCE(title, '')) +
             LENGTH(COALESCE(subtitle, '')) +
             LENGTH(COALESCE(narrative, '')) +
             LENGTH(COALESCE(facts, '[]'))) / ${CHARS_PER_TOKEN}.0
          AS INTEGER)
        ) as read_tokens
      FROM observations
    `).get() as { discovery: number; read_tokens: number };

    const totalDiscoveryTokens = row.discovery || 0;
    const totalReadTokens = row.read_tokens || 0;
    const savings = totalDiscoveryTokens - totalReadTokens;
    const savingsPercent = totalDiscoveryTokens > 0
      ? Math.round((savings / totalDiscoveryTokens) * 100)
      : 0;

    return {
      totalDiscoveryTokens,
      totalReadTokens,
      savings,
      savingsPercent,
    };
  }
}
