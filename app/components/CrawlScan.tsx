'use client';

import CrawlScanForm from './CrawlScanForm';
import Scanning from './Scanning';

type CrawlState = 'idle' | 'scanning';

interface CrawlScanProps {
  crawlState: CrawlState;
  setCrawlState: (state: CrawlState) => void;
  config: any;
  setConfig: (config: any) => void;
  onViewResults: (scanId: string | null) => void;
}

export default function CrawlScan({ crawlState, setCrawlState, config, setConfig, onViewResults }: CrawlScanProps) {
  if (crawlState === 'scanning') {
    return (
      <Scanning
        config={config}
        onFinish={() => setCrawlState('idle')}
        onViewResults={(scanId) => { setCrawlState('idle'); onViewResults(scanId); }}
      />
    );
  }

  return (
    <CrawlScanForm
      onStart={(formConfig) => {
        setConfig(formConfig);
        setCrawlState('scanning');
      }}
    />
  );
}
