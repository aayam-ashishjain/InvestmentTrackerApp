import React from 'react';
import { Download } from 'lucide-react';
import { CsvColumn, downloadCsv } from '../utils/csvExport';

interface CsvExportButtonProps<T> {
  fileName: string;
  records: T[];
  columns: CsvColumn<T>[];
  label?: string;
}

export function CsvExportButton<T>({ fileName, records, columns, label = 'Export CSV' }: CsvExportButtonProps<T>) {
  return (
    <button
      type="button"
      onClick={() => downloadCsv(fileName, records, columns)}
      disabled={records.length === 0}
      className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-cyan-700 hover:bg-slate-800 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
      title={`Download ${records.length} rows as CSV`}
      aria-label={`${label} (${records.length} rows)`}
    >
      <Download className="h-3.5 w-3.5" />
      <span>{label}</span>
    </button>
  );
}
