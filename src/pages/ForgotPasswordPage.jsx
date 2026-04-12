import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { T } from '../lib/theme.js';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ width: 400, padding: 40, background: T.wh, borderRadius: 12, border: `1px solid ${T.bd}` }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: T.tx, letterSpacing: -1 }}>A</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.tx, marginTop: 8 }}>Reset your password</div>
          <div style={{ fontSize: 13, color: T.mt, marginTop: 6 }}>Enter your email and we will send you a reset link.</div>
        </div>
        {submitted ? (
          <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, padding: '14px', fontSize: 13, color: '#166534', textAlign: 'center' }}>
            If that email exists, a reset link has been sent. Check your inbox.
          </div>
        ) : (
          <>
            {error && <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#DC2626', marginBottom: 16 }}>{error}</div>}
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: T.tx, marginBottom: 6 }}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={{ width: '100%', padding: '10px 12px', border: `1px solid ${T.bd}`, borderRadius: 8, fontSize: 14, color: T.tx, background: T.bg, boxSizing: 'border-box' }} />
              </div>
              <button type="submit" disabled={loading} style={{ width: '100%', padding: '12px', background: T.tx, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
          </>
        )}
        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: T.mt }}>
          <Link to="/login" style={{ color: T.tx, fontWeight: 600 }}>Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
