import { useState } from 'react';
import type { Patient } from '@shared';
import { Button, Sheet } from '@/ui';
import { qrcodegen } from '@/lib/qrCode';

/** The QR contains only the facility patient ID, never clinical details or credentials. */
export const PatientCard = ({ patient, facilityName, onClose }: { patient: Patient; facilityName: string; onClose: () => void }) => {
  const [error, setError] = useState('');
  const qr = qrcodegen.QrCode.encodeText(patient.patientId, qrcodegen.QrCode.Ecc.MEDIUM);
  let path = '';
  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.getModule(x, y)) path += `M${x + 4},${y + 4}h1v1h-1z`;
  const print = () => {
    const card = document.getElementById('patient-card-print');
    const popup = window.open('', '_blank', 'width=640,height=650');
    if (!popup || !card) { setError('Allow the print window, then try again'); return; }
    popup.opener = null;
    popup.document.title = 'Geneus patient card';
    popup.document.body.append(card.cloneNode(true));
    popup.focus(); popup.print();
  };
  return <Sheet title="Patient card" onClose={onClose}>
    <div id="patient-card-print" style={{ padding: '24px', border: '1px solid #333', color: '#111', background: '#fff', fontFamily: 'sans-serif', maxWidth: '400px', textAlign: 'center' }}>
      <p style={{ fontSize: '16px', fontWeight: 700 }}>{facilityName}</p>
      <h2 style={{ fontSize: '22px', margin: '12px 0' }}>{patient.fullName}</h2>
      <svg role="img" aria-label="Patient ID QR code" viewBox={`0 0 ${qr.size + 8} ${qr.size + 8}`} width="180" height="180" style={{ margin: '8px auto', display: 'block', background: '#fff' }} shapeRendering="crispEdges"><path d={path} fill="#000" /></svg>
      <p style={{ fontSize: '15px', fontFamily: 'monospace', overflowWrap: 'anywhere' }}>{patient.patientId}</p>
      <p style={{ marginTop: '14px', fontSize: '12px' }}>Bring this card on your next visit. Keep it private.</p>
    </div>
    <p className="my-3 text-sm text-ink-muted">Printing or reprinting a card keeps the same patient ID.</p>
    {error ? <p role="alert" className="my-3 text-sm text-danger">{error}</p> : null}
    <Button onClick={print}>Print patient card</Button>
  </Sheet>;
};
