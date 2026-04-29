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
  { label: 'No limit', value: Infinity },
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
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [startingUrl, setStartingUrl] = useState('');
  const [maxDepth, setMaxDepth] = useState(2);
  const [timeout, setTimeout] = useState(30);
  const [forbiddenWords, setForbiddenWords] = useState<string[]>([
    'Log out', 'Grant', 'Access', 'Delete'
  ]);
  const [excludedScopes, setExcludedScopes] = useState<string[]>([]);

  return (
    <div className="min-h-screen flex items-center">
      <div className="w-150 max-w-150 mx-auto py-4">
        <h2 className="text-3xl font-medium mb-6">Crawl & Scan</h2>
        <div className="space-y-8">

          <div>
            <label htmlFor="scope" className="block text-white mb-1">
              Site to Scan
            </label>
            <p className="text-gray-400 text-base mb-2">
              The crawler will scan pages and sub pages within this URL.
            </p>
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
            <div className="flex items-center gap-3">
              <div className="relative w-5 h-5 shrink-0">
                <input
                  type="checkbox"
                  id="requires-login"
                  checked={requiresLogin}
                  onChange={(e) => {
                    setRequiresLogin(e.target.checked);
                    if (!e.target.checked) setStartingUrl('');
                  }}
                  className="peer appearance-none w-5 h-5 cursor-pointer rounded border-2 border-gray-600 bg-gray-800 checked:bg-white checked:border-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-950"
                />
                <span aria-hidden="true" className="pointer-events-none absolute inset-0 hidden peer-checked:flex items-center justify-center text-gray-800 leading-none">✓</span>
              </div>
              <label htmlFor="requires-login" className="text-white cursor-pointer">
                This site requires login
              </label>
            </div>

            {requiresLogin && (
              <div className="mt-4 ml-2 pl-4 border-l-2 border-gray-600">
                <label htmlFor="starting-url" className="block text-white mb-1">
                  Specify Starting Page
                </label>
                <p className="text-gray-400 text-base mb-2">
                  The crawler opens this page first and waits, log in here if needed.
                </p>
                <TextField
                  id="starting-url"
                  icon={<Link size={20} />}
                  value={startingUrl}
                  onChange={setStartingUrl}
                  type="url"
                />
              </div>
            )}
          </div>

          <div className="flex gap-12">
            <div>
              <label htmlFor="max-depth" className="block text-white mb-1">
                Interaction depth
              </label>
              <p className="text-gray-400 text-base mb-2">
                e.g. At depth 2: click a button, then click what it reveals on the same page. 
              </p>
              <NumberStepper
                id="max-depth"
                value={maxDepth}
                onChange={setMaxDepth}
                min={1}
                max={10}
                ariaLabel="Interaction depth"
              />
            </div>
            <div>
              <label htmlFor="timeout" className="block text-white mb-1">
                Time limit
              </label>
              <p className="text-gray-400 text-base mb-2">
                Stop the scan after this long.
              </p>
              <DropdownInput
                id="timeout"
                value={timeout}
                onChange={setTimeout}
                options={TIMEOUT_OPTIONS}
                suffix="Min"
                ariaLabel="Time limit in minutes"
              />
            </div>
          </div>

          <div>
            <label htmlFor="forbidden-words" className="block text-white mb-1">
              Buttons to avoid
            </label>
            <p className="text-gray-400 text-base mb-2">
              The crawler will not clicking on any button that contains these words.
            </p>
            <TagInput
              id="forbidden-words"
              values={forbiddenWords}
              onChange={setForbiddenWords}
              ariaLabel="Buttons to avoid"
            />
          </div>

          <div>
            <label htmlFor="exclude-scope" className="block text-white mb-1">
              Skip Scanning these URLs
            </label>
            {/* <p className="text-gray-400 text-base mb-2">
              Pages with these addresses will not be scanned.
            </p> */}
            <TagInput
              id="exclude-scope"
              values={excludedScopes}
              onChange={setExcludedScopes}
              ariaLabel="URLs to skip"
            />
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={() => onStart({ scope, startingUrl, maxDepth, timeout, forbiddenWords, excludedScopes })}>
              Start Scan
            </Button>
          </div>

        </div>
      </div>
    </div>
  );
}