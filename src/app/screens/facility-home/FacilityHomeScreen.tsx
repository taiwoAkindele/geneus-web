import { Dashboard } from '@/app/dashboard/Dashboard';
import { ModuleGrid } from '@/app/dashboard/ModuleHome';

/** Home starts with today's work for this person, then the modules they can open. */
export const FacilityHomeScreen = () => <><Dashboard /><ModuleGrid /></>;
