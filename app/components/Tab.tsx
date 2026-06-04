'use client';

import { ReactNode } from 'react';

interface SidebarTabProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  collapsed?: boolean;
  onClick?: () => void;
}

export default function SidebarTab({ icon, label, active = false, collapsed = false, onClick }: SidebarTabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`
        flex items-center gap-3 px-3
        ${collapsed ? 'w-full justify-center' : 'w-[240px]'}
        h-[50px]
        rounded-[5px]
        bg-gray-200 text-gray-900 dark:bg-gray-800 dark:text-white
        border-2
        transition-all
        cursor-pointer
        ${active ? 'border-gray-500 dark:border-gray-400' : 'border-gray-300 hover:border-gray-500 dark:border-gray-700 dark:hover:border-gray-100'}
      `}
    >
      <span className="w-6 h-6 flex items-center justify-center shrink-0">
        {icon}
      </span>
      <span className={`text-base ${collapsed ? 'sr-only' : ''}`}>{label}</span>
    </button>
  );
}