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
import { ChevronDown } from 'lucide-react';
import Button from './Button';

// The shared content box for this section: centred, clamped to the page's
// content width. Exported because the "Violations" heading has to sit on the
// table's left edge, and a hand-copied duplicate would drift the first time one
// of these changed.
//
// Deliberately no min-width. The table's own min-w-6xl is a readability floor
// for five columns, not an alignment rule — leaving it here forced 72rem of
// horizontal scroll onto the heading and the empty state too, which need none
// of it. With the table present it still sets the shared container's width, so
// everything using this class lines up with it anyway.
export const tableWidthClass = 'mx-auto w-full max-w-7xl';

const columnHelper = createColumnHelper<ScanRow>();

// A "page state" is a base URL plus the interaction (click) that produced it.
// The same base URL reached via different clicks is a different DOM, so the
// URL-level grouping key folds in the action to keep those states separate.
// The NUL joiner can't occur in a URL or label, making it collision-free.
const pageGroupKey = (url: string, action: string) => `${url}\u0000${action}`;

export default function ScanTable({ data }: { data: ScanRow[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const state: Record<string, boolean> = {};
    for (const key of new Set(data.map(r => pageGroupKey(r.url, r.action)))) {
      state[`url:${key}`] = true;
    }
    return state;
  });
  const [grouping, setGrouping] = useState<string[]>(['url', 'error']);

  const columns = [
    columnHelper.accessor('url', {
      header: 'URL',
      // Group by page state (base URL + action) so the same URL reached via
      // different clicks forms separate groups instead of one merged row.
      getGroupingValue: row => pageGroupKey(row.url, row.action),
      cell: info => {
        // The grouping value is composite, so derive the display values from the
        // leaf rows. Each page-state group has a single action (folded in here
        // as context beneath the URL, since it describes the page, not a fault).
        const leaves = info.row.getLeafRows();
        const baseUrl = leaves[0]?.original.url ?? String(info.getValue());
        const actions = Array.from(
          new Set(leaves.map(r => r.original.action).filter(Boolean))
        );
        return (
          <div className="break-all">
            <div>{baseUrl}</div>
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
      // WCAG used to be its own column. The criteria are folded in here as pills
      // under the message — the same idiom the URL column uses for its action
      // text: secondary context describing the fault, not a fault of its own.
      // Dropping the column also gives the remaining five a sixth more width.
      cell: info => {
        // 'error' is a grouping column, so this normally renders for a group row
        // and the tags have to come off the leaves. Falls back to the row itself
        // in case the grouping is ever changed and this renders a real leaf.
        const leaves = info.row.getLeafRows();
        const rows = leaves.length ? leaves : [info.row];
        const tags = Array.from(new Set(
          rows.flatMap(r =>
            String(r.original.wcag ?? '').split(',').map(t => t.trim()).filter(Boolean)
          )
        ));
        return (
          <div className="max-w-[200px] break-words">
            <div>{info.getValue()}</div>
            {tags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {/* Names the pills for a screen reader: "wcag412" on its own
                    doesn't say what it is, and the column header now reads
                    "Error". Visually the pill shape carries that meaning. */}
                <span className="sr-only">WCAG criteria:</span>
                {tags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full border border-gray-400 px-2 py-0.5 text-xs font-normal whitespace-nowrap text-gray-700 dark:border-gray-600 dark:text-gray-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      },
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
      <div className={`${tableWidthClass} p-8 text-center text-gray-500 dark:text-gray-400 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-md`}>
        No violations found.
      </div>
    );
  }

  // A group of one has nothing to reveal: isInlinedGroup below keeps it
  // permanently expanded, so its single child already sits on this same <tr>.
  // A chevron would toggle between two identical renderings and a "1" badge
  // would count the row the reader is already looking at, so both are dropped.
  const isSoloGroup = (row: any) => row.getIsGrouped() && row.subRows.length === 1;

  // True when a grouped row's children are rendered inline (its grouped cell
  // rowSpanning them) rather than folded behind a collapsed summary. Solo
  // groups always are; every other group follows the user's expand state.
  const isInlinedGroup = (row: any) =>
    row.getIsGrouped() && row.subRows.length > 0 && (isSoloGroup(row) || row.getIsExpanded());

  // Names a group row's children. One grouping level down from the URL those
  // are errors; below the last grouping level they are the individual
  // violation nodes. Read off `grouping` rather than hardcoded per column, so
  // re-ordering or adding a grouping level keeps the units honest.
  // Takes a count because the toggle labels a *hidden* subset, which is 1 when
  // a group has exactly two children.
  const childUnit = (columnId: string, count: number) => {
    const singular = grouping[grouping.indexOf(columnId) + 1] ?? 'element';
    return count === 1 ? singular : `${singular}s`;
  };

  // Render a grouped cell: the group's label as plain text, with the count
  // itself as the disclosure control beneath it.
  //
  // The label used to be the button. That was wrong three ways: it made a long
  // URL the button's accessible name ("https://app.peerceptiv.com/course/6246
  // 788e-.../teacher_data_dashboard, collapsed, button"), it styled a
  // disclosure as a hyperlink to that page, and it swallowed the URL text into
  // a control so it couldn't be selected without a `select-text` workaround.
  // Splitting them gives the button a short honest name and hands the label
  // back to the reader as text. It also removes the need to special-case a
  // solo group's appearance: every label renders identically, and a solo group
  // is simply a label with no control under it.
  const renderGroupCell = (row: any, cell: any) => {
    // A collapsed group still shows one child inline (renderAggregatedPreview
    // renders a sample in the trailing columns), so the toggle reveals one
    // fewer row than the group holds.
    const hidden = row.subRows.length - 1;

    return (
    <div className="text-left">
      <div className="font-medium">{flexRender(cell.column.columnDef.cell, cell.getContext())}</div>
      {/* A solo group has nothing to disclose (isInlinedGroup keeps it open and
          its one child is already on this row), so it gets no control at all.
          That guarantees `hidden` is at least 1 here — never a "0 more". */}
      {!isSoloGroup(row) && (
        <div className="mt-2">
          {/* ariaExpanded is what makes this a disclosure rather than an
              unlabelled button: without it a screen reader announces no state
              and no hint that activating it reveals anything. (aria-controls is
              deliberately omitted — an expanded group's children are sibling
              <tr>s spanned by this cell, not one container with an id.) */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => row.toggleExpanded()}
            ariaExpanded={row.getIsExpanded()}
          >
            {/* A control, not a statistic: it names the outcome of the click
                rather than reporting a total, leads with the verb, and names
                the unit — what it reveals differs by level, a URL group holds
                errors and an error group holds elements. Both states stay
                verb-led so the label never goes stale against the chevron.
                Known adjacency: a collapsed row can read "Show 5 more elements"
                here while the Element cell beside it reads "+1 more". They
                disagree on purpose — that counts distinct values, this counts
                rows. */}
            {row.getIsExpanded()
              ? `Hide ${hidden} ${childUnit(cell.column.id, hidden)}`
              : `Show ${hidden} more ${childUnit(cell.column.id, hidden)}`}
            {/* Down when collapsed, flipped up when open — the show/hide idiom
                DropdownInput already uses, and the one that matches content
                appearing *below* this control. A right-pointing chevron would
                clash with HistoryList, where it means "navigate to". No
                aria-hidden: lucide adds it to childless icons itself. */}
            <ChevronDown
              size={14}
              className={`shrink-0 transition-transform ${row.getIsExpanded() ? 'rotate-180' : ''}`}
            />
          </Button>
        </div>
      )}
    </div>
    );
  };

  // For a collapsed group, summarize a node-level column across its leaf rows.
  // If every leaf shares the value it's a real shared fact (e.g. WCAG) and is
  // shown plainly; if values differ (e.g. Element, or a Fix whose failure
  // summary varies per element) the first is shown as a muted sample with a
  // "+N more" affordance, so a sample never masquerades as the whole set.
  const renderAggregatedPreview = (row: any, columnId: string) => {
    // Count distinct values, not leaf rows: many nodes can share one value
    // (e.g. every node of an error has the same error text), so "+N more"
    // must reflect how many *distinct* values exist, not how many rows.
    const distinct = Array.from(
      new Set(
        row.getLeafRows().map((r: any) => String(r.original[columnId] ?? '')).filter(Boolean)
      )
    ) as string[];
    const first = distinct[0];
    if (!first) return null;

    const mono = columnId === 'element' || columnId === 'selector';

    if (distinct.length === 1) {
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
        <div className=" mt-0.5">+{distinct.length - 1} more</div>
      </div>
    );
  };

  // A cell standing in for rows the reader can't see yet.
  // Aggregated = non-grouping column on a group row; placeholder = a deeper
  // grouping column (e.g. error) on an ancestor group row (e.g. a collapsed
  // URL). Both summarize the group's leaves rather than showing one of them.
  // Drives both the preview content and the fold marker on the cell's edge, so
  // the two can't drift apart.
  const isSummaryCell = (cell: any) => cell.getIsAggregated() || cell.getIsPlaceholder();

  // Render a single cell's content
  const renderCellContent = (cell: any, row: any) => {
    if (cell.getIsGrouped()) return renderGroupCell(row, cell);
    if (isSummaryCell(cell)) return renderAggregatedPreview(row, cell.column.id);
    return flexRender(cell.column.columnDef.cell, cell.getContext());
  };

  const trClass = "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors divide-x divide-gray-200 dark:divide-gray-800";
  const tdClass = "px-4 py-3 align-top";

  // Heavier bottom edge on exactly the cells that are standing in for hidden
  // rows, so the fold is visible where the folded content is rather than only
  // in the "Show N more" button off to the left. The table is border-collapse
  // (Tailwind preflight), so at the shared edge this 2px replaces the tbody's
  // 1px divide-y instead of stacking with it: the row divider stays hairline
  // under the label columns and thickens under the summarized ones.
  const summaryEdgeClass = "border-b-2 border-b-gray-400 dark:border-b-gray-500";

  // Count how many actual <tr> elements a row subtree will produce.
  // Collapsed groups and leaf rows each produce 1 <tr>.
  // Inlined groups produce the sum of their children's counts (the group
  // row itself is merged into the first child, so it doesn't add a <tr>).
  const countTrs = (row: any): number => {
    if (!isInlinedGroup(row)) return 1;
    return row.subRows.reduce((sum: number, child: any) => sum + countTrs(child), 0);
  };

  type PrependCell = {
    key: string;
    rowSpan: number;
    content: React.ReactNode;
    columnId: string;
  };

  // Recursively render a row subtree with compact group expansion.
  // When any group is inlined, its grouped-column cell is folded into the
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
    if (!isInlinedGroup(row)) {
      result.push(
        <tr key={row.id} className={trClass}>
          {/* These are the grouped URL / Error cells that rowSpan the group, so
              they are headers for the rows they span, not data — <th scope="row">
              lets a screen reader announce the page and rule as context when
              reading a cell further along the row. font-normal/text-left undo the
              UA's bold+centred <th> defaults so this looks identical to the <td>
              it replaces. (A stricter scope="rowgroup" would mean one <tbody>
              per group; that also drops the row divider at group boundaries, so
              it's left as a possible follow-up.) */}
          {prependCells.map(p => (
            <th
              key={p.key}
              scope="row"
              rowSpan={p.rowSpan > 1 ? p.rowSpan : undefined}
              className={`${tdClass} font-normal text-left`}
            >
              {p.content}
            </th>
          ))}
          {row.getVisibleCells()
            .filter((c: any) => !excludeColumnIds.has(c.column.id))
            .map((cell: any) => (
              <td
                key={cell.id}
                className={`${tdClass} ${isSummaryCell(cell) ? summaryEdgeClass : ''}`}
              >
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
      content: groupCell ? renderGroupCell(row, groupCell) : null,
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
    // Framed table region. The table fits its container width — columns share
    // the width and wrap; no horizontal scrolling.

    <table className={`${tableWidthClass} min-w-6xl mb-20 rounded-md border-2 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 table-fixed text-left text-sm text-gray-900 dark:text-gray-100`}>
      {/* Native accessible name for the table — no aria-label needed. Must be
          the first child of <table>. sr-only keeps it off-screen visually. */}
      <caption className="sr-only">
        Accessibility violations, grouped by page and rule
      </caption>
      {/* top-13 (not top-0) because the scroll container is <main>, shared with
          the sticky BackBar above — this pins directly below its 3.25rem bar. */}
      <thead className="sticky top-13 z-10 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-b border-gray-300 dark:border-gray-700">
        {table.getHeaderGroups().map(headerGroup => (
          <tr key={headerGroup.id} className="divide-x divide-gray-300 dark:divide-gray-700">
            {headerGroup.headers.map(header => (
              <th key={header.id} scope="col" className="px-4 py-3 font-semibold whitespace-nowrap w-[calc(100%/5)]">
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

  );
}
