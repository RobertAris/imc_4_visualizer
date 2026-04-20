import { Divider, Stack, Text } from '@mantine/core';
import { ReactNode } from 'react';
import { AlgorithmDataRow, ProsperitySymbol } from '../../models.ts';
import { useStore } from '../../store.ts';
import { formatNumber } from '../../utils/format.ts';
import classes from './DashboardVisualizer.module.css';

interface StatRowProps {
  label: string;
  value: string;
}

function StatRow({ label, value }: StatRowProps): ReactNode {
  return (
    <div className={classes.statRow}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function getBestLevel(orders: Record<number, number>, side: 'bid' | 'ask'): [number, number] | null {
  const entries = Object.entries(orders).map(([price, quantity]) => [Number(price), quantity] as [number, number]);
  if (entries.length === 0) {
    return null;
  }

  return entries.sort((a, b) => (side === 'bid' ? b[0] - a[0] : a[0] - b[0]))[0];
}

export interface DashboardSideRailProps {
  row: AlgorithmDataRow;
  symbol: ProsperitySymbol;
}

export function DashboardSideRail({ row, symbol }: DashboardSideRailProps): ReactNode {
  const algorithm = useStore(state => state.algorithm)!;
  const orderDepth = row.state.orderDepths[symbol];
  const bestBid = orderDepth ? getBestLevel(orderDepth.buyOrders, 'bid') : null;
  const bestAsk = orderDepth ? getBestLevel(orderDepth.sellOrders, 'ask') : null;
  const bidSize = bestBid ? Math.abs(bestBid[1]) : 0;
  const askSize = bestAsk ? Math.abs(bestAsk[1]) : 0;
  const mid = bestBid && bestAsk ? (bestBid[0] + bestAsk[0]) / 2 : 0;
  const microprice =
    bidSize + askSize > 0 && bestBid && bestAsk
      ? (bestBid[0] * askSize + bestAsk[0] * bidSize) / (bidSize + askSize)
      : mid;
  const productPnl =
    algorithm.activityLogs.find(
      activityRow => activityRow.timestamp === row.state.timestamp && activityRow.product === symbol,
    )?.profitLoss ?? 0;
  const observations = row.state.observations.conversionObservations[symbol];
  const plainObservation = row.state.observations.plainValueObservations[symbol];

  return (
    <aside className={classes.sideRail}>
      <section className={classes.panel}>
        <Text className={classes.panelTitle}>Market State</Text>
        <Stack gap={0}>
          <StatRow label="Best bid" value={bestBid ? formatNumber(bestBid[0]) : '-'} />
          <StatRow label="Best ask" value={bestAsk ? formatNumber(bestAsk[0]) : '-'} />
          <StatRow label="Mid" value={mid ? formatNumber(mid, 2) : '-'} />
          <StatRow label="Spread" value={bestBid && bestAsk ? formatNumber(bestAsk[0] - bestBid[0], 2) : '-'} />
          <StatRow label="Microprice" value={microprice ? formatNumber(microprice, 2) : '-'} />
          <StatRow label="Bid size" value={formatNumber(bidSize)} />
          <StatRow label="Ask size" value={formatNumber(askSize)} />
        </Stack>
      </section>

      <section className={classes.panel}>
        <Text className={classes.panelTitle}>Product Performance</Text>
        <Stack gap={0}>
          <StatRow label="Position" value={formatNumber(row.state.position[symbol] ?? 0)} />
          <StatRow label="PnL" value={formatNumber(productPnl)} />
          <StatRow label="Bot trades" value={formatNumber(row.state.marketTrades[symbol]?.length ?? 0)} />
          <StatRow label="Own fills" value={formatNumber(row.state.ownTrades[symbol]?.length ?? 0)} />
          <StatRow label="Orders" value={formatNumber(row.orders[symbol]?.length ?? 0)} />
        </Stack>
      </section>

      <section className={classes.panel}>
        <Text className={classes.panelTitle}>Observations</Text>
        {observations ? (
          <Stack gap={0}>
            <StatRow label="Conv bid" value={formatNumber(observations.bidPrice)} />
            <StatRow label="Conv ask" value={formatNumber(observations.askPrice)} />
            <StatRow label="Transport" value={formatNumber(observations.transportFees)} />
            <StatRow label="Import tariff" value={formatNumber(observations.importTariff)} />
            <StatRow label="Export tariff" value={formatNumber(observations.exportTariff)} />
            <StatRow label="Sunlight" value={formatNumber(observations.sunlight)} />
            <StatRow label="Humidity" value={formatNumber(observations.humidity)} />
          </Stack>
        ) : plainObservation !== undefined ? (
          <StatRow label="Value" value={formatNumber(plainObservation)} />
        ) : (
          <Text size="sm" c="dimmed">
            No observations for this product.
          </Text>
        )}
      </section>

      <section className={classes.panel}>
        <Text className={classes.panelTitle}>Timestamp Notes</Text>
        <Divider mb="xs" />
        <Text size="sm" c="dimmed">
          {row.algorithmLogs || row.sandboxLogs
            ? 'Logs are available in timestamp details.'
            : 'No logs for this timestamp.'}
        </Text>
      </section>
    </aside>
  );
}
