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
  // Local draft allows the user to fully clear the field
  const displayValue = value === Infinity ? '' : value.toString();
  const [draft, setDraft] = useState(displayValue);

  // Sync draft when value changes externally (e.g. dropdown selection)
  useEffect(() => {
    setDraft(value === Infinity ? '' : value.toString());
  }, [value]);

  const handleInput = (raw: string) => {
    setDraft(raw);
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n > 0) onChange(n);
  };

  const handleBlur = () => {
    const n = parseInt(draft, 10);
    if (isNaN(n) || draft.trim() === '') {
      onChange(Infinity);
      setDraft('');
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="group flex items-center h-12.5 border-2 border-gray-400 hover:border-gray-600 focus-within:border-gray-900 dark:border-gray-600 dark:hover:border-gray-400 dark:focus-within:border-white transition-colors rounded-[5px] overflow-hidden">
        {/* Input + suffix */}
        <div className="flex items-center flex-1 h-full">
          <input
            id={id}
            type="text"
            value={draft}
            onChange={(e) => handleInput(e.target.value)}
            onBlur={handleBlur}
            placeholder="∞"
            aria-label={ariaLabel}
            className="w-20 h-full px-4 bg-transparent text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-[#888] focus:outline-none"
          />
          {suffix && (
            <span className="text-gray-500 dark:text-[#888] pr-2 select-none" aria-hidden="true">
              {suffix}
            </span>
          )}
        </div>
        {/* Single separator that tracks the outer border color */}
        <div className="w-0.5 self-stretch bg-gray-400 group-hover:bg-gray-600 group-focus-within:bg-gray-900 dark:bg-gray-600 dark:group-hover:bg-gray-400 dark:group-focus-within:bg-white transition-colors" aria-hidden="true" />
        {/* Dropdown trigger */}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label="Show options"
          aria-expanded={open}
          className="h-full px-3 flex items-center text-gray-900 bg-gray-200 dark:text-white dark:bg-gray-800 focus:outline-none"
        >
          <ChevronDown size={20} aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <ul
          role="listbox"
          className="absolute top-full left-0 right-0 mt-1 border-2 border-gray-400 bg-gray-100 dark:border-gray-600 dark:bg-gray-800 rounded-[5px] overflow-hidden z-10 shadow-lg"
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
                className={`w-full text-left px-4 py-3 border-2 border-gray-100 hover:border-gray-500 dark:border-gray-800 dark:hover:border-gray-400 transition-colors ${value === opt.value ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-[#ccc]'
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