import { Text } from '@mantine/core';
import { ReactNode } from 'react';
import {
  ActivityLogRow,
  Algorithm,
  AlgorithmDataRow,
  AlgorithmSummary,
  CompressedAlgorithmDataRow,
  CompressedListing,
  CompressedObservations,
  CompressedOrder,
  CompressedOrderDepth,
  CompressedTrade,
  CompressedTradingState,
  ConversionObservation,
  Listing,
  Observation,
  Order,
  OrderDepth,
  Product,
  ProsperitySymbol,
  Trade,
  TradingState,
} from '../models.ts';
import { authenticatedAxios } from './axios.ts';

export class AlgorithmParseError extends Error {
  public constructor(public readonly node: ReactNode) {
    super('Failed to parse algorithm logs');
  }
}

function getColumnValues(columns: string[], indices: number[]): number[] {
  const values: number[] = [];

  for (const index of indices) {
    const value = columns[index];
    if (value !== '') {
      values.push(parseFloat(value));
    }
  }

  return values;
}

function getActivityLogMidPrice(columns: string[]): number {
  const bestBid = columns[3];
  const bestAsk = columns[9];

  if (bestBid !== '' && bestAsk !== '') {
    return (Number(bestBid) + Number(bestAsk)) / 2;
  }

  return columns[15] === '' ? Number.NaN : Number(columns[15]);
}

function parseActivityLogLines(lines: string[]): ActivityLogRow[] {
  const rows: ActivityLogRow[] = [];

  for (const line of lines) {
    if (line === '') {
      break;
    }

    const columns = line.split(';');

    rows.push({
      day: Number(columns[0]),
      timestamp: Number(columns[1]),
      product: columns[2],
      bidPrices: getColumnValues(columns, [3, 5, 7]),
      bidVolumes: getColumnValues(columns, [4, 6, 8]),
      askPrices: getColumnValues(columns, [9, 11, 13]),
      askVolumes: getColumnValues(columns, [10, 12, 14]),
      midPrice: getActivityLogMidPrice(columns),
      profitLoss: Number(columns[16]),
    });
  }

  return rows;
}

function getActivityLogs(logLines: string[]): ActivityLogRow[] {
  const headerIndex = logLines.indexOf('Activities log:');
  if (headerIndex === -1) {
    return [];
  }

  return parseActivityLogLines(logLines.slice(headerIndex + 2));
}

function decompressListings(compressed: CompressedListing[]): Record<ProsperitySymbol, Listing> {
  const listings: Record<ProsperitySymbol, Listing> = {};

  for (const [symbol, product, denomination] of compressed) {
    listings[symbol] = {
      symbol,
      product,
      denomination,
    };
  }

  return listings;
}

function decompressOrderDepths(
  compressed: Record<ProsperitySymbol, CompressedOrderDepth>,
): Record<ProsperitySymbol, OrderDepth> {
  const orderDepths: Record<ProsperitySymbol, OrderDepth> = {};

  for (const [symbol, [buyOrders, sellOrders]] of Object.entries(compressed)) {
    orderDepths[symbol] = {
      buyOrders,
      sellOrders,
    };
  }

  return orderDepths;
}

function decompressTrades(compressed: CompressedTrade[]): Record<ProsperitySymbol, Trade[]> {
  const trades: Record<ProsperitySymbol, Trade[]> = {};

  for (const [symbol, price, quantity, buyer, seller, timestamp] of compressed) {
    if (trades[symbol] === undefined) {
      trades[symbol] = [];
    }

    trades[symbol].push({
      symbol,
      price,
      quantity,
      buyer,
      seller,
      timestamp,
    });
  }

  return trades;
}

function decompressObservations(compressed: CompressedObservations): Observation {
  const conversionObservations: Record<Product, ConversionObservation> = {};

  for (const [
    product,
    [bidPrice, askPrice, transportFees, exportTariff, importTariff, sunlight, humidity],
  ] of Object.entries(compressed[1])) {
    conversionObservations[product] = {
      bidPrice,
      askPrice,
      transportFees,
      exportTariff,
      importTariff,
      sunlight,
      humidity,
    };
  }

  return {
    plainValueObservations: compressed[0],
    conversionObservations,
  };
}

