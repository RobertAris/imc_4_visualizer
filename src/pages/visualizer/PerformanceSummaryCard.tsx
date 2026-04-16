import { Grid, Text, Title } from '@mantine/core';
import { ReactNode } from 'react';
import { useStore } from '../../store.ts';
import { formatNumber } from '../../utils/format.ts';
import { VisualizerCard } from './VisualizerCard.tsx';

interface PerformanceMetricProps {
  label: string;
  value: string;
}

function PerformanceMetric({ label, value }: PerformanceMetricProps): ReactNode {
  return (
    <Grid.Col span={{ xs: 12, sm: 6, md: 3 }}>
      <Text c="dimmed" fw={700} size="sm" tt="uppercase">
        {label}
      </Text>
      <Title order={3}>{value}</Title>
    </Grid.Col>
  );
}

export function PerformanceSummaryCard(): ReactNode {
  const algorithm = useStore(state => state.algorithm)!;

  const pnlByTimestamp = new Map<number, number>();
  for (const row of algorithm.activityLogs) {
    pnlByTimestamp.set(row.timestamp, (pnlByTimestamp.get(row.timestamp) ?? 0) + row.profitLoss);
  }

  const pnlSeries = [...pnlByTimestamp.entries()].sort((a, b) => a[0] - b[0]);
  const totalPnl = pnlSeries.length > 0 ? pnlSeries[pnlSeries.length - 1][1] : 0;

  let runningPeak = Number.NEGATIVE_INFINITY;
  let maxDrawdown = 0;

  for (const [, pnl] of pnlSeries) {
    runningPeak = Math.max(runningPeak, pnl);
    maxDrawdown = Math.max(maxDrawdown, runningPeak - pnl);
  }

  let totalFilledTradePrice = 0;
  let totalFilledTrades = 0;

  for (const row of algorithm.data) {
    for (const trades of Object.values(row.state.ownTrades)) {
      for (const trade of trades) {
        totalFilledTradePrice += trade.price;
        totalFilledTrades += 1;
      }
    }
  }

  const averageFill = totalFilledTrades > 0 ? totalFilledTradePrice / totalFilledTrades : 0;
  const recovery = maxDrawdown === 0 ? 0 : totalPnl / maxDrawdown;

  return (
    <VisualizerCard title="Performance summary">
      <Grid>
        <PerformanceMetric label="Total PnL" value={formatNumber(totalPnl)} />
        <PerformanceMetric label="Max drawdown" value={formatNumber(maxDrawdown)} />
        <PerformanceMetric label="Recovery" value={formatNumber(recovery, 2)} />
        <PerformanceMetric label="Avg fill" value={formatNumber(averageFill, 2)} />
      </Grid>
    </VisualizerCard>
  );
}
