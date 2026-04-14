import { Group, Text } from '@mantine/core';
import { Dropzone, FileRejection } from '@mantine/dropzone';
import { IconChartLine, IconUpload } from '@tabler/icons-react';
import { ReactNode, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorAlert } from '../../components/ErrorAlert.tsx';
import { useAsync } from '../../hooks/use-async.ts';
import { useStore } from '../../store.ts';
import { parseMarketDataCsv } from '../../utils/market-data.tsx';
import { HomeCard } from './HomeCard.tsx';

function DropzoneContent(): ReactNode {
  return (
    <Group justify="center" gap="xl" style={{ minHeight: 80, pointerEvents: 'none' }}>
      <IconUpload size={40}></IconUpload>
      <Text size="xl" inline={true}>
        Drag prices CSV here or click to select file
      </Text>
    </Group>
  );
}

export function LoadMarketDataFile(): ReactNode {
  const navigate = useNavigate();

  const [error, setError] = useState<Error>();

  const setAlgorithm = useStore(state => state.setAlgorithm);

  const onDrop = useAsync(
    (files: File[]) =>
      new Promise<void>((resolve, reject) => {
        setError(undefined);

        const reader = new FileReader();

        reader.addEventListener('load', () => {
          try {
            setAlgorithm(parseMarketDataCsv(reader.result as string));
            navigate('/visualizer');
            resolve();
          } catch (err: any) {
            reject(err);
          }
        });

        reader.addEventListener('error', () => {
          reject(new Error('FileReader emitted an error event'));
        });

        reader.readAsText(files[0]);
      }),
  );

  const onReject = useCallback((rejections: FileRejection[]) => {
    const messages: string[] = [];

    for (const rejection of rejections) {
      const errorType = {
        'file-invalid-type': 'Invalid type, only CSV files are supported.',
        'file-too-large': 'File too large.',
        'file-too-small': 'File too small.',
        'too-many-files': 'Too many files.',
      }[rejection.errors[0].code]!;

      messages.push(`Could not load market data from ${rejection.file.name}: ${errorType}`);
    }

    setError(new Error(messages.join('<br/>')));
  }, []);

  return (
    <HomeCard title="Load market data CSV">
      <Group gap="xs" mb="sm">
        <IconChartLine size={18} />
        <Text fw={500}>Market-data-only mode</Text>
      </Group>
      <Text mb="md">
        Load a raw <code>prices_round_*_day_*.csv</code> file to plot mid prices and order-book volume without
        requiring sandbox logs, positions, or profit and loss panels.
      </Text>

      {error && <ErrorAlert error={error} />}
      {onDrop.error && <ErrorAlert error={onDrop.error} />}

      <Dropzone
        onDrop={onDrop.call}
        onReject={onReject}
        multiple={false}
        loading={onDrop.loading}
        accept={['text/csv', 'application/vnd.ms-excel', '.csv']}
      >
        <Dropzone.Idle>
          <DropzoneContent />
        </Dropzone.Idle>
        <Dropzone.Accept>
          <DropzoneContent />
        </Dropzone.Accept>
      </Dropzone>
    </HomeCard>
  );
}