function decompressState(compressed: CompressedTradingState): TradingState {
  return {
    timestamp: compressed[0],
    traderData: compressed[1],
    listings: decompressListings(compressed[2]),
    orderDepths: decompressOrderDepths(compressed[3]),
    ownTrades: decompressTrades(compressed[4]),
    marketTrades: decompressTrades(compressed[5]),
    position: compressed[6],
    observations: decompressObservations(compressed[7]),
  };
}

function decompressOrders(compressed: CompressedOrder[]): Record<ProsperitySymbol, Order[]> {
  const orders: Record<ProsperitySymbol, Order[]> = {};

  for (const [symbol, price, quantity] of compressed) {
    if (orders[symbol] === undefined) {
      orders[symbol] = [];
    }

    orders[symbol].push({
      symbol,
      price,
      quantity,
    });
  }

  return orders;
}

function decompressDataRow(compressed: CompressedAlgorithmDataRow, sandboxLogs: string): AlgorithmDataRow {
  return {
    state: decompressState(compressed[0]),
    orders: decompressOrders(compressed[1]),
    conversions: compressed[2],
    traderData: compressed[3],
    algorithmLogs: compressed[4],
    sandboxLogs,
  };
}

function parseCompressedDataRow(encoded: string, sandboxLogs: string): AlgorithmDataRow {
  try {
    const compressedDataRow = encoded.trim().startsWith('[[')
      ? JSON.parse(encoded)
      : JSON.parse(JSON.parse('"' + encoded + '"'));
    return decompressDataRow(compressedDataRow, sandboxLogs);
  } catch (err) {
    console.error(err);

    throw new AlgorithmParseError(
      (
        <>
          <Text>Logs are in invalid format. Could not parse the following compressed row:</Text>
          <Text>{encoded}</Text>
        </>
      ),
    );
  }
}

function getAlgorithmData(logLines: string[]): AlgorithmDataRow[] {
  const headerIndex = logLines.indexOf('Sandbox logs:');
  if (headerIndex === -1) {
    return [];
  }

  const rows: AlgorithmDataRow[] = [];
  let nextSandboxLogs = '';

  const sandboxLogPrefix = '  "sandboxLog": ';
  const lambdaLogPrefix = '  "lambdaLog": ';

  for (let i = headerIndex + 1; i < logLines.length; i++) {
    const line = logLines[i];
    if (line.endsWith(':')) {
      break;
    }

    if (line.startsWith(sandboxLogPrefix)) {
      nextSandboxLogs = JSON.parse(line.substring(sandboxLogPrefix.length, line.length - 1)).trim();

      if (nextSandboxLogs.startsWith('Conversion request')) {
        const lastRow = rows[rows.length - 1];
        lastRow.sandboxLogs += (lastRow.sandboxLogs.length > 0 ? '\n' : '') + nextSandboxLogs;

        nextSandboxLogs = '';
      }

      continue;
    }

    if (!line.startsWith(lambdaLogPrefix) || line === '  "lambdaLog": "",') {
      continue;
    }

    const start = line.indexOf('[[');
    const end = line.lastIndexOf(']') + 1;

    try {
      rows.push(parseCompressedDataRow(line.substring(start, end), nextSandboxLogs));
    } catch (err) {
      console.log(line);
      console.error(err);

      throw new AlgorithmParseError(
        (
          <>
            <Text>Logs are in invalid format. Could not parse the following line:</Text>
            <Text>{line}</Text>
          </>
        ),
      );
    }
  }

  return rows;
}

interface ProsperitySubmissionLogEntry {
  sandboxLog: string | null;
  lambdaLog: string | null;
  timestamp: number;
}

interface SimulatorTradeHistoryRow {
  timestamp: number;
  symbol: string;
  price: number;
  quantity: number;
  buyer?: string;
  seller?: string;
}

interface SimulatorPositionSnapshot {
  symbol: string;
  quantity: number;
}

