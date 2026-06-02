'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const state: Record<string, boolean> = {};
    for (const url of new Set(data.map(r => r.url))) {
      state[`url:${url}`] = true;
    }
    return state;
  });
  const [grouping, setGrouping] = useState<string[]>(['url', 'error']);

  // Horizontal-scroll affordance: track whether more content exists to the
  // left/right of the framed viewport so we can show edge shadows only when
  // there's actually somewhere to scroll.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollShadows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateScrollShadows();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateScrollShadows);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateScrollShadows, data, expanded, grouping]);

  const columns = [
    columnHelper.accessor('url', {
      header: 'URL',
      cell: info => {
        // Fold the page "action" (e.g. clicked "View gallery") in as context
        // beneath the URL, since it describes the page state, not a violation.
        const actions = Array.from(
          new Set(info.row.getLeafRows().map(r => r.original.action).filter(Boolean))
        );
        return (
          <div className="break-all">
            <div>{info.getValue()}</div>
            {actions.map(action => (
              <div key={action} className="mt-0.5 font-normal text-gray-500 dark:text-gray-400">
                {action}
              </div>
            ))}
          </div>
        );
      },
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
      cell: info => <div className="font-mono  break-all">{info.getValue()}</div>,
    }),
    columnHelper.accessor('selector', {
      header: 'Selector',
      cell: info => <div className="font-mono  break-all">{info.getValue()}</div>,
    }),
    columnHelper.accessor('fix', {
      header: 'Fix',
      cell: info => <div className="max-w-[200px]  break-words">{info.getValue()}</div>,
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
    autoResetExpanded: false,
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
      <span className="ml-1  font-bold bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded-full inline-flex items-center">
        {row.subRows.length}
      </span>
    </button>
  );

  // For a collapsed group, summarize a node-level column across its leaf rows.
  // If every leaf shares the value it's a real shared fact (e.g. WCAG) and is
  // shown plainly; if values differ (e.g. Element, or a Fix whose failure
  // summary varies per element) the first is shown as a muted sample with a
  // "+N more" affordance, so a sample never masquerades as the whole set.
  const renderAggregatedPreview = (row: any, columnId: string) => {
    const values: string[] = row
      .getLeafRows()
      .map((r: any) => String(r.original[columnId] ?? ''));
    const first = values.find(Boolean);
    if (!first) return null;

    const uniform = values.every(v => v === first);
    const mono = columnId === 'element' || columnId === 'selector';

    if (uniform) {
      // No "+N more" affordance here, so show the full value (no truncation).
      return (
        <div className={mono ? 'font-mono break-all' : 'break-words'} title={first}>
          {first}
        </div>
      );
    }
    return (
      <div className="text-gray-500 dark:text-gray-400">
        <div className={`truncate ${mono ? 'font-mono' : ''}`} title={first}>{first}</div>
        <div className=" mt-0.5">+{values.length - 1} more</div>
      </div>
    );
  };

  // Render a single cell's content
  const renderCellContent = (cell: any, row: any) => {
    if (cell.getIsGrouped()) return renderGroupButton(row, cell);
    if (cell.getIsAggregated()) return renderAggregatedPreview(row, cell.column.id);
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
    // Framed scroll region: overflow is contained here (not the page), and the
    // region is keyboard-focusable so it can be scrolled without a pointer.
    <div className="relative rounded-lg border-2 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900">
      {/* Edge shadows hint that more columns exist off-screen; shown only when
          there is content to scroll toward in that direction. */}
      <div
        className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-6 rounded-l-md bg-gradient-to-r from-black/15 to-transparent transition-opacity dark:from-black/40 ${canScrollLeft ? 'opacity-100' : 'opacity-0'}`}
      />
      <div
        className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-6 rounded-r-md bg-gradient-to-l from-black/15 to-transparent transition-opacity dark:from-black/40 ${canScrollRight ? 'opacity-100' : 'opacity-0'}`}
      />
      <div
        ref={scrollRef}
        onScroll={updateScrollShadows}
        tabIndex={0}
        className="overflow-x-auto rounded-md focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-500"
      >
        <table className="w-full min-w-[1000px] table-fixed text-left text-sm text-gray-900 dark:text-gray-100">
          <thead className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-b border-gray-300 dark:border-gray-700">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} className="divide-x divide-gray-300 dark:divide-gray-700">
                {headerGroup.headers.map(header => (
                  <th key={header.id} className="px-4 py-3 font-semibold whitespace-nowrap w-[calc(100%/6)]">
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
    </div>
  );
}
