import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionTabs } from '@/ui';
import { useAuthorizationContext } from '@/session';

export type StaffView = 'directory' | 'roster' | 'coverage' | 'facilities';

/**
 * The Staff module's sections, one address each (/admin/staff?view=…). A
 * section shows only to people who may use it; the server checks every change.
 */
export const StaffSectionTabs = ({ value }: { value: StaffView }) => {
  const navigate = useNavigate();
  const context = useAuthorizationContext();
  const manage = context.permissions.includes('staff:manage');
  const options: { value: StaffView; label: string }[] = [
    { value: 'directory', label: 'Staff' },
    { value: 'roster', label: 'Sign-in windows' },
    { value: 'coverage', label: 'Coverage' },
    ...(manage ? [{ value: 'facilities' as const, label: 'Facility assignments' }] : []),
  ];
  return (
    <SectionTabs
      label="Staff sections"
      value={value}
      onChange={(view) =>
        navigate(view === 'directory' ? '/admin/staff' : `/admin/staff?view=${view}`)
      }
      options={options}
    />
  );
};

/** A Staff section without its own page header: the module title and its sections, then the content. */
export const StaffSectionPage = ({ view, children }: { view: StaffView; children: ReactNode }) => (
  <div className="min-h-screen bg-surface">
    <div className="mx-auto w-full max-w-md space-y-4 px-5 py-3 md:max-w-2xl lg:max-w-none lg:px-8">
      <h1 className="text-[24px] font-extrabold">Staff &amp; roster</h1>
      <StaffSectionTabs value={view} />
      {children}
    </div>
  </div>
);
