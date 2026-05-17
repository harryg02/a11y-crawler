'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light',  label: 'Light'  },
  { value: 'dark',   label: 'Dark'   },
];

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="max-w-220 mx-auto p-8">
      <h1 className="text-3xl font-medium mb-6 text-gray-900 dark:text-white">Settings</h1>

      <div>
        <p className="text-gray-900 dark:text-white mb-1 font-medium">Appearance</p>
        <p className="text-gray-600 dark:text-gray-400 text-base mb-3">Choose how the app looks.</p>

        {mounted && (
          <div
            role="group"
            aria-label="Theme"
            className="inline-flex rounded-[5px] border-2 border-gray-300 dark:border-gray-700"
          >
            {THEMES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                aria-pressed={theme === value}
                className={`px-5 py-2 text-base font-medium transition-colors first:rounded-l-[3px] last:rounded-r-[3px] focus:z-10 focus:relative ${
                  theme === value
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                    : 'bg-white text-gray-900 hover:bg-gray-100 dark:bg-gray-900 dark:text-white dark:hover:bg-gray-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
