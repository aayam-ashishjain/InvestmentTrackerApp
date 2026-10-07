export interface CsvColumn<T> {
  header: string;
  value: (record: T) => unknown;
}

function escapeCsvValue(value: unknown): string {
  const text = value instanceof Date ? value.toISOString() : String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function downloadCsv<T>(fileName: string, records: T[], columns: CsvColumn<T>[]): void {
  const lines = [
    columns.map(column => escapeCsvValue(column.header)).join(','),
    ...records.map(record => columns.map(column => escapeCsvValue(column.value(record))).join(',')),
  ];
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName.toLowerCase().endsWith('.csv') ? fileName : `${fileName}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
