import { ProsperitySymbol, Trade } from '../../models.ts';
import { useStore } from '../../store.ts';

export interface FlattenedTrade extends Trade {
  tradeIndex: number;
}

export function useTradesForSymbol(symbol: ProsperitySymbol): FlattenedTrade[] {
  const algorithm = useStore(state => state.algorithm)!;

  const trades: FlattenedTrade[] = [];
  let tradeIndex = 0;

  for (const row of algorithm.data) {
    for (const trade of row.state.marketTrades[symbol] ?? []) {
      trades.push({
        ...trade,
        tradeIndex,
      });
      tradeIndex += 1;
    }
  }

  return trades;
}

export function getTradeQuantityRange(trades: Trade[]): [number, number] {
  if (trades.length === 0) {
    return [0, 0];
  }

  let minQuantity = Infinity;
  let maxQuantity = -Infinity;

  for (const trade of trades) {
    minQuantity = Math.min(minQuantity, trade.quantity);
    maxQuantity = Math.max(maxQuantity, trade.quantity);
  }

  return [minQuantity, maxQuantity];
}

export function getTradeMarkerRadius(quantity: number, minQuantity: number, maxQuantity: number): number {
  if (minQuantity === maxQuantity) {
    return 6;
  }

  return 4 + ((quantity - minQuantity) / (maxQuantity - minQuantity)) * 8;
}

export interface TradeBucket {
  timestamp: number;
  tradeCount: number;
  totalQuantity: number;
}

export function bucketTradesByTime(trades: Trade[], bucketCount: number = 40): TradeBucket[] {
  if (trades.length === 0) {
    return [];
  }

  const sortedTrades = [...trades].sort((a, b) => a.timestamp - b.timestamp);
  const minTimestamp = sortedTrades[0].timestamp;
  const maxTimestamp = sortedTrades[sortedTrades.length - 1].timestamp;

  if (minTimestamp === maxTimestamp) {
    return [
      {
        timestamp: minTimestamp,
        tradeCount: sortedTrades.length,
        totalQuantity: sortedTrades.reduce((sum, trade) => sum + trade.quantity, 0),
      },
    ];
  }

  const bucketWidth = Math.max(1, Math.ceil((maxTimestamp - minTimestamp + 1) / bucketCount));
  const buckets = new Map<number, TradeBucket>();

  for (const trade of sortedTrades) {
    const bucketIndex = Math.floor((trade.timestamp - minTimestamp) / bucketWidth);
    const bucketStart = minTimestamp + bucketIndex * bucketWidth;
    const bucketMidpoint = bucketStart + Math.floor(bucketWidth / 2);

    if (!buckets.has(bucketMidpoint)) {
      buckets.set(bucketMidpoint, {
        timestamp: bucketMidpoint,
        tradeCount: 0,
        totalQuantity: 0,
      });
    }

    const bucket = buckets.get(bucketMidpoint)!;
    bucket.tradeCount += 1;
    bucket.totalQuantity += trade.quantity;
  }

  return [...buckets.values()].sort((a, b) => a.timestamp - b.timestamp);
}
