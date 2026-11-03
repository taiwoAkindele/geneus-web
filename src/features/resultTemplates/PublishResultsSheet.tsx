import { useState } from 'react';
import type { LabReport } from '@shared';
import { Button, Sheet, SheetCancelButton, Tag } from '@/ui';
import { LabReportView, reportCounts } from './LabReportView';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * The report exactly as it will be published, then a confirmation before it is.
 * Publishing signs and locks the results; corrections are made by amendment.
 */
export const PublishResultsSheet = ({ report, patientName, heading, enteredBy, saving, correcting = false, onPublish, onClose }: {
  report: LabReport; patientName: string; heading: string; enteredBy: string; saving: boolean; correcting?: boolean; onPublish: () => void; onClose: () => void;
}) => {
  const [confirming, setConfirming] = useState(false);
  const { values, flagged } = reportCounts(report), tests = report.items.map((item) => item.test).join(', ');
  return <Sheet title={correcting ? 'Preview corrected report' : 'Preview report'} placement="side" wide onClose={onClose} closeDisabled={saving}>
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">This is how the results will appear to the doctor and on the printed report.</p>
      <LabReportView report={report} heading={heading} status={<Tag tone="amber">Not published</Tag>} enteredBy={enteredBy} />
      <div className="flex flex-wrap gap-2"><SheetCancelButton disabled={saving}>Back to edit</SheetCancelButton><Button fullWidth={false} disabled={saving} onClick={() => setConfirming(true)}>{correcting ? 'Publish correction' : 'Publish results'}</Button></div>
    </div>
    {confirming ? <Sheet title={correcting ? 'Publish this correction?' : 'Publish these results?'} onClose={() => setConfirming(false)} closeDisabled={saving}>
      <div className="space-y-4">
        <div className="space-y-2 text-sm">
          <p><b>{tests}</b> for <b>{patientName}</b>: {plural(values, 'result')}, {flagged} flagged.</p>
          <p>The requesting clinician will be alerted straight away.</p>
          <p>{correcting ? 'The original stays in the visit history beside the correction.' : 'After publishing, the results can’t be edited. Corrections are made by amendment and keep the original.'}</p>
        </div>
        <div className="flex flex-wrap gap-2"><SheetCancelButton disabled={saving}>Cancel</SheetCancelButton><Button fullWidth={false} loading={saving} disabled={saving} onClick={onPublish}>Publish</Button></div>
      </div>
    </Sheet> : null}
  </Sheet>;
};
