import { afterEach, describe, expect, it, vi } from 'vitest';
import { staffPermissions, type Role } from '@shared';
import { activeWorkspaceLink, moduleStart, readLastWorkspace, rememberWorkspace, workspaceForLocation, workspacePath, workspacesFor } from './workspaces';

const context = (role: Role, additionalRoles: Role[] = []) => ({ role, roles: [role, ...additionalRoles], permissions: staffPermissions({ role, additionalRoles, permission: 'read_write' }) });

describe('module workspaces', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('offers the daily modules and one Settings module to an administrator', () => {
    expect(workspacesFor(context('facility_admin')).map((workspace) => workspace.id)).toEqual(['front-desk', 'clinical', 'finance', 'inventory', 'reports', 'settings']);
    expect(workspacesFor(context('facility_admin')).find((w) => w.id === 'settings')?.links.map((l) => l.label))
      .toEqual(['Facility', 'Staff & access', 'Devices', 'Billing', 'Insurance', 'Clinical catalogue', 'Organization', 'Account & security']);
  });

  it('keeps clinical and administrative actions out of the cashier workspace', () => {
    const available = workspacesFor(context('cashier'));
    expect(available.map((workspace) => workspace.id)).toEqual(['front-desk', 'finance']);
    expect(available.find((workspace) => workspace.id === 'front-desk')?.links.map((item) => item.key)).toEqual(['patients']);
    expect(available.find((workspace) => workspace.id === 'finance')?.links.map((item) => item.key)).not.toContain('fees');
    expect(workspaceForLocation('/workspace/clinical', '', available)).toBeUndefined();
  });

  it('combines secondary duties without mixing the module menus', () => {
    const available = workspacesFor(context('cashier', ['nurse']));
    expect(available.map((workspace) => workspace.id)).toEqual(expect.arrayContaining(['clinical', 'finance']));
    expect(available.find((workspace) => workspace.id === 'clinical')?.links.every((item) => !item.to.startsWith('/billing'))).toBe(true);
    expect(available.find((workspace) => workspace.id === 'finance')?.links.every((item) => !item.to.startsWith('/encounters'))).toBe(true);
  });

  it('gives lab and pharmacy workers their relevant clinical destinations', () => {
    const lab = workspacesFor(context('laboratory_staff')).find((workspace) => workspace.id === 'clinical')!;
    const pharmacy = workspacesFor(context('pharmacy_staff')).find((workspace) => workspace.id === 'clinical')!;
    expect(lab.links.map((item) => item.key)).toContain('laboratory');
    expect(lab.links.map((item) => item.key)).not.toContain('pharmacy');
    expect(pharmacy.links.map((item) => item.key)).toContain('pharmacy');
    expect(pharmacy.links.map((item) => item.key)).not.toContain('laboratory');
  });

  it('places delegated configuration under Settings, showing only the tabs the person may use', () => {
    const available = workspacesFor({ role: 'cashier', roles: ['cashier'], permissions: ['payment:receive', 'fee_item:manage'] });
    expect(available.find((workspace) => workspace.id === 'finance')?.links.map((item) => item.key)).not.toContain('fees');
    expect(available.find((workspace) => workspace.id === 'settings')?.links.map((item) => item.label)).toEqual(['Billing']);
    expect(workspacesFor(context('nurse')).map((workspace) => workspace.id)).not.toContain('settings');
  });

  it('preserves existing deep links and shared record context', () => {
    const available = workspacesFor(context('facility_admin'));
    expect(workspaceForLocation('/encounters/record', '', available)?.id).toBe('clinical');
    expect(workspaceForLocation('/billing', '?patient=test', available)?.id).toBe('finance');
    expect(workspaceForLocation('/patients/profile', '', available, 'clinical')?.id).toBe('clinical');
    expect(workspaceForLocation('/patients/profile', '', available, 'finance')?.id).toBe('finance');
    expect(workspaceForLocation('/admin/staff', '', available)?.id).toBe('settings');
    expect(workspaceForLocation('/settings/insurance/payers', '?payer=x', available)?.id).toBe('settings');
    expect(workspaceForLocation('/facility', '?view=settings', available)?.id).toBe('settings');
    expect(workspaceForLocation('/home', '', available)).toBeUndefined();
  });

  it('opens Front Desk on the patient list and every other module on its first page (no Overview pages)', () => {
    const available = workspacesFor(context('facility_admin'));
    const frontDesk = available.find((workspace) => workspace.id === 'front-desk')!;
    expect(frontDesk.label).toBe('Front Desk');
    expect(moduleStart(frontDesk)).toBe('/patients/search');
    expect(frontDesk.links[0].to).toBe('/patients/search');
    for (const workspace of available.filter((item) => item.id !== 'front-desk')) {
      expect(workspace.start).toBeUndefined();
      expect(moduleStart(workspace)).toBe(workspace.links[0].to);
    }
    // Every role that has Front Desk can open its start page.
    for (const role of ['records_officer', 'cashier', 'nurse', 'doctor', 'laboratory_staff', 'pharmacy_staff'] as const) {
      const desk = workspacesFor(context(role)).find((workspace) => workspace.id === 'front-desk');
      if (desk) expect(desk.links.some((item) => item.to === moduleStart(desk))).toBe(true);
    }
  });

  it('starts registration from the patient list rather than its own menu entry', () => {
    for (const role of ['records_officer', 'facility_admin'] as const) {
      const frontDesk = workspacesFor(context(role)).find((workspace) => workspace.id === 'front-desk')!;
      expect(frontDesk.links.map((item) => item.key)).not.toContain('registration');
      expect(frontDesk.links.some((item) => item.to === '/patients/new')).toBe(false);
      expect(activeWorkspaceLink(frontDesk, '/patients/new', '')).toBe('patients');
      expect(activeWorkspaceLink(frontDesk, '/patients/new/details', '')).toBe('patients');
      expect(activeWorkspaceLink(frontDesk, '/patients/duplicate', '')).toBe('patients');
      expect(activeWorkspaceLink(frontDesk, '/patients/search', '?q=amaka')).toBe('patients');
      expect(activeWorkspaceLink(frontDesk, '/appointments', '')).toBe('appointments');
    }
  });

  it('selects the correct queue, billing tab and most specific route', () => {
    const available = workspacesFor(context('facility_admin'));
    const clinical = available.find((workspace) => workspace.id === 'clinical')!;
    const finance = available.find((workspace) => workspace.id === 'finance')!;
    expect(activeWorkspaceLink(clinical, '/laboratory', '?tab=completed')).toBe('laboratory');
    expect(activeWorkspaceLink(clinical, '/pharmacy', '')).toBe('pharmacy');
    expect(activeWorkspaceLink(clinical, '/clinical/patients', '?q=amaka')).toBe('clinical-patients');
    expect(clinical.links.map((link) => link.key)).toEqual(['clinical-patients', 'admissions', 'laboratory', 'pharmacy', 'referrals', 'documents']);
    expect(activeWorkspaceLink(finance, '/billing', '?tab=transfers')).toBe('transfers');
    const settings = available.find((workspace) => workspace.id === 'settings')!;
    expect(activeWorkspaceLink(settings, '/settings/billing/fees', '')).toBe('settings-billing');
    expect(activeWorkspaceLink(settings, '/settings/insurance/payers', '')).toBe('settings-insurance');
  });

  it('stores only a module preference for the relevant staff member and facility', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    rememberWorkspace('facility:one', 'staff:one', 'clinical');
    expect(readLastWorkspace('facility:one', 'staff:one')).toBe('clinical');
    expect(readLastWorkspace('facility:one', 'staff:two')).toBeUndefined();
    expect(readLastWorkspace('facility:two', 'staff:one')).toBeUndefined();
    expect([...values.values()]).toEqual(['clinical']);
    expect(workspacePath('clinical')).toBe('/workspace/clinical');
  });

  it('keeps insurance setup under Settings, and shows daily insurance work by state', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
    const admin = { ...context('facility_admin'), facilityId: 'facility:one', deviceId: 'device:one' };
    const officer = { ...context('insurance_officer'), facilityId: 'facility:one', deviceId: 'device:one' };
    const finance = (c: typeof admin) => workspacesFor(c).find((w) => w.id === 'finance')?.links.map((l) => l.key) ?? [];
    const settings = (c: typeof admin) => workspacesFor(c).find((w) => w.id === 'settings')?.links.map((l) => l.key) ?? [];
    expect(settings(admin)).toContain('settings-insurance');
    expect(settings(officer)).toContain('settings-insurance');
    expect(finance(admin)).not.toContain('contracts');
    values.set('geneus.insuranceSupport:facility:one:device:one', 'setup');
    expect(finance(officer)).not.toContain('insurance');
    values.set('geneus.insuranceSupport:facility:one:device:one', 'active');
    expect(finance(officer)).toContain('insurance');
    expect(finance(officer)).toContain('claims');
    const nurse = { ...context('nurse'), facilityId: 'facility:one', deviceId: 'device:one' };
    const clinical = (c: typeof admin) => workspacesFor(c).find((w) => w.id === 'clinical')?.links.map((l) => l.key) ?? [];
    expect(clinical(nurse)).toContain('service-completion');
    expect(clinical(officer)).not.toContain('service-completion');
    values.set('geneus.insuranceSupport:facility:one:device:one', 'setup');
    expect(finance(officer)).not.toContain('claims');
    expect(clinical(nurse)).not.toContain('service-completion');
  });

  it('keeps navigation usable when preference storage is blocked', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(readLastWorkspace('facility:one', 'staff:one')).toBeUndefined();
    expect(() => rememberWorkspace('facility:one', 'staff:one', 'clinical')).not.toThrow();
  });
});
