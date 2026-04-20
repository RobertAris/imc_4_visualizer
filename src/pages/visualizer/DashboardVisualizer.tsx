import { Collapse, Group, SegmentedControl, Select, Switch, Text } from '@mantine/core';
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { AlgorithmDataRow } from '../../models.ts';
import { useStore } from '../../store.ts';
import { formatNumber } from '../../utils/format.ts';
import { DashboardMarketMetric, DashboardTradePresentation, getDashboardSymbols } from './dashboard-series.ts';
import { DashboardMarketChart } from './DashboardMarketChart.tsx';
import { DashboardMetric, DashboardMetricStrip } from './DashboardMetricStrip.tsx';
import { DashboardSideRail } from './DashboardSideRail.tsx';
import { DashboardTimelineControls } from './DashboardTimelineControls.tsx';
import classes from './DashboardVisualizer.module.css';
import { PositionChart } from './PositionChart.tsx';
import { ProfitLossChart } from './ProfitLossChart.tsx';
import { TimestampsCard } from './TimestampsCard.tsx';

function getRows(algorithmRows: AlgorithmDataRow[]): AlgorithmDataRow[] {
  return [...algorithmRows].sort((a, b) => a.state.timestamp - b.state.timestamp);
}

function getPnlSeries(algorithm: ReturnType<typeof useStore.getState>['algorithm']): [number, number][] {
  if (!algorithm) {
    return [];
  }

  const pnlByTimestamp = new Map<number, number>();

  for (const row of algorithm.activityLogs) {
    pnlByTimestamp.set(row.timestamp, (pnlByTimestamp.get(row.timestamp) ?? 0) + row.profitLoss);
  }

  return [...pnlByTimestamp.entries()].sort((a, b) => a[0] - b[0]);
}

function getCurrentTotalPnl(pnlSeries: [number, number][], timestamp: number): number {
  let current = 0;

  for (const [pnlTimestamp, pnl] of pnlSeries) {
    if (pnlTimestamp > timestamp) {
      break;
    }

    current = pnl;
  }

  return current;
}

function getMaxDrawdown(pnlSeries: [number, number][], timestamp: number): number {
  let peak = Number.NEGATIVE_INFINITY;
  let drawdown = 0;

  for (const [pnlTimestamp, pnl] of pnlSeries) {
    if (pnlTimestamp > timestamp) {
      break;
    }

    peak = Math.max(peak, pnl);
    drawdown = Math.max(drawdown, peak - pnl);
  }

  return drawdown;
}

function getProductPnl(
  algorithm: ReturnType<typeof useStore.getState>['algorithm'],
  symbol: string,
  timestamp: number,
): number {
  if (!algorithm) {
    return 0;
  }

  let current = 0;

  for (const row of algorithm.activityLogs) {
    if (row.product === symbol && row.timestamp <= timestamp) {
      current = row.profitLoss;
    }
  }

  return current;
}

function getMidPrice(row: AlgorithmDataRow, symbol: string): number {
  const orderDepth = row.state.orderDepths[symbol];
  if (!orderDepth) {
    return 0;
  }

  const bids = Object.keys(orderDepth.buyOrders).map(Number);
  const asks = Object.keys(orderDepth.sellOrders).map(Number);

  if (bids.length === 0 || asks.length === 0) {
    return 0;
  }

  return (Math.max(...bids) + Math.min(...asks)) / 2;
}

