import React from 'react';
import { formatINR } from '../types/database';
import { CsvColumn } from '../utils/csvExport';
import { CsvExportButton } from './CsvExportButton';

interface FinancialYearTreeProps<T> {
  records: T[];
  getKey: (record: T) => string;
  getDate: (record: T) => string;
  getAmount: (record: T) => number;
  renderRecord: (record: T) => React.ReactNode;
  totalLabel: string;
  emptyMessage: string;
  exportFileName?: string;
  exportColumns?: CsvColumn<T>[];
}

interface MonthGroup<T> {
  key: string;
  label: string;
  total: number;
  records: T[];
}

interface YearGroup<T> {
  startYear: number;
  label: string;
  total: number;
  months: Map<number, MonthGroup<T>>;
}

export function FinancialYearTree<T>({
  records,
  getKey,
  getDate,
  getAmount,
  renderRecord,
  totalLabel,
  emptyMessage,
  exportFileName,
  exportColumns,
}: FinancialYearTreeProps<T>) {
  const years = new Map<number, YearGroup<T>>();
  const orderedRecords = [...records].sort((left, right) => getDate(right).localeCompare(getDate(left)));

  orderedRecords.forEach(record => {
    const [year, month] = getDate(record).split('-').map(Number);
    if (!year || !month || month < 1 || month > 12) return;

    const startYear = month >= 4 ? year : year - 1;
    let yearGroup = years.get(startYear);
    if (!yearGroup) {
      yearGroup = {
        startYear,
        label: `FY ${startYear}-${String(startYear + 1).slice(-2)}`,
        total: 0,
        months: new Map(),
      };
      years.set(startYear, yearGroup);
    }

    let monthGroup = yearGroup.months.get(month);
    if (!monthGroup) {
      const date = new Date(Date.UTC(year, month - 1, 1));
      monthGroup = {
        key: `${year}-${String(month).padStart(2, '0')}`,
        label: date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
        total: 0,
        records: [],
      };
      yearGroup.months.set(month, monthGroup);
    }

    const amount = getAmount(record);
    yearGroup.total += amount;
    monthGroup.total += amount;
    monthGroup.records.push(record);
  });

  const orderedYears = [...years.values()].sort((left, right) => right.startYear - left.startYear);
  const total = records.reduce((sum, record) => sum + getAmount(record), 0);

  if (orderedYears.length === 0) {
    return <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-500">{emptyMessage}</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-900/70 bg-emerald-950/30 px-4 py-3">
        <div>
          <span className="text-xs font-semibold uppercase text-emerald-200">{totalLabel}</span>
          <span className="ml-3 font-mono text-sm font-bold text-emerald-300">{formatINR(total)}</span>
        </div>
        {exportFileName && exportColumns && (
          <CsvExportButton fileName={exportFileName} records={records} columns={exportColumns} />
        )}
      </div>
      <div className="space-y-2">
        {orderedYears.map(yearGroup => (
          <details key={yearGroup.startYear} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/40">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-slate-800/50">
              <span className="font-semibold text-white">{yearGroup.label}</span>
              <span className="font-mono text-sm font-bold text-emerald-300">{formatINR(yearGroup.total)}</span>
            </summary>
            <div className="space-y-2 border-t border-slate-800 p-3 sm:p-4">
              {[...yearGroup.months.values()].sort((left, right) => right.key.localeCompare(left.key)).map(monthGroup => (
                <details key={monthGroup.key} className="overflow-hidden rounded-lg border border-slate-800/80 bg-slate-900/60">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 hover:bg-slate-800/50">
                    <span className="text-sm font-medium text-slate-200">{monthGroup.label}</span>
                    <span className="font-mono text-xs font-semibold text-cyan-300">{formatINR(monthGroup.total)}</span>
                  </summary>
                  <div className="divide-y divide-slate-800/70 border-t border-slate-800/80">
                    {monthGroup.records.map(record => (
                      <React.Fragment key={getKey(record)}>{renderRecord(record)}</React.Fragment>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
