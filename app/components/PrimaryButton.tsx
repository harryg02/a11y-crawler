'use client';

import { ReactNode } from 'react';

interface PrimaryButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  ariaLabel?: string;
}

export default function PrimaryButton({
  children,
  onClick,
  disabled = false,
  type = 'button',
  ariaLabel,
}: PrimaryButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="
        py-2 px-4
        bg-white text-gray-900
        rounded-full
        font-medium text-base
        hover:bg-gray-300
        focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#0f0f0f]
        disabled:opacity-40 disabled:cursor-not-allowed
        transition-colors
        cursor-pointer
      "
    >
      {children}
    </button>
  );
}