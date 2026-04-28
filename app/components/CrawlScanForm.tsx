'use client';

import { useState } from 'react';
import { Link } from 'lucide-react';
import TextField from './TextField';
import NumberStepper from './NumberStepper';
import DropdownInput from './DropdownInput';
import TagInput from './TagInput';
import Button from './Button';

const TIMEOUT_OPTIONS = [
  { label: '15 Min', value: 15 },
  { label: '30 Min', value: 30 },
  { label: '60 Min', value: 60 },
  { label: 'Infinity', value: Infinity },
];

interface CrawlScanProps {
  onStart: (config: {
    scope: string;
    startingUrl: string;
    maxDepth: number;
    timeout: number;
    forbiddenWords: string[];
    excludedScopes: string[];
  }) => void;
}

export default function CrawlScan({ onStart }: CrawlScanProps) {
  const [scope, setScope] = useState('');
  const [startingUrl, setStartingUrl] = useState('');
  const [maxDepth, setMaxDepth] = useState(2);
  const [timeout, setTimeout] = useState(30);
  const [forbiddenWords, setForbiddenWords] = useState<string[]>([
    'Log out', 'Grant', 'Access', 'Delete'
  ]);
  const [excludedScopes, setExcludedScopes] = useState<string[]>([]);

  return (
    <div className="min-h-screen flex items-center">
      <div className="max-w-150 mx-auto py-4">
        <h2 className="text-3xl font-medium mb-6">Crawl & Scan</h2>
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
              autoFocus
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
          <div className="flex gap-12">
            <div className="">
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
            <div className="">
              <label htmlFor="timeout" className="block text-white mb-2">
                Time Out
              </label>
              <DropdownInput
                id="timeout"
                value={timeout}
                onChange={setTimeout}
                options={TIMEOUT_OPTIONS}
                suffix="Min"
                ariaLabel="Timeout in minutes"
              />
            </div>

          </div>
          <div>
            <label htmlFor="forbidden-words" className="block text-white mb-2">
              Forbidden Words
            </label>
            <TagInput
              id="forbidden-words"
              values={forbiddenWords}
              onChange={setForbiddenWords}
              ariaLabel="Forbidden words list"
            />
          </div>

          <div>
            <label htmlFor="exclude-scope" className="block text-white mb-2">
              Exclude Scope
            </label>
            <TagInput
              id="exclude-scope"
              values={excludedScopes}
              onChange={setExcludedScopes}
              ariaLabel="Excluded URL scopes list"
            />
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={() => onStart({ scope, startingUrl, maxDepth, timeout, forbiddenWords, excludedScopes })}>Start Scan</Button>
          </div>

        </div>

      </div>
    </div>
  );
}