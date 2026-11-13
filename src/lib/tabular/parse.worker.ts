/// <reference lib="webworker" />
import { parseWorkbookSafely, TableFileError } from './parseWorkbook';

/** Spreadsheet parsing off the main thread, so a large or hostile file cannot freeze the app; the caller stops it after a time limit. */
self.onmessage = async (event: MessageEvent<{ bytes: Uint8Array; fileName: string }>) => {
  try {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ ok: true, workbook: await parseWorkbookSafely(event.data.bytes, event.data.fileName) });
  } catch (cause) {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ ok: false, message: cause instanceof TableFileError ? cause.message : 'The file could not be read' });
  }
};
