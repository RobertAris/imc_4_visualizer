import Highcharts from 'highcharts';
import { ReactNode } from 'react';
import { ProsperitySymbol } from '../../models.ts';
import { getAskColor } from '../../utils/colors.ts';
import { formatNumber } from '../../utils/format.ts';
import { Chart } from './Chart.tsx';
import { useTradesForSymbol } from './trade-chart-utils.ts';

export interface TradeQuantityChartProps {
  symbol: ProsperitySymbol;
}

export function TradeQuantityChart({ symbol }: TradeQuantityChartProps): ReactNode {
  const trades = useTradesForSymbol(symbol);

  const series: Highcharts.SeriesOptionsType[] = [
    {
      type: 'column',
      name: 'Executed quantity',
      color: getAskColor(0.75),
      data: trades.map(trade => ({
        x: trade.timestamp,
        y: trade.quantity,
        custom: {
          price: trade.price,
          buyer: trade.buyer,
          seller: trade.seller,
        },
      })),
      tooltip: {
        pointFormatter: function () {
          return (
            `<span style="color:${this.color}">\u25CF</span> Quantity: <b>${formatNumber(this.y as number)}</b><br/>` +
            `Price: <b>${formatNumber((this as any).custom.price)}</b><br/>` +
            `Buyer: <b>${(this as any).custom.buyer || '-'}</b><br/>` +
            `Seller: <b>${(this as any).custom.seller || '-'}</b><br/>`
          );
        },
      },
    },
  ];

  return (
    <Chart
      title={`${symbol} - Quantity`}
      series={series}
      options={{
        yAxis: {
          title: {
            text: 'Quantity',
          },
        },
      }}
    />
  );
}