export function DashboardVisualizer(): ReactNode {
  const algorithm = useStore(state => state.algorithm)!;
  const symbols = useMemo(() => getDashboardSymbols(algorithm), [algorithm]);
  const rows = useMemo(() => getRows(algorithm.data), [algorithm.data]);
  const [selectedProduct, setSelectedProduct] = useState(symbols[0] ?? '');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [marketMetric, setMarketMetric] = useState<DashboardMarketMetric>('prices');
  const [sampled, setSampled] = useState(true);
  const [showTrades, setShowTrades] = useState(true);
  const [tradePresentation, setTradePresentation] = useState<DashboardTradePresentation>('botTrades');

  useEffect(() => {
    if (!symbols.includes(selectedProduct)) {
      setSelectedProduct(symbols[0] ?? '');
    }
  }, [selectedProduct, symbols]);

  useEffect(() => {
    setCurrentIndex(index => Math.min(index, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  const stepTimeline = useCallback(
    (delta: number) => {
      setCurrentIndex(index => Math.max(0, Math.min(rows.length - 1, index + delta)));
    },
    [rows.length],
  );

  useEffect(() => {
    if (!isPlaying || rows.length <= 1) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setCurrentIndex(index => {
        const nextIndex = index + playbackSpeed;
        if (nextIndex >= rows.length - 1) {
          setIsPlaying(false);
          return rows.length - 1;
        }

        return nextIndex;
      });
    }, 220);

    return () => window.clearInterval(interval);
  }, [isPlaying, playbackSpeed, rows.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setIsPlaying(false);
        stepTimeline(-1);
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setIsPlaying(false);
        stepTimeline(1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stepTimeline]);

  const currentRow = rows[currentIndex] ?? rows[0];
  const currentTimestamp = currentRow?.state.timestamp ?? 0;
  const pnlSeries = useMemo(() => getPnlSeries(algorithm), [algorithm]);
  const currentTotalPnl = getCurrentTotalPnl(pnlSeries, currentTimestamp);
  const productPnl = getProductPnl(algorithm, selectedProduct, currentTimestamp);
  const currentPosition = currentRow?.state.position[selectedProduct] ?? 0;
  const midPrice = currentRow ? getMidPrice(currentRow, selectedProduct) : 0;
  const metrics: DashboardMetric[] = [
    {
      label: 'Total PnL',
      value: formatNumber(currentTotalPnl),
      trend: currentTotalPnl >= 0 ? 'up' : 'down',
      subValue: 'Cumulative',
    },
    {
      label: 'Max Drawdown',
      value: formatNumber(getMaxDrawdown(pnlSeries, currentTimestamp)),
      trend: 'down',
      subValue: 'Peak to trough',
    },
    {
      label: `${selectedProduct} PnL`,
      value: formatNumber(productPnl),
      trend: productPnl >= 0 ? 'up' : 'down',
      subValue: 'Selected product',
    },
    {
      label: 'Position',
      value: formatNumber(currentPosition),
      trend: currentPosition > 0 ? 'up' : currentPosition < 0 ? 'down' : 'neutral',
      subValue: 'Current inventory',
    },
    {
      label: 'Mid Price',
      value: midPrice ? formatNumber(midPrice, 2) : '-',
      subValue: `${formatNumber(symbols.length)} active products`,
    },
  ];

  const jumpToTimestamp = (timestamp: number): void => {
    const targetIndex = rows.findIndex(row => row.state.timestamp >= timestamp);
    setIsPlaying(false);
    setCurrentIndex(targetIndex === -1 ? Math.max(0, rows.length - 1) : targetIndex);
  };

  if (!currentRow) {
    return <Text>No dashboard data available.</Text>;
  }

  return (
    <div className={classes.workstation}>
      <div className={classes.stickyTop}>
        <DashboardTimelineControls
          currentIndex={currentIndex}
          day={algorithm.activityLogs.find(row => row.timestamp === currentTimestamp)?.day}
          isPlaying={isPlaying}
          playbackSpeed={playbackSpeed}
          timestamp={currentTimestamp}
          total={rows.length}
          onIndexChange={index => {
            setIsPlaying(false);
            setCurrentIndex(index);
          }}
          onPlayPause={() => setIsPlaying(value => !value)}
          onPlaybackSpeedChange={setPlaybackSpeed}
          onStep={delta => {
            setIsPlaying(false);
            stepTimeline(delta);
          }}
          onTimestampJump={jumpToTimestamp}
        />
      </div>

      <DashboardMetricStrip metrics={metrics} />

      <div className={classes.productBar}>
        <Group gap="xs" wrap="wrap">
          <Select
            label="Product"
            data={symbols}
            value={selectedProduct}
            onChange={value => setSelectedProduct(value ?? symbols[0] ?? '')}
            allowDeselect={false}
            w={240}
          />
          <SegmentedControl
            value={tradePresentation}
            onChange={value => setTradePresentation(value as DashboardTradePresentation)}
            data={[
              { label: 'Bot Trades', value: 'botTrades' },
              { label: 'Own Fills', value: 'ownFills' },
            ]}
          />
          <Switch
            checked={showTrades}
            onChange={event => setShowTrades(event.currentTarget.checked)}
            label="Show trades"
          />
        </Group>
        <Text className={classes.monoLabel}>
          {sampled ? 'Sampled' : 'Full'} · {marketMetric.toUpperCase()} · {formatNumber(currentTimestamp)}
        </Text>
      </div>

      <div className={classes.dashboardGrid}>
        <main className={classes.chartColumn}>
          <DashboardMarketChart
            currentTimestamp={currentTimestamp}
            expanded={expanded}
            metric={marketMetric}
            sampled={sampled}
            selectedProduct={selectedProduct}
            showTrades={showTrades}
            tradePresentation={tradePresentation}
            onExpandedChange={setExpanded}
            onMetricChange={setMarketMetric}
            onSampledChange={setSampled}
            onShowTradesChange={setShowTrades}
          />

          {!expanded && algorithm.mode !== 'market-data-only' && (
            <div className={classes.secondaryGrid}>
              <ProfitLossChart symbols={symbols} />
              <PositionChart symbols={symbols} />
            </div>
          )}
        </main>

        {!expanded && <DashboardSideRail row={currentRow} symbol={selectedProduct} />}
      </div>

      {!expanded && (
        <>
          <Group justify="flex-end">
            <Switch
              checked={showDetails}
              onChange={event => setShowDetails(event.currentTarget.checked)}
              label="Show full timestamp tables and logs"
            />
          </Group>

          <Collapse in={showDetails}>
            <TimestampsCard />
          </Collapse>
        </>
      )}
    </div>
  );
}
