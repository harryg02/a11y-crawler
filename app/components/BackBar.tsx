'use client';

import { ChevronLeft } from 'lucide-react';

interface BackBarProps {
  label: string;
  onClick: () => void;
  rightAction?: React.ReactNode;
}

export default function BackBar({ label, onClick, rightAction }: BackBarProps) {
  return (
    // Sticky in both axes: top-0 pins it while scrolling down, left-0 while
    // scrolling right (a wide table can scroll horizontally beneath it). The
    // width is the scroll port via a container query unit, so the opaque
    // background always spans the visible area even though the content box it
    // lives in may be much wider. z-20 keeps it above the table's sticky
    // <thead>, which pins directly below it.
    <div className="sticky top-0 left-0 z-20 w-[100cqw] bg-white border-b border-gray-200 dark:bg-gray-950 dark:border-gray-800">
      <div className="max-w-240 mx-auto px-6 py-1 flex items-center justify-between min-h-13">
        <button
          type="button"
          onClick={onClick}
          className="inline-flex items-center gap-1 min-h-11 px-2 -ml-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-white dark:focus:ring-offset-gray-950 rounded"
        >
          <ChevronLeft size={18} aria-hidden="true" />
          <span>{label}</span>
        </button>
        {rightAction && (
          <div className="flex items-center">
            {rightAction}
          </div>
        )}
      </div>
    </div>
  );
}
