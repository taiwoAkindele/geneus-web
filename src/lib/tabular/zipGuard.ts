/**
 * Checks an .xlsx (a zip archive) from its central directory before any of it
 * is decompressed: too many parts, too much uncompressed data, an extreme
 * compression ratio (a "zip bomb"), encryption, zip64, or macros are refused.
 * The directory can lie about sizes, so this is one layer: parsing also runs
 * in a worker that is stopped after a time limit.
 */
export type ZipLimits = { maxEntries: number; maxUncompressedBytes: number; maxRatio: number };
export const ZIP_LIMITS: ZipLimits = { maxEntries: 2_000, maxUncompressedBytes: 40 * 1024 * 1024, maxRatio: 150 };

export type ZipCheck = { ok: true; entries: number; uncompressedBytes: number } | { ok: false; reason: string };

const EOCD = 0x06054b50, CENTRAL = 0x02014b50;

export const isZip = (bytes: Uint8Array) => bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
/** Old binary Excel (.xls) and password-protected workbooks are OLE compound files. */
export const isCompoundFile = (bytes: Uint8Array) => bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;

export const inspectZip = (bytes: Uint8Array, limits: ZipLimits = ZIP_LIMITS): ZipCheck => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) if (view.getUint32(i, true) === EOCD) { end = i; break; }
  if (end < 0) return { ok: false, reason: 'The file is damaged or is not an Excel workbook' };
  const total = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true), offset = view.getUint32(end + 16, true);
  if (total === 0xffff || size === 0xffffffff || offset === 0xffffffff) return { ok: false, reason: 'This workbook is too large to import' };
  if (total > limits.maxEntries) return { ok: false, reason: 'This workbook has too many parts to import' };
  if (offset + size > end) return { ok: false, reason: 'The file is damaged or is not an Excel workbook' };
  let at = offset, uncompressed = 0;
  for (let n = 0; n < total; n++) {
    if (at + 46 > end || view.getUint32(at, true) !== CENTRAL) return { ok: false, reason: 'The file is damaged or is not an Excel workbook' };
    const flags = view.getUint16(at + 8, true), compressedSize = view.getUint32(at + 20, true), uncompressedSize = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true), extraLength = view.getUint16(at + 30, true), commentLength = view.getUint16(at + 32, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength)).toLowerCase();
    if (flags & 0x1) return { ok: false, reason: 'This workbook is password-protected. Save an unprotected copy to import it' };
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) return { ok: false, reason: 'This workbook is too large to import' };
    if (name.endsWith('vbaproject.bin')) return { ok: false, reason: 'Workbooks with macros are not accepted. Save it as a plain .xlsx workbook' };
    if (uncompressedSize > 1024 * 1024 && uncompressedSize / Math.max(compressedSize, 1) > limits.maxRatio) return { ok: false, reason: 'This workbook expands to an unsafe size and was not opened' };
    uncompressed += uncompressedSize;
    if (uncompressed > limits.maxUncompressedBytes) return { ok: false, reason: 'This workbook expands to an unsafe size and was not opened' };
    at += 46 + nameLength + extraLength + commentLength;
  }
  return { ok: true, entries: total, uncompressedBytes: uncompressed };
};

/**
 * Proves the sizes the directory declares by actually decompressing every
 * part, as a stream, and stopping the moment one produces more than it
 * declared or the total passes the limit. Only after this does a parser see
 * the workbook, so decompression a file lies about is cut off, not trusted.
 * Unknown compression methods, encrypted parts and inconsistent headers are refused.
 */
export const verifyZipInflation = async (bytes: Uint8Array, limits: ZipLimits = ZIP_LIMITS): Promise<ZipCheck> => {
  const declared = inspectZip(bytes, limits);
  if (!declared.ok) return declared;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) if (view.getUint32(i, true) === EOCD) { end = i; break; }
  const total = view.getUint16(end + 10, true), offset = view.getUint32(end + 16, true);
  let at = offset, produced = 0;
  const damaged = { ok: false as const, reason: 'The file is damaged or is not an Excel workbook' };
  for (let n = 0; n < total; n++) {
    const method = view.getUint16(at + 10, true), compressedSize = view.getUint32(at + 20, true), declaredSize = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true), extraLength = view.getUint16(at + 30, true), commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    at += 46 + nameLength + extraLength + commentLength;
    if (local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50) return damaged;
    const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (dataStart + compressedSize > bytes.length) return damaged;
    const data = bytes.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) { if (compressedSize !== declaredSize) return damaged; produced += declaredSize; continue; }
    if (method !== 8) return { ok: false, reason: 'This workbook uses a compression Geneus does not open' };
    const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    let entry = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        entry += value.byteLength; produced += value.byteLength;
        if (entry > declaredSize || produced > limits.maxUncompressedBytes) { await reader.cancel(); return { ok: false, reason: 'This workbook expands to an unsafe size and was not opened' }; }
      }
    } catch { return damaged; }
    if (entry !== declaredSize) return damaged;
  }
  return { ok: true, entries: total, uncompressedBytes: produced };
};