interface ProsperitySubmissionFile {
  activitiesLog: string;
  /** May be omitted in IMC simulator result bundles (`560891`-style `.json`). */
  logs?: ProsperitySubmissionLogEntry[];
  /** Present on full simulator / submission dumps; truncated `lambdaLog` fragments are reconstructed from this. */
  tradeHistory?: SimulatorTradeHistoryRow[];
  /** Simulator-only final inventory (no per-timestamp path); used when neither `logs` nor `tradeHistory` can drive `data`. */
  positions?: SimulatorPositionSnapshot[];
}

function simulatorListingsFromActivity(activityLogs: ActivityLogRow[]): Record<string, Listing> {
  const names = [...new Set(activityLogs.map(row => row.product))].sort((a, b) => a.localeCompare(b));

  return Object.fromEntries(
    names.map(name => [
      name,
      {
        symbol: name,
        product: name,
        denomination: 'SEASHELLS',
      },
    ]),
  );
}

/** Matches `market-data.tsx` so order book panels align with activity CSV rows. */
function simulatorOrderDepthFromRow(row: ActivityLogRow): OrderDepth {
  const buyOrders = Object.fromEntries(
    row.bidPrices.map((price, index) => [price, row.bidVolumes[index]]).filter(([, volume]) => volume !== undefined),
  );

  const sellOrders = Object.fromEntries(
    row.askPrices.map((price, index) => [price, -Math.abs(row.askVolumes[index])]).filter(([, volume]) => volume !== undefined),
  );

  return {
    buyOrders,
    sellOrders,
  };
}

function simulatorOrderDepthsAtTimestamp(timestamp: number, activityLogs: ActivityLogRow[]): Record<string, OrderDepth> {
  return Object.fromEntries(
    activityLogs.filter(row => row.timestamp === timestamp).map(row => [row.product, simulatorOrderDepthFromRow(row)]),
  );
}

function emptyTradingObservation(): Observation {
  return {
    plainValueObservations: {},
    conversionObservations: {},
  };
}

function uniqueSortedTimestamps(activityLogs: ActivityLogRow[]): number[] {
  return [...new Set(activityLogs.map(row => row.timestamp))].sort((a, b) => a - b);
}

/** SUBMISSION-involved fills only — matches bookkeeping used to reconcile simulator `positions`. */
function applySimulatorTrade(position: Record<Product, number>, trade: SimulatorTradeHistoryRow): void {
  if (trade.buyer === 'SUBMISSION') {
    position[trade.symbol] = (position[trade.symbol] ?? 0) + trade.quantity;
    return;
  }
  if (trade.seller === 'SUBMISSION') {
    position[trade.symbol] = (position[trade.symbol] ?? 0) - trade.quantity;
  }
}

function isSubmissionSimulatorTrade(trade: SimulatorTradeHistoryRow): boolean {
  return trade.buyer === 'SUBMISSION' || trade.seller === 'SUBMISSION';
}

function groupOwnTradesAtTimestamp(timestamp: number, trades: SimulatorTradeHistoryRow[]): Record<ProsperitySymbol, Trade[]> {
  const out: Record<ProsperitySymbol, Trade[]> = {};

  for (const ht of trades) {
    if (ht.timestamp !== timestamp || !isSubmissionSimulatorTrade(ht)) {
      continue;
    }

    const t: Trade = {
      symbol: ht.symbol,
      price: ht.price,
      quantity: ht.quantity,
      buyer: ht.buyer ?? '',
      seller: ht.seller ?? '',
      timestamp: ht.timestamp,
    };

    const arr = out[ht.symbol];
    if (arr === undefined) {
      out[ht.symbol] = [t];
    } else {
      arr.push(t);
    }
  }

  return out;
}

