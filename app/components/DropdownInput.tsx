'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface DropdownInputProps {
  value: number;
  onChange: (value: number) => void;
  options: { label: string; value: number }[];
  suffix?: string;
  id?: string;
  ariaLabel?: string;
}

export default function DropdownInput({
  value,
  onChange,
  options,
  suffix,
  id,
  ariaLabel,
}: DropdownInputProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const handleInput = (raw: string) => {
    const n = parseInt(raw, 10);
    if (!isNaN(n)) onChange(n);
  };

  const displayValue = value === Infinity ? '∞' : value.toString();

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex items-center w-full h-[50px] transition-colors">
        <div className='border-2 border-gray-600 focus-within:border-white hover:border-gray-400 items-center flex h-[50px] rounded-l-[5px]'>
          <input
            id={id}
            type="text"
            value={displayValue}
            onChange={(e) => handleInput(e.target.value)}
            aria-label={ariaLabel}
            className="flex-1 h-full px-4 bg-transparent text-white focus:outline-none"
          />
          {suffix && (
            <span className="text-[#888] pr-2 select-none" aria-hidden="true">
              {suffix}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label="Show options"
          aria-expanded={open}
          className="h-full px-3 flex items-center text-white border-2 border-gray-800 bg-gray-800 focus-within:border-white hover:border-gray-400 transition-colors rounded-r-[5px]"
        >
          <ChevronDown size={20} aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <ul
          role="listbox"
          className="absolute top-full left-0 right-0 mt-1 bg-gray-800 rounded-[5px] overflow-hidden z-10 shadow-lg"
        >
          {options.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                role="option"
                aria-selected={value === opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full text-left px-4 py-3 border-2 border-gray-800 hover:border-gray-400 transition-colors ${
                  value === opt.value ? 'text-white' : 'text-[#ccc]'
                }`}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}