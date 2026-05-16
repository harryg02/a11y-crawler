'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface NumberStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  id?: string;
  ariaLabel?: string;
}

export default function NumberStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  id,
  ariaLabel,
}: NumberStepperProps) {
  const decrement = () => onChange(Math.max(min, value - 1));
  const increment = () => onChange(Math.min(max, value + 1));

  const handleInput = (raw: string) => {
    const n = parseInt(raw, 10);
    if (isNaN(n)) return;
    onChange(Math.max(min, Math.min(max, n)));
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={decrement}
        disabled={value <= min}
        aria-label="Decrease"
        className="w-12.5 h-12.5 flex items-center justify-center bg-gray-200 border-2 border-gray-400 rounded-[5px] text-gray-900 hover:border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-gray-800 dark:border-gray-600 dark:text-white dark:hover:border-gray-400 transition-colors"
      >
        <ChevronLeft size={25} aria-hidden="true" />
      </button>

      <input
        id={id}
        type="number"
        value={value}
        onChange={(e) => handleInput(e.target.value)}
        aria-label={ariaLabel}
        className="w-15 h-12.5 text-center bg-transparent border-2 border-gray-400 rounded-[5px] text-gray-900 focus:border-gray-900 hover:border-gray-600 focus:outline-none dark:border-gray-600 dark:text-white dark:focus:border-white dark:hover:border-gray-400 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />

      <button
        type="button"
        onClick={increment}
        disabled={value >= max}
        aria-label="Increase"
        className="w-12.5 h-12.5 flex items-center justify-center bg-gray-200 border-2 border-gray-400 rounded-[5px] text-gray-900 hover:border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-gray-800 dark:border-gray-600 dark:text-white dark:hover:border-gray-400 transition-colors"
      >
        <ChevronRight size={25} aria-hidden="true" />
      </button>
    </div>
  );
}