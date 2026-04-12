import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { T } from '../lib/theme.js';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!token) {
      setError('Missing reset token. Please use the link from your email.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword });
      navigate('/login');
    } catch (err) {
      setError(err.message || 'Password reset failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ width: 400, padding: 40, background: T.wh, borderRadius: 12, border: `1px solid ${T.bd}` }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: T.tx, letterSpacing: -1 }}>A</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.tx, marginTop: 8 }}>Set a new password</div>
        </div>
        {error && <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#DC2626', marginBottom: 16 }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: T.tx, marginBottom: 6 }}>New password</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={8} style={{ width: '100%', padding: '10px 12px', border: `1px solid ${T.bd}`, borderRadius: 8, fontSize: 14, color: T.tx, background: T.bg, boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: T.tx, marginBottom: 6 }}>Confirm new password</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={8} style={{ width: '100%', padding: '10px 12px', border: `1px solid ${T.bd}`, borderRadius: 8, fontSize: 14, color: T.tx, background: T.bg, boxSizing: 'border-box' }} />
          </div>
          <button type="submit" disabled={loading} style={{ width: '100%', padding: '12px', background: T.tx, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Updating…' : 'Update Password'}
          </button>
        </form>
        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: T.mt }}>
          <Link to="/login" style={{ color: T.tx, fontWeight: 600 }}>Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
