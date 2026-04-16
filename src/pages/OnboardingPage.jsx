import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { api } from '../lib/api.js';
import AgentMeta from '../components/AgentMeta.js';

const SIZES = ['1-5', '6-10', '11-25', '26-50', '51-100', '100+'];
const INDUSTRIES = ['Retail', 'Services', 'Construction', 'Healthcare', 'Technology', 'Hospitality', 'Real Estate', 'Finance', 'Other'];

const wrap = { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)', padding: '24px' };
const card = { width: '100%', maxWidth: 520, background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-lg)', padding: '40px' };
const inputStyle = { width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 14, fontFamily: 'var(--font-family)', color: 'var(--color-text-primary)', background: 'var(--color-bg)', boxSizing: 'border-box', outline: 'none' };
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 };
const primaryBtn = (disabled) => ({ width: '100%', padding: '12px', background: 'var(--color-brand)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, fontFamily: 'var(--font-family)' });
const secondaryBtn = { background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: 13, cursor: 'pointer', padding: '8px 0', fontFamily: 'var(--font-family)' };
const systemIconBadge = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 6, background: 'var(--color-brand)', color: '#fff', fontSize: 11, fontWeight: 800, flexShrink: 0 };

const activatingScreenStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', textAlign: 'center' };
const activatingAgentsStyle = { display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap', justifyContent: 'center' };
const activatingTitleStyle = { fontSize: 22, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 12 };
const activatingDescStyle = { fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6, maxWidth: 320 };

function ProgressBar({ step, total }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            style={{
              height: 4,
              flex: 1,
              marginRight: i < total - 1 ? 4 : 0,
              borderRadius: 2,
              background: i < step ? 'var(--color-brand)' : 'var(--color-border)',
              transition: 'background 0.3s',
            }}
          />
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'right' }}>
        Step {step} of {total}
      </div>
    </div>
  );
}

