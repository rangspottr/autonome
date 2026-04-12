import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';

const card = { width: 440, padding: 40, background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-lg)', textAlign: 'center' };

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('loading'); // loading | success | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setMessage('No verification token provided.');
      return;
    }
    api.get(`/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(() => {
        setStatus('success');
        setMessage('Your email has been verified. You can now sign in.');
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.message || 'Verification failed. The link may have expired.');
      });
  }, [searchParams]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
      <div style={card}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 12 }}>
          Email Verification
        </div>
        {status === 'loading' && (
          <div style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>Verifying your email…</div>
        )}
        {status === 'success' && (
          <>
            <div style={{ background: 'var(--color-success-light)', border: '1px solid var(--color-success)', borderRadius: 'var(--radius-md)', padding: '14px', fontSize: 13, color: 'var(--color-success)', marginBottom: 20 }}>
              {message}
            </div>
            <Link to="/login" style={{ display: 'inline-block', padding: '10px 24px', background: 'var(--color-brand)', color: '#fff', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
              Sign in
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <div style={{ background: 'var(--color-danger-light)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 'var(--radius-md)', padding: '14px', fontSize: 13, color: 'var(--color-danger)', marginBottom: 20 }}>
              {message}
            </div>
            <Link to="/login" style={{ fontSize: 13, color: 'var(--color-text-muted)', textDecoration: 'none' }}>
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
