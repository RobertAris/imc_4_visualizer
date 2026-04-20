import { Center, Container, Grid, SegmentedControl, Text, Title } from '@mantine/core';
import { ReactNode, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useStore } from '../../store.ts';
import { formatNumber } from '../../utils/format.ts';
import { AlgorithmSummaryCard } from './AlgorithmSummaryCard.tsx';
import { ConversionPriceChart } from './ConversionPriceChart.tsx';
import { DashboardVisualizer } from './DashboardVisualizer.tsx';
import { EnvironmentChart } from './EnvironmentChart.tsx';
import { PerformanceSummaryCard } from './PerformanceSummaryCard.tsx';
import { PlainValueObservationChart } from './PlainValueObservationChart.tsx';
import { PositionChart } from './PositionChart.tsx';
import { ProductPriceChart } from './ProductPriceChart.tsx';
import { ProfitLossChart } from './ProfitLossChart.tsx';
import { TimestampsCard } from './TimestampsCard.tsx';
import { TradeDensityChart } from './TradeDensityChart.tsx';
import { TradePriceChart } from './TradePriceChart.tsx';
import { TradeQuantityChart } from './TradeQuantityChart.tsx';
import { TransportChart } from './TransportChart.tsx';
import { VisualizerCard } from './VisualizerCard.tsx';
import { VolumeChart } from './VolumeChart.tsx';

