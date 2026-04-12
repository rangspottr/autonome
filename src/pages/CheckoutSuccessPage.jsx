import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';

export default function CheckoutSuccessPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('checking');
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    let timer;
    async function checkStatus() {
      try {
        const data = await api.get('/billing/status');
        if (data.status === 'active' || data.status === 'trialing') {
          setStatus('active');
          setTimeout(() => navigate('/'), 2000);
        } else if (attempts < 10) {
          setAttempts(a => a + 1);
          timer = setTimeout(checkStatus, 2000);
        } else {
          setStatus('timeout');
        }
      } catch {
        if (attempts < 10) {
          setAttempts(a => a + 1);
          timer = setTimeout(checkStatus, 2000);
        } else {
          setStatus('error');
        }
      }
    }
    checkStatus();
    return () => clearTimeout(timer);
  }, [attempts, navigate]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
      <div style={{ width: 440, padding: 40, background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-lg)', textAlign: 'center' }}>
        {status === 'active' ? (
          <>
            <div style={{ fontSize: 48, marginBottom: 16, color: 'var(--color-success)', fontWeight: 800 }}>✓</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 8 }}>Subscription active!</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Redirecting you to Autonome…</div>
          </>
        ) : status === 'timeout' || status === 'error' ? (
          <>
            <div style={{ fontSize: 40, marginBottom: 16, color: 'var(--color-warning)', fontWeight: 800 }}>!</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 8 }}>Almost there</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              Your payment was received. Please wait a moment and then{' '}
              <a href="/" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>go to the app</a>.
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Confirming your subscription…</div>
        )}
      </div>
    </div>
  );
}
