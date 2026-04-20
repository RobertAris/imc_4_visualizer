import Highcharts from 'highcharts';
import { ActivityLogRow, Algorithm, ProsperitySymbol, Trade } from '../../models.ts';
import { getAskColor, getBidColor } from '../../utils/colors.ts';
import { formatNumber } from '../../utils/format.ts';
import { getTradeMarkerRadius, getTradeQuantityRange } from './trade-chart-utils.ts';

export type DashboardMarketMetric = 'prices' | 'spread' | 'volume';
export type DashboardPriceSeries = 'bid' | 'mid' | 'ask' | 'depth';
export type DashboardTradePresentation = 'botTrades' | 'ownFills';

export function getDashboardSymbols(algorithm: Algorithm): ProsperitySymbol[] {
  const symbols = new Set<ProsperitySymbol>();

  for (const row of algorithm.activityLogs) {
    symbols.add(row.product);
  }

  for (const row of algorithm.data) {
    for (const symbol of Object.keys(row.state.listings)) {
      symbols.add(symbol);
    }

    for (const symbol of Object.keys(row.state.orderDepths)) {
      symbols.add(symbol);
    }

    for (const symbol of Object.keys(row.state.marketTrades)) {
      symbols.add(symbol);
    }
  }

  return [...symbols].sort((a, b) => a.localeCompare(b));
}

export function getDashboardTimestampRange(algorithm: Algorithm): [number, number] {
  const timestamps: number[] = [];

  for (const row of algorithm.activityLogs) {
    timestamps.push(row.timestamp);
  }

  for (const row of algorithm.data) {
    timestamps.push(row.state.timestamp);
  }

  if (timestamps.length === 0) {
    return [0, 0];
  }

  return [Math.min(...timestamps), Math.max(...timestamps)];
}

function isInRange(timestamp: number, range: [number, number]): boolean {
  return timestamp >= range[0] && timestamp <= range[1];
}

function getRowsForSymbol(algorithm: Algorithm, symbol: ProsperitySymbol, range: [number, number]): ActivityLogRow[] {
  return algorithm.activityLogs.filter(row => row.product === symbol && isInRange(row.timestamp, range));
}

function downsamplePoints<T>(points: T[], enabled: boolean, maxPoints: number): T[] {
  if (!enabled || points.length <= maxPoints) {
    return points;
  }

  const sampled: T[] = [];
  const step = Math.ceil(points.length / maxPoints);

  for (let i = 0; i < points.length; i += step) {
    sampled.push(points[i]);
  }

  const lastPoint = points[points.length - 1];
  if (sampled[sampled.length - 1] !== lastPoint) {
    sampled.push(lastPoint);
  }

  return sampled;
}

function getDepthAtLevel(row: ActivityLogRow, side: 'bid' | 'ask'): number {
  const volumes = side === 'bid' ? row.bidVolumes : row.askVolumes;
  return volumes.reduce((sum, volume) => sum + Math.abs(volume), 0);
}

function getTrades(
  algorithm: Algorithm,
  symbol: ProsperitySymbol,
  range: [number, number],
  tradePresentation: DashboardTradePresentation,
): Trade[] {
  const trades: Trade[] = [];

  for (const row of algorithm.data) {
    const symbolTrades =
      tradePresentation === 'botTrades' ? row.state.marketTrades[symbol] : row.state.ownTrades[symbol];

    for (const trade of symbolTrades ?? []) {
      if (isInRange(trade.timestamp, range)) {
        trades.push(trade);
      }
    }
  }

  return trades;
}

