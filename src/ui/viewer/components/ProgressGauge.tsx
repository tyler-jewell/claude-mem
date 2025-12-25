import React from 'react';

interface ProgressGaugeProps {
  value: number; // 0-100
  label: string;
  showValue?: boolean;
  size?: 'small' | 'medium' | 'large';
  color?: 'default' | 'success' | 'warning';
}

export function ProgressGauge({
  value,
  label,
  showValue = true,
  size = 'medium',
  color = 'default',
}: ProgressGaugeProps) {
  // Clamp value between 0 and 100
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <div className={`progress-gauge progress-gauge-${size}`}>
      {showValue && (
        <div className="progress-gauge-value">{clampedValue.toFixed(1)}%</div>
      )}
      <div className="progress-gauge-bar">
        <div
          className={`progress-gauge-fill progress-gauge-${color}`}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
      <div className="progress-gauge-label">{label}</div>
    </div>
  );
}
