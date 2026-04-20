import {
  ActionIcon,
  Badge,
  Button,
  Group,
  NumberInput,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import { IconArrowsMaximize, IconArrowsMinimize, IconMinus, IconPlus } from '@tabler/icons-react';
import Highcharts from 'highcharts';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { ProsperitySymbol } from '../../models.ts';
import { useStore } from '../../store.ts';
import { formatNumber } from '../../utils/format.ts';
import { Chart } from './Chart.tsx';
import {
  buildDashboardMarketSeries,
  DashboardMarketMetric,
  DashboardPriceSeries,
  DashboardTradePresentation,
  getDashboardTimestampRange,
} from './dashboard-series.ts';
import classes from './DashboardVisualizer.module.css';

function toggleSeries(
  enabledSeries: Set<DashboardPriceSeries>,
  series: DashboardPriceSeries,
): Set<DashboardPriceSeries> {
  const next = new Set(enabledSeries);

  if (next.has(series)) {
    next.delete(series);
  } else {
    next.add(series);
  }

  return next;
}

export interface DashboardMarketChartProps {
  currentTimestamp: number;
  expanded: boolean;
  metric: DashboardMarketMetric;
  sampled: boolean;
  selectedProduct: ProsperitySymbol;
  showTrades: boolean;
  tradePresentation: DashboardTradePresentation;
  onMetricChange: (metric: DashboardMarketMetric) => void;
  onExpandedChange: (expanded: boolean) => void;
  onSampledChange: (sampled: boolean) => void;
  onShowTradesChange: (showTrades: boolean) => void;
}

export function DashboardMarketChart({
  currentTimestamp,
  expanded,
  metric,
  sampled,
  selectedProduct,
  showTrades,
  tradePresentation,
  onExpandedChange,
  onMetricChange,
  onSampledChange,
  onShowTradesChange,
}: DashboardMarketChartProps): ReactNode {
  const algorithm = useStore(state => state.algorithm)!;
  const fullRange = useMemo(() => getDashboardTimestampRange(algorithm), [algorithm]);
  const [enabledSeries, setEnabledSeries] = useState<Set<DashboardPriceSeries>>(new Set(['bid', 'mid', 'ask']));
  const [rangeDraft, setRangeDraft] = useState<[number, number]>(fullRange);
  const [range, setRange] = useState<[number, number]>(fullRange);

  useEffect(() => {
    setRangeDraft(fullRange);
    setRange(fullRange);
  }, [fullRange]);

  const plottedPointCount = useMemo(() => {
    let points = 0;

    for (const row of algorithm.activityLogs) {
      if (row.product === selectedProduct && row.timestamp >= range[0] && row.timestamp <= range[1]) {
        points += 1;
      }
    }

    for (const row of algorithm.data) {
      const trades =
        tradePresentation === 'botTrades'
          ? row.state.marketTrades[selectedProduct]
          : row.state.ownTrades[selectedProduct];

      for (const trade of trades ?? []) {
        if (trade.timestamp >= range[0] && trade.timestamp <= range[1]) {
          points += 1;
        }
      }
    }

    return points;
  }, [algorithm, range, selectedProduct, tradePresentation]);

  const series = useMemo(
    () =>
      buildDashboardMarketSeries({
        algorithm,
        symbol: selectedProduct,
        metric,
        enabledSeries,
        showBotTrades: showTrades,
        tradePresentation,
        range,
        sampled,
      }),
    [algorithm, enabledSeries, metric, range, sampled, selectedProduct, showTrades, tradePresentation],
  );

  const chartOptions: Highcharts.Options = {
    chart: {
      height: expanded ? 620 : 520,
      spacingTop: 16,
    },
    yAxis:
      metric === 'prices' && enabledSeries.has('depth')
        ? [
            {
              title: {
                text: 'Price',
              },
              opposite: false,
              allowDecimals: false,
            },
            {
              title: {
                text: 'Depth',
              },
              opposite: true,
              min: 0,
            },
          ]
        : {
            title: {
              text: metric === 'spread' ? 'Spread' : metric === 'volume' ? 'Volume' : 'Price',
            },
            opposite: false,
            allowDecimals: false,
            min: metric === 'volume' ? 0 : undefined,
          },
    plotOptions: {
      series: {
        marker: {
          enabled: metric !== 'volume',
          radius: 2,
        },
      },
      scatter: {
        marker: {
          enabled: true,
        },
      },
      column: {
        stacking: metric === 'volume' ? 'normal' : undefined,
      },
    },
    xAxis: {
      plotLines: [
        {
          color: '#f43f5e',
          dashStyle: 'ShortDash',
          value: currentTimestamp,
          width: 1,
          zIndex: 6,
        },
      ],
    },
  };

  const windowSize = 1000;
  const setQuickRange = (direction: 'first' | 'middle' | 'last'): void => {
    const [minTimestamp, maxTimestamp] = fullRange;
    const size = Math.min(windowSize, maxTimestamp - minTimestamp);

    if (direction === 'first') {
      setRangeDraft([minTimestamp, minTimestamp + size]);
      setRange([minTimestamp, minTimestamp + size]);
      return;
    }

    if (direction === 'last') {
      setRangeDraft([maxTimestamp - size, maxTimestamp]);
      setRange([maxTimestamp - size, maxTimestamp]);
      return;
    }

    const midpoint = Math.round((minTimestamp + maxTimestamp) / 2);
    setRangeDraft([
      Math.max(minTimestamp, midpoint - Math.floor(size / 2)),
      Math.min(maxTimestamp, midpoint + Math.ceil(size / 2)),
    ]);
    setRange([
      Math.max(minTimestamp, midpoint - Math.floor(size / 2)),
      Math.min(maxTimestamp, midpoint + Math.ceil(size / 2)),
    ]);
  };

  const applyRange = (): void => {
    const start = Math.max(fullRange[0], Math.min(rangeDraft[0], rangeDraft[1]));
    const end = Math.min(fullRange[1], Math.max(rangeDraft[0], rangeDraft[1]));

    setRange([start, end]);
    setRangeDraft([start, end]);
  };

  return (
    <section className={`${classes.hero} ${expanded ? classes.heroExpanded : ''}`}>
      <div className={classes.toolbar}>
        <Stack gap={4}>
          <Title order={3} className={classes.title}>
            Price & Liquidity: {selectedProduct || 'No product'}
          </Title>
          <Text size="sm" className={classes.subtle}>
            Resolution: {sampled ? 'sampled for performance' : 'full data'} · {formatNumber(plottedPointCount)} /{' '}
            {formatNumber(plottedPointCount)} visible points
          </Text>
        </Stack>

        <Group gap="xs">
          <Badge color="red" variant="light">
            Ask
          </Badge>
          <Badge color="dark" variant="light">
            Mid
          </Badge>
          <Badge color="green" variant="light">
            Bid
          </Badge>
          <Badge color="violet" variant="light">
            Bot trades
          </Badge>
        </Group>
      </div>

      <Stack gap="sm">
        <div className={classes.controls}>
          <SegmentedControl
            value={sampled ? 'sampled' : 'full'}
            onChange={value => onSampledChange(value === 'sampled')}
            data={[
              { label: 'Sampled', value: 'sampled' },
              { label: 'Full', value: 'full' },
            ]}
          />

          <ActionIcon
            variant="outline"
            size="lg"
            onClick={() => onExpandedChange(!expanded)}
            aria-label="Toggle expanded chart"
          >
            {expanded ? <IconArrowsMinimize size={18} /> : <IconArrowsMaximize size={18} />}
          </ActionIcon>
        </div>

        <div className={classes.controls}>
          <NumberInput
            label="Timestamp zoom"
            placeholder="Start"
            value={rangeDraft[0]}
            onChange={value => setRangeDraft([Number(value) || fullRange[0], rangeDraft[1]])}
            hideControls
            w={160}
          />
          <NumberInput
            label=" "
            placeholder="End"
            value={rangeDraft[1]}
            onChange={value => setRangeDraft([rangeDraft[0], Number(value) || fullRange[1]])}
            hideControls
            w={160}
          />
          <Button variant="outline" onClick={applyRange}>
            Apply
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setRange(fullRange);
              setRangeDraft(fullRange);
            }}
          >
            All
          </Button>
          <Button variant="outline" onClick={() => setQuickRange('first')}>
            1st 1K
          </Button>
          <Button variant="outline" onClick={() => setQuickRange('middle')}>
            Around Current
          </Button>
          <Button variant="outline" onClick={() => setQuickRange('last')}>
            Last 1K
          </Button>
        </div>

        <div className={classes.controls}>
          <SegmentedControl
            value={metric}
            onChange={value => onMetricChange(value as DashboardMarketMetric)}
            data={[
              { label: 'Prices', value: 'prices' },
              { label: 'Spread', value: 'spread' },
              { label: 'Volume', value: 'volume' },
            ]}
          />

          {(['bid', 'mid', 'ask', 'depth'] as DashboardPriceSeries[]).map(seriesKey => (
            <Switch
              key={seriesKey}
              checked={enabledSeries.has(seriesKey)}
              onChange={() => setEnabledSeries(current => toggleSeries(current, seriesKey))}
              label={seriesKey.toUpperCase()}
              disabled={(metric === 'spread' && seriesKey !== 'depth') || (metric === 'volume' && seriesKey === 'mid')}
            />
          ))}

          <Switch
            checked={showTrades}
            onChange={event => onShowTradesChange(event.currentTarget.checked)}
            label={tradePresentation === 'botTrades' ? 'Bot trades' : 'Own fills'}
          />

          <Group gap={4}>
            <Text size="sm" className={classes.subtle}>
              Depth detail
            </Text>
            <ActionIcon variant="outline" size="sm" disabled aria-label="Decrease depth detail">
              <IconMinus size={14} />
            </ActionIcon>
            <Text size="sm">3</Text>
            <ActionIcon variant="outline" size="sm" disabled aria-label="Increase depth detail">
              <IconPlus size={14} />
            </ActionIcon>
          </Group>
        </div>

        <div className={classes.chartFrame}>
          <Chart title="" series={series} options={chartOptions} />
        </div>
      </Stack>
    </section>
  );
}
