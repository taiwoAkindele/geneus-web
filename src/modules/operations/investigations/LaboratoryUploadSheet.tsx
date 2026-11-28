import { useCallback, useMemo, useRef, useState } from 'react';
import type { ResultTemplate, ServiceDefinition } from '@shared';
import { useLiveQuery } from '@/data';
import { allOfType } from '@/data/db';
import { saveLaboratoryTests, type AddedTests } from '@/lib/api/investigations';
import { downloadExcel, readExcel } from '@/lib/excel';
import { useAuthorizationContext, StaffVerification } from '@/session';
import { Button, SelectField, Sheet, SheetCancelButton, Tag, TextField } from '@/ui';
import {
  LABORATORY_WORKBOOK_HEADERS,
  laboratoryWorkbookRows,
  previewLaboratoryWorkbook,
  type LaboratoryWorkbookRow,
} from './laboratoryWorkbook';

const categories = [
  { value: '', label: 'Select category' },
  { value: 'Billable', label: 'Billable' },
  { value: 'Non-billable', label: 'Non-billable' },
];

const WorkbookRowEditor = ({
  row,
  onApply,
  onCancel,
}: {
  row: LaboratoryWorkbookRow;
  onApply: (row: LaboratoryWorkbookRow) => void;
  onCancel: () => void;
}) => {
  const [pricing, setPricing] = useState(
    categories.find(({ value }) => value.toLowerCase() === row.pricing.toLowerCase())?.value ?? '',
  );
  const [specimens, setSpecimens] = useState(row.specimens.join(' | '));
  const [requirement, setRequirement] = useState(row.requirement);
  const [name, setName] = useState(row.name);
  const [department, setDepartment] = useState(row.department);
  const [templateName, setTemplateName] = useState(row.templateName);

  return (
    <div className="space-y-2 py-2">
      <TextField label="Test name" value={name} onChange={(event) => setName(event.target.value)} />
      <TextField
        label="Lab section"
        value={department}
        onChange={(event) => setDepartment(event.target.value)}
      />
      <TextField
        label="Specimen types"
        value={specimens}
        onChange={(event) => setSpecimens(event.target.value)}
      />
      <SelectField
        label="Specimen requirement"
        value={requirement}
        onChange={(event) => setRequirement(event.target.value)}
        options={[
          { value: '', label: 'One specimen type' },
          { value: 'Any one', label: 'Any one' },
          { value: 'All listed', label: 'All listed' },
        ]}
      />
      <SelectField
        label="Pricing category"
        options={categories}
        value={pricing}
        onChange={(event) => setPricing(event.target.value)}
      />
      <TextField
        label="Result template (optional)"
        value={templateName}
        onChange={(event) => setTemplateName(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="outlined" fullWidth={false} onClick={onCancel}>
          Cancel edit
        </Button>
        <Button
          fullWidth={false}
          onClick={() =>
            onApply({
              ...row,
              name: name.trim(),
              department: department.trim(),
              templateName: templateName.trim(),
              pricing,
              requirement,
              specimens: specimens
                .split('|')
                .map((type) => type.trim())
                .filter(Boolean),
            })
          }
        >
          Apply changes
        </Button>
      </div>
    </div>
  );
};

export const LaboratoryUploadSheet = ({
  templates,
  onClose,
}: {
  templates: ResultTemplate[];
  onClose: () => void;
}) => {
  const context = useAuthorizationContext();
  const definitions = useLiveQuery(
    useCallback(() => allOfType<ServiceDefinition>('service_definition'), []),
  );
  const [rows, setRows] = useState<LaboratoryWorkbookRow[]>([]);
  const [filename, setFilename] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('');
  const [editingLine, setEditingLine] = useState<number>();
  const fileInput = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<AddedTests>();
  const preview = useMemo(
    () => previewLaboratoryWorkbook(rows, definitions.data ?? [], templates),
    [rows, definitions.data, templates],
  );
  const ready = preview.flatMap((entry) => ('input' in entry ? [entry.input] : []));
  const issues = preview.flatMap((entry) => ('issue' in entry ? [entry] : []));
  const drafts = ready.filter((test) => test.catalogue.pricingCategory === 'billable').length;

  const reportError = (cause: unknown) =>
    setError(cause instanceof Error ? cause.message : 'Could not complete this upload');

  const read = async (file: File) => {
    setFilename(file.name);
    setRows([]);
    setResult(undefined);
    setEditingLine(undefined);
    setCategory('');
    setError('');
    setBusy(true);

    try {
      const parsed = laboratoryWorkbookRows(await readExcel(file));

      if (!parsed.length) {
        throw new Error('The workbook contains no test rows');
      }

      setRows(parsed);
    } catch (cause) {
      reportError(cause);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError('');

    try {
      const saved = await saveLaboratoryTests(context, ready);
      setRows([]);
      setResult(saved);
    } catch (cause) {
      reportError(cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title="Bulk upload laboratory tests"
      placement="side"
      onClose={onClose}
      hasUnsavedChanges={rows.length > 0}
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">
          Use the Excel template. Separate multiple specimen types with | and choose Any one or All
          listed.
        </p>
        <Button
          variant="outlined"
          fullWidth={false}
          onClick={() =>
            void downloadExcel('geneus-laboratory-tests.xlsx', 'Tests', [
              LABORATORY_WORKBOOK_HEADERS,
            ]).catch(reportError)
          }
        >
          Download Excel template
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInput}
            aria-label="Excel workbook"
            type="file"
            accept=".xlsx"
            disabled={busy}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void read(file);
              }
              event.target.value = '';
            }}
          />
          <Button
            variant="outlined"
            fullWidth={false}
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            {filename ? 'Choose another workbook' : 'Choose Excel workbook'}
          </Button>
          {filename ? <p className="break-all text-sm text-ink-soft">{filename}</p> : null}
        </div>
        {rows.some((row) => !row.pricing) ? (
          <div className="space-y-2 rounded-field border border-outline-soft p-3">
            <SelectField
              label="Pricing category for blank rows"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              options={categories}
            />
            <Button
              variant="outlined"
              fullWidth={false}
              disabled={!category || busy}
              onClick={() =>
                setRows((current) =>
                  current.map((row) => (row.pricing ? row : { ...row, pricing: category })),
                )
              }
            >
              Apply to blank rows
            </Button>
          </div>
        ) : null}
        {rows.length ? (
          <section className="space-y-2" aria-label="Upload preview">
            <p role="status" className="text-sm font-bold">
              {ready.length - drafts} active · {drafts} need pricing · {issues.length} to correct
            </p>
            {issues.length ? (
              <Button
                variant="outlined"
                fullWidth={false}
                onClick={() =>
                  void downloadExcel('geneus-laboratory-upload-errors.xlsx', 'Row errors', [
                    ['Row', 'Test name', 'Issue'],
                    ...issues.map(({ row, issue }) => [row.line, row.name, issue]),
                  ]).catch(reportError)
                }
              >
                Download row errors
              </Button>
            ) : null}
            <ul className="max-h-72 divide-y divide-outline-soft overflow-auto rounded-field border border-outline-soft">
              {preview.map((entry) => (
                <li key={entry.row.line} className="space-y-1 p-3 text-sm">
                  <p className="font-bold">
                    Row {entry.row.line} · {entry.row.name || 'Unnamed test'}
                  </p>
                  {'issue' in entry ? (
                    <>
                      <p className="text-danger-strong">{entry.issue}</p>
                      {editingLine === entry.row.line ? (
                        <WorkbookRowEditor
                          row={entry.row}
                          onCancel={() => setEditingLine(undefined)}
                          onApply={(revised) => {
                            setRows((current) =>
                              current.map((row) => (row.line === revised.line ? revised : row)),
                            );
                            setEditingLine(undefined);
                          }}
                        />
                      ) : (
                        <Button
                          variant="ghost"
                          fullWidth={false}
                          onClick={() => setEditingLine(entry.row.line)}
                        >
                          Edit row
                        </Button>
                      )}
                    </>
                  ) : (
                    <Tag
                      tone={
                        entry.input.catalogue.pricingCategory === 'billable' ? 'amber' : 'green'
                      }
                    >
                      {entry.input.catalogue.pricingCategory === 'billable'
                        ? 'Draft · Needs pricing'
                        : 'Active · Non-billable'}
                    </Tag>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {error || definitions.error ? (
          <p role="alert" className="text-danger-strong">
            {error || definitions.error?.message}
          </p>
        ) : null}
        {result ? (
          <p role="status" className="text-sm">
            {result.added.length} added · {result.skipped.length} already in catalogue. New tests
            appear after sync.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <SheetCancelButton>{result ? 'Done' : 'Cancel'}</SheetCancelButton>
          <StaffVerification requireServerSession purpose="Importing laboratory tests">
            <Button
              fullWidth={false}
              loading={busy}
              disabled={busy || editingLine !== undefined || !definitions.data || !ready.length}
              onClick={() => void save()}
            >
              Import {ready.length} ready {ready.length === 1 ? 'test' : 'tests'}
            </Button>
          </StaffVerification>
        </div>
      </div>
    </Sheet>
  );
};
