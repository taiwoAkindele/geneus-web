import { useState } from 'react';
import { PATIENT_ID_RE } from '@shared';

type Detector = { detect: (source: ImageBitmap) => Promise<{ rawValue: string }[]> };
type BarcodeConstructor = new (options: { formats: string[] }) => Detector;

/** Camera/photo scan where the browser supports it; manual ID entry always remains available. */
export const ScanPatientCard = ({ onRead }: { onRead: (id: string) => void }) => {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const scan = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setMessage('This photo is too large. Use a smaller photo or enter the Patient ID.'); return; }
    const DetectorClass = (globalThis as unknown as { BarcodeDetector?: BarcodeConstructor }).BarcodeDetector;
    if (!DetectorClass) { setMessage('This browser cannot scan QR codes. Enter the full Patient ID printed on the card.'); return; }
    setBusy(true); setMessage('');
    let image: ImageBitmap | undefined;
    try {
      image = await createImageBitmap(file, { resizeWidth: 1200 });
      const results = await new DetectorClass({ formats: ['qr_code'] }).detect(image);
      const id = results.map((r) => r.rawValue.trim().toUpperCase()).find((value) => PATIENT_ID_RE.test(value));
      if (id) onRead(id); else setMessage('No readable Geneus patient ID was found. Retake the photo or type the full ID.');
    } catch { setMessage('The card could not be scanned. Try another photo or enter its full ID.'); }
    finally { image?.close(); setBusy(false); }
  };
  if (!(globalThis as unknown as { BarcodeDetector?: BarcodeConstructor }).BarcodeDetector) return <p className="text-xs text-ink-muted">To use a patient card, enter its full Patient ID. Camera scanning is unavailable in this browser.</p>;
  return <div className="space-y-2">
    <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-field border border-outline bg-white px-4 text-sm font-bold">{busy ? 'Reading card…' : 'Scan patient card'}<input aria-label="Scan patient card" type="file" accept="image/*" capture="environment" disabled={busy} className="sr-only" onChange={(event) => { void scan(event.target.files?.[0]); event.target.value = ''; }} /></label>
    {message ? <p role="status" className="text-sm text-ink-muted">{message}</p> : null}
  </div>;
};
