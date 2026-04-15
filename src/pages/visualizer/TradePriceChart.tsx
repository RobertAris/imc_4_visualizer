import Highcharts from 'highcharts';
import { ReactNode } from 'react';
import { ProsperitySymbol } from '../../models.ts';
import { getBidColor } from '../../utils/colors.ts';
import { formatNumber } from '../../utils/format.ts';
import { Chart } from './Chart.tsx';
import { getTradeMarkerRadius, getTradeQuantityRange, useTradesForSymbol } from './trade-chart-utils.ts';

export interface TradePriceChartProps {
  symbol: ProsperitySymbol;
}

export function TradePriceChart({ symbol }: TradePriceChartProps): ReactNode {
  const trades = useTradesForSymbol(symbol);
  const [minQuantity, maxQuantity] = getTradeQuantityRange(trades);

  const series: Highcharts.SeriesOptionsType[] = [
    {
      type: 'scatter',
      name: 'Executions',
      color: getBidColor(0.7),
      data: trades.map(trade => ({
        x: trade.timestamp,
        y: trade.price,
        marker: {
          radius: getTradeMarkerRadius(trade.quantity, minQuantity, maxQuantity),
        },
        custom: {
          quantity: trade.quantity,
          buyer: trade.buyer,
          seller: trade.seller,
        },
      })),
      tooltip: {
        pointFormatter: function () {
          return (
            `<span style="color:${this.color}">\u25CF</span> Price: <b>${formatNumber(this.y as number)}</b><br/>` +
            `Quantity: <b>${formatNumber((this as any).custom.quantity)}</b><br/>` +
            `Buyer: <b>${(this as any).custom.buyer || '-'}</b><br/>` +
            `Seller: <b>${(this as any).custom.seller || '-'}</b><br/>`
          );
        },
      },
    },
  ];

  return (
    <Chart
      title={`${symbol} - Executions`}
      series={series}
      options={{
        yAxis: {
          title: {
            text: 'Price',
          },
        },
        plotOptions: {
          scatter: {
            jitter: {
              x: 0.15,
            },
          },
        },
      }}
    />
  );
}
