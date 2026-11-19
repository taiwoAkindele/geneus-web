import { afterEach, describe, expect, it, vi } from 'vitest';
import { staffPermissions, type Role } from '@shared';
import { activeWorkspaceLink, moduleStart, readLastWorkspace, rememberWorkspace, workspaceForLocation, workspacePath, workspacesFor } from './workspaces';
import { activeSettingsPage, moduleSettingsFor } from './moduleSettings';
import { schedulingPlanner, settingsTabsFor } from './settings/settingsTabs';

const context = (role: Role, additionalRoles: Role[] = []) => ({ role, roles: [role, ...additionalRoles], permissions: staffPermissions({ role, additionalRoles, permission: 'read_write' }) });

describe('module workspaces', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('offers the daily modules, Staff and facility-wide Settings to an administrator', () => {
    expect(workspacesFor(context('facility_admin')).map((workspace) => workspace.id)).toEqual(['front-desk', 'clinical', 'finance', 'inventory', 'reports', 'staff', 'settings']);
    expect(workspacesFor(context('facility_admin')).find((w) => w.id === 'staff')?.links.map((l) => l.to)).toEqual(['/admin/staff']);
    expect(workspacesFor(context('facility_admin')).find((w) => w.id === 'settings')?.links.map((l) => l.label))
      .toEqual(['Facility', 'Staff scheduling & coverage', 'Devices', 'Organization', 'Account & security']);
  });

  it('keeps facility-wide workforce planning in Settings, reachable by clinicians running intake without a Settings menu', () => {
    // Clinicians open walk-in intake from Coverage: the page is theirs to reach, but no Settings entry appears in their sidebar.
    const nurse = context('nurse');
    expect(settingsTabsFor(nurse).find((tab) => tab.key === 'scheduling')).toMatchObject({ to: '/settings/scheduling', navigation: false });
    expect(workspacesFor(nurse).map((workspace) => workspace.id)).not.toContain('settings');
    expect(schedulingPlanner(nurse)).toBe(false);
    expect(schedulingPlanner(context('facility_admin'))).toBe(true);
    // A cashier neither plans nor runs sessions.
    expect(settingsTabsFor(context('cashier')).map((tab) => tab.key)).not.toContain('scheduling');
    // The Staff module is the directory only; old Staff tab addresses belong to Staff and redirect from there.
    expect(workspaceForLocation('/settings/scheduling', '?view=coverage', workspacesFor(context('facility_admin')))?.id).toBe('settings');
  });

  it('keeps module setup in each module’s Settings menu, not in global Settings or the module pages', () => {
    const admin = context('facility_admin');
    expect(moduleSettingsFor('laboratory', admin).pages.map((p) => p.label)).toEqual(['Tests', 'Result templates', 'Result parts', 'Answer lists']);
    expect(moduleSettingsFor('billing', admin).pages.map((p) => p.label)).toEqual(['Price Catalogue', 'Payment settings']);
    expect(moduleSettingsFor('insurance', admin).pages.map((p) => p.key)).toEqual(['setup', 'payers']);
    // A section shortcut opens its page: Result parts is a tab of Result templates.
    expect(activeSettingsPage(moduleSettingsFor('laboratory', admin), '/laboratory/settings/templates/abc')?.key).toBe('templates');
    expect(activeSettingsPage(moduleSettingsFor('billing', admin), '/billing/settings/payments')?.key).toBe('accounts');
    // A cashier may read the price list but not set up payment accounts; a nurse has no lab settings.
    expect(moduleSettingsFor('billing', context('cashier')).pages.map((p) => p.key)).toEqual(['fees']);
    expect(moduleSettingsFor('laboratory', context('nurse')).pages).toEqual([]);
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

  it('places delegated billing configuration in Billing settings, without a global Settings module', () => {
    const cashier = { role: 'cashier' as const, roles: ['cashier' as const], permissions: ['payment:receive' as const, 'fee_item:manage' as const] };
    const available = workspacesFor(cashier);
    expect(available.find((workspace) => workspace.id === 'finance')?.links.map((item) => item.key)).not.toContain('fees');
    expect(available.map((workspace) => workspace.id)).not.toContain('settings');
    expect(moduleSettingsFor('billing', cashier).pages.map((p) => p.key)).toEqual(['fees', 'accounts']);
    expect(workspacesFor(context('nurse')).map((workspace) => workspace.id)).not.toContain('settings');
  });

  it('preserves existing deep links and shared record context', () => {
    const available = workspacesFor(context('facility_admin'));
    expect(workspaceForLocation('/encounters/record', '', available)?.id).toBe('clinical');
    expect(workspaceForLocation('/billing', '?patient=test', available)?.id).toBe('finance');
    expect(workspaceForLocation('/patients/profile', '', available, 'clinical')?.id).toBe('clinical');
    expect(workspaceForLocation('/patients/profile', '', available, 'finance')?.id).toBe('finance');
    expect(workspaceForLocation('/admin/staff', '', available)?.id).toBe('staff');
    expect(workspaceForLocation('/admin/staff/staff:1', '', available)?.id).toBe('staff');
    expect(workspaceForLocation('/admin/devices/add', '', available)?.id).toBe('settings');
    expect(workspaceForLocation('/insurance/settings/payers', '?payer=x', available)?.id).toBe('finance');
    expect(workspaceForLocation('/billing/settings/fees', '', available)?.id).toBe('finance');
    expect(workspaceForLocation('/laboratory/settings/tests', '', available)?.id).toBe('clinical');
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
    // Module settings pages keep their module's page selected.
    expect(activeWorkspaceLink(clinical, '/laboratory/settings/templates', '?tab=parts')).toBe('laboratory');
    expect(activeWorkspaceLink(finance, '/billing/settings/fees', '')).toBe('accounts');
    const settings = available.find((workspace) => workspace.id === 'settings')!;
    expect(activeWorkspaceLink(settings, '/settings/devices', '')).toBe('devices');
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

  it('keeps insurance setup in the Insurance Settings menu, and shows daily insurance work by state', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
    const admin = { ...context('facility_admin'), facilityId: 'facility:one', deviceId: 'device:one' };
    const officer = { ...context('insurance_officer'), facilityId: 'facility:one', deviceId: 'device:one' };
    const finance = (c: typeof admin) => workspacesFor(c).find((w) => w.id === 'finance')?.links.map((l) => l.key) ?? [];
    const settings = (c: typeof admin) => workspacesFor(c).find((w) => w.id === 'settings')?.links.map((l) => l.key) ?? [];
    expect(settings(admin)).not.toContain('settings-insurance');
    expect(moduleSettingsFor('insurance', officer).pages.map((p) => p.key)).toContain('payers');
    expect(finance(admin)).not.toContain('contracts');
    // Nothing granted (insurance off): no insurance entry at all.
    expect(finance(officer)).not.toContain('insurance');
    expect(finance(admin)).not.toContain('insurance');
    // During setup the people setting it up reach Insurance (and its Settings menu); daily work stays hidden.
    values.set('geneus.insuranceSupport:facility:one:device:one', 'setup');
    expect(finance(officer)).toContain('insurance');
    expect(finance(admin)).toContain('insurance');
    expect(finance(officer)).not.toContain('claims');
    const cashier = { ...context('cashier'), facilityId: 'facility:one', deviceId: 'device:one' };
    expect(finance(cashier)).not.toContain('insurance');
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
