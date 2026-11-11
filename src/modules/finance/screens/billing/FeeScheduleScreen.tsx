import { Navigate } from 'react-router-dom';

/** Existing bookmarks lead into the same Billing workspace. */
export const FeeScheduleScreen = () => <Navigate to="/billing?tab=fees" replace />;
