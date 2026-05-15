'use client';

import { ReactNode } from 'react';

interface SidebarTabProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

export default function SidebarTab({ icon, label, active = false, onClick }: SidebarTabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex items-center gap-3
        w-[240px] h-[50px] px-3
        rounded-[5px]
        bg-gray-800 text-white
        border-2
        transition-colors
        cursor-pointer
        ${active ? 'border-gray-400' : 'border-gray-700 hover:border-gray-100'}
      `}
    >
      <span aria-hidden="true" className="w-6 h-6 flex items-center justify-center shrink-0">
        {icon}
      </span>
      <span className="text-base">{label}</span>
    </button>
  );
}