function buildTradeSeries(
  algorithm: Algorithm,
  symbol: ProsperitySymbol,
  range: [number, number],
  sampled: boolean,
  tradePresentation: DashboardTradePresentation,
): Highcharts.SeriesOptionsType {
  const trades = downsamplePoints(getTrades(algorithm, symbol, range, tradePresentation), sampled, 800);
  const [minQuantity, maxQuantity] = getTradeQuantityRange(trades);
  const name = tradePresentation === 'botTrades' ? 'Bot trades' : 'Own fills';

  return {
    type: 'scatter',
    name,
    color: tradePresentation === 'botTrades' ? '#7c3aed' : '#2563eb',
    zIndex: 10,
    data: trades.map(trade => ({
      x: trade.timestamp,
      y: trade.price,
      marker: {
        radius: getTradeMarkerRadius(trade.quantity, minQuantity, maxQuantity),
        symbol: 'circle',
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
          `<span style="color:${this.color}">\u25CF</span> ${name}: <b>${formatNumber(this.y as number)}</b><br/>` +
          `Quantity: <b>${formatNumber((this as any).custom.quantity)}</b><br/>` +
          `Buyer: <b>${(this as any).custom.buyer || '-'}</b><br/>` +
          `Seller: <b>${(this as any).custom.seller || '-'}</b><br/>`
        );
      },
    },
  };
}

export interface BuildDashboardMarketSeriesOptions {
  algorithm: Algorithm;
  symbol: ProsperitySymbol;
  metric: DashboardMarketMetric;
  enabledSeries: Set<DashboardPriceSeries>;
  showBotTrades: boolean;
  tradePresentation: DashboardTradePresentation;
  range: [number, number];
  sampled: boolean;
}

export function buildDashboardMarketSeries({
  algorithm,
  symbol,
  metric,
  enabledSeries,
  showBotTrades,
  tradePresentation,
  range,
  sampled,
}: BuildDashboardMarketSeriesOptions): Highcharts.SeriesOptionsType[] {
  const rows = downsamplePoints(getRowsForSymbol(algorithm, symbol, range), sampled, 1200);
  const series: Highcharts.SeriesOptionsType[] = [];

  if (metric === 'prices') {
    if (enabledSeries.has('ask')) {
      series.push({
        type: 'line',
        name: 'Ask',
        color: '#ff6b6b',
        data: rows.filter(row => row.askPrices.length > 0).map(row => [row.timestamp, row.askPrices[0]]),
      });
    }

    if (enabledSeries.has('mid')) {
      series.push({
        type: 'line',
        name: 'Mid',
        color: '#1f1f24',
        lineWidth: 3,
        data: rows.filter(row => !Number.isNaN(row.midPrice)).map(row => [row.timestamp, row.midPrice]),
      });
    }

    if (enabledSeries.has('bid')) {
      series.push({
        type: 'line',
        name: 'Bid',
        color: '#20c997',
        data: rows.filter(row => row.bidPrices.length > 0).map(row => [row.timestamp, row.bidPrices[0]]),
      });
    }

    if (enabledSeries.has('depth')) {
      series.push({
        type: 'area',
        name: 'Book depth',
        color: 'rgba(124, 58, 237, 0.22)',
        yAxis: 1,
        data: rows.map(row => [row.timestamp, getDepthAtLevel(row, 'bid') + getDepthAtLevel(row, 'ask')]),
      });
    }
  }

  if (metric === 'spread') {
    series.push({
      type: 'line',
      name: 'Spread',
      color: '#ff6b6b',
      data: rows
        .filter(row => row.askPrices.length > 0 && row.bidPrices.length > 0)
        .map(row => [row.timestamp, row.askPrices[0] - row.bidPrices[0]]),
    });
  }

  if (metric === 'volume') {
    if (enabledSeries.has('bid')) {
      series.push({
        type: 'column',
        name: 'Bid volume',
        color: getBidColor(0.8),
        data: rows.map(row => [row.timestamp, getDepthAtLevel(row, 'bid')]),
      });
    }

    if (enabledSeries.has('ask')) {
      series.push({
        type: 'column',
        name: 'Ask volume',
        color: getAskColor(0.8),
        data: rows.map(row => [row.timestamp, getDepthAtLevel(row, 'ask')]),
      });
    }
  }

  if (showBotTrades) {
    series.push(buildTradeSeries(algorithm, symbol, range, sampled, tradePresentation));
  }

  return series;
}
