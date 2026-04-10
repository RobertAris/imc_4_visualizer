import Highcharts from 'highcharts';
import { ReactNode } from 'react';
import { ProsperitySymbol } from '../../models.ts';
import { useStore } from '../../store.ts';
import { Chart } from './Chart.tsx';

export interface AutocorrelationChartProps {
  symbol: ProsperitySymbol;
}

function autocorrelation(values: number[], lag: number): number {
  const comparableCount = values.length - lag;
  if (comparableCount <= 1) {
    return 0;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < values.length; i++) {
    const centeredValue = values[i] - mean;
    denominator += centeredValue * centeredValue;

    if (i + lag < values.length) {
      numerator += centeredValue * (values[i + lag] - mean);
    }
  }

  return denominator === 0 ? 0 : numerator / denominator;
}

export function AutocorrelationChart({ symbol }: AutocorrelationChartProps): ReactNode {
  const algorithm = useStore(state => state.algorithm)!;

  const midPrices: number[] = [];
  for (const row of algorithm.activityLogs) {
    if (row.product === symbol) {
      midPrices.push(row.midPrice);
    }
  }

  const priceChanges: number[] = [];
  for (let i = 1; i < midPrices.length; i++) {
    priceChanges.push(midPrices[i] - midPrices[i - 1]);
  }

  const maxLag = Math.min(20, Math.floor(priceChanges.length / 2));
  const data = [];

  for (let lag = 1; lag <= maxLag; lag++) {
    data.push([lag, autocorrelation(priceChanges, lag)]);
  }

  const options: Highcharts.Options = {
    xAxis: {
      title: {
        text: 'Lag',
      },
      labels: {
        formatter() {
          return String(this.value);
        },
      },
    },
    yAxis: {
      allowDecimals: true,
      min: -1,
      max: 1,
      title: {
        text: 'Autocorrelation',
      },
    },
  };

  const series: Highcharts.SeriesOptionsType[] = [
    {
      type: 'column',
      name: 'ACF',
      data,
    },
  ];

  return <Chart title={`${symbol} - Autocorrelation`} options={options} series={series} />;
}
