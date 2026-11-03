import type { ReactNode } from 'react';
import { RESULT_FLAG_LABELS, formatRange, type DocumentFile, type LabReport, type ReportValue, type ResultFlag } from '@shared';
import { factsLabel } from './labEntry';

const FLAG_STYLE: Record<ResultFlag, string> = {
  normal: 'bg-brand-wash text-brand', abnormal: 'bg-amber-bg text-amber-text', high: 'bg-amber-bg text-amber-text', low: 'bg-amber-bg text-amber-text',
  borderline: 'bg-amber-bg text-amber-text', inconclusive_repeat: 'bg-surface text-ink', critically_high: 'bg-danger-bg text-danger-strong', critically_low: 'bg-danger-bg text-danger-strong',
};
const ARROW: Partial<Record<ResultFlag, string>> = { high: '↑', critically_high: '↑↑', low: '↓', critically_low: '↓↓' };
export const FlagTag = ({ flag }: { flag?: ResultFlag }) => flag
  ? <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${FLAG_STYLE[flag]}`}>{ARROW[flag] ? <span aria-hidden="true">{ARROW[flag]}</span> : null}{RESULT_FLAG_LABELS[flag]}</span>
  : <span className="text-ink-soft">—</span>;

const tabular = (value: ReportValue) => value.kind === 'number' || value.kind === 'choice' || value.kind === 'text';
const shown = (value: ReportValue) => value.kind === 'number' ? String(value.value) : value.kind === 'choice' ? value.answer : value.kind === 'text' ? value.text : '';

/** How many values were recorded and how many the scientist flagged, for the publish confirmation. */
export const reportCounts = (report: LabReport) => {
  const values = report.items.flatMap((item) => item.values);
  return { values: values.length, flagged: values.filter((value) => 'flag' in value && value.flag).length };
};

/**
 * A lab report exactly as it is published: each test's values with the range that
 * applied to this patient and any flag the scientist chose. Everything shown comes
 * from the report itself, so it reads the same whatever later template changes.
 */
export const LabReportView = ({ report, heading, status, enteredBy, onOpenFile, openingFile }: { report: LabReport; heading: string; status: ReactNode; enteredBy?: string; onOpenFile?: (file: DocumentFile) => void; openingFile?: string }) =>
  <article aria-label={heading} className="space-y-5 rounded-card border border-outline-soft p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-brand pb-3"><p className="text-xs font-bold text-brand">{heading}</p>{status}</div>
    {report.items.map((item) => {
      const rows = item.values.filter(tabular), other = item.values.filter((value) => !tabular(value));
      return <section key={item.orderItemId ?? item.test} aria-label={item.test} className="space-y-3">
        <h3 className="text-xl font-extrabold">{item.test}</h3>
        {rows.length ? <div className="relative overflow-x-auto rounded-field border border-outline-soft">
          <table className="w-full min-w-[520px] text-left text-sm">
            <caption className="sr-only">{item.test} results</caption>
            <thead className="bg-surface text-xs font-bold text-ink-soft"><tr><th scope="col" className="px-3 py-3">Part</th><th scope="col" className="px-3 py-3">Result</th><th scope="col" className="px-3 py-3">Unit</th><th scope="col" className="px-3 py-3">Normal range</th><th scope="col" className="px-3 py-3">Flag</th></tr></thead>
            <tbody>{rows.map((value) => <tr key={value.key} className="border-t border-outline-soft">
              <th scope="row" className="px-3 py-3 font-semibold">{value.label}</th>
              <td className="whitespace-pre-wrap px-3 py-3 font-bold">{shown(value)}</td>
              <td className="px-3 py-3">{value.kind === 'number' && value.unit ? value.unit : '—'}</td>
              <td className="px-3 py-3">{value.kind === 'number' ? value.range ? formatRange(value.range) : <span className="text-ink-soft">No range set</span> : '—'}</td>
              <td className="px-3 py-3"><FlagTag flag={'flag' in value ? value.flag : undefined} /></td>
            </tr>)}</tbody>
          </table>
        </div> : null}
        {other.map((value) => <div key={value.key} className="space-y-1">
          <p className="text-xs font-bold text-ink-soft">{value.label}</p>
          {value.kind === 'section' ? <p className="whitespace-pre-wrap">{value.text}</p> : null}
          {value.kind === 'images' ? <ul className="space-y-1 text-sm">{value.files.map((file) => <li key={file.id} className="flex flex-wrap items-center gap-2"><span className="min-w-0 break-all">{file.fileName}</span>{onOpenFile ? <button type="button" className="min-h-[44px] px-2 font-bold text-brand disabled:text-ink-muted" disabled={openingFile === file.id} onClick={() => onOpenFile(file)}>{openingFile === file.id ? 'Opening…' : 'Open'}</button> : null}</li>)}</ul> : null}
          {value.kind === 'culture' ? value.growth === 'no_growth' ? <p className="flex items-center gap-2">No growth <FlagTag flag={value.flag} /></p> : <div className="space-y-2">
            <p className="flex items-center gap-2">Growth <FlagTag flag={value.flag} /></p>
            {value.organisms.map((organism) => <div key={organism.name} className="rounded-field border border-outline-soft p-3 text-sm">
              <p className="font-bold">{organism.name}{organism.count ? <span className="font-normal text-ink-soft"> · {organism.count}</span> : null}</p>
              {organism.susceptibility.length ? <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">{organism.susceptibility.map((s) => <div key={s.antibiotic} className="flex justify-between gap-2"><dt className="min-w-0 truncate">{s.antibiotic}</dt><dd className="font-bold">{s.result}</dd></div>)}</dl> : null}
            </div>)}
          </div> : null}
        </div>)}
        {item.comment ? <div className="space-y-1"><p className="text-xs font-bold text-ink-soft">Comment</p><p className="whitespace-pre-wrap">{item.comment}</p></div> : null}
      </section>;
    })}
    <p className="text-xs text-ink-soft">{report.patient.sex || report.patient.age ? `Normal ranges are for a ${factsLabel(report.patient)}.` : 'The patient’s sex and age were not recorded, so no normal ranges are shown.'}{enteredBy ? ` Entered by ${enteredBy}.` : ''}</p>
  </article>;
