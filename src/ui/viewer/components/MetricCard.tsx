import React from 'react';

interface MetricCardProps {
  label: string;
  value: number | string;
  unit?: string;
  format?: 'number' | 'bytes' | 'duration' | 'percent';
  variant?: 'default' | 'success' | 'warning' | 'highlight';
  fullWidth?: boolean;
  tooltip?: string; // Hover tooltip explaining how metric is calculated
}

function formatValue(
  value: number | string,
  format: 'number' | 'bytes' | 'duration' | 'percent' = 'number'
): string {
  if (typeof value === 'string') return value;

  switch (format) {
    case 'bytes': {
      if (value < 1024) return `${value} B`;
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
      if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
      return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    case 'duration': {
      if (value < 1000) return `${value}ms`;
      if (value < 60000) return `${(value / 1000).toFixed(1)}s`;
      if (value < 3600000) return `${Math.floor(value / 60000)}m ${Math.floor((value % 60000) / 1000)}s`;
      return `${Math.floor(value / 3600000)}h ${Math.floor((value % 3600000) / 60000)}m`;
    }
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'number':
    default:
      return value.toLocaleString();
  }
}

export function MetricCard({
  label,
  value,
  unit,
  format = 'number',
  variant = 'default',
  fullWidth = false,
  tooltip,
}: MetricCardProps) {
  const formattedValue = formatValue(value, format);

  return (
    <div className={`metric-card ${variant !== 'default' ? `metric-${variant}` : ''} ${fullWidth ? 'full-width' : ''}`}>
      <div className="metric-label">
        {label}
        {tooltip && (
          <span className="metric-info" title={tooltip}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          </span>
        )}
      </div>
      <div className="metric-value">
        {formattedValue}
        {unit && <span className="metric-unit">{unit}</span>}
      </div>
    </div>
  );
}
