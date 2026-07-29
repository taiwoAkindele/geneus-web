import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, ChoiceChip, Icon, Sheet, ToggleSwitch, useToast } from "@/ui";
import {
  CATEGORIES,
  FIELD_TYPES,
  isChoice,
  RegisterField,
  type FieldType,
  type RegisterDraft,
  type RegisterFieldType,
  typeDef,
  uid,
  useRegisters,
} from "@/features/registers";

const labelInput =
  "w-full rounded-[9px] border-[1.5px] border-outline bg-white px-3 py-2.5 text-[15px] font-semibold text-ink outline-none focus:border-2 focus:border-brand placeholder:text-ink-muted";

/** Register builder — define fields, watch the live preview, then publish (PRD §9.4). */
export const RegisterBuilderScreen = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { id } = useParams();
  const editingId = id ?? null;
  const { getById, publish } = useRegisters();

  const [draft, setDraft] = useState<RegisterDraft>(() => {
    if (id) {
      const r = getById(id);
      if (r)
        return {
          name: r.name,
          category: r.category,
          description: r.description,
          fields: r.fields.map((f) => ({ ...f, options: f.options ?? [] })),
        };
    }
    return { name: "", category: "General", description: "", fields: [] };
  });

  const [publishing, setPublishing] = useState(false);

  const setFields = (fields: RegisterFieldType[]) =>
    setDraft((d) => ({ ...d, fields }));
  const addField = (type: FieldType) =>
    setFields([
      ...draft.fields,
      {
        id: uid("fld"),
        type,
        label: type === "section" ? "New section" : "",
        required: false,
        help: "",
        options: isChoice(type) ? ["Option 1", "Option 2"] : [],
      },
    ]);
  const updateField = (fid: string, patch: Partial<RegisterFieldType>) =>
    setFields(draft.fields.map((f) => (f.id === fid ? { ...f, ...patch } : f)));
  const changeType = (fid: string, type: FieldType) => {
    const cur = draft.fields.find((f) => f.id === fid);
    const patch: Partial<RegisterFieldType> = { type };
    if (isChoice(type) && !cur?.options?.length)
      patch.options = ["Option 1", "Option 2"];
    updateField(fid, patch);
  };
  const removeField = (fid: string) =>
    setFields(draft.fields.filter((f) => f.id !== fid));
  const moveField = (fid: string, dir: -1 | 1) => {
    const arr = [...draft.fields];
    const i = arr.findIndex((f) => f.id === fid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setFields(arr);
  };
  const addOption = (fid: string) => {
    const f = draft.fields.find((x) => x.id === fid);
    updateField(fid, { options: [...(f?.options ?? []), "New option"] });
  };
  const updateOption = (fid: string, idx: number, val: string) => {
    const f = draft.fields.find((x) => x.id === fid);
    const options = [...(f?.options ?? [])];
    options[idx] = val;
    updateField(fid, { options });
  };
  const removeOption = (fid: string, idx: number) => {
    const f = draft.fields.find((x) => x.id === fid);
    updateField(fid, {
      options: (f?.options ?? []).filter((_, k) => k !== idx),
    });
  };

  const realFields = draft.fields.filter((f) => f.type !== "section");
  const previewName = draft.name.trim() || "Untitled register";

  const openPublish = () => {
    if (draft.fields.length === 0) {
      toast("Add at least one field before publishing");
      return;
    }
    setPublishing(true);
  };
  const confirmPublish = () => {
    publish(draft, editingId);
    setPublishing(false);
    toast(`“${previewName}” published — staff can now record entries`);
    navigate("/registers");
  };

  const MoveButtons = ({ f }: { f: RegisterFieldType }) => (
    <div className="flex flex-none flex-col gap-1">
      <button
        type="button"
        onClick={() => moveField(f.id, -1)}
        aria-label="Move up"
        className="flex h-5 w-6 min-h-0 items-center justify-center rounded-md bg-surface-container text-[11px] font-extrabold text-ink-soft"
      >
        ▲
      </button>
      <button
        type="button"
        onClick={() => moveField(f.id, 1)}
        aria-label="Move down"
        className="flex h-5 w-6 min-h-0 items-center justify-center rounded-md bg-surface-container text-[11px] font-extrabold text-ink-soft"
      >
        ▼
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-surface">
      <div className="w-full px-5 py-4 md:px-8">
        {/* Top bar */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/registers")}
            className="inline-flex items-center gap-1.5 text-[14px] font-bold text-brand"
          >
            <Icon name="back" className="h-4 w-4" /> All registers
          </button>
          <Button
            variant="primary"
            fullWidth={false}
            className="ml-auto px-5"
            onClick={openPublish}
          >
            {editingId ? "Update & publish" : "Publish"}
          </Button>
        </div>

        {/* Register meta */}
        <div className="mt-4 rounded-card border border-outline-soft bg-white p-4 md:p-5">
          <label className="mb-2 block text-[12px] font-bold uppercase tracking-[0.04em] text-brand-strong">
            Register name
          </label>
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="e.g. Antenatal (ANC) Register"
            className="w-full border-0 border-b-2 border-outline-soft bg-transparent pb-2.5 pt-1 text-[24px] font-extrabold tracking-[-0.02em] text-ink outline-none focus:border-brand placeholder:text-ink-muted"
          />
          <div className="mt-4">
            <div className="mb-2.5 text-[13px] font-semibold text-ink-soft">
              Category
            </div>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <ChoiceChip
                  key={c}
                  selected={draft.category === c}
                  onClick={() => setDraft((d) => ({ ...d, category: c }))}
                >
                  {c}
                </ChoiceChip>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-2 text-[13px] font-semibold text-ink-soft">
              Description
            </div>
            <textarea
              rows={2}
              value={draft.description}
              onChange={(e) =>
                setDraft((d) => ({ ...d, description: e.target.value }))
              }
              placeholder="What is this register for? When is it filled?"
              className="w-full rounded-[11px] border-[1.5px] border-outline bg-white p-3 text-[15px] leading-relaxed text-ink outline-none focus:border-2 focus:border-brand placeholder:text-ink-muted"
            />
          </div>
        </div>

        {/* Two columns */}
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start">
          {/* LEFT — field builder */}
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[13px] font-bold uppercase tracking-[0.06em] text-ink-muted">
                Fields
              </span>
              <span className="font-mono text-xs text-ink-muted">
                {realFields.length} field{realFields.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {draft.fields.map((f) =>
                f.type === "section" ? (
                  <div
                    key={f.id}
                    className="flex items-center gap-2.5 rounded-[14px] border-[1.5px] border-brand-tint bg-brand-wash px-3 py-3"
                  >
                    <span className="rounded-md bg-brand-tint px-2 py-1 text-[11px] font-extrabold uppercase tracking-[0.06em] text-brand-strong">
                      Section
                    </span>
                    <input
                      value={f.label}
                      onChange={(e) =>
                        updateField(f.id, { label: e.target.value })
                      }
                      placeholder="Section heading"
                      className="min-w-0 flex-1 border-0 bg-transparent text-base font-bold text-ink outline-none placeholder:text-ink-muted"
                    />
                    <MoveButtons f={f} />
                    <button
                      type="button"
                      onClick={() => removeField(f.id)}
                      aria-label="Remove section"
                      className="flex h-8 w-8 min-h-0 flex-none items-center justify-center rounded-lg bg-danger-bg text-danger-strong"
                    >
                      <Icon name="close" className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div
                    key={f.id}
                    className="rounded-[14px] border-[1.5px] border-outline-soft bg-white p-3.5"
                  >
                    <div className="flex items-center gap-2.5">
                      <MoveButtons f={f} />
                      <input
                        value={f.label}
                        onChange={(e) =>
                          updateField(f.id, { label: e.target.value })
                        }
                        placeholder="Field label"
                        className={labelInput}
                      />
                      <button
                        type="button"
                        onClick={() => removeField(f.id)}
                        aria-label="Remove field"
                        className="flex h-8 w-8 min-h-0 flex-none items-center justify-center rounded-lg bg-danger-bg text-danger-strong"
                      >
                        <Icon name="close" className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-3">
                      <select
                        value={f.type}
                        onChange={(e) =>
                          changeType(f.id, e.target.value as FieldType)
                        }
                        className="rounded-[9px] border-[1.5px] border-outline bg-white px-3 py-2.5 text-[13px] font-semibold text-ink-soft outline-none"
                      >
                        {FIELD_TYPES.map((t) => (
                          <option key={t.type} value={t.type}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-soft">
                        <ToggleSwitch
                          checked={Boolean(f.required)}
                          ariaLabel="Required"
                          onChange={(v) => updateField(f.id, { required: v })}
                        />
                        Required
                      </div>
                    </div>

                    {isChoice(f.type) ? (
                      <div className="mt-3 border-t border-dashed border-outline-soft pt-3">
                        <div className="mb-2 text-[12px] font-bold text-ink-muted">
                          Choices
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {(f.options ?? []).map((o, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <span className="h-2 w-2 flex-none rounded-full bg-outline" />
                              <input
                                value={o}
                                onChange={(e) =>
                                  updateOption(f.id, idx, e.target.value)
                                }
                                placeholder="Option"
                                className="min-w-0 flex-1 rounded-[8px] border-[1.5px] border-outline bg-white px-2.5 py-2 text-sm text-ink outline-none focus:border-2 focus:border-brand"
                              />
                              <button
                                type="button"
                                onClick={() => removeOption(f.id, idx)}
                                aria-label="Remove choice"
                                className="flex h-6 w-6 min-h-0 flex-none items-center justify-center rounded-md bg-surface-muted text-danger-strong"
                              >
                                <Icon name="close" className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => addOption(f.id)}
                          className="mt-2 min-h-0 text-[13px] font-bold text-brand"
                        >
                          ＋ Add choice
                        </button>
                      </div>
                    ) : null}

                    <input
                      value={f.help ?? ""}
                      onChange={(e) =>
                        updateField(f.id, { help: e.target.value })
                      }
                      placeholder="Helper text (optional)"
                      className="mt-2.5 w-full border-0 border-b border-outline-soft bg-transparent py-1.5 text-[13px] text-ink-muted outline-none focus:border-brand placeholder:text-ink-muted"
                    />
                  </div>
                ),
              )}

              {draft.fields.length === 0 ? (
                <div className="rounded-[14px] border border-dashed border-outline p-6 text-center text-sm text-ink-muted">
                  No fields yet. Add one from the palette below.
                </div>
              ) : null}
            </div>

            {/* Palette */}
            <div className="mt-3.5 rounded-[14px] border border-brand-tint bg-brand-wash p-3.5">
              <div className="mb-2.5 text-[12px] font-bold uppercase tracking-[0.04em] text-brand-strong">
                Add a field
              </div>
              <div className="flex flex-wrap gap-2">
                {FIELD_TYPES.map((t) => (
                  <button
                    key={t.type}
                    type="button"
                    onClick={() => addField(t.type)}
                    className="flex min-h-0 items-center gap-1.5 rounded-[10px] border-[1.5px] border-outline bg-white px-3 py-2 text-[13px] font-semibold text-ink-soft"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-tint font-mono text-[11px] font-extrabold text-brand">
                      {t.glyph}
                    </span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT — live preview */}
          <div className="lg:sticky lg:top-4 lg:w-[360px] lg:flex-none">
            <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.06em] text-ink-muted">
              Live preview
            </div>
            <div className="overflow-hidden rounded-card border border-outline-soft bg-white">
              <div className="bg-brand px-4 py-4 text-white">
                <div className="text-[11px] uppercase tracking-[0.04em] text-brand-accent-soft">
                  {draft.category} · New entry
                </div>
                <div className="mt-0.5 text-[18px] font-extrabold tracking-[-0.02em]">
                  {previewName}
                </div>
              </div>
              <div className="flex flex-col gap-4 p-4">
                {draft.fields.length > 0 ? (
                  draft.fields.map((f) => (
                    <RegisterField key={f.id} field={f} preview />
                  ))
                ) : (
                  <div className="py-4 text-center text-sm text-ink-muted">
                    Your register form appears here as you add fields.
                  </div>
                )}
                {draft.fields.length > 0 ? (
                  <div className="mt-1 rounded-[11px] bg-brand py-3 text-center text-[15px] font-bold text-white">
                    Save entry
                  </div>
                ) : null}
              </div>
            </div>
            <p className="mt-3 pb-24 text-xs leading-relaxed text-ink-muted lg:pb-0">
              This is exactly what staff see when they add an entry. Once
              published, edits create a new version so historical entries stay
              intact.
            </p>
          </div>
        </div>
      </div>

      {publishing ? (
        <Sheet
          onClose={() => setPublishing(false)}
          eyebrow="Review before publishing"
          title={previewName}
        >
          <p className="text-[13px] text-ink-muted">
            {realFields.length} field{realFields.length === 1 ? "" : "s"} ·{" "}
            {draft.category} ·{" "}
            {editingId ? "updating existing register" : "new register"}
          </p>
          <div className="mt-3 overflow-hidden rounded-[14px] border border-outline-soft">
            {draft.fields.map((f) => {
              const section = f.type === "section";
              return (
                <div
                  key={f.id}
                  className="flex items-center gap-2.5 border-b border-outline-soft px-3.5 py-2.5 last:border-0"
                >
                  <span
                    className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-bold ${section ? "bg-brand-tint text-brand" : "bg-surface-container text-ink-soft"}`}
                  >
                    {typeDef(f.type).label}
                  </span>
                  <span className="flex-1 text-sm font-medium text-ink">
                    {f.label || "(unlabelled)"}
                  </span>
                  {f.required && !section ? (
                    <span className="text-[11px] font-bold text-danger">
                      Required
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Button
              variant="primary"
              fullWidth={false}
              className="flex-1"
              onClick={confirmPublish}
            >
              Publish register
            </Button>
            <Button
              variant="outlined"
              fullWidth={false}
              className="px-5"
              onClick={() => setPublishing(false)}
            >
              Keep editing
            </Button>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
};
