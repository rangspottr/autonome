import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [workspace, setWorkspaceState] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('autonome_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api.get('/auth/me')
      .then((data) => {
        setUser(data.user);
        if (data.workspaces && data.workspaces.length > 0) {
          const ws = data.workspaces[0];
          setWorkspaceState(ws);
          localStorage.setItem('autonome_workspace_id', ws.id);
          setSubscription({ status: ws.subscription_status });
        }
      })
      .catch(() => {
        localStorage.removeItem('autonome_token');
        localStorage.removeItem('autonome_workspace_id');
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const data = await api.post('/auth/login', { email, password });
    localStorage.setItem('autonome_token', data.token);
    if (data.refreshToken) localStorage.setItem('autonome_refresh_token', data.refreshToken);
    setUser(data.user);
    if (data.workspace) {
      setWorkspaceState(data.workspace);
      localStorage.setItem('autonome_workspace_id', data.workspace.id);
    }
    // Fetch full profile to populate subscription status immediately so
    // RequireSubscription does not redirect to /checkout after login.
    try {
      const meData = await api.get('/auth/me');
      if (meData.user) setUser(meData.user);
      if (meData.workspaces && meData.workspaces.length > 0) {
        const ws = meData.workspaces[0];
        setWorkspaceState(ws);
        localStorage.setItem('autonome_workspace_id', ws.id);
        setSubscription({ status: ws.subscription_status });
      }
    } catch {
      // Non-fatal — subscription stays null; RequireSubscription will handle it.
    }
    return data;
  }

  async function signup(email, password, full_name) {
    const data = await api.post('/auth/signup', { email, password, full_name });
    localStorage.setItem('autonome_token', data.token);
    if (data.refreshToken) localStorage.setItem('autonome_refresh_token', data.refreshToken);
    setUser(data.user);
    return data;
  }

  async function logout() {
    try {
      const refreshToken = localStorage.getItem('autonome_refresh_token');
      await api.post('/auth/logout', { refreshToken }).catch(() => {});
    } finally {
      localStorage.removeItem('autonome_token');
      localStorage.removeItem('autonome_refresh_token');
      localStorage.removeItem('autonome_workspace_id');
      setUser(null);
      setWorkspaceState(null);
      setSubscription(null);
      window.location.href = '/login';
    }
  }

  function setWorkspace(ws) {
    setWorkspaceState(ws);
    if (ws) {
      localStorage.setItem('autonome_workspace_id', ws.id);
    } else {
      localStorage.removeItem('autonome_workspace_id');
    }
  }

  return (
    <AuthContext.Provider value={{ user, workspace, subscription, loading, isAuthenticated: !!user, login, signup, logout, setWorkspace }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
