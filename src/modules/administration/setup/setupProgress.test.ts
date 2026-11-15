import { describe, expect, it } from 'vitest';
import { setupProgress, setupSteps, type SetupFacts } from './setupProgress';

const empty: SetupFacts = { units: [], locations: [], offerings: [], fees: [], stock: [], staff: [], shifts: [] };
const facts = (patch: Record<string, unknown[] | object>) => ({ ...empty, ...patch }) as unknown as SetupFacts;
const status = (f: SetupFacts, notNeeded = new Set<never>()) => Object.fromEntries(setupSteps(f, notNeeded).map((s) => [s.id, s.status]));
const now = Date.parse('2026-11-15T10:00:00Z');

describe('hospital setup progress', () => {
  it('starts with every step to do and the facility step next', () => {
    const steps = setupSteps(empty);
    expect(steps.every((s) => s.status === 'todo')).toBe(true);
    expect(setupProgress(steps)).toMatchObject({ settled: 0, total: 6, complete: false, next: { id: 'facility' } });
  });

  it('reads progress from the records the hospital already has', () => {
    const f = facts({
      facility: { timeZone: 'Africa/Lagos' },
      units: [{ id: 'u1', name: 'Care team', active: true }],
      locations: [{ id: 'w1', name: 'Male Ward', kind: 'ward', active: true }, { id: 'b1', name: 'MM-01', kind: 'bed', parentId: 'w1', active: true }],
      offerings: [{ id: 'o1', name: 'Consultation', configuration: 'active', feeItemId: 'f1' }],
      fees: [{ id: 'f1', active: true }],
      staff: [{ staffId: 's1', active: true }, { staffId: 's2', active: true, loginAccess: 'always' }],
    });
    const steps = setupSteps(f, new Set(), now);
    expect(steps.map((s) => s.status)).toEqual(['done', 'done', 'done', 'done', 'done', 'done']);
    expect(steps.flatMap((s) => s.notes)).toEqual(['1 person with no upcoming shift.']);
    expect(setupProgress(steps).complete).toBe(true);
  });

  it('keeps advice separate from completion', () => {
    const steps = setupSteps(facts({
      locations: [{ id: 'w1', name: 'Female Ward', kind: 'ward', active: true }],
      offerings: [{ id: 'o1', name: 'Consultation', configuration: 'active' }, { id: 'o2', name: 'Dressing', configuration: 'draft' }],
      fees: [{ id: 'f1', active: true }, { id: 'f2', active: false }],
      stock: [{ id: 'k1', name: 'Gauze', feeItemId: 'f2' }],
    }));
    const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
    expect(byId.places).toMatchObject({ status: 'done', notes: ['No beds yet in Female Ward.'] });
    expect(byId.services).toMatchObject({ status: 'done', notes: ['1 care service still in draft or awaiting review.'] });
    expect(byId.prices.status).toBe('done');
    // A care service is charged through visit fees, so it is never reported as unpriced.
    expect(byId.prices.notes).toEqual(['1 stock item without a price.']);
  });

  describe('care services and lab tests', () => {
    const definitions = [
      { id: 'd-hb', investigation: { specimen: 'Blood', department: 'Haematology', aliases: [] } },
      { id: 'd-fbc', investigation: { specimen: 'Blood', department: 'Haematology', aliases: [] } },
      { id: 'd-opd' },
    ];
    const test = (id: string, definition: string, extra = {}) => ({ id, name: id, serviceDefinitionId: definition, configuration: 'active', ...extra });

    it('never counts lab tests as care services', () => {
      const steps = setupSteps(facts({ definitions, offerings: [test('Haemoglobin', 'd-hb'), test('Full blood count', 'd-fbc', { feeItemId: 'f1' })], fees: [{ id: 'f1', active: true }] }));
      const services = steps.find((s) => s.id === 'services')!;
      expect(services).toMatchObject({ label: 'Care services', status: 'todo', summary: 'No care services yet', notes: [] });
      expect(steps.find((s) => s.id === 'prices')!.notes).toEqual(['1 lab test without a price. Set them in the Lab catalogue.']);
    });

    it('counts only active care services, alongside any number of lab tests', () => {
      const services = setupSteps(facts({ definitions, offerings: [test('Haemoglobin', 'd-hb'), test('Full blood count', 'd-fbc'), test('General outpatient consultation', 'd-opd')] })).find((s) => s.id === 'services')!;
      expect(services).toMatchObject({ status: 'done', summary: '1 active care service' });
    });

    it('lets a facility without care services set the step aside, and drafts never block it', () => {
      const draftOnly = facts({ definitions, offerings: [test('Haemoglobin', 'd-hb'), test('Eye clinic', 'd-opd', { configuration: 'draft' })] });
      expect(setupSteps(draftOnly).find((s) => s.id === 'services')!.status).toBe('started');
      expect(setupSteps(draftOnly, new Set(['services'])).find((s) => s.id === 'services')!.status).toBe('not_needed');
    });

    it('ignores retired care services', () => {
      expect(setupSteps(facts({ definitions, offerings: [test('Old clinic', 'd-opd', { configuration: 'retired' })] })).find((s) => s.id === 'services')!.status).toBe('todo');
    });
  });

  it('marks partial work as started and ignores retired records', () => {
    expect(status(facts({ offerings: [{ id: 'o1', name: 'Lab', configuration: 'proposed' }], staff: [{ staffId: 'admin', active: true }], units: [{ id: 'u1', name: 'Old', active: false }] })))
      .toMatchObject({ services: 'started', staff: 'started', teams: 'todo' });
  });

  it('lets a step be set aside without overriding work that is done', () => {
    const steps = setupSteps(facts({ facility: { timeZone: 'Africa/Lagos' } }), new Set(['facility', 'places', 'services', 'prices', 'staff']));
    expect(steps.find((s) => s.id === 'facility')?.status).toBe('done');
    expect(steps.find((s) => s.id === 'places')?.status).toBe('not_needed');
    expect(setupProgress(steps)).toMatchObject({ settled: 5, complete: false, next: { id: 'teams' } });
  });
});
