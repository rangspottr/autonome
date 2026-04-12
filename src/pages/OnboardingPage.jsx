import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { api } from '../lib/api.js';
import { T } from '../lib/theme.js';

const SIZES = ['1-5', '6-10', '11-25', '26-50', '51-100', '100+'];

export default function OnboardingPage() {
  const { workspace, setWorkspace } = useAuth();
  const navigate = useNavigate();
  const [companySize, setCompanySize] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const updated = await api.post(`/workspaces/${workspace.id}/complete-onboarding`, { company_size: companySize, phone, address });
      setWorkspace(updated);
      navigate('/checkout');
    } catch (err) {
      setError(err.message || 'Failed to save company details');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ width: 480, padding: 40, background: T.wh, borderRadius: 12, border: `1px solid ${T.bd}` }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.tx }}>Tell us about your company</div>
          <div style={{ fontSize: 13, color: T.mt, marginTop: 6 }}>This helps Autonome personalize your experience.</div>
        </div>
        {error && <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#DC2626', marginBottom: 16 }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: T.tx, marginBottom: 6 }}>Company Size</label>
            <select value={companySize} onChange={e => setCompanySize(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: `1px solid ${T.bd}`, borderRadius: 8, fontSize: 14, color: T.tx, background: T.bg, boxSizing: 'border-box' }}>
              <option value="">Select size…</option>
              {SIZES.map(s => <option key={s} value={s}>{s} employees</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: T.tx, marginBottom: 6 }}>Phone Number</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 000-0000" style={{ width: '100%', padding: '10px 12px', border: `1px solid ${T.bd}`, borderRadius: 8, fontSize: 14, color: T.tx, background: T.bg, boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: T.tx, marginBottom: 6 }}>Business Address</label>
            <textarea value={address} onChange={e => setAddress(e.target.value)} rows={3} placeholder="123 Main St, City, State 00000" style={{ width: '100%', padding: '10px 12px', border: `1px solid ${T.bd}`, borderRadius: 8, fontSize: 14, color: T.tx, background: T.bg, boxSizing: 'border-box', resize: 'vertical' }} />
          </div>
          <button type="submit" disabled={loading} style={{ width: '100%', padding: '12px', background: T.tx, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Saving…' : 'Continue to Payment'}
          </button>
        </form>
      </div>
    </div>
  );
}
