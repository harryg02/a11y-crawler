'use client';

import { useState } from 'react';
import { Link } from 'lucide-react';
import TextField from './TextField';
import NumberStepper from './NumberStepper';

export default function CrawlScan() {
  const [scope, setScope] = useState('');
  const [startingUrl, setStartingUrl] = useState('');
  const [maxDepth, setMaxDepth] = useState(2);

  return (
    <div className="max-w-150 mx-auto py-12">
      <h2 className="text-4xl mb-5">Crawl & Scan</h2>
      <div className="space-y-6">
        <div>
          <label htmlFor="scope" className="block text-white mb-1">
            Scope
          </label>
          <TextField
            id="scope"
            icon={<Link size={20} />}
            value={scope}
            onChange={setScope}
            type="url"
          />
        </div>

        <div>
          <label htmlFor="starting-url" className="block text-white mb-1">
            Starting URL
          </label>
          <TextField
            id="starting-url"
            icon={<Link size={20} />}
            value={startingUrl}
            onChange={setStartingUrl}
            type="url"
          />
        </div>
        <div>
          <label htmlFor="max-depth" className="block text-white mb-2">
            Max Depth
          </label>
          <NumberStepper
            id="max-depth"
            value={maxDepth}
            onChange={setMaxDepth}
            min={1}
            max={10}
            ariaLabel="Max interaction depth"
          />
        </div>

      </div>

    </div>
  );
}