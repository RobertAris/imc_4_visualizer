import Highcharts from 'highcharts';
import { ReactNode } from 'react';
import { ProsperitySymbol } from '../../models.ts';
import { useStore } from '../../store.ts';
import { Chart } from './Chart.tsx';

export interface EntropyRateChartProps {
  symbol: ProsperitySymbol;
}

function normalizeNearZero(value: number): number {
  return Math.abs(value) < 1e-6 ? 0 : value;
}

function toMovementSymbols(values: number[]): string[] {
  const symbols: string[] = [];

  for (let i = 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];

    if (change > 0) {
      symbols.push('U');
    } else if (change < 0) {
      symbols.push('D');
    } else {
      symbols.push('F');
    }
  }

  return symbols;
}

function estimateConditionalEntropy(symbols: string[], order: number): number {
  if (symbols.length <= order) {
    return 0;
  }

  const contextCounts = new Map<string, number>();
  const transitionCounts = new Map<string, Map<string, number>>();

  for (let i = order; i < symbols.length; i++) {
    const context = symbols.slice(i - order, i).join('|');
    const nextSymbol = symbols[i];

    contextCounts.set(context, (contextCounts.get(context) ?? 0) + 1);

    if (!transitionCounts.has(context)) {
      transitionCounts.set(context, new Map<string, number>());
    }

    const nextCounts = transitionCounts.get(context)!;
    nextCounts.set(nextSymbol, (nextCounts.get(nextSymbol) ?? 0) + 1);
  }

  const totalTransitions = symbols.length - order;
  let entropy = 0;

  for (const [context, count] of contextCounts) {
    const nextCounts = transitionCounts.get(context)!;
    let contextEntropy = 0;

    for (const nextCount of nextCounts.values()) {
      const probability = nextCount / count;
      contextEntropy -= probability * Math.log2(probability);
    }

    entropy += (count / totalTransitions) * contextEntropy;
  }

  return normalizeNearZero(entropy);
}

export function EntropyRateChart({ symbol }: EntropyRateChartProps): ReactNode {
  const algorithm = useStore(state => state.algorithm)!;

  const midPrices: number[] = [];
  for (const row of algorithm.activityLogs) {
    if (row.product === symbol) {
      midPrices.push(row.midPrice);
    }
  }

  const movementSymbols = toMovementSymbols(midPrices);
  const maxOrder = Math.min(8, Math.floor(movementSymbols.length / 4));
  const data = [];

  for (let order = 1; order <= maxOrder; order++) {
    data.push([order, estimateConditionalEntropy(movementSymbols, order)]);
  }

  const options: Highcharts.Options = {
    xAxis: {
      title: {
        text: 'History length',
      },
      labels: {
        formatter() {
          return String(this.value);
        },
      },
    },
    yAxis: {
      allowDecimals: true,
      min: 0,
      title: {
        text: 'Estimated entropy rate of price movements (bits)',
      },
      labels: {
        formatter() {
          return normalizeNearZero(Number(this.value)).toFixed(2);
        },
      },
    },
    tooltip: {
      pointFormatter() {
        return `<span style="color:${this.color}">\u25cf</span> ${this.series.name}: <b>${normalizeNearZero(this.y ?? 0).toFixed(4)} bits</b><br/>`;
      },
    },
  };

  const series: Highcharts.SeriesOptionsType[] = [
    {
      type: 'line',
      name: 'Conditional entropy of price movements',
      data,
    },
  ];

  return <Chart title={`${symbol} - Entropy Rate`} options={options} series={series} />;
}
