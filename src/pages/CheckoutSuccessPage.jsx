import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { T } from '../lib/theme.js';

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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ width: 480, padding: 40, background: T.wh, borderRadius: 12, border: `1px solid ${T.bd}`, textAlign: 'center' }}>
        {status === 'active' ? (
          <>
            <div style={{ fontSize: 48, marginBottom: 16, color: '#22C55E', fontWeight: 800 }}>[OK]</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.tx }}>Subscription active!</div>
            <div style={{ fontSize: 13, color: T.mt, marginTop: 8 }}>Redirecting you to Autonome…</div>
          </>
        ) : status === 'timeout' || status === 'error' ? (
          <>
            <div style={{ fontSize: 32, marginBottom: 16, color: '#D97706', fontWeight: 800 }}>[!]</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.tx }}>Almost there</div>
            <div style={{ fontSize: 13, color: T.mt, marginTop: 8 }}>Your payment was received. Please wait a moment and then <a href="/" style={{ color: T.tx }}>go to the app</a>.</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: T.mt }}>Confirming your subscription…</div>
          </>
        )}
      </div>
    </div>
  );
}