export function VisualizerPage(): ReactNode {
  const algorithm = useStore(state => state.algorithm);
  const [visualizerMode, setVisualizerMode] = useState<'classic' | 'dashboard'>('classic');
  const isMarketDataOnly = algorithm?.mode === 'market-data-only';
  const hasTimestampData = (algorithm?.data.length ?? 0) > 0;
  const hasActivityLogs = (algorithm?.activityLogs.length ?? 0) > 0;
  const isTradesOnly = isMarketDataOnly && hasTimestampData && !hasActivityLogs;

  const { search } = useLocation();

  if (algorithm === null) {
    return <Navigate to={`/${search}`} />;
  }

  const conversionProducts = new Set();
  for (const row of algorithm.data) {
    for (const product of Object.keys(row.state.observations.conversionObservations)) {
      conversionProducts.add(product);
    }
  }

  let profitLoss = 0;
  if (!isMarketDataOnly && algorithm.activityLogs.length > 0) {
    const lastTimestamp = algorithm.activityLogs[algorithm.activityLogs.length - 1].timestamp;
    for (
      let i = algorithm.activityLogs.length - 1;
      i >= 0 && algorithm.activityLogs[i].timestamp == lastTimestamp;
      i--
    ) {
      profitLoss += algorithm.activityLogs[i].profitLoss;
    }
  }

  const symbols = new Set<string>();
  const plainValueObservationSymbols = new Set<string>();

  if (isMarketDataOnly) {
    for (const row of algorithm.activityLogs) {
      symbols.add(row.product);
    }

    for (const row of algorithm.data) {
      for (const symbol of Object.keys(row.state.listings)) {
        symbols.add(symbol);
      }

      for (const symbol of Object.keys(row.state.marketTrades)) {
        symbols.add(symbol);
      }
    }
  } else {
    for (let i = 0; i < algorithm.data.length; i += 1000) {
      const row = algorithm.data[i];

      for (const key of Object.keys(row.state.listings)) {
        symbols.add(key);
      }

      for (const key of Object.keys(row.state.observations.plainValueObservations)) {
        plainValueObservationSymbols.add(key);
      }
    }
  }

  const sortedSymbols = [...symbols].sort((a, b) => a.localeCompare(b));
  const sortedPlainValueObservationSymbols = [...plainValueObservationSymbols].sort((a, b) => a.localeCompare(b));

  const symbolColumns: ReactNode[] = [];
  if (isTradesOnly) {
    sortedSymbols.forEach(symbol => {
      symbolColumns.push(
        <Grid.Col key={`${symbol} - trade price`} span={{ xs: 12, sm: 6 }}>
          <TradePriceChart symbol={symbol} />
        </Grid.Col>,
      );

      symbolColumns.push(
        <Grid.Col key={`${symbol} - trade quantity`} span={{ xs: 12, sm: 6 }}>
          <TradeQuantityChart symbol={symbol} />
        </Grid.Col>,
      );

      symbolColumns.push(
        <Grid.Col key={`${symbol} - trade density`} span={12}>
          <TradeDensityChart symbol={symbol} />
        </Grid.Col>,
      );
    });
  } else {
    sortedSymbols.forEach(symbol => {
      symbolColumns.push(
        <Grid.Col key={`${symbol} - product price`} span={{ xs: 12, sm: 6 }}>
          <ProductPriceChart symbol={symbol} />
        </Grid.Col>,
      );

      symbolColumns.push(
        <Grid.Col key={`${symbol} - symbol`} span={{ xs: 12, sm: 6 }}>
          <VolumeChart symbol={symbol} />
        </Grid.Col>,
      );

      if (!conversionProducts.has(symbol)) {
        return;
      }

      symbolColumns.push(
        <Grid.Col key={`${symbol} - conversion price`} span={{ xs: 12, sm: 6 }}>
          <ConversionPriceChart symbol={symbol} />
        </Grid.Col>,
      );

      symbolColumns.push(
        <Grid.Col key={`${symbol} - transport`} span={{ xs: 12, sm: 6 }}>
          <TransportChart symbol={symbol} />
        </Grid.Col>,
      );

      symbolColumns.push(
        <Grid.Col key={`${symbol} - environment`} span={{ xs: 12, sm: 6 }}>
          <EnvironmentChart symbol={symbol} />
        </Grid.Col>,
      );

      symbolColumns.push(<Grid.Col key={`${symbol} - environment`} span={{ xs: 12, sm: 6 }} />);
    });

    sortedPlainValueObservationSymbols.forEach(symbol => {
      symbolColumns.push(
        <Grid.Col key={`${symbol} - plain value observation`} span={{ xs: 12, sm: 6 }}>
          <PlainValueObservationChart symbol={symbol} />
        </Grid.Col>,
      );
    });
  }

  return (
    <Container fluid>
      <Grid mb="md">
        <Grid.Col span={12}>
          <Center>
            <SegmentedControl
              value={visualizerMode}
              onChange={value => setVisualizerMode(value as 'classic' | 'dashboard')}
              data={[
                { label: 'Classic', value: 'classic' },
                { label: 'Dashboard', value: 'dashboard' },
              ]}
            />
          </Center>
        </Grid.Col>
      </Grid>

      {visualizerMode === 'dashboard' ? (
        <DashboardVisualizer />
      ) : (
        <Grid>
          {!isMarketDataOnly && (
            <Grid.Col span={12}>
              <VisualizerCard>
                <Center>
                  <Title order={2}>Final Profit / Loss: {formatNumber(profitLoss)}</Title>
                </Center>
              </VisualizerCard>
            </Grid.Col>
          )}
          {!isMarketDataOnly && (
            <Grid.Col span={{ xs: 12, sm: 6 }}>
              <ProfitLossChart symbols={sortedSymbols} />
            </Grid.Col>
          )}
          {!isMarketDataOnly && (
            <Grid.Col span={{ xs: 12, sm: 6 }}>
              <PositionChart symbols={sortedSymbols} />
            </Grid.Col>
          )}
          {isTradesOnly && (
            <Grid.Col span={12}>
              <VisualizerCard title="Trades Data">
                <Text>
                  Loaded a trades CSV. Bubble size in the execution chart scales with quantity, and the density chart
                  buckets trades over time so bursts of activity stand out quickly.
                </Text>
              </VisualizerCard>
            </Grid.Col>
          )}
          {symbolColumns}
          {hasTimestampData && (
            <Grid.Col span={12}>
              <TimestampsCard />
            </Grid.Col>
          )}
          {algorithm.summary && (
            <Grid.Col span={12}>
              <AlgorithmSummaryCard />
            </Grid.Col>
          )}
          {!isMarketDataOnly && (
            <Grid.Col span={12}>
              <PerformanceSummaryCard />
            </Grid.Col>
          )}
        </Grid>
      )}
    </Container>
  );
}