function coerceTradeHistory(raw: unknown): SimulatorTradeHistoryRow[] | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }

  const rows: SimulatorTradeHistoryRow[] = [];

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const o = item as Record<string, unknown>;
    const ts = o.timestamp;
    const symbol = o.symbol;

    if (typeof ts !== 'number' || typeof symbol !== 'string') {
      continue;
    }

    const priceNum = typeof o.price === 'number' ? o.price : Number(o.price);
    const qtyNum = typeof o.quantity === 'number' ? o.quantity : Number(o.quantity);

    if (!Number.isFinite(priceNum) || !Number.isFinite(qtyNum)) {
      continue;
    }

    rows.push({
      timestamp: ts,
      symbol,
      price: priceNum,
      quantity: qtyNum,
      buyer: typeof o.buyer === 'string' ? o.buyer : undefined,
      seller: typeof o.seller === 'string' ? o.seller : undefined,
    });
  }

  return rows.length > 0 ? rows : null;
}

/** Rebuild timeline when `lambdaLog` strings are truncated (IMC simulator ~4KiB cap) so positions / avg-fill panels work. */
function buildSimulatorDataFromTradeHistory(
  activityLogs: ActivityLogRow[],
  tradeHistory: SimulatorTradeHistoryRow[],
): AlgorithmDataRow[] {
  const timestamps = uniqueSortedTimestamps(activityLogs);
  const trades = [...tradeHistory].sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp;
    }

    return a.symbol.localeCompare(b.symbol);
  });

  const listings = simulatorListingsFromActivity(activityLogs);
  const cum: Record<Product, number> = {};
  let ti = 0;

  return timestamps.map(ts => {
    while (ti < trades.length) {
      const tr = trades[ti];
      if (tr.timestamp > ts) {
        break;
      }
      applySimulatorTrade(cum, tr);
      ti += 1;
    }

    const ownAtTs = trades.filter(tr => tr.timestamp === ts);

    const state: TradingState = {
      timestamp: ts,
      traderData: '',
      listings,
      orderDepths: simulatorOrderDepthsAtTimestamp(ts, activityLogs),
      ownTrades: groupOwnTradesAtTimestamp(ts, ownAtTs),
      marketTrades: {},
      position: { ...cum },
      observations: emptyTradingObservation(),
    };

    return {
      state,
      orders: {},
      conversions: 0,
      traderData: '',
      algorithmLogs: '',
      sandboxLogs: '',
    };
  });
}

/** Simulator `.json` often ships final `positions` only — replicate as a flat trajectory (no intra-day path). */
function buildSimulatorDataFromFinalPositions(activityLogs: ActivityLogRow[], positions: SimulatorPositionSnapshot[]): AlgorithmDataRow[] {
  const timestamps = uniqueSortedTimestamps(activityLogs);
  const listings = simulatorListingsFromActivity(activityLogs);
  const pmap: Record<Product, number> = {};

  for (const row of positions) {
    if (row.symbol !== 'XIRECS') {
      pmap[row.symbol] = row.quantity;
    }
  }

  return timestamps.map(ts => ({
    state: {
      timestamp: ts,
      traderData: '',
      listings,
      orderDepths: simulatorOrderDepthsAtTimestamp(ts, activityLogs),
      ownTrades: {},
      marketTrades: {},
      position: { ...pmap },
      observations: emptyTradingObservation(),
    },
    orders: {},
    conversions: 0,
    traderData: '',
    algorithmLogs: '',
    sandboxLogs: '',
  }));
}

/** One row per activity timestamp — empty fills/positions (PnL-from-activities only). */
function buildMinimalTimestampSkeleton(activityLogs: ActivityLogRow[]): AlgorithmDataRow[] {
  const listings = simulatorListingsFromActivity(activityLogs);

  return uniqueSortedTimestamps(activityLogs).map(ts => ({
    state: {
      timestamp: ts,
      traderData: '',
      listings,
      orderDepths: simulatorOrderDepthsAtTimestamp(ts, activityLogs),
      ownTrades: {},
      marketTrades: {},
      position: {},
      observations: emptyTradingObservation(),
    },
    orders: {},
    conversions: 0,
    traderData: '',
    algorithmLogs: '',
    sandboxLogs: '',
  }));
}

function getSubmissionActivityLogs(activitiesLog: string): ActivityLogRow[] {
  const lines = activitiesLog.trim().split(/\r?\n/);
  if (lines.length <= 1) {
    return [];
  }

  return parseActivityLogLines(lines.slice(1));
}

function getSubmissionAlgorithmData(entries: ProsperitySubmissionLogEntry[]): AlgorithmDataRow[] {
  const rows: AlgorithmDataRow[] = [];

  for (const entry of entries) {
    if (!entry.lambdaLog || !entry.lambdaLog.startsWith('[[')) {
      continue;
    }

    rows.push(parseCompressedDataRow(entry.lambdaLog, entry.sandboxLog?.trim() ?? ''));
  }

  return rows;
}

export function parseAlgorithmLogs(logs: string, summary?: AlgorithmSummary): Algorithm {
  const logLines = logs.trim().split(/\r?\n/);

  const activityLogs = getActivityLogs(logLines);
  const data = getAlgorithmData(logLines);

  if (activityLogs.length === 0 && data.length === 0) {
    throw new AlgorithmParseError(
      (
        <Text>
          Logs are empty, either something went wrong with your submission or your backtester logs in a different format
          than Prosperity&apos;s submission environment.
        </Text>
      ),
    );
  }

  if (activityLogs.length === 0 || data.length === 0) {
    throw new AlgorithmParseError(
      /* prettier-ignore */
      <Text>Logs are in invalid format.</Text>,
    );
  }

  return {
    summary,
    mode: 'full',
    activityLogs,
    data,
  };
}

export function parseProsperitySubmissionFile(logs: string): Algorithm {
  let parsed: ProsperitySubmissionFile;

  try {
    parsed = JSON.parse(logs) as ProsperitySubmissionFile;
  } catch {
    throw new AlgorithmParseError(<Text>Submission file is not valid JSON.</Text>);
  }

  if (typeof parsed.activitiesLog !== 'string') {
    throw new AlgorithmParseError(<Text>Submission file is missing `activitiesLog`.</Text>);
  }

  const logsEntries: ProsperitySubmissionLogEntry[] = Array.isArray(parsed.logs) ? parsed.logs : [];

  const activityLogs = getSubmissionActivityLogs(parsed.activitiesLog);

  if (activityLogs.length === 0) {
    throw new AlgorithmParseError(<Text>Submission file does not contain usable activity logs.</Text>);
  }

  let data = getSubmissionAlgorithmData(logsEntries);

  if (data.length === 0) {
    const rebuilt = coerceTradeHistory(parsed.tradeHistory);
    if (rebuilt !== null) {
      data = buildSimulatorDataFromTradeHistory(activityLogs, rebuilt);
    }
  }

  if (data.length === 0 && Array.isArray(parsed.positions) && parsed.positions.length > 0) {
    data = buildSimulatorDataFromFinalPositions(activityLogs, parsed.positions);
  }

  if (data.length === 0) {
    data = buildMinimalTimestampSkeleton(activityLogs);
  }

  return {
    mode: 'full',
    activityLogs,
    data,
  };
}

export async function getAlgorithmLogsUrl(algorithmId: string): Promise<string> {
  const urlResponse = await authenticatedAxios.get(
    `https://bz97lt8b1e.execute-api.eu-west-1.amazonaws.com/prod/submission/logs/${algorithmId}`,
  );

  return urlResponse.data;
}

function downloadFile(url: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = new URL(url).pathname.split('/').pop()!;
  link.target = '_blank';
  link.rel = 'noreferrer';

  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function downloadAlgorithmLogs(algorithmId: string): Promise<void> {
  const logsUrl = await getAlgorithmLogsUrl(algorithmId);
  downloadFile(logsUrl);
}

export async function downloadAlgorithmResults(algorithmId: string): Promise<void> {
  const detailsResponse = await authenticatedAxios.get(
    `https://bz97lt8b1e.execute-api.eu-west-1.amazonaws.com/prod/results/tutorial/${algorithmId}`,
  );

  downloadFile(detailsResponse.data.algo.summary.activitiesLog);
}
