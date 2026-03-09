"use client";

import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Props {
  rows: Record<string, unknown>[];
}

export default function DataTable({ rows }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo(
    () =>
      Object.keys(rows[0] ?? {}).map((key) => ({
        accessorKey: key,
        header: key,
      })),
    [rows]
  );

  // TanStack Table returns non-memoizable callbacks; React Compiler intentionally skips this hook.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const renderSortMark = (sorted: false | "asc" | "desc") => {
    if (sorted === "asc") return " ^";
    if (sorted === "desc") return " v";
    return "";
  };

  return (
    <div className="max-h-80 overflow-auto rounded-xl border border-border/90 bg-background shadow-[0_12px_30px_-22px_rgba(25,25,25,0.45)]">
      <Table>
        <TableHeader className="sticky top-0 z-10 [&_tr]:border-b-0">
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="hover:bg-transparent">
              {hg.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className="cursor-pointer select-none whitespace-nowrap bg-[#191919] px-3 text-xs font-semibold uppercase tracking-wide text-[#F5F5F5]"
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {renderSortMark(header.column.getIsSorted())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody className="[&_tr:nth-child(even)]:bg-muted/35">
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="whitespace-nowrap px-3 py-2.5 text-sm text-foreground">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
