import { Slider, SliderProps, Text } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { ReactNode, useState } from 'react';
import { useStore } from '../../store.ts';
import { formatNumber } from '../../utils/format.ts';
import { TimestampDetail } from './TimestampDetail.tsx';
import { VisualizerCard } from './VisualizerCard.tsx';

export function TimestampsCard(): ReactNode {
  const algorithm = useStore(state => state.algorithm)!;
  const [rowIndex, setRowIndex] = useState(0);
  const row = algorithm.data[rowIndex];
  const timestamp = row.state.timestamp;

  const marks: SliderProps['marks'] = [];
  const markDivisor = Math.min(4, Math.max(1, algorithm.data.length - 1));
  for (let i = 0; i <= markDivisor; i++) {
    const index = Math.min(algorithm.data.length - 1, Math.round((i * (algorithm.data.length - 1)) / markDivisor));
    marks.push({
      value: index,
      label: formatNumber(algorithm.data[index].state.timestamp),
    });
  }

  useHotkeys([
    ['ArrowLeft', () => setRowIndex(index => Math.max(0, index - 1))],
    ['ArrowRight', () => setRowIndex(index => Math.min(algorithm.data.length - 1, index + 1))],
  ]);

  return (
    <VisualizerCard title="Timestamps">
      <Slider
        min={0}
        max={Math.max(0, algorithm.data.length - 1)}
        step={1}
        marks={marks}
        label={value => `Timestamp ${formatNumber(algorithm.data[value].state.timestamp)}`}
        value={rowIndex}
        onChange={setRowIndex}
        mb="lg"
      />

      {row ? <TimestampDetail row={row} /> : <Text>No logs found for timestamp {formatNumber(timestamp)}</Text>}
    </VisualizerCard>
  );
}
