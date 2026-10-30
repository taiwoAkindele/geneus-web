import { afterEach, describe, expect, it, vi } from 'vitest';
import { staffPermissions, type Role } from '@shared';
import { activeWorkspaceLink, readLastWorkspace, rememberWorkspace, workspaceForLocation, workspacePath, workspacesFor } from './workspaces';

const context = (role: Role, additionalRoles: Role[] = []) => ({ role, roles: [role, ...additionalRoles], permissions: staffPermissions({ role, additionalRoles, permission: 'read_write' }) });

describe('module workspaces', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('offers all seven modules to an administrator', () => {
    expect(workspacesFor(context('facility_admin')).map((workspace) => workspace.id)).toEqual(['front-desk', 'clinical', 'finance', 'operations', 'inventory', 'reports', 'administration']);
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

  it('places delegated configuration in its owning module', () => {
    const available = workspacesFor({ role: 'cashier', roles: ['cashier'], permissions: ['payment:receive', 'fee_item:manage'] });
    expect(available.find((workspace) => workspace.id === 'finance')?.links.map((item) => item.key)).toContain('fees');
    expect(available.map((workspace) => workspace.id)).not.toContain('administration');
  });

  it('preserves existing deep links and shared record context', () => {
    const available = workspacesFor(context('facility_admin'));
    expect(workspaceForLocation('/encounters/record', '', available)?.id).toBe('clinical');
    expect(workspaceForLocation('/billing', '?patient=test', available)?.id).toBe('finance');
    expect(workspaceForLocation('/patients/profile', '', available, 'clinical')?.id).toBe('clinical');
    expect(workspaceForLocation('/patients/profile', '', available, 'finance')?.id).toBe('finance');
    expect(workspaceForLocation('/admin/staff', '?workspace=administration', available)?.id).toBe('administration');
    expect(workspaceForLocation('/admin/staff', '', available, 'operations')?.id).toBe('operations');
    expect(workspaceForLocation('/home', '', available)).toBeUndefined();
  });

  it('selects the correct queue, billing tab and most specific route', () => {
    const available = workspacesFor(context('facility_admin'));
    const clinical = available.find((workspace) => workspace.id === 'clinical')!;
    const finance = available.find((workspace) => workspace.id === 'finance')!;
    expect(activeWorkspaceLink(clinical, '/encounters', '?queue=lab')).toBe('laboratory');
    expect(activeWorkspaceLink(clinical, '/encounters', '?queue=pharmacy')).toBe('pharmacy');
    expect(activeWorkspaceLink(finance, '/billing', '?tab=transfers')).toBe('transfers');
    expect(activeWorkspaceLink(finance, '/billing/fees', '')).toBe('fees');
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

  it('keeps navigation usable when preference storage is blocked', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(readLastWorkspace('facility:one', 'staff:one')).toBeUndefined();
    expect(() => rememberWorkspace('facility:one', 'staff:one', 'clinical')).not.toThrow();
  });
});
