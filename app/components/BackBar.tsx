'use client';

import { ChevronLeft } from 'lucide-react';

interface BackBarProps {
  label: string;
  onClick: () => void;
}

export default function BackBar({ label, onClick }: BackBarProps) {
  return (
    <div className="sticky top-0 z-10 bg-white border-b border-gray-200 dark:bg-gray-950 dark:border-gray-800">
      <div className="max-w-220 mx-auto px-6 py-1">
        <button
          type="button"
          onClick={onClick}
          className="inline-flex items-center gap-1 min-h-11 px-2 -ml-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-white dark:focus:ring-offset-gray-950 rounded"
        >
          <ChevronLeft size={18} aria-hidden="true" />
          <span>{label}</span>
        </button>
      </div>
    </div>
  );
}
