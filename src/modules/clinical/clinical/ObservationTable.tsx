import { useState } from 'react';
import { Button } from '@/ui';
import type { observationHistory } from './clinicalSummary';

const COLUMNS = ['Recorded', 'BP (mmHg)', 'Temp (°C)', 'Pulse (/min)', 'Weight (kg)', 'Height (cm)', 'BMI', 'SpO₂ (%)', 'Resp. (/min)'];
export const ObservationTable = ({ observations, compact = false }: { observations: ReturnType<typeof observationHistory>; compact?: boolean }) => {
  const [limit, setLimit] = useState(10);
  return <details className={compact ? 'text-sm' : 'rounded-card border border-outline-soft bg-white p-4'}>
    <summary className="cursor-pointer font-bold">Vitals across visits · {observations.length}</summary>
    {!observations.length ? <p className="mt-3 text-sm text-ink-muted">No observations recorded.</p> : <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left text-xs">
        <caption className="mb-2 text-left text-ink-muted">Recorded observations, including structured corrections. Units appear in the column headings.</caption>
        <thead><tr>{COLUMNS.map((label) => <th key={label} scope="col" className="whitespace-nowrap p-2">{label}</th>)}</tr></thead>
        <tbody>{observations.slice(0, limit).map((v) => {
          const values = [
            new Date(v.recordedOn).toLocaleString('en-GB'),
            v.systolicMmHg && v.diastolicMmHg ? `${v.systolicMmHg}/${v.diastolicMmHg}` : '—',
            v.temperatureC, v.pulseBpm, v.weightKg, v.heightCm, v.bmi, v.spo2Percent, v.respiratoryRate,
          ];
          return <tr key={v.id} className="border-t border-outline-soft">
            {values.map((value, index) => <td key={index} className="whitespace-nowrap p-2">{value ?? '—'}</td>)}
          </tr>;
        })}</tbody>
      </table>
      {observations.length > limit ? <Button variant="ghost" onClick={() => setLimit((count) => count + 20)}>Show older observations</Button> : null}
    </div>}
  </details>;
};
