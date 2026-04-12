import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

const card = { width: 440, padding: 40, background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-lg)' };
const inputStyle = { width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 14, fontFamily: 'var(--font-family)', color: 'var(--color-text-primary)', background: 'var(--color-bg)', boxSizing: 'border-box', outline: 'none' };
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 };
const btnStyle = (loading) => ({ width: '100%', padding: '12px', background: 'var(--color-brand)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, fontFamily: 'var(--font-family)' });

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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
      <div style={card}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 6 }}>Reset your password</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Enter your email and we will send you a reset link.</div>
        </div>
        {submitted ? (
          <div style={{ background: 'var(--color-success-light)', border: '1px solid var(--color-success)', borderRadius: 'var(--radius-md)', padding: '14px', fontSize: 13, color: 'var(--color-success-text, var(--color-success))', textAlign: 'center' }}>
            If that email exists, a reset link has been sent. Check your inbox.
          </div>
        ) : (
          <>
            {error && (
              <div style={{ background: 'var(--color-danger-light)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: 13, color: 'var(--color-danger)', marginBottom: 'var(--space-4)' }}>
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} placeholder="you@company.com" autoComplete="email" />
              </div>
              <button type="submit" disabled={loading} style={btnStyle(loading)}>
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
          </>
        )}
        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--color-text-muted)' }}>
          <Link to="/login" style={{ color: 'var(--color-text-primary)', fontWeight: 600, textDecoration: 'none' }}>Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
