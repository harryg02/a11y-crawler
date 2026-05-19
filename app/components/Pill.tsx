'use client';

import { X } from 'lucide-react';

interface PillProps {
  label: string;
  onRemove?: () => void;
}

export default function Pill({ label, onRemove }: PillProps) {
  return (
    <span className="inline-flex items-center gap-1.5 h-8 pl-3 pr-2 bg-transparent border-2 border-gray-400 rounded-full text-gray-900 text-sm hover:border-gray-600 dark:border-gray-600 dark:text-white dark:hover:border-gray-400 transition-colors">
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="flex items-center justify-center w-5 h-5 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}