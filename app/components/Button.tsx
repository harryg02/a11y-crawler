'use client';

import { ReactNode, forwardRef } from 'react';

interface ButtonProps {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: 'button' | 'submit';
    ariaLabel?: string;
    variant?: 'primary' | 'secondary' | 'danger';
}

const variantClasses = {
    primary: 'bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-300',
    secondary: 'bg-gray-200 border-2 border-gray-400 text-gray-900 hover:border-gray-600 dark:bg-gray-800 dark:border-gray-600 dark:text-white dark:hover:border-gray-400',
    danger: 'bg-red-700 text-white hover:bg-red-600 dark:bg-red-800 dark:hover:bg-red-700',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
    children,
    onClick,
    disabled = false,
    type = 'button',
    ariaLabel,
    variant = 'primary',
}, ref) => {
    return (
        <button
            ref={ref}
            type={type}
            onClick={onClick}
            disabled={disabled}
            aria-label={ariaLabel}
            className={`
        inline-flex items-center justify-center
        py-2 px-5
        rounded-full
        font-medium text-base
        focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-white dark:focus:ring-offset-[#0f0f0f]
        disabled:opacity-40 disabled:cursor-not-allowed
        transition-colors
        cursor-pointer
        ${variantClasses[variant]}
      `}
        >
            {children}
        </button>
    );
});

export default Button;
