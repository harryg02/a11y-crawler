'use client';

import { ReactNode } from 'react';

interface ButtonProps {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: 'button' | 'submit';
    ariaLabel?: string;
    variant?: 'primary' | 'secondary';
}

const variantClasses = {
    primary: 'bg-white text-gray-900 hover:bg-gray-300',
    secondary: 'bg-gray-800 border-2 border-gray-600 text-white hover:border-gray-400',
};

export default function Button({
    children,
    onClick,
    disabled = false,
    type = 'button',
    ariaLabel,
    variant = 'primary',
}: ButtonProps) {
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            aria-label={ariaLabel}
            className={`
        py-2 px-4
        rounded-full
        font-medium text-base
        focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#0f0f0f]
        disabled:opacity-40 disabled:cursor-not-allowed
        transition-colors
        cursor-pointer
        ${variantClasses[variant]}
      `}
        >
            {children}
        </button>
    );
}
