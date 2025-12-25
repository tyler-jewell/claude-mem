import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DashboardMetrics,
  TokenMetrics,
  CompressionMetrics,
  EndlessModeProjection,
  PerformanceStats,
  Stats,
} from '../types';
import { API_ENDPOINTS } from '../constants/api';

const REFRESH_INTERVAL_MS = 30000; // 30 seconds auto-refresh

interface SSETokenUpdate {
  type: 'token_update';
  tokens: TokenMetrics;
  timestamp: number;
}

export function useDashboardMetrics() {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    tokens: null,
    compression: null,
    projection: null,
    performance: null,
    system: null,
    lastUpdated: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch all metrics in parallel
      const [
        tokensRes,
        compressionRes,
        projectionRes,
        performanceRes,
        statsRes,
      ] = await Promise.all([
        fetch(API_ENDPOINTS.TOKENS_SUMMARY),
        fetch(API_ENDPOINTS.TOKENS_COMPRESSION),
        fetch(API_ENDPOINTS.TOKENS_PROJECTION),
        fetch(API_ENDPOINTS.PERFORMANCE_TIMES),
        fetch(API_ENDPOINTS.STATS),
      ]);

      // Parse responses (handle failures gracefully)
      const tokens: TokenMetrics | null = tokensRes.ok
        ? await tokensRes.json()
        : null;
      const compression: CompressionMetrics | null = compressionRes.ok
        ? await compressionRes.json()
        : null;
      const projection: EndlessModeProjection | null = projectionRes.ok
        ? await projectionRes.json()
        : null;
      const performanceData = performanceRes.ok
        ? await performanceRes.json()
        : null;
      const system: Stats | null = statsRes.ok ? await statsRes.json() : null;

      // Extract performance stats from response
      const performance: PerformanceStats | null = performanceData?.stats || null;

      setMetrics({
        tokens,
        compression,
        projection,
        performance,
        system,
        lastUpdated: Date.now(),
      });
    } catch (err) {
      console.error('Failed to fetch dashboard metrics:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchMetrics();

    const interval = setInterval(fetchMetrics, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  // SSE listener for real-time token updates
  useEffect(() => {
    // Connect to SSE stream to listen for token updates
    const eventSource = new EventSource(API_ENDPOINTS.STREAM);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'token_update' && data.tokens) {
          console.log('[Dashboard] SSE token update received');
          setMetrics((prev) => ({
            ...prev,
            tokens: data.tokens,
            lastUpdated: Date.now(),
          }));
        }
      } catch (err) {
        // Ignore parse errors for non-token events
      }
    };

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return {
    metrics,
    isLoading,
    error,
    refresh: fetchMetrics,
  };
}
