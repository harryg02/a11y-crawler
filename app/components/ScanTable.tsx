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

  // Render expand/collapse button for a grouped cell
  const renderGroupButton = (row: any, cell: any) => (
    <button
      onClick={row.getToggleExpandedHandler()}
      style={{ cursor: row.getCanExpand() ? 'pointer' : 'normal' }}
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
  );

  // Render a single cell's content
  const renderCellContent = (cell: any, row: any) => {
    if (cell.getIsGrouped()) return renderGroupButton(row, cell);
    if (cell.getIsAggregated()) return null;
    if (cell.getIsPlaceholder()) return null;
    return flexRender(cell.column.columnDef.cell, cell.getContext());
  };

  const trClass = "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors divide-x divide-gray-200 dark:divide-gray-800";
  const tdClass = "px-4 py-3 align-top";

  // Build table rows with compact URL grouping:
  // When a URL group is expanded, the URL cell shares the first child's <tr>
  // via rowSpan, instead of rendering as its own empty row.
  const buildRows = () => {
    const rows = table.getRowModel().rows;
    const result: React.ReactNode[] = [];
    let i = 0;

    while (i < rows.length) {
      const row = rows[i];

      // Handle URL-level group rows specially
      if (row.getIsGrouped() && row.groupingColumnId === 'url') {
        if (!row.getIsExpanded()) {
          // Collapsed: render as a normal single row
          result.push(
            <tr key={row.id} className={trClass}>
              {row.getVisibleCells().map(cell => (
                <td key={cell.id} className={tdClass}>
                  {renderCellContent(cell, row)}
                </td>
              ))}
            </tr>
          );
          i++;
          continue;
        }

        // Expanded: count all visible descendant rows in the flat list
        let span = 0;
        for (let j = i + 1; j < rows.length && rows[j].depth > 0; j++) {
          span++;
        }

        if (span === 0) {
          // Edge case: expanded but no visible children — render normally
          result.push(
            <tr key={row.id} className={trClass}>
              {row.getVisibleCells().map(cell => (
                <td key={cell.id} className={tdClass}>
                  {renderCellContent(cell, row)}
                </td>
              ))}
            </tr>
          );
          i++;
          continue;
        }

        // Inline the URL cell into the first child row via rowSpan
        const urlCell = row.getVisibleCells().find((c: any) => c.column.id === 'url');

        for (let k = 0; k < span; k++) {
          const childRow = rows[i + 1 + k];
          result.push(
            <tr key={childRow.id} className={trClass}>
              {k === 0 && (
                <td rowSpan={span} className={tdClass}>
                  {urlCell && renderGroupButton(row, urlCell)}
                </td>
              )}
              {childRow.getVisibleCells()
                .filter((c: any) => c.column.id !== 'url')
                .map((cell: any) => (
                  <td key={cell.id} className={tdClass}>
                    {renderCellContent(cell, childRow)}
                  </td>
                ))}
            </tr>
          );
        }

        i += 1 + span;
        continue;
      }

      // Non-URL-group rows (fallback for ungrouped data)
      result.push(
        <tr key={row.id} className={trClass}>
          {row.getVisibleCells().map(cell => (
            <td key={cell.id} className={tdClass}>
              {renderCellContent(cell, row)}
            </td>
          ))}
        </tr>
      );
      i++;
    }

    return result;
  };

  return (
    <div className="overflow-x-auto rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
      <table className="min-w-full text-left text-sm text-gray-900 dark:text-gray-100">
        <thead className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-b border-gray-300 dark:border-gray-700">
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id} className="divide-x divide-gray-300 dark:divide-gray-700">
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
          {buildRows()}
        </tbody>
      </table>
    </div>
  );
}
