/**
 * API endpoint paths
 * Centralized to avoid magic strings scattered throughout the codebase
 */
export const API_ENDPOINTS = {
  OBSERVATIONS: '/api/observations',
  SUMMARIES: '/api/summaries',
  PROMPTS: '/api/prompts',
  SETTINGS: '/api/settings',
  STATS: '/api/stats',
  PROCESSING_STATUS: '/api/processing-status',
  STREAM: '/stream',

  // Dashboard endpoints
  TOKENS_SUMMARY: '/api/tokens/summary',
  TOKENS_BY_PROJECT: '/api/tokens/by-project',
  TOKENS_BY_TYPE: '/api/tokens/by-type',
  TOKENS_COMPRESSION: '/api/tokens/compression',
  TOKENS_PROJECTION: '/api/tokens/projection',
  PERFORMANCE_QUEUE: '/api/performance/queue',
  PERFORMANCE_TIMES: '/api/performance/times',
} as const;
