'use client';

import { ChevronLeft } from 'lucide-react';

interface BackBarProps {
  label: string;
  onClick: () => void;
}

export default function BackBar({ label, onClick }: BackBarProps) {
  return (
    <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800">
      <div className="max-w-220 mx-auto px-6 py-1">
        <button
          type="button"
          onClick={onClick}
          className="inline-flex items-center gap-1 min-h-11 px-2 -ml-2 text-gray-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-950 rounded"
        >
          <ChevronLeft size={18} aria-hidden="true" />
          <span>{label}</span>
        </button>
      </div>
    </div>
  );
}
