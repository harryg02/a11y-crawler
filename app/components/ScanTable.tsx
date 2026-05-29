'use client';

import React, { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getGroupedRowModel,
  getExpandedRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import { ScanRow } from '../../lib/csvExport';
import { ChevronRight, ChevronDown } from 'lucide-react';

const columnHelper = createColumnHelper<ScanRow>();

export default function ScanTable({ data }: { data: ScanRow[] }) {
  const [expanded, setExpanded] = useState({});
  const [grouping, setGrouping] = useState<string[]>(['url', 'error']);

  const columns = [
    columnHelper.accessor('url', {
      header: 'URL',
      cell: info => <div className="max-w-[200px] truncate" title={info.getValue()}>{info.getValue()}</div>,
    }),
    columnHelper.accessor('action', {
      header: 'Action',
      cell: info => info.getValue(),
    }),
    columnHelper.accessor('error', {
      header: 'Error',
      cell: info => <div className="max-w-[200px] break-words">{info.getValue()}</div>,
    }),
    columnHelper.accessor('wcag', {
      header: 'WCAG',
      cell: info => info.getValue(),
    }),
    columnHelper.accessor('element', {
      header: 'Element',
      cell: info => <div className="max-w-[200px] font-mono text-xs overflow-hidden text-ellipsis whitespace-nowrap" title={info.getValue()}>{info.getValue()}</div>,
    }),
    columnHelper.accessor('selector', {
      header: 'Selector',
      cell: info => <div className="max-w-[150px] font-mono text-xs overflow-hidden text-ellipsis whitespace-nowrap" title={info.getValue()}>{info.getValue()}</div>,
    }),
    columnHelper.accessor('fix', {
      header: 'Fix',
      cell: info => <div className="max-w-[200px] text-xs break-words">{info.getValue()}</div>,
    }),
  ];

  const table = useReactTable({
    data,
    columns,
    state: {
      expanded,
      grouping,
    },
    onExpandedChange: setExpanded,
    onGroupingChange: setGrouping,
    getCoreRowModel: getCoreRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  if (data.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-md">
        No violations found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
      <table className="min-w-full text-left text-sm text-gray-900 dark:text-gray-100">
        <thead className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-b border-gray-300 dark:border-gray-700">
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <th key={header.id} className="px-4 py-3 font-semibold whitespace-nowrap">
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
          {table.getRowModel().rows.map(row => {
            return (
              <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                {row.getVisibleCells().map(cell => {
                  return (
                    <td key={cell.id} className="px-4 py-3 align-top">
                      {cell.getIsGrouped() ? (
                        <>
                          <button
                            {...{
                              onClick: row.getToggleExpandedHandler(),
                              style: { cursor: row.getCanExpand() ? 'pointer' : 'normal' },
                            }}
                            className="flex items-start gap-1 font-medium text-blue-700 dark:text-blue-400 hover:underline text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                          >
                            <span className="mt-0.5 shrink-0" aria-hidden="true">
                              {row.getIsExpanded() ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </span>
                            <span>{flexRender(cell.column.columnDef.cell, cell.getContext())}</span>
                            <span className="ml-1 text-[11px] font-bold bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded-full inline-flex items-center">
                              {row.subRows.length}
                            </span>
                          </button>
                        </>
                      ) : cell.getIsAggregated() ? (
                        null // hide aggregated content to keep it clean
                      ) : cell.getIsPlaceholder() ? null : (
                        flexRender(cell.column.columnDef.cell, cell.getContext())
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
