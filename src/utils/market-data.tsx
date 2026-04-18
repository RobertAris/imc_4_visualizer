import { Text } from '@mantine/core';
import { ActivityLogRow, Algorithm, AlgorithmDataRow, Listing, OrderDepth, Trade, TradingState } from '../models.ts';
import { AlgorithmParseError } from './algorithm.tsx';

type CsvRow = Record<string, string>;

function getDelimiter(headerLine: string): string {
  return headerLine.includes(';') ? ';' : ',';
}

function parseCsv(text: string): CsvRow[] {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length < 2) {
    throw new AlgorithmParseError(<Text>CSV is empty or only contains a header row.</Text>);
  }

  const delimiter = getDelimiter(lines[0]);
  const headers = lines[0].split(delimiter).map(header => header.trim());

  return lines.slice(1).map((line, index) => {
    const values = line.split(delimiter).map(value => value.trim());

    if (values.length !== headers.length) {
      throw new AlgorithmParseError(
        <Text>
          CSV row {index + 2} has {values.length} columns, expected {headers.length}.
        </Text>,
      );
    }

    return Object.fromEntries(headers.map((header, valueIndex) => [header, values[valueIndex]]));
  });
}

function getNumber(row: CsvRow, key: string, rowNumber: number): number {
  const value = row[key];
  if (value === undefined || value === '') {
    throw new AlgorithmParseError(<Text>CSV row {rowNumber} is missing required column `{key}`.</Text>);
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new AlgorithmParseError(<Text>CSV row {rowNumber} has an invalid number in `{key}`.</Text>);
  }

  return parsed;
}

function getOptionalNumber(row: CsvRow, key: string): number | null {
  const value = row[key];
  if (value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function getLevelValues(row: CsvRow, prefix: 'bid' | 'ask', suffix: 'price' | 'volume'): number[] {
  const values: number[] = [];

  for (let level = 1; level <= 3; level++) {
    const value = getOptionalNumber(row, `${prefix}_${suffix}_${level}`);
    if (value !== null) {
      values.push(value);
    }
  }

  return values;
}

function getMidPrice(row: CsvRow, rowNumber: number): number {
  const bidPrices = getLevelValues(row, 'bid', 'price');
  const askPrices = getLevelValues(row, 'ask', 'price');

  if (bidPrices.length > 0 && askPrices.length > 0) {
    return (bidPrices[0] + askPrices[0]) / 2;
  }

  return getNumber(row, 'mid_price', rowNumber);
}

function parseActivityLogRow(row: CsvRow, rowNumber: number): ActivityLogRow {
  return {
    day: getNumber(row, 'day', rowNumber),
    timestamp: getNumber(row, 'timestamp', rowNumber),
    product: row.product || (() => {
      throw new AlgorithmParseError(<Text>CSV row {rowNumber} is missing required column `product`.</Text>);
    })(),
    bidPrices: getLevelValues(row, 'bid', 'price'),
    bidVolumes: getLevelValues(row, 'bid', 'volume'),
    askPrices: getLevelValues(row, 'ask', 'price'),
    askVolumes: getLevelValues(row, 'ask', 'volume'),
    midPrice: getMidPrice(row, rowNumber),
    profitLoss: getOptionalNumber(row, 'profit_and_loss') ?? 0,
  };
}

function getRequiredString(row: CsvRow, key: string, rowNumber: number): string {
  const value = row[key];
  if (value === undefined || value === '') {
    throw new AlgorithmParseError(<Text>CSV row {rowNumber} is missing required column `{key}`.</Text>);
  }

  return value;
}

function buildListings(symbols: Set<string>, denomination: string): Record<string, Listing> {
  return Object.fromEntries(
    [...symbols].sort((a, b) => a.localeCompare(b)).map(symbol => [
      symbol,
      {
        symbol,
        product: symbol,
        denomination,
      },
    ]),
  );
}

function buildSyntheticDataRows(
  timestamps: number[],
  listings: Record<string, Listing>,
  marketTradesByTimestamp: Record<number, Record<string, Trade[]>>,
): AlgorithmDataRow[] {
  return timestamps.map(timestamp => {
    const state: TradingState = {
      timestamp,
      traderData: '',
      listings,
      orderDepths: {},
      ownTrades: {},
      marketTrades: marketTradesByTimestamp[timestamp] ?? {},
      position: {},
      observations: {
        plainValueObservations: {},
        conversionObservations: {},
      },
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

function buildOrderDepth(row: ActivityLogRow): OrderDepth {
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

function buildMarketDataRows(activityLogs: ActivityLogRow[]): AlgorithmDataRow[] {
  const timestamps = [...new Set(activityLogs.map(row => row.timestamp))].sort((a, b) => a - b);
  const symbols = new Set(activityLogs.map(row => row.product));
  const listings = buildListings(symbols, 'SEASHELLS');
  const rowsByTimestamp = new Map<number, ActivityLogRow[]>();

  activityLogs.forEach(row => {
    const rows = rowsByTimestamp.get(row.timestamp) ?? [];
    rows.push(row);
    rowsByTimestamp.set(row.timestamp, rows);
  });

  return timestamps.map(timestamp => {
    const timestampRows = rowsByTimestamp.get(timestamp) ?? [];
    const orderDepths = Object.fromEntries(timestampRows.map(row => [row.product, buildOrderDepth(row)]));

    return {
      state: {
        timestamp,
        traderData: '',
        listings,
        orderDepths,
        ownTrades: {},
        marketTrades: {},
        position: {},
        observations: {
          plainValueObservations: {},
          conversionObservations: {},
        },
      },
      orders: {},
      conversions: 0,
      traderData: '',
      algorithmLogs: '',
      sandboxLogs: '',
    };
  });
}

export function parseMarketDataCsv(csv: string): Algorithm {
  const rows = parseCsv(csv);
  const activityLogs = rows.map((row, index) => parseActivityLogRow(row, index + 2));

  return {
    mode: 'market-data-only',
    activityLogs,
    data: buildMarketDataRows(activityLogs),
  };
}

export function parseTradesCsv(csv: string): Algorithm {
  const rows = parseCsv(csv);
  const marketTradesByTimestamp: Record<number, Record<string, Trade[]>> = {};
  const symbols = new Set<string>();
  const currencies = new Set<string>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const timestamp = getNumber(row, 'timestamp', rowNumber);
    const symbol = getRequiredString(row, 'symbol', rowNumber);
    const currency = getRequiredString(row, 'currency', rowNumber);

    currencies.add(currency);
    symbols.add(symbol);

    if (marketTradesByTimestamp[timestamp] === undefined) {
      marketTradesByTimestamp[timestamp] = {};
    }

    if (marketTradesByTimestamp[timestamp][symbol] === undefined) {
      marketTradesByTimestamp[timestamp][symbol] = [];
    }

    marketTradesByTimestamp[timestamp][symbol].push({
      symbol,
      buyer: row.buyer ?? '',
      seller: row.seller ?? '',
      price: getNumber(row, 'price', rowNumber),
      quantity: getNumber(row, 'quantity', rowNumber),
      timestamp,
    });
  });

  if (currencies.size > 1) {
    throw new AlgorithmParseError(<Text>Trades CSV contains multiple currencies, which is not supported.</Text>);
  }

  const denomination = currencies.values().next().value ?? 'SEASHELLS';
  const timestamps = Object.keys(marketTradesByTimestamp)
    .map(Number)
    .sort((a, b) => a - b);

  return {
    mode: 'market-data-only',
    activityLogs: [],
    data: buildSyntheticDataRows(timestamps, buildListings(symbols, denomination), marketTradesByTimestamp),
  };
}
