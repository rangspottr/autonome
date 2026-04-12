const API_URL = import.meta.env.VITE_API_URL || '/api';

function getCsrfToken() {
  const match = document.cookie.split(';').find((c) => c.trim().startsWith('__csrf='));
  return match ? match.trim().slice('__csrf='.length) : null;
}

function getHeaders(method) {
  const token = localStorage.getItem('autonome_token');
  const workspaceId = localStorage.getItem('autonome_workspace_id');
  const headers = {
    'Content-Type': 'application/json',
    'x-requested-with': 'XMLHttpRequest',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (workspaceId) headers['x-workspace-id'] = workspaceId;
  // Attach CSRF token on state-changing requests
  if (method && !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) {
    const csrf = getCsrfToken();
    if (csrf) headers['x-csrf-token'] = csrf;
  }
  return headers;
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('autonome_refresh_token');
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
        ...(() => {
          const csrf = getCsrfToken();
          return csrf ? { 'x-csrf-token': csrf } : {};
        })(),
      },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    localStorage.setItem('autonome_token', data.token);
    localStorage.setItem('autonome_refresh_token', data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

async function request(endpoint, options = {}) {
  const method = options.method || 'GET';
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: { ...getHeaders(method), ...options.headers },
  });

  if (res.status === 401) {
    // Attempt token refresh before giving up
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const retryRes = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: { ...getHeaders(method), ...options.headers },
      });
      if (retryRes.status === 401) {
        localStorage.removeItem('autonome_token');
        localStorage.removeItem('autonome_refresh_token');
        window.location.href = '/login';
        throw new Error('Unauthorized');
      }
      if (!retryRes.ok) {
        const error = await retryRes.json().catch(() => ({ message: 'Request failed' }));
        throw new Error(error.message || 'Request failed');
      }
      return retryRes.json();
    }
    localStorage.removeItem('autonome_token');
    localStorage.removeItem('autonome_refresh_token');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (res.status === 402) {
    window.location.href = '/checkout';
    throw new Error('Payment required');
  }
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || 'Request failed');
  }
  return res.json();
}

export const api = {
  get: (endpoint) => request(endpoint, { method: 'GET' }),
  post: (endpoint, data) => request(endpoint, { method: 'POST', body: JSON.stringify(data) }),
  patch: (endpoint, data) => request(endpoint, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (endpoint) => request(endpoint, { method: 'DELETE' }),
};