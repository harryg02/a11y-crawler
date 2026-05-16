'use client';

import { ReactNode } from 'react';

interface TextFieldProps {
  icon?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'url' | 'email' | 'number';
  id?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
}

export default function TextField({
  icon,
  value,
  onChange,
  type = 'text',
  id,
  ariaLabel,
  autoFocus,
}: TextFieldProps) {
  return (
    <div className="flex items-center gap-3 w-full px-4 border-2 border-gray-400 rounded-[5px] hover:border-gray-600 focus-within:border-gray-900 hover:focus-within:border-gray-900 dark:border-gray-600 dark:hover:border-gray-400 dark:focus-within:border-white dark:hover:focus-within:border-white transition-colors">
      {icon && (
        <span aria-hidden="true" className="text-gray-500 dark:text-gray-400 shrink-0 flex items-center">
          {icon}
        </span>
      )}
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="flex-1 bg-transparent h-12.5 text-gray-900 dark:text-white focus:outline-none"
        autoFocus={autoFocus}
      />
    </div>
  );
}