import type { ReactNode } from 'react';
import type { Permission } from '@shared';
import { useAuthorizationContext } from '@/session';
import { UnavailableScreen } from './UnavailableScreen';

export const RequireCapability = ({ permissions, children }: { permissions: readonly Permission[]; children: ReactNode }) => {
  const context = useAuthorizationContext();
  return permissions.some((permission) => context.permissions.includes(permission)) ? children : (
    <UnavailableScreen title="View access" description="Your role can view patient records but cannot make this change. Ask a facility admin if your access needs updating." />
  );
};
