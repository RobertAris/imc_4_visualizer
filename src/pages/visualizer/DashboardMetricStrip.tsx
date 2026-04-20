import { ReactNode } from 'react';
import { formatNumber } from '../../utils/format.ts';
import classes from './DashboardVisualizer.module.css';

export interface DashboardMetric {
  label: string;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  value: string;
}

export interface DashboardMetricStripProps {
  metrics: DashboardMetric[];
}

export function DashboardMetricStrip({ metrics }: DashboardMetricStripProps): ReactNode {
  return (
    <div className={classes.metricGrid}>
      {metrics.map(metric => (
        <div key={metric.label} className={classes.metricCard} data-trend={metric.trend}>
          <span className={classes.metricLabel}>{metric.label}</span>
          <strong>{metric.value || formatNumber(0)}</strong>
          {metric.subValue && <span className={classes.metricSubValue}>{metric.subValue}</span>}
        </div>
      ))}
    </div>
  );
}
