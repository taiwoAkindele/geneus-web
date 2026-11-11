import { useRef, useState } from 'react';
import type { DocumentFile, EncounterEntry } from '@shared';
import { readDocumentFile } from '@/data/repos/clinicalDocuments';
import { useAuthorizationContext } from '@/session';
import { Button, Tag } from '@/ui';
import { LabReportView } from './LabReportView';
import { effectiveLabReport } from './reports';
export { effectiveLabReport } from './reports';

const PRINT_STYLE = 'body{font:13px system-ui,sans-serif;color:#111;margin:24px}h3{font-size:18px;margin:16px 0 8px}table{width:100%;border-collapse:collapse;margin:4px 0 12px}th,td{border-bottom:1px solid #ccc;padding:6px;text-align:left;vertical-align:top}caption,.sr-only,button{display:none}p{margin:4px 0;white-space:pre-wrap}dl{display:grid;grid-template-columns:repeat(3,1fr);gap:2px 16px}dl div{display:flex;justify-content:space-between}article>div:first-child{border-bottom:2px solid #111;padding-bottom:8px;display:flex;justify-content:space-between}';

/**
 * A published lab report as the doctor reads it, read-only, with its attached
 * images and a printable copy. Shown wherever the result appears.
 */
export const PublishedLabReport = ({ entry, entries, heading, enteredBy }: { entry: EncounterEntry; entries: readonly EncounterEntry[]; heading: string; enteredBy?: string }) => {
  const context = useAuthorizationContext(), area = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(''), [opening, setOpening] = useState<string>();
  const report = effectiveLabReport(entry, entries);
  if (!report) return null;
  const corrected = report !== entry.labReport;
  const open = async (file: DocumentFile) => {
    setOpening(file.id); setError('');
    // The window opens on the click itself so the browser allows it; the file is read into it afterwards.
    const view = window.open('', '_blank');
    try { const url = URL.createObjectURL(await readDocumentFile(file, context)); if (view) { view.opener = null; view.location.href = url; } else setError('Allow the new window, then try again.'); }
    catch (cause) { view?.close(); setError(cause instanceof Error ? cause.message : 'This file could not be opened'); } finally { setOpening(undefined); }
  };
  const print = () => {
    const popup = window.open('', '_blank', 'width=900,height=700');
    if (!popup || !area.current) { setError('Allow the print window, then try again.'); return; }
    popup.opener = null; popup.document.title = heading;
    const style = popup.document.createElement('style'); style.textContent = PRINT_STYLE;
    popup.document.head.append(style); popup.document.body.append(area.current.cloneNode(true)); popup.focus(); popup.print();
  };
  return <div className="space-y-2">
    <div ref={area}><LabReportView report={report} heading={heading} enteredBy={enteredBy} onOpenFile={(file) => void open(file)} openingFile={opening}
      status={<Tag tone="green">{corrected ? 'Corrected' : 'Published'} {new Date(entry.createdOn).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</Tag>} /></div>
    <div className="flex flex-wrap items-center gap-2"><Button variant="outlined" fullWidth={false} className="px-3 text-sm" onClick={print}>Print report</Button>{error ? <p role="alert" className="text-sm text-danger-strong">{error}</p> : null}</div>
  </div>;
};
