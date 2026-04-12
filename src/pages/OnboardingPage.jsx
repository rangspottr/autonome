import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { api } from '../lib/api.js';

const SIZES = ['1-5', '6-10', '11-25', '26-50', '51-100', '100+'];

const card = { width: 440, padding: 40, background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-lg)' };
const inputStyle = { width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 14, fontFamily: 'var(--font-family)', color: 'var(--color-text-primary)', background: 'var(--color-bg)', boxSizing: 'border-box', outline: 'none' };
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 };
const btnStyle = (loading) => ({ width: '100%', padding: '12px', background: 'var(--color-brand)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, fontFamily: 'var(--font-family)' });

export default function OnboardingPage() {
  const { workspace, subscription, setWorkspace } = useAuth();
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
      // If the subscription is already active (e.g. BYPASS_SUBSCRIPTION), go straight to the dashboard.
      const isActive = subscription?.status === 'active' || subscription?.status === 'trialing';
      navigate(isActive ? '/' : '/checkout');
    } catch (err) {
      setError(err.message || 'Failed to save company details');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
      <div style={card}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 6 }}>Tell us about your company</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>This helps Autonome personalize your experience.</div>
        </div>
        {error && (
          <div style={{ background: 'var(--color-danger-light)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: 13, color: 'var(--color-danger)', marginBottom: 'var(--space-4)' }}>
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label style={labelStyle}>Company Size</label>
            <select value={companySize} onChange={e => setCompanySize(e.target.value)} style={inputStyle}>
              <option value="">Select size…</option>
              {SIZES.map(s => <option key={s} value={s}>{s} employees</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label style={labelStyle}>Phone Number</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 000-0000" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Business Address</label>
            <textarea value={address} onChange={e => setAddress(e.target.value)} rows={3} placeholder="123 Main St, City, State 00000" style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <button type="submit" disabled={loading} style={btnStyle(loading)}>
            {loading ? 'Saving…' : (subscription?.status === 'active' || subscription?.status === 'trialing') ? 'Go to Dashboard' : 'Continue to Payment'}
          </button>
        </form>
      </div>
    </div>
  );
}
