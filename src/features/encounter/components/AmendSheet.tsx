import { useRef, useState } from 'react';
import { Button, Sheet, TextAreaField } from '@/ui';
import { ENCOUNTER_FIELD_HELP } from '../fieldHelp';

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
      <TextAreaField label="Amendment note" name="amendment_note" help={ENCOUNTER_FIELD_HELP.amendment}
        rows={4}
        value={note}
        disabled={saving}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Describe the correction or addition…"
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
