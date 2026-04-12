import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { api } from '../lib/api.js';
import { T } from '../lib/theme.js';

const INDUSTRIES = ['roofing', 'construction', 'landscaping', 'plumbing', 'electrical', 'hvac', 'cleaning', 'consulting', 'retail', 'other'];

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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ width: 480, padding: 40, background: T.wh, borderRadius: 12, border: `1px solid ${T.bd}` }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.tx }}>Create your workspace</div>
          <div style={{ fontSize: 13, color: T.mt, marginTop: 6 }}>Your workspace is your company's home in Autonome.</div>
        </div>
        {error && <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#DC2626', marginBottom: 16 }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: T.tx, marginBottom: 6 }}>Company Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="Acme Roofing Co." style={{ width: '100%', padding: '10px 12px', border: `1px solid ${T.bd}`, borderRadius: 8, fontSize: 14, color: T.tx, background: T.bg, boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: T.tx, marginBottom: 6 }}>Industry</label>
            <select value={industry} onChange={e => setIndustry(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: `1px solid ${T.bd}`, borderRadius: 8, fontSize: 14, color: T.tx, background: T.bg, boxSizing: 'border-box' }}>
              <option value="">Select industry…</option>
              {INDUSTRIES.map(i => <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>)}
            </select>
          </div>
          <button type="submit" disabled={loading} style={{ width: '100%', padding: '12px', background: T.tx, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Creating…' : 'Create Workspace'}
          </button>
        </form>
      </div>
    </div>
  );
}
