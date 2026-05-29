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
      cell: info => <div className="break-all">{info.getValue()}</div>,
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
      cell: info => <div className="font-mono text-xs break-all">{info.getValue()}</div>,
    }),
    columnHelper.accessor('selector', {
      header: 'Selector',
      cell: info => <div className="font-mono text-xs break-all">{info.getValue()}</div>,
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
      className="flex items-start gap-1 font-medium text-blue-700 dark:text-blue-400 hover:underline text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded select-text"
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

  // Count how many actual <tr> elements a row subtree will produce.
  // Collapsed groups and leaf rows each produce 1 <tr>.
  // Expanded groups produce the sum of their children's counts (the group
  // row itself is merged into the first child, so it doesn't add a <tr>).
  const countTrs = (row: any): number => {
    if (!row.getIsGrouped() || !row.getIsExpanded() || row.subRows.length === 0) return 1;
    return row.subRows.reduce((sum: number, child: any) => sum + countTrs(child), 0);
  };

  type PrependCell = {
    key: string;
    rowSpan: number;
    content: React.ReactNode;
    columnId: string;
  };

  // Recursively render a row subtree with compact group expansion.
  // When any group is expanded, its grouped-column cell is inlined into the
  // first descendant leaf/collapsed-group via rowSpan, instead of rendering
  // the group header as its own <tr>.
  //
  // prependCells:     cells to prepend to the FIRST <tr> of this subtree
  //                   (accumulated from ancestor expanded groups).
  // excludeColumnIds: columns already handled by an ancestor's rowSpan —
  //                   these should NOT be rendered in child <td>s.
  const renderSubtree = (
    row: any,
    result: React.ReactNode[],
    prependCells: PrependCell[],
    excludeColumnIds: Set<string>,
  ) => {
    // Terminal case: leaf row, collapsed group, or empty group → single <tr>
    if (!row.getIsGrouped() || !row.getIsExpanded() || row.subRows.length === 0) {
      result.push(
        <tr key={row.id} className={trClass}>
          {prependCells.map(p => (
            <td key={p.key} rowSpan={p.rowSpan > 1 ? p.rowSpan : undefined} className={tdClass}>
              {p.content}
            </td>
          ))}
          {row.getVisibleCells()
            .filter((c: any) => !excludeColumnIds.has(c.column.id))
            .map((cell: any) => (
              <td key={cell.id} className={tdClass}>
                {renderCellContent(cell, row)}
              </td>
            ))}
        </tr>
      );
      return;
    }

    // Expanded group: compact its grouped-column cell into the first child
    const groupColumnId: string = row.groupingColumnId;
    const groupCell = row.getVisibleCells().find((c: any) => c.column.id === groupColumnId);
    const totalTrs = countTrs(row);

    const newPrepend: PrependCell = {
      key: `group-${row.id}`,
      rowSpan: totalTrs,
      content: groupCell ? renderGroupButton(row, groupCell) : null,
      columnId: groupColumnId,
    };

    const childExclude = new Set([...excludeColumnIds, groupColumnId]);

    row.subRows.forEach((child: any, idx: number) => {
      if (idx === 0) {
        // First child inherits all accumulated prepend cells + this group's cell
        renderSubtree(child, result, [...prependCells, newPrepend], childExclude);
      } else {
        // Subsequent children: no prepend cells (covered by ancestor rowSpans)
        renderSubtree(child, result, [], childExclude);
      }
    });
  };

  const buildRows = () => {
    const result: React.ReactNode[] = [];
    const topRows = table.getGroupedRowModel().rows;
    for (const row of topRows) {
      renderSubtree(row, result, [], new Set());
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
