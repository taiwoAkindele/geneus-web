import { Link } from 'react-router-dom';
import { FacilityWorkspace } from '@/features/workforce/Workspaces';
export const FacilityScreen = () => <><nav aria-label="Facility administration" className="flex flex-wrap gap-4 px-4 py-3"><Link className="font-bold text-brand" to="/investigations/catalogue">Investigation catalogue</Link><Link className="font-bold text-brand" to="/organization">Organization & staff provisioning</Link><Link className="font-bold text-brand" to="/facilities">Switch facility</Link></nav><FacilityWorkspace /></>;
