'use client';

import { ReactNode } from 'react';

interface TextFieldProps {
  icon?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'url' | 'email' | 'number';
  id?: string;
  ariaLabel?: string;
}

export default function TextField({
  icon,
  value,
  onChange,
  type = 'text',
  id,
  ariaLabel,
}: TextFieldProps) {
  return (
    <div className="flex items-center gap-3 w-full h-12.5 px-4 border-2 border-gray-600 rounded-[5px] focus-within:border-white transition-colors">
      {icon && (
        <span aria-hidden="true" className="text-gray-400 shrink-0 flex items-center">
          {icon}
        </span>
      )}
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="flex-1 bg-transparent text-white focus:outline-none"
      />
    </div>
  );
}