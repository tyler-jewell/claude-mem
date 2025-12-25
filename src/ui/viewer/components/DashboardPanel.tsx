import React from 'react';
import { DashboardMetrics } from '../types';
import { MetricCard } from './MetricCard';
import { ProgressGauge } from './ProgressGauge';

interface DashboardPanelProps {
  isOpen: boolean;
  onClose: () => void;
  metrics: DashboardMetrics;
  isLoading: boolean;
  onRefresh: () => void;
}

export function DashboardPanel({
  isOpen,
  onClose,
  metrics,
  isLoading,
  onRefresh,
}: DashboardPanelProps) {
  const { tokens, compression, projection, performance, system } = metrics;

  // Format uptime
  const formatUptime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  return (
    <div className={`dashboard-panel ${isOpen ? 'open' : ''}`}>
      {/* Header */}
      <div className="dashboard-header">
        <h2>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"></line>
            <line x1="12" y1="20" x2="12" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="14"></line>
          </svg>
          Dashboard
        </h2>
        <div className="dashboard-header-actions">
          <button
            className="dashboard-refresh-btn"
            onClick={onRefresh}
            disabled={isLoading}
            title="Refresh metrics"
          >
            <svg
              className={isLoading ? 'spinning' : ''}
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
            </svg>
          </button>
          <button className="dashboard-close-btn" onClick={onClose} title="Close dashboard">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="dashboard-content">
        {/* Token Economics Section */}
        <div className="dashboard-section">
          <div className="dashboard-section-header">
            <svg className="dashboard-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="16"></line>
              <line x1="8" y1="12" x2="16" y2="12"></line>
            </svg>
            Token Economics
          </div>

          {tokens ? (
            <>
              <div className="metric-grid">
                <MetricCard
                  label="Observations"
                  value={tokens.totalObservations}
                  tooltip="Total compressed observations stored in the database"
                />
                <MetricCard
                  label="Recall Ratio"
                  value={tokens.efficiencyGain}
                  unit="x"
                  variant="highlight"
                  tooltip="discovery_tokens / read_tokens: How many times cheaper to read than discover. Higher = better compression"
                />
                <MetricCard
                  label="Discovery Tokens"
                  value={tokens.totalDiscoveryTokens}
                  tooltip="Total tokens spent by SDK analyzing tool outputs to create observations"
                />
                <MetricCard
                  label="Read Tokens"
                  value={tokens.totalReadTokens}
                  tooltip="Total tokens to inject all compressed observations into context"
                />
              </div>

              <div className="metric-highlight-row">
                <MetricCard
                  label="Compression Gain"
                  value={tokens.savings}
                  unit="tokens"
                  variant="success"
                  fullWidth
                  tooltip="discovery_tokens - read_tokens: Tokens saved by compressing observations vs cost to create them"
                />
              </div>

              <ProgressGauge
                value={tokens.savingsPercent}
                label="Compression Rate"
                color="success"
              />
            </>
          ) : (
            <div className="dashboard-empty">No token data available</div>
          )}
        </div>

        {/* Compression Section */}
        {compression && (
          <div className="dashboard-section">
            <div className="dashboard-section-header">
              <svg className="dashboard-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 14 10 14 10 20"></polyline>
                <polyline points="20 10 14 10 14 4"></polyline>
                <line x1="14" y1="10" x2="21" y2="3"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
              Compression
            </div>

            <ProgressGauge
              value={compression.avgCompressionRatio * 100}
              label="Average Compression Ratio"
              color="success"
            />
          </div>
        )}

        {/* Endless Mode Projection Section */}
        {projection && projection.tokensSaved > 0 && (
          <div className="dashboard-section">
            <div className="dashboard-section-header">
              <svg className="dashboard-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 6v6l4 2"></path>
              </svg>
              Endless Mode Projection
            </div>

            <div className="metric-grid">
              <MetricCard
                label="Tokens Saved"
                value={projection.tokensSaved}
                variant="success"
                tooltip="Projected context tokens saved by using compressed observations vs full tool outputs"
              />
              <MetricCard
                label="Context Ratio"
                value={projection.efficiencyGain}
                unit="x"
                variant="highlight"
                tooltip="Context reduction factor: full_context / compressed_context"
              />
            </div>

            <ProgressGauge
              value={projection.percentSaved}
              label="Context Reduction"
              color="success"
            />
          </div>
        )}

        {/* System Performance Section */}
        <div className="dashboard-section">
          <div className="dashboard-section-header">
            <svg className="dashboard-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
              <polyline points="2 17 12 22 22 17"></polyline>
              <polyline points="2 12 12 17 22 12"></polyline>
            </svg>
            System
          </div>

          <div className="metric-grid">
            {system?.worker?.uptime !== undefined && (
              <MetricCard
                label="Uptime"
                value={formatUptime(system.worker.uptime)}
                tooltip="Time since worker service started"
              />
            )}
            {system?.worker?.activeSessions !== undefined && (
              <MetricCard
                label="Active Sessions"
                value={system.worker.activeSessions}
                tooltip="Currently processing SDK sessions"
              />
            )}
            {system?.database?.observations !== undefined && (
              <MetricCard
                label="Total Observations"
                value={system.database.observations}
                tooltip="Total observations in SQLite database"
              />
            )}
            {system?.database?.size !== undefined && (
              <MetricCard
                label="Database Size"
                value={system.database.size}
                format="bytes"
                tooltip="SQLite database file size on disk"
              />
            )}
          </div>

          {performance && (
            <div className="metric-grid" style={{ marginTop: '10px' }}>
              <MetricCard
                label="Avg Storage"
                value={performance.avgProcessingTime}
                format="duration"
                tooltip="Average time to parse, store, and broadcast each observation batch"
              />
              <MetricCard
                label="Obs/Minute"
                value={performance.observationsPerMinute.toFixed(1)}
                tooltip="Observation throughput rate over the last hour"
              />
            </div>
          )}
        </div>

        {/* Last Updated */}
        {metrics.lastUpdated > 0 && (
          <div className="dashboard-footer">
            Updated {new Date(metrics.lastUpdated).toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
}
