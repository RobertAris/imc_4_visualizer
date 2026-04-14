import { Text } from '@mantine/core';
import { ActivityLogRow, Algorithm } from '../models.ts';
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
    midPrice: getNumber(row, 'mid_price', rowNumber),
    profitLoss: getOptionalNumber(row, 'profit_and_loss') ?? 0,
  };
}

export function parseMarketDataCsv(csv: string): Algorithm {
  const rows = parseCsv(csv);

  return {
    mode: 'market-data-only',
    activityLogs: rows.map((row, index) => parseActivityLogRow(row, index + 2)),
    data: [],
  };
}
