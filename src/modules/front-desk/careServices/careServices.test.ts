import { describe, expect, it } from 'vitest';
import type { Encounter, Facility, ServiceOffering } from '@shared';
import { defaultCareChoice } from './CareServiceVisitFields';
import { careContextOptions } from '@/modules/operations/workforce/careContextOptions';
import { monthlyReport, type MonthlyData } from '@/modules/reports/reporting/monthlyReport';
import { facilityForm } from '@/modules/administration/setup/FacilityDetailsStep';

const offering = (id: string, patch: Partial<ServiceOffering> = {}) =>
  ({
    id,
    name: id,
    serviceDefinitionId: `def:${id}`,
    configuration: 'active',
    visitTypes: [],
    ...patch,
  }) as ServiceOffering;

describe('care services across the hospital', () => {
  it('starts a booking on the service that records its visit type, else the first', () => {
    const opd = offering('opd', { visitTypes: ['general', 'follow_up'] });
    const anc = offering('anc', { visitTypes: ['antenatal'] });
    expect(defaultCareChoice([opd, anc], 'antenatal')).toEqual({
      offeringId: 'anc',
      visitType: 'antenatal',
    });
    expect(defaultCareChoice([opd, anc], 'follow_up')).toEqual({
      offeringId: 'opd',
      visitType: 'follow_up',
    });
    expect(defaultCareChoice([opd, anc], 'immunisation')).toEqual({
      offeringId: 'opd',
      visitType: 'general',
    });
    expect(defaultCareChoice([], 'general')).toBeUndefined();
  });

  it('lists care services before lab tests for a clinician, keeping tests that approvals may name', () => {
    const options = careContextOptions(
      [
        offering('Haemoglobin', { serviceDefinitionId: 'def:hb' }),
        offering('Outpatients'),
        offering('Retired', { configuration: 'retired' }),
      ],
      [
        {
          id: 'def:hb',
          investigation: { specimen: 'Blood', department: 'Haematology', aliases: [] },
        },
      ],
    );
    expect(options.map((o) => o.label)).toEqual(['Outpatients', 'Lab test · Haemoglobin']);
  });

  it('reports visits by care service, keeping earlier visits apart', () => {
    const visit = (id: string, offeringId?: string) =>
      ({
        id,
        patientId: `p:${id}`,
        openedOn: '2026-11-10T10:00:00.000Z',
        createdOn: '2026-11-10T10:00:00.000Z',
        ...(offeringId ? { offeringId } : {}),
      }) as Encounter;
    const data = {
      encounters: [visit('a', 'opd'), visit('b', 'opd'), visit('c', 'anc'), visit('d')],
      entries: [],
      patients: [],
      identities: [],
      definitions: [],
      registerEntries: [],
      items: [],
      movements: [],
      offerings: [
        offering('opd', { name: 'Outpatients' }),
        offering('anc', { name: 'Antenatal care' }),
      ],
    } as unknown as MonthlyData;
    expect(monthlyReport(data, '2026-11').careServices).toEqual([
      { id: 'opd', name: 'Outpatients', visits: 2 },
      { id: 'anc', name: 'Antenatal care', visits: 1 },
      { id: '', name: 'No care service recorded', visits: 1 },
    ]);
    expect(monthlyReport({ ...data, encounters: [visit('d')] }, '2026-11').careServices).toEqual(
      [],
    );
  });

  it('fills the facility step from registration, with Nigeria and its zone and currency where nothing was said', () => {
    const facility = {
      code: 'SHA',
      name: 'Sunrise Hospital Annex',
      state: 'Lagos',
      lga: 'Ikeja',
      level: 'general_hospital',
    } as Facility;
    expect(facilityForm(facility)).toMatchObject({
      code: 'SHA',
      name: 'Sunrise Hospital Annex',
      state: 'Lagos',
      country: 'NG',
      currency: 'NGN',
      timeZone: 'Africa/Lagos',
      address: '',
      phone: '',
    });
    expect(
      facilityForm({
        ...facility,
        country: 'GH',
        currency: 'USD',
        timeZone: 'Africa/Accra',
        address: '1 Road',
      }),
    ).toMatchObject({
      country: 'GH',
      currency: 'USD',
      timeZone: 'Africa/Accra',
      address: '1 Road',
    });
  });
});
