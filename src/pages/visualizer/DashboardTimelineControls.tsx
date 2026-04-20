import { ActionIcon, Group, NumberInput, SegmentedControl, Slider, Text } from '@mantine/core';
import {
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerSkipBack,
  IconPlayerSkipForward,
} from '@tabler/icons-react';
import { ReactNode } from 'react';
import { formatNumber } from '../../utils/format.ts';
import classes from './DashboardVisualizer.module.css';

export interface DashboardTimelineControlsProps {
  currentIndex: number;
  day?: number;
  isPlaying: boolean;
  playbackSpeed: number;
  timestamp: number;
  total: number;
  onIndexChange: (index: number) => void;
  onPlayPause: () => void;
  onPlaybackSpeedChange: (speed: number) => void;
  onStep: (delta: number) => void;
  onTimestampJump: (timestamp: number) => void;
}

export function DashboardTimelineControls({
  currentIndex,
  day,
  isPlaying,
  playbackSpeed,
  timestamp,
  total,
  onIndexChange,
  onPlayPause,
  onPlaybackSpeedChange,
  onStep,
  onTimestampJump,
}: DashboardTimelineControlsProps): ReactNode {
  return (
    <div className={classes.timelineBar}>
      <Group gap="xs" wrap="nowrap">
        <ActionIcon variant="filled" color="dark" size="lg" onClick={onPlayPause} aria-label="Toggle playback">
          {isPlaying ? <IconPlayerPauseFilled size={16} /> : <IconPlayerPlayFilled size={16} />}
        </ActionIcon>
        <ActionIcon variant="outline" size="lg" onClick={() => onStep(-1)} aria-label="Previous timestamp">
          <IconPlayerSkipBack size={16} />
        </ActionIcon>
        <ActionIcon variant="outline" size="lg" onClick={() => onStep(1)} aria-label="Next timestamp">
          <IconPlayerSkipForward size={16} />
        </ActionIcon>
      </Group>

      <div className={classes.timelineMain}>
        <Group justify="space-between" gap="xs">
          <Text className={classes.monoLabel}>
            Timestamp {formatNumber(timestamp)}
            {day !== undefined ? ` · Day ${formatNumber(day)}` : ''}
          </Text>
          <Text className={classes.monoLabel}>
            {formatNumber(currentIndex + 1)} / {formatNumber(total)}
          </Text>
        </Group>
        <Slider
          min={0}
          max={Math.max(0, total - 1)}
          step={1}
          value={currentIndex}
          onChange={onIndexChange}
          label={value => `Tick ${formatNumber(value + 1)}`}
        />
      </div>

      <Group gap="xs" wrap="nowrap">
        <SegmentedControl
          value={String(playbackSpeed)}
          onChange={value => onPlaybackSpeedChange(Number(value))}
          data={[
            { label: '1x', value: '1' },
            { label: '5x', value: '5' },
            { label: '10x', value: '10' },
          ]}
        />
        <NumberInput
          aria-label="Jump to timestamp"
          placeholder="Jump"
          value={timestamp}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              onTimestampJump(Number(event.currentTarget.value));
            }
          }}
          hideControls
          w={110}
        />
      </Group>
    </div>
  );
}
