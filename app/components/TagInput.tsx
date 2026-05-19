'use client';

import { useState, KeyboardEvent } from 'react';
import Pill from './Pill';

interface TagInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  id?: string;
  ariaLabel?: string;
}

export default function TagInput({
  values,
  onChange,
  id,
  ariaLabel,
}: TagInputProps) {
  const [draft, setDraft] = useState('');

  const addPill = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (values.includes(trimmed)) {
      setDraft('');
      return;
    }
    onChange([...values, trimmed]);
    setDraft('');
  };

  const removePill = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addPill();
    } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
      // remove last pill when backspace pressed in empty input
      removePill(values.length - 1);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 w-full min-h-[50px] p-2 bg-transparent border-2 border-gray-400 rounded-[5px] hover:border-gray-600 focus-within:border-gray-900 hover:focus-within:border-gray-900 dark:border-gray-600 dark:hover:border-gray-400 dark:focus-within:border-white dark:hover:focus-within:border-white transition-colors">
      <input
        id={id}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addPill}
        aria-label={ariaLabel}
        className="order-last flex-1 min-w-30 h-8 px-2 bg-transparent text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-[#888] focus:outline-none"
      />
      {values.map((value, i) => (
        <Pill key={`${value}-${i}`} label={value} onRemove={() => removePill(i)} />
      ))}
    </div>
  );
}