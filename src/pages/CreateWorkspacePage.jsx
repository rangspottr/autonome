import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { api } from '../lib/api.js';

const INDUSTRIES = ['roofing', 'construction', 'landscaping', 'plumbing', 'electrical', 'hvac', 'cleaning', 'consulting', 'retail', 'other'];

const card = { width: 440, padding: 40, background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-lg)' };
const inputStyle = { width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 14, fontFamily: 'var(--font-family)', color: 'var(--color-text-primary)', background: 'var(--color-bg)', boxSizing: 'border-box', outline: 'none' };
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 };
const btnStyle = (loading) => ({ width: '100%', padding: '12px', background: 'var(--color-brand)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, fontFamily: 'var(--font-family)' });

export default function CreateWorkspacePage() {
  const { setWorkspace } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const workspace = await api.post('/workspaces', { name, industry });
      setWorkspace(workspace);
      navigate('/onboarding');
    } catch (err) {
      setError(err.message || 'Failed to create workspace');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
      <div style={card}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 6 }}>Create your workspace</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Your workspace is your company's home in Autonome.</div>
        </div>
        {error && (
          <div style={{ background: 'var(--color-danger-light)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: 13, color: 'var(--color-danger)', marginBottom: 'var(--space-4)' }}>
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label style={labelStyle}>Company Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="Acme Roofing Co." style={inputStyle} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Industry</label>
            <select value={industry} onChange={e => setIndustry(e.target.value)} style={inputStyle}>
              <option value="">Select industry…</option>
              {INDUSTRIES.map(i => <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>)}
            </select>
          </div>
          <button type="submit" disabled={loading} style={btnStyle(loading)}>
            {loading ? 'Creating…' : 'Create Workspace'}
          </button>
        </form>
      </div>
    </div>
  );
}
