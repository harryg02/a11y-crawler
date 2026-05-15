'use client';

import CrawlScanForm from './CrawlScanForm';
import Scanning from './Scanning';

type CrawlState = 'idle' | 'scanning';

interface CrawlScanProps {
  crawlState: CrawlState;
  setCrawlState: (state: CrawlState) => void;
  config: any;
  setConfig: (config: any) => void;
  onViewHistory: () => void;
}

export default function CrawlScan({ crawlState, setCrawlState, config, setConfig, onViewHistory }: CrawlScanProps) {
  if (crawlState === 'scanning') {
    return (
      <Scanning
        config={config}
        onFinish={() => setCrawlState('idle')}
        onViewResults={() => { setCrawlState('idle'); onViewHistory(); }}
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
