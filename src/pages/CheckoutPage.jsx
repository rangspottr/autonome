import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { api } from '../lib/api.js';
import { T } from '../lib/theme.js';

export default function CheckoutPage() {
  const { workspace } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCheckout() {
    setError('');
    setLoading(true);
    try {
      const data = await api.post('/billing/create-checkout-session', {});
      window.location.href = data.url;
    } catch (err) {
      setError(err.message || 'Failed to start checkout');
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ width: 480, padding: 40, background: T.wh, borderRadius: 12, border: `1px solid ${T.bd}` }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.tx }}>Autonome Pro</div>
          <div style={{ fontSize: 13, color: T.mt, marginTop: 6 }}>Your complete AI operations layer.</div>
        </div>
        <div style={{ background: T.bg, border: `1px solid ${T.bd}`, borderRadius: 10, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 36, fontWeight: 800, color: T.tx }}>$1,279<span style={{ fontSize: 16, fontWeight: 500, color: T.mt }}>/mo</span></div>
          <div style={{ fontSize: 13, color: T.mt, marginTop: 4 }}>Billed monthly. Cancel anytime.</div>
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {['Autonomous agents across all business functions', 'Revenue, finance, operations & support automation', 'Real-time workflow execution', 'Full CRM + invoicing + task management', 'AI-powered briefings and insights', 'Unlimited workspace seats'].map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: T.tx }}>
                <span style={{ color: '#22C55E', fontWeight: 700, flexShrink: 0 }}>✓</span>
                {f}
              </div>
            ))}
          </div>
        </div>
        {error && <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#DC2626', marginBottom: 16 }}>{error}</div>}
        <button onClick={handleCheckout} disabled={loading} style={{ width: '100%', padding: '14px', background: T.tx, color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Redirecting to Stripe…' : 'Subscribe — $1,279/mo'}
        </button>
        <div style={{ fontSize: 12, color: T.mt, textAlign: 'center', marginTop: 12 }}>Secure checkout powered by Stripe</div>
      </div>
    </div>
  );
}
