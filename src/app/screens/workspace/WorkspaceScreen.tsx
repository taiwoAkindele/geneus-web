import { Navigate, useParams } from 'react-router-dom';
import { useWorkspace } from '@/app/useWorkspace';
import { moduleStart, rememberWorkspace } from '@/app/workspaces';
import { useAuthorizationContext } from '@/session';

/**
 * Modules have no Overview pages: the sidebar lists each module's pages. Older
 * links and bookmarks to /workspace/<module> open that module's first page,
 * with the module kept current for pages several modules share.
 */
export const WorkspaceScreen = () => {
  const { moduleId } = useParams();
  const { available } = useWorkspace();
  const context = useAuthorizationContext();
  const workspace = available.find((item) => item.id === moduleId);
  if (!workspace) return <Navigate to="/home" replace />;
  rememberWorkspace(context.facilityId, context.userId, workspace.id);
  return <Navigate to={moduleStart(workspace)} replace />;
};
