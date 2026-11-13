import { IMPORT_LIMITS } from '@shared';
import { TableFileError, type ParsedWorkbook } from './parseWorkbook';

export type TableFile = ParsedWorkbook & { fileName: string; byteSize: number; sha256: string };
const PARSE_TIMEOUT_MS = 20_000;
const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Reads a chosen .xlsx or .csv in a worker with a time limit. The file never
 * leaves the device: only the rows a person confirms are sent, with the file's
 * name and checksum for the audit trail.
 */
export const readTableFile = async (file: File): Promise<TableFile> => {
  if (file.size > IMPORT_LIMITS.maxFileBytes) throw new TableFileError(`Choose a file up to ${Math.round(IMPORT_LIMITS.maxFileBytes / 1024 / 1024)} MB`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = hex(await crypto.subtle.digest('SHA-256', bytes));
  const worker = new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' });
  try {
    const workbook = await new Promise<ParsedWorkbook>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new TableFileError('The file took too long to read. Split it into smaller files')), PARSE_TIMEOUT_MS);
      worker.onmessage = ({ data }: MessageEvent<{ ok: true; workbook: ParsedWorkbook } | { ok: false; message: string }>) => {
        window.clearTimeout(timer);
        if (data.ok) resolve(data.workbook); else reject(new TableFileError(data.message));
      };
      worker.onerror = () => { window.clearTimeout(timer); reject(new TableFileError('The file could not be read')); };
      worker.postMessage({ bytes, fileName: file.name }, [bytes.buffer]);
    });
    return { ...workbook, fileName: file.name, byteSize: file.size, sha256 };
  } finally {
    worker.terminate();
  }
};
