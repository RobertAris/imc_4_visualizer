import Highcharts from 'highcharts';
import { ReactNode } from 'react';
import { ProsperitySymbol } from '../../models.ts';
import { getAskColor, getBidColor } from '../../utils/colors.ts';
import { formatNumber } from '../../utils/format.ts';
import { Chart } from './Chart.tsx';
import { bucketTradesByTime, useTradesForSymbol } from './trade-chart-utils.ts';

export interface TradeDensityChartProps {
  symbol: ProsperitySymbol;
}

export function TradeDensityChart({ symbol }: TradeDensityChartProps): ReactNode {
  const trades = useTradesForSymbol(symbol);
  const buckets = bucketTradesByTime(trades);

  const series: Highcharts.SeriesOptionsType[] = [
    {
      type: 'column',
      name: 'Trades per bucket',
      color: getBidColor(0.75),
      data: buckets.map(bucket => [bucket.timestamp, bucket.tradeCount]),
      tooltip: {
        pointFormatter: function () {
          return `<span style="color:${this.color}">\u25CF</span> Trades: <b>${formatNumber(this.y as number)}</b><br/>`;
        },
      },
    },
    {
      type: 'line',
      name: 'Quantity per bucket',
      color: getAskColor(0.9),
      yAxis: 1,
      data: buckets.map(bucket => [bucket.timestamp, bucket.totalQuantity]),
      tooltip: {
        pointFormatter: function () {
          return `<span style="color:${this.color}">\u25CF</span> Quantity: <b>${formatNumber(this.y as number)}</b><br/>`;
        },
      },
    },
  ];

  return (
    <Chart
      title={`${symbol} - Trade Density`}
      series={series}
      options={{
        yAxis: [
          {
            title: {
              text: 'Trade count',
            },
            min: 0,
          },
          {
            title: {
              text: 'Total quantity',
            },
            opposite: true,
            min: 0,
          },
        ],
      }}
    />
  );
}
