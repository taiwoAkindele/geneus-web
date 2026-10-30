import { useLiveQuery } from '@/data';
import { loadWorkforce } from '@/data/repos/workforce';
export const useWorkforce = () => useLiveQuery(loadWorkforce);
