import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthorizationContext } from '@shared';
import type { WorkforceData } from '@/data/repos/workforce';

const saved: { type: string; fields: Record<string, unknown> }[] = [];
vi.mock('@/data/repos/workforce', () => ({
  saveWorkforce: vi.fn(async (type: string, fields: Record<string, unknown>) => {
    saved.push({ type, fields });

    return { id: `${type}:new`, type, ...fields };
  }),
}));

const {
  addCareService,
  CARE_CONCEPT_SYSTEM,
  careServiceStatus,
  defaultPlacement,
  existingCareService,
} = await import('./careServices');

const context = {
  facilityId: 'f1',
  userId: 'admin',
  permissions: ['service:manage'],
} as unknown as AuthorizationContext;

const lab = {
  id: 'd-hb',
  name: 'Haemoglobin',
  category: 'laboratory',
  active: true,
  concept: { system: 'http://loinc.org', code: '718-7', label: 'Haemoglobin' },
  investigation: { specimen: 'Blood', department: 'Haematology', aliases: [] },
};

const base = (patch: Partial<Record<keyof WorkforceData, unknown>> = {}) =>
  ({
    units: [
      { id: 'u-lab', unitId: 'u-lab', name: 'Laboratory', active: true, kind: 'unit' },
      { id: 'u-opd', unitId: 'u-opd', name: 'Outpatients', active: true, kind: 'unit' },
    ],
    locations: [
      { id: 'l-lab', name: 'Laboratory', kind: 'room', active: true, unitId: 'u-lab' },
      { id: 'l-c1', name: 'Consulting room 1', kind: 'room', active: true, unitId: 'u-opd' },
      { id: 'l-w', name: 'Female ward', kind: 'ward', active: true },
      { id: 'l-b', name: 'FW-01', kind: 'bed', parentId: 'l-w', active: true },
    ],
    definitions: [lab],
    offerings: [
      {
        id: 'o-hb',
        name: 'Haemoglobin',
        serviceDefinitionId: 'd-hb',
        configuration: 'active',
        unitId: 'u-lab',
        locationIds: ['l-lab'],
      },
    ],
    facility: { timeZone: 'Africa/Lagos' },
    pending: new Set(),
    receipts: [],
    rejections: [],
    ...patch,
  }) as unknown as WorkforceData;

beforeEach(() => {
  saved.length = 0;
});

describe('care services in hospital setup', () => {
  it('chooses a non-laboratory team and its own place by default, and a ward for inpatient care', () => {
    expect(defaultPlacement(undefined, base())).toEqual({ unitId: 'u-opd', locationId: 'l-c1' });
    expect(defaultPlacement({ place: 'ward' }, base())).toEqual({
      unitId: 'u-opd',
      locationId: 'l-w',
    });
  });

  it('adds an active offering under a new care definition, with no workforce rules imposed', async () => {
    await addCareService(
      {
        key: 'general-outpatient',
        name: 'General outpatient consultation',
        category: 'consultation',
        intakePolicy: 'both',
        visitTypes: ['general'],
        unitId: 'u-opd',
        locationId: 'l-c1',
      },
      base(),
      context,
    );

    expect(saved.map((s) => s.type)).toEqual(['service_definition', 'service_offering']);
    expect(saved[0].fields).toMatchObject({
      category: 'consultation',
      orderable: false,
      concept: { system: CARE_CONCEPT_SYSTEM, code: 'general-outpatient' },
    });

    expect(saved[1].fields).toMatchObject({
      serviceDefinitionId: 'service_definition:new',
      configuration: 'active',
      visitTypes: ['general'],
      requiredActions: [],
      resourceReadiness: 'unassessed',
      locationIds: ['l-c1'],
      timeZone: 'Africa/Lagos',
    });
  });

  it('reuses an existing definition with the same meaning instead of creating another', async () => {
    const own = {
      id: 'd-anc',
      name: 'antenatal care',
      category: 'preventive',
      active: true,
      concept: { system: 'urn:geneus:local-service', code: 'x', label: 'antenatal care' },
    };

    await addCareService(
      {
        key: 'antenatal',
        name: 'Antenatal care',
        category: 'preventive',
        intakePolicy: 'both',
        visitTypes: ['general'],
        unitId: 'u-opd',
        locationId: 'l-c1',
      },
      base({ definitions: [lab, own] }),
      context,
    );

    expect(saved.map((s) => s.type)).toEqual(['service_offering']);
    expect(saved[0].fields.serviceDefinitionId).toBe('d-anc');
  });

  it('refuses a second offering for a care service the hospital already has', async () => {
    const data = base({
      definitions: [
        lab,
        {
          id: 'd-opd',
          name: 'OPD',
          category: 'consultation',
          active: true,
          concept: { system: CARE_CONCEPT_SYSTEM, code: 'general-outpatient', label: 'OPD' },
        },
      ],
      offerings: [
        { id: 'o-opd', name: 'OPD', serviceDefinitionId: 'd-opd', configuration: 'active' },
      ],
    });

    expect(
      existingCareService(
        { key: 'general-outpatient', name: 'General outpatient consultation' },
        data,
      )?.id,
    ).toBe('o-opd');

    await expect(
      addCareService(
        {
          key: 'general-outpatient',
          name: 'General outpatient consultation',
          category: 'consultation',
          intakePolicy: 'both',
          visitTypes: ['general'],
          unitId: 'u-opd',
          locationId: 'l-c1',
        },
        data,
        context,
      ),
    ).rejects.toThrow('already one of');

    await expect(
      addCareService(
        {
          name: ' opd ',
          category: 'consultation',
          intakePolicy: 'both',
          visitTypes: ['general'],
          unitId: 'u-opd',
          locationId: 'l-c1',
        },
        data,
        context,
      ),
    ).rejects.toThrow('already one of');

    expect(saved).toEqual([]);
  });

  it('never treats a lab test as an existing care service, and never reuses a lab definition', async () => {
    expect(existingCareService({ name: 'Haemoglobin' }, base())).toBeUndefined();
    await addCareService(
      {
        name: 'Haemoglobin',
        category: 'other',
        intakePolicy: 'both',
        visitTypes: ['general'],
        unitId: 'u-opd',
        locationId: 'l-c1',
      },
      base(),
      context,
    );

    expect(saved[0].type).toBe('service_definition');
  });

  it('asks for the team and place before saving anything', async () => {
    await expect(
      addCareService(
        {
          name: 'Eye clinic',
          category: 'consultation',
          intakePolicy: 'both',
          visitTypes: ['general'],
          unitId: '',
          locationId: 'l-c1',
        },
        base(),
        context,
      ),
    ).rejects.toThrow('team');

    await expect(
      addCareService(
        {
          name: 'Eye clinic',
          category: 'consultation',
          intakePolicy: 'both',
          visitTypes: ['general'],
          unitId: 'u-opd',
          locationId: '',
        },
        base(),
        context,
      ),
    ).rejects.toThrow('where');

    expect(saved).toEqual([]);
  });

  it('shows business status, with sync detail only when it needs attention', () => {
    const offering = { id: 'o1', configuration: 'active' } as never;
    expect(careServiceStatus(offering, base())).toEqual({ label: 'Active', tone: 'green' });
    expect(careServiceStatus({ id: 'o1', configuration: 'draft' } as never, base()).label).toBe(
      'Draft',
    );

    expect(careServiceStatus(offering, base({ pending: new Set(['o1']) })).label).toBe('Saving');
    expect(
      careServiceStatus(
        offering,
        base({ rejections: [{ type: 'sync_rejection', entityId: 'o1' }] }),
      ).label,
    ).toBe('Needs attention');
  });
});
