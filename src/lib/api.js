const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function getHeaders() {
  const token = localStorage.getItem('autonome_token');
  const workspaceId = localStorage.getItem('autonome_workspace_id');
  const headers = {
    'Content-Type': 'application/json',
    'x-requested-with': 'XMLHttpRequest',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (workspaceId) headers['x-workspace-id'] = workspaceId;
  return headers;
}

async function request(endpoint, options = {}) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: { ...getHeaders(), ...options.headers },
  });
  if (res.status === 401) {
    localStorage.removeItem('autonome_token');
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
  get: (endpoint) => request(endpoint),
  post: (endpoint, data) => request(endpoint, { method: 'POST', body: JSON.stringify(data) }),
  patch: (endpoint, data) => request(endpoint, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (endpoint) => request(endpoint, { method: 'DELETE' }),
};
