/**
 * Token Routes
 *
 * API endpoints for the token usage dashboard.
 * All endpoints use TokenMetricsService for calculations
 * and PerformanceTracker for system metrics.
 */

import express, { Request, Response } from 'express';
import { BaseRouteHandler } from '../BaseRouteHandler.js';
import { TokenMetricsService } from '../../TokenMetricsService.js';
import { PerformanceTracker } from '../../PerformanceTracker.js';

export class TokenRoutes extends BaseRouteHandler {
  constructor(
    private tokenMetricsService: TokenMetricsService,
    private performanceTracker: PerformanceTracker
  ) {
    super();
  }

  setupRoutes(app: express.Application): void {
    // Token metrics endpoints
    app.get('/api/tokens/summary', this.handleGetSummary.bind(this));
    app.get('/api/tokens/by-project', this.handleGetByProject.bind(this));
    app.get('/api/tokens/by-type', this.handleGetByType.bind(this));
    app.get('/api/tokens/time-series', this.handleGetTimeSeries.bind(this));
    app.get('/api/tokens/compression', this.handleGetCompression.bind(this));
    app.get('/api/tokens/projection', this.handleGetProjection.bind(this));

    // Performance metrics endpoints
    app.get('/api/performance/queue', this.handleGetQueueHistory.bind(this));
    app.get('/api/performance/times', this.handleGetProcessingTimes.bind(this));
  }

  // ==========================================================================
  // Token Metrics Handlers
  // ==========================================================================

  /**
   * GET /api/tokens/summary
   * Query params: project?, since? (e.g., "24h", "7d", "30d", or ISO date)
   */
  private handleGetSummary = this.wrapHandler((req: Request, res: Response): void => {
    const project = req.query.project as string | undefined;
    const since = req.query.since as string | undefined;

    const summary = this.tokenMetricsService.getSummary(project, since);

    res.json({
      ...summary,
      period: {
        since: since || 'all',
        project: project || 'all',
      },
    });
  });

  /**
   * GET /api/tokens/by-project
   * Query params: limit? (default 10), since?
   */
  private handleGetByProject = this.wrapHandler((req: Request, res: Response): void => {
    const limit = parseInt(req.query.limit as string, 10) || 10;
    const since = req.query.since as string | undefined;

    const result = this.tokenMetricsService.getByProject(limit, since);

    res.json(result);
  });

  /**
   * GET /api/tokens/by-type
   * Query params: project?, since?
   */
  private handleGetByType = this.wrapHandler((req: Request, res: Response): void => {
    const project = req.query.project as string | undefined;
    const since = req.query.since as string | undefined;

    const types = this.tokenMetricsService.getByType(project, since);

    res.json({ types });
  });

  /**
   * GET /api/tokens/time-series
   * Query params: project?, since? (default "30d"), granularity? ("hour", "day", "week")
   */
  private handleGetTimeSeries = this.wrapHandler((req: Request, res: Response): void => {
    const project = req.query.project as string | undefined;
    const since = (req.query.since as string) || '30d';
    const granularity = (req.query.granularity as 'hour' | 'day' | 'week') || 'day';

    const result = this.tokenMetricsService.getTimeSeries(project, since, granularity);

    res.json(result);
  });

  /**
   * GET /api/tokens/compression
   * Query params: project?, since?
   */
  private handleGetCompression = this.wrapHandler((req: Request, res: Response): void => {
    const project = req.query.project as string | undefined;
    const since = req.query.since as string | undefined;

    const compression = this.tokenMetricsService.getCompressionMetrics(project, since);

    res.json(compression);
  });

  /**
   * GET /api/tokens/projection
   * Query params: project?, observations? (default 50)
   *
   * Calculates Endless Mode ROI projection based on real observation data.
   */
  private handleGetProjection = this.wrapHandler((req: Request, res: Response): void => {
    const project = req.query.project as string | undefined;
    const observationCount = parseInt(req.query.observations as string, 10) || 50;

    const projection = this.tokenMetricsService.getEndlessModeProjection(project, observationCount);

    res.json(projection);
  });

  // ==========================================================================
  // Performance Metrics Handlers
  // ==========================================================================

  /**
   * GET /api/performance/queue
   * Query params: since? (default "1h"), limit? (default 100)
   */
  private handleGetQueueHistory = this.wrapHandler((req: Request, res: Response): void => {
    const since = (req.query.since as string) || '1h';
    const limit = parseInt(req.query.limit as string, 10) || 100;

    const result = this.performanceTracker.getQueueHistory(since, limit);

    res.json(result);
  });

  /**
   * GET /api/performance/times
   * Query params: since? (default "24h"), limit? (default 100)
   */
  private handleGetProcessingTimes = this.wrapHandler((req: Request, res: Response): void => {
    const since = (req.query.since as string) || '24h';
    const limit = parseInt(req.query.limit as string, 10) || 100;

    const result = this.performanceTracker.getProcessingTimes(since, limit);

    res.json(result);
  });
}
