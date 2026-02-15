/**
 * @file useSettingsStore.js
 * @description Global app state: authentication, user info, preferences.
 *
 * WHY IS AUTH IN THE SETTINGS STORE?
 * For v1 with a single user, keeping auth state here is simpler than
 * a separate auth store. If/when we add multi-user support, we can split it.
 *
 * USAGE:
 *   import { useSettingsStore } from '@/stores/useSettingsStore';
 *
 *   function Header() {
 *     const { user, isAuthenticated, logout } = useSettingsStore();
 *     if (!isAuthenticated) return <LoginRedirect />;
 *     return <div>Welcome, {user.name}</div>;
 *   }
 */

import { create } from 'zustand';
import { api, getToken, setToken, removeToken } from '@/lib/api';

const useSettingsStore = create((set, get) => ({
  // --- Authentication State ---
  user: null,            // { id, email, name, role } or null if not logged in
  isAuthenticated: false,
  isLoading: true,       // True until we've checked for an existing token

  /**
   * Login: store the token and user info.
   * Called after successful POST /api/auth/login.
   */
  login: (token, user) => {
    setToken(token);
    set({ user, isAuthenticated: true, isLoading: false });
  },

  /**
   * Logout: clear everything and redirect to login.
   */
  logout: () => {
    removeToken();
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  /**
   * Check if user is already logged in (on app load).
   * Verifies the stored JWT token with the server.
   */
  checkAuth: async () => {
    // BYPASS FOR TESTING - Check if we're in bypass mode
    const bypassAuth = window.localStorage.getItem('BYPASS_AUTH') === 'true';
    if (bypassAuth) {
      console.log('[Auth] ⚠️  BYPASSED - Using default test user');
      set({
        user: {
          id: 'test-user-id',
          email: 'admin@test.com',
          name: 'Test Admin',
          role: 'admin'
        },
        isAuthenticated: true,
        isLoading: false
      });
      return;
    }

    const token = getToken();

    if (!token) {
      set({ isLoading: false });
      return;
    }

    try {
      const data = await api.get('/auth/me');
      set({ user: data.user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      // Token is invalid, expired, or server unreachable
      removeToken();
      set({ isLoading: false, isAuthenticated: false, user: null });
    }
  },

  // --- UI Preferences ---
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));

export { useSettingsStore };
