import { useRef, useState } from 'react';
import { Button, Sheet } from '@/ui';

/**
 * Add an amendment to a locked section (PRD §9.8.3). The original is never
 * touched; the note is appended and logged against the author.
 */
export const AmendSheet = ({ onSave, onClose }: { onSave: (note: string) => Promise<void>; onClose: () => void }) => {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const save = async () => {
    if (busy.current || !note.trim()) return;
    busy.current = true; setSaving(true);
    try { await onSave(note.trim()); }
    finally { busy.current = false; setSaving(false); }
  };
  return (
    <Sheet onClose={onClose} title="Add an amendment" closeDisabled={saving}>
      <p className="mb-4 text-sm leading-relaxed text-ink-muted">
        The original record stays locked and unchanged. Your amendment is appended and logged against your name.
      </p>
      <textarea
        rows={4}
        value={note}
        disabled={saving}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Describe the correction or addition…"
        className="w-full rounded-field border-[1.5px] border-outline bg-white p-3.5 text-[15px] leading-relaxed text-ink outline-none focus:border-2 focus:border-brand placeholder:text-ink-muted"
      />
      <div className="mt-4 space-y-2">
        <Button variant="primary" disabled={!note.trim() || saving} loading={saving} onClick={save}>
          Save amendment
        </Button>
        <Button variant="outlined" disabled={saving} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Sheet>
  );
};
