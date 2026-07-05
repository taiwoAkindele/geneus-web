import { useState } from 'react';
import {
  AppBar,
  Banner,
  Button,
  Card,
  ChoiceChip,
  PatientIdToken,
  SegmentedControl,
  StatusPill,
  TextField,
  SelectField,
} from '@/ui';

/**
 * Foundations showcase — a living reference for the Geneus design system
 * (mirrors section 01 of the design file) and the visual smoke-test for every
 * shared primitive. Not a product screen; it renders the tokens + components so
 * regressions in the foundation are obvious at a glance.
 */
const COLORS: { name: string; hex: string; text?: string }[] = [
  { name: 'Primary', hex: '#00502e' },
  { name: 'Primary strong', hex: '#006b3f' },
  { name: 'Mint', hex: '#8af5b4', text: '#00502e' },
  { name: 'Tint', hex: '#dcefe2', text: '#00502e' },
  { name: 'Slate', hex: '#394750' },
  { name: 'Amber', hex: '#8a5a00' },
  { name: 'Error', hex: '#ba1a1a' },
  { name: 'Surface', hex: '#f8f9fa', text: '#191c1d' },
];

function SectionLabel({ children }: { children: string }) {
  return (
    <h3 className="mb-4 text-[13px] font-bold uppercase tracking-[0.14em] text-ink-muted">
      {children}
    </h3>
  );
}

export function FoundationsScreen() {
  const [sex, setSex] = useState<'F' | 'M'>('F');
  const [role, setRole] = useState('CHEW');

  return (
    <div className="min-h-screen bg-surface-container">
      <AppBar title="Geneus Health — Foundations" right={<StatusPill status="synced" />} />

      {/* Same UI at every width — Tailwind md: utilities reflow the single
          mobile column into a multi-column masonry on wider screens. */}
      <main className="mx-auto max-w-md space-y-10 p-5 pb-24 md:max-w-5xl md:columns-2 md:gap-6 md:space-y-0 md:p-10 md:[&>section]:mb-6 md:[&>section]:break-inside-avoid lg:max-w-6xl lg:columns-3">
        {/* Type */}
        <section>
          <SectionLabel>Typography</SectionLabel>
          <Card className="space-y-3">
            <div className="text-[40px] font-extrabold leading-none tracking-[-0.03em]">
              Display 40
            </div>
            <div className="text-[26px] font-bold tracking-[-0.02em]">Heading 26</div>
            <div className="text-lg font-semibold">Title 18</div>
            <div className="text-base text-ink-soft">Body 16 — legible in the sun.</div>
            <div className="text-[13px] font-semibold text-ink-muted">Label 13</div>
            <div className="pt-1 font-mono text-2xl font-semibold text-brand">OOE-PHC-000047-K2</div>
          </Card>
        </section>

        {/* Color */}
        <section>
          <SectionLabel>Color tokens</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            {COLORS.map((c) => (
              <div
                key={c.name}
                className="overflow-hidden rounded-card border border-outline-hair bg-white"
              >
                <div className="h-16" style={{ background: c.hex }} />
                <div className="px-3 py-2">
                  <div className="text-[13px] font-bold">{c.name}</div>
                  <div className="font-mono text-[11px] text-ink-muted">{c.hex}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Buttons */}
        <section>
          <SectionLabel>Buttons — 52px min height</SectionLabel>
          <div className="space-y-3">
            <Button variant="primary">Save &amp; continue</Button>
            <Button variant="secondary">Secondary action</Button>
            <Button variant="outlined">Outlined</Button>
            <div className="flex gap-3">
              <Button variant="ghost">Text</Button>
              <Button variant="danger">Destructive</Button>
            </div>
            <Button variant="danger-outline">End shift now</Button>
          </div>
        </section>

        {/* Inputs */}
        <section>
          <SectionLabel>Inputs</SectionLabel>
          <Card className="space-y-4">
            <TextField label="Full name" defaultValue="Amaka Okoro" name="demo_name" />
            <TextField
              label="Phone number"
              hint="Best way to find a returning patient"
              defaultValue="0803 555 0147"
              name="demo_phone"
            />
            <TextField
              label="Facility code"
              error="This code is already taken"
              defaultValue="OOE-PHC"
              name="demo_code"
            />
            <SelectField
              label="Level of care"
              name="demo_level"
              options={[
                { value: 'primary', label: 'Primary' },
                { value: 'secondary', label: 'Secondary' },
                { value: 'tertiary', label: 'Tertiary' },
              ]}
            />
          </Card>
        </section>

        {/* Segmented + chips */}
        <section>
          <SectionLabel>Choices</SectionLabel>
          <Card className="space-y-5">
            <div>
              <div className="mb-2 text-[13px] font-semibold text-ink-soft">Sex</div>
              <SegmentedControl
                ariaLabel="Sex"
                value={sex}
                onChange={setSex}
                options={[
                  { value: 'F', label: 'F' },
                  { value: 'M', label: 'M' },
                ]}
              />
            </div>
            <div>
              <div className="mb-2 text-[13px] font-semibold text-ink-soft">Role</div>
              <div className="flex flex-wrap gap-2">
                {['CHEW', 'Nurse', 'Doctor', 'Records', 'Admin'].map((r) => (
                  <ChoiceChip key={r} selected={role === r} onClick={() => setRole(r)}>
                    {r}
                    {role === r ? ' ✓' : ''}
                  </ChoiceChip>
                ))}
              </div>
            </div>
          </Card>
        </section>

        {/* Status pills */}
        <section>
          <SectionLabel>Sync &amp; status pills</SectionLabel>
          <div className="flex flex-wrap gap-2.5">
            <StatusPill status="synced" />
            <StatusPill status="pending">Offline — 4 pending</StatusPill>
            <StatusPill status="syncing" />
            <StatusPill status="error">Not yet arrived</StatusPill>
          </div>
        </section>

        {/* Patient ID */}
        <section>
          <SectionLabel>Patient ID token</SectionLabel>
          <PatientIdToken
            id="OOE-PHC-000047-K2"
            parts={[
              { label: 'facility', value: 'OOE-PHC' },
              { label: 'patient #', value: '000047' },
              { label: 'safety code', value: 'K2' },
            ]}
          />
        </section>

        {/* Banner */}
        <section>
          <SectionLabel>Offline banner</SectionLabel>
          <Banner title="Working offline — everything is saved on this device">
            4 records will sync automatically the moment a connection returns. Nothing is lost.
          </Banner>
        </section>
      </main>
    </div>
  );
}