function Step1({ workspace, formData, onChange, onNext }) {
  return (
    <div>
      <ProgressBar step={1} total={3} />
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 6 }}>
          Help your AI team understand your business
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          Your five AI specialists are standing by. Tell them about your business so they can start working for you.
        </div>
      </div>

      {/* Agent avatars */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
        {Object.entries(AgentMeta).map(([key, meta]) => (
          <div
            key={key}
            title={`${meta.title} — ${meta.focus}`}
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: meta.bg,
              color: meta.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 800,
              border: `2px solid ${meta.color}30`,
              flexShrink: 0,
            }}
          >
            {meta.icon}
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Business Name</label>
        <input
          type="text"
          value={formData.businessName}
          onChange={e => onChange('businessName', e.target.value)}
          placeholder={workspace?.name || 'Your Business Name'}
          style={inputStyle}
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Industry</label>
        <select value={formData.industry} onChange={e => onChange('industry', e.target.value)} style={inputStyle}>
          <option value="">Select industry…</option>
          {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
      </div>
      <div style={{ marginBottom: 28 }}>
        <label style={labelStyle}>Company Size</label>
        <select value={formData.companySize} onChange={e => onChange('companySize', e.target.value)} style={inputStyle}>
          <option value="">Select size…</option>
          {SIZES.map(s => <option key={s} value={s}>{s} employees</option>)}
        </select>
      </div>

      <button onClick={onNext} style={primaryBtn(false)}>Meet Your AI Team →</button>
    </div>
  );
}

const BUSINESS_SYSTEMS = [
  { key: 'email', icon: 'EM', label: 'Email', desc: 'Live now via SMTP (Gmail, Outlook, custom domains)', status: 'Supported now' },
  { key: 'phone', icon: 'PH', label: 'Phone / SMS', desc: 'Live now via Twilio for SMS and missed-call recovery', status: 'Supported now' },
  { key: 'payments', icon: 'PM', label: 'Payments', desc: 'Live now via Stripe for invoicing and collections', status: 'Supported now' },
  { key: 'leads', icon: 'LD', label: 'CSV / Lead Intake', desc: 'CSV lead import + webhook intake are live in Connections', status: 'Supported now' },
];

const ROADMAP_SYSTEMS = ['Calendar', 'HubSpot', 'OpenPhone / RingCentral', 'QuickBooks'];

function Step2({ onNext, onBack, onOpenConnections }) {
function Step2({ onNext, onBack, onOpenConnections, canOpenConnections }) {
  return (
    <div>
      <ProgressBar step={2} total={3} />
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 6 }}>
          Connect your business
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          Use this same live setup in <strong>Connections</strong> to connect Email, Phone/SMS, Payments, and Lead Intake.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
        {BUSINESS_SYSTEMS.map(sys => (
          <div
            key={sys.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 16px',
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <span style={systemIconBadge}>{sys.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text-primary)', marginBottom: 2 }}>
                {sys.label}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{sys.desc}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--color-success)', fontWeight: 700 }}>{sys.status}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: '12px 16px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', marginBottom: 28, fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--color-text-primary)' }}>Roadmap only (not yet live):</strong> {ROADMAP_SYSTEMS.join(', ')}.
      </div>

      <button onClick={onOpenConnections} style={{ ...secondaryBtn, marginBottom: 10, color: 'var(--color-brand)', fontWeight: 700 }}>
        Open live Connections setup →
      </button>
      {canOpenConnections && (
        <button onClick={onOpenConnections} style={{ ...secondaryBtn, marginBottom: 10, color: 'var(--color-brand)', fontWeight: 700 }}>
          Open live Connections setup →
        </button>
      )}
      <button onClick={onNext} style={{ ...primaryBtn(false), marginBottom: 10 }}>Continue →</button>
      <div style={{ textAlign: 'center' }}>
        <button onClick={onBack} style={secondaryBtn}>← Back</button>
      </div>
    </div>
  );
}

function Step3({ onSubmit, loading, error }) {
  return (
    <div>
      <ProgressBar step={3} total={3} />
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🚀</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 8 }}>
          Your AI team is ready
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6, maxWidth: 340, margin: '0 auto' }}>
          Five specialist agents — Finance, Revenue, Operations, Growth, and Support — are standing by to run your business.
        </div>
      </div>

      <div style={{ padding: '12px 14px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 6 }}>Implementation sequence</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          1) Business basics → 2) System connections → 3) Workflow preferences → 4) Approval thresholds → 5) Activation → 6) First briefing + outputs.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
        {Object.entries(AgentMeta).map(([key, meta]) => (
          <div
            key={key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 14px',
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: meta.bg,
                color: meta.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              {meta.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>{meta.title}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{meta.focus}</div>
            </div>
            <span style={{ fontSize: 11, color: 'var(--color-success)', fontWeight: 700 }}>● Ready</span>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: 13, color: 'var(--color-danger)', marginBottom: 16 }}>
          {error}
        </div>
      )}

      <button onClick={onSubmit} disabled={loading} style={primaryBtn(loading)}>
        {loading ? 'Activating…' : 'Enter Your Operating Room →'}
      </button>
    </div>
  );
}

export default function OnboardingPage() {
  const { workspace, subscription, setWorkspace } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [activating, setActivating] = useState(false);
  const [formData, setFormData] = useState({
    businessName: workspace?.name || '',
    industry: workspace?.industry || '',
    companySize: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isActive = subscription?.status === 'active' || subscription?.status === 'trialing';

  function handleFormChange(field, value) {
    setFormData(f => ({ ...f, [field]: value }));
  }

  async function handleFinish() {
    setError('');
    setLoading(true);
    try {
      // Complete onboarding
      const updated = await api.post(`/workspaces/${workspace.id}/complete-onboarding`, {
        company_size: formData.companySize,
        industry: formData.industry,
      });
      setWorkspace(updated);
      const target = isActive ? '/' : '/checkout';
      setActivating(true);
      setTimeout(() => navigate(target), 2500);
    } catch (err) {
      setError(err.message || 'Failed to complete setup.');
    } finally {
      setLoading(false);
    }
  }

  const pulseKeyframes = `
    @keyframes activatingPulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.12); opacity: 0.85; }
    }
  `;

  return (
    <div style={wrap}>
      <div style={card}>
        {activating ? (
          <div style={activatingScreenStyle}>
            <style>{pulseKeyframes}</style>
            <div style={activatingAgentsStyle}>
              {Object.entries(AgentMeta).map(([key, meta], i) => (
                <div
                  key={key}
                  title={meta.title}
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: '50%',
                    background: meta.bg,
                    color: meta.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 800,
                    border: `2px solid ${meta.color}30`,
                    animation: `activatingPulse 1.6s ease-in-out infinite`,
                    animationDelay: `${i * 0.2}s`,
                  }}
                >
                  {meta.icon}
                </div>
              ))}
            </div>
            <div style={activatingTitleStyle}>
              Your AI team is now active
            </div>
            <div style={activatingDescStyle}>
              Finance, Revenue, Operations, Growth, and Support are scanning your business…
            </div>
          </div>
        ) : (
          <>
        {step === 1 && (
          <Step1
            workspace={workspace}
            formData={formData}
            onChange={handleFormChange}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <Step2
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
            onOpenConnections={() => navigate('/setup/connections')}
            canOpenConnections={isActive}
            onOpenConnections={() => navigate('/?view=connections')}
          />
        )}
        {step === 3 && (
          <Step3
            onSubmit={handleFinish}
            loading={loading}
            error={error}
          />
        )}
          </>
        )}
      </div>
    </div>
  );
}
