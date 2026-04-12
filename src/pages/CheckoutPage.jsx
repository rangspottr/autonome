import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { api } from '../lib/api.js';

const FEATURES = [
  'Autonomous agents across all business functions',
  'Revenue, finance, operations & support automation',
  'Real-time workflow execution',
  'Full CRM + invoicing + task management',
  'AI-powered briefings and insights',
  'Unlimited workspace seats',
];

export default function CheckoutPage() {
  // eslint-disable-next-line no-unused-vars
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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
      <div style={{ width: 440, padding: 40, background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 4 }}>Autonome Pro</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Your complete AI operations layer.</div>
        </div>
        <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--color-text-primary)' }}>
            $1,279<span style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-text-muted)' }}>/mo</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>Billed monthly. Cancel anytime.</div>
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {FEATURES.map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: 'var(--color-text-primary)' }}>
                <span style={{ color: 'var(--color-success)', fontWeight: 700, flexShrink: 0 }}>✓</span>
                {f}
              </div>
            ))}
          </div>
        </div>
        {error && (
          <div style={{ background: 'var(--color-danger-light)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: 13, color: 'var(--color-danger)', marginBottom: 'var(--space-4)' }}>
            {error}
          </div>
        )}
        <button
          onClick={handleCheckout}
          disabled={loading}
          style={{ width: '100%', padding: '14px', background: 'var(--color-brand)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, fontFamily: 'var(--font-family)' }}
        >
          {loading ? 'Redirecting to Stripe…' : 'Subscribe — $1,279/mo'}
        </button>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 12 }}>
          Secure checkout powered by Stripe
        </div>
      </div>
    </div>
  );
}
