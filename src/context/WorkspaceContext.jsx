import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, getToken } from '../lib/api';

const WorkspaceContext = createContext();

/** Workspace slug → ID mapping for route-based defaults */
const SLUG_MAP = { jake: 'jake', hoa: 'hoa', owen: 'owen', 'data-rehab': 'data-rehab' };

export function WorkspaceProvider({ children }) {
  const [activeWorkspaceSlug, setActiveWorkspaceSlug] = useState(
    localStorage.getItem('activeWorkspaceSlug') || null
  );
  const [workspaces, setWorkspaces] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch all workspaces on mount — skip if not authenticated
  useEffect(() => {
    if (!getToken()) { setIsLoading(false); return; }

    const fetchWorkspaces = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await api.get('/workspaces');
        setWorkspaces(data.workspaces || data || []);
      } catch (err) {
        console.error('[WorkspaceContext] Failed to fetch workspaces:', err);
        setError(err.message || 'Failed to load workspaces');
      } finally {
        setIsLoading(false);
      }
    };

    fetchWorkspaces();
  }, []);

  // Persist selection
  useEffect(() => {
    if (activeWorkspaceSlug) {
      localStorage.setItem('activeWorkspaceSlug', activeWorkspaceSlug);
    } else {
      localStorage.removeItem('activeWorkspaceSlug');
    }
  }, [activeWorkspaceSlug]);

  const activeWorkspace = workspaces.find(w => w.slug === activeWorkspaceSlug) || null;
  const activeWorkspaceId = activeWorkspace?.id || null;

  const switchWorkspace = useCallback((slugOrNull) => {
    setActiveWorkspaceSlug(slugOrNull || null);
  }, []);

  /** Set workspace from a route-based defaultSource prop (e.g. "owen" → owen workspace) */
  const setFromSource = useCallback((source) => {
    if (source && SLUG_MAP[source]) {
      setActiveWorkspaceSlug(SLUG_MAP[source]);
    }
  }, []);

  const refreshWorkspaces = useCallback(async () => {
    try {
      const data = await api.get('/workspaces');
      setWorkspaces(data.workspaces || data || []);
    } catch (err) {
      console.error('[WorkspaceContext] Failed to refresh workspaces:', err);
    }
  }, []);

  return (
    <WorkspaceContext.Provider value={{
      activeWorkspace,
      activeWorkspaceId,
      activeWorkspaceSlug,
      workspaces,
      switchWorkspace,
      setFromSource,
      isLoading,
      error,
      refreshWorkspaces,
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};
