import { Stack, Text, Title } from '@mantine/core';
import { ReactNode } from 'react';
import { ProsperitySymbol } from '../../models.ts';
import { useStore } from '../../store.ts';
import { formatNumber } from '../../utils/format.ts';
import { VisualizerCard } from './VisualizerCard.tsx';

export interface EntropyRateChartProps {
  symbol: ProsperitySymbol;
}

const EMBEDDING_DIMENSION = 4;
const DELAY = 1;

function factorial(value: number): number {
  let result = 1;
  for (let i = 2; i <= value; i++) {
    result *= i;
  }

  return result;
}

function getOrdinalPattern(values: number[]): string {
  return values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value || a.index - b.index)
    .map(item => item.index)
    .join('|');
}

function getPermutationEntropy(values: number[], embeddingDimension: number, delay: number): number | null {
  const windowSize = 1 + (embeddingDimension - 1) * delay;
  if (values.length < windowSize) {
    return null;
  }

  const patternCounts = new Map<string, number>();
  let totalPatterns = 0;

  for (let start = 0; start <= values.length - windowSize; start++) {
    const window: number[] = [];

    for (let offset = 0; offset < embeddingDimension; offset++) {
      window.push(values[start + offset * delay]);
    }

    const pattern = getOrdinalPattern(window);
    patternCounts.set(pattern, (patternCounts.get(pattern) ?? 0) + 1);
    totalPatterns += 1;
  }

  let entropy = 0;
  for (const count of patternCounts.values()) {
    const probability = count / totalPatterns;
    entropy -= probability * Math.log2(probability);
  }

  return entropy / Math.log2(factorial(embeddingDimension));
}

function getPatternCount(values: number[], embeddingDimension: number, delay: number): number {
  const windowSize = 1 + (embeddingDimension - 1) * delay;
  return Math.max(0, values.length - windowSize + 1);
}

function describeEntropy(value: number): string {
  if (value < 0.35) {
    return 'Low local randomness';
  }

  if (value < 0.7) {
    return 'Moderate local randomness';
  }

  return 'High local randomness';
}

export function EntropyRateChart({ symbol }: EntropyRateChartProps): ReactNode {
  const algorithm = useStore(state => state.algorithm)!;

  const midPrices: number[] = [];
  for (const row of algorithm.activityLogs) {
    if (row.product === symbol) {
      midPrices.push(row.midPrice);
    }
  }

  const permutationEntropy = getPermutationEntropy(midPrices, EMBEDDING_DIMENSION, DELAY);
  const patternCount = getPatternCount(midPrices, EMBEDDING_DIMENSION, DELAY);

  return (
    <VisualizerCard title={`${symbol} - Permutation Entropy`}>
      {permutationEntropy !== null ? (
        <Stack gap="xs">
          <Title order={2}>{formatNumber(permutationEntropy, 4)}</Title>
          <Text c="dimmed" size="sm">
            {describeEntropy(permutationEntropy)}. Normalized permutation entropy of the mid-price series using
            ordinal patterns of length {EMBEDDING_DIMENSION}.
          </Text>
          <Text c="dimmed" size="sm">
            Based on {formatNumber(patternCount)} overlapping patterns with delay {DELAY}. Values near 0 indicate more
            repeated local structure; values near 1 indicate more random-looking local orderings.
          </Text>
        </Stack>
      ) : (
        <Text c="dimmed">Not enough price observations to calculate permutation entropy yet.</Text>
      )}
    </VisualizerCard>
  );
}
