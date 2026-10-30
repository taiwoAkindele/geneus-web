import { useState } from 'react';
import type { InvestigationItem } from '@shared';
import { useDeviceContext, useLiveQuery } from '@/data';
import { loadInvestigationCatalogue, selectInvestigation } from '@/data/repos/investigations';
import { Button, TextField } from '@/ui';
import { formatMoney } from '@/lib/money';

export const InvestigationPicker = ({ items, onChange }: { items: InvestigationItem[]; onChange: (items: InvestigationItem[]) => void }) => {
  const { facility } = useDeviceContext();
  const catalogue = useLiveQuery(loadInvestigationCatalogue);
  const [search, setSearch] = useState('');
  const [custom, setCustom] = useState('');
  const matching = catalogue.data?.items.filter(({ definition, offering }) => `${offering.name} ${definition.investigation?.department} ${definition.investigation?.aliases.join(' ')}`.toLowerCase().includes(search.toLowerCase())) ?? [];
  return <div className="space-y-4">
    <TextField label="Search facility investigations" type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
    {catalogue.loading ? <p role="status">Loading investigations…</p> : catalogue.error ? <div role="alert">{catalogue.error.message}<Button variant="outlined" onClick={catalogue.reload}>Retry</Button></div> : !matching.length ? <p>No available investigations match. Ask the facility administrator to configure its catalogue.</p> : <ul className="max-h-80 space-y-2 overflow-y-auto">{matching.slice(0, 50).map((row) => {
      const selected = items.some((i) => i.offeringId === row.offering.id);
      return <li key={row.offering.id} className="flex items-center justify-between gap-3 rounded-field border border-outline-soft p-3"><div><strong>{row.offering.name}</strong><p className="text-sm text-ink-soft">{row.definition.investigation?.department} · {row.definition.investigation?.specimen}</p><p>{row.fee ? formatMoney(row.fee.amountMinor, row.fee.currency) : 'Price not configured'}</p></div><Button variant="outlined" fullWidth={false} disabled={selected} onClick={() => onChange([...items, selectInvestigation(row)])}>{selected ? 'Added' : 'Add'}</Button></li>;
    })}</ul>}
    {facility?.allowCustomInvestigations ? <div className="space-y-2"><TextField label="Unlisted investigation request" value={custom} onChange={(e) => setCustom(e.target.value)} /><Button variant="outlined" disabled={!custom.trim()} onClick={() => { onChange([...items, { id: `order_item:${crypto.randomUUID()}`, name: custom.trim(), custom: true, priority: 'routine' }]); setCustom(''); }}>Add unpriced request</Button></div> : null}
    <div><h3 className="font-bold">Selected investigations ({items.length})</h3>{items.map((item) => <div key={item.id} className="flex items-center justify-between gap-2 border-b border-outline-soft py-2"><div>{item.name}<p className="text-sm">{item.priceMinor === undefined ? 'Price pending review' : formatMoney(item.priceMinor, item.currency!)}</p></div><Button variant="ghost" fullWidth={false} onClick={() => onChange(items.filter((i) => i.id !== item.id))}>Remove</Button></div>)}</div>
    <p className="text-sm text-ink-soft">Prices reflect the facility catalogue last received on this device. Orders and charges are created only when signed. Unpriced requests need review.</p>
  </div>;
};
