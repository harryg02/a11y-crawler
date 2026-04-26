'use client';

import { useState } from 'react';
import { Link } from 'lucide-react';
import TextField from './TextField';

export default function CrawlScan() {
  const [scope, setScope] = useState('');
  const [startingUrl, setStartingUrl] = useState('');
  return (
    <div className="max-w-160 mx-auto py-12">
      <h2 className="text-3xl font-medium mb-8">Crawl & Scan</h2>
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
      </div>

    </div>
  );
}