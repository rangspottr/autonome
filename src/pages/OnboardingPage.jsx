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
  { key: 'email', icon: '📧', label: 'Email', desc: 'Receive and respond to customer emails', hint: 'SMTP' },
  { key: 'phone', icon: '📱', label: 'Phone / SMS', desc: 'Handle calls and text messages', hint: 'Twilio' },
  { key: 'payments', icon: '💳', label: 'Payments', desc: 'Track invoices and payments', hint: 'Stripe' },
];

function Step2({ connected, onToggle, onNext, onBack }) {
  return (
    <div>
      <ProgressBar step={2} total={3} />
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 6 }}>
          Connect your business
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          Your agents need to see your business to start working. Connect the tools you already use.
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
              border: `1px solid ${connected[sys.key] ? 'rgba(16,185,129,0.4)' : 'var(--color-border)'}`,
              borderRadius: 'var(--radius-md)',
              transition: 'border-color 0.2s',
            }}
          >
            <span style={{ fontSize: 22 }}>{sys.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text-primary)', marginBottom: 2 }}>
                {sys.label}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{sys.desc}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{sys.hint}</span>
              {connected[sys.key] ? (
                <button
                  onClick={() => onToggle(sys.key, false)}
                  style={{ fontSize: 11, color: 'var(--color-success)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                >
                  ✓ Connected
                </button>
              ) : (
                <button
                  onClick={() => onToggle(sys.key, true)}
                  style={{ fontSize: 11, color: 'var(--color-brand)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                >
                  Connect →
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <button onClick={onNext} style={{ ...primaryBtn(false), marginBottom: 10 }}>Connect & Continue →</button>
      <div style={{ textAlign: 'center' }}>
        <button onClick={onBack} style={secondaryBtn}>← Back</button>
      </div>
    </div>
  );
}

function Step3({ onSubmit, onSkip, loading, error, apiKey, onApiKeyChange, testResult, onTest, testing }) {
  return (
    <div>
      <ProgressBar step={3} total={3} />
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 6 }}>
          Activate your AI Brain
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          Connect an AI provider so your specialists can think, analyze, and act on your behalf — not just report data.
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Anthropic API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={e => onApiKeyChange(e.target.value)}
          placeholder="sk-ant-api…"
          style={inputStyle}
          autoComplete="off"
        />
        <div style={{ marginTop: 6 }}>
          <a
            href="https://console.anthropic.com/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, color: 'var(--color-brand)', textDecoration: 'none' }}
          >
            Don't have a key? Get one at anthropic.com →
          </a>
        </div>
      </div>

      {testResult && (
        <div style={{
          padding: '10px 14px',
          borderRadius: 'var(--radius-md)',
          marginBottom: 16,
          fontSize: 13,
          background: testResult.success ? 'rgba(16,185,129,0.08)' : 'rgba(220,38,38,0.08)',
          border: `1px solid ${testResult.success ? 'rgba(16,185,129,0.3)' : 'rgba(220,38,38,0.3)'}`,
          color: testResult.success ? 'var(--color-success)' : 'var(--color-danger)',
        }}>
          {testResult.success ? `✓ Verified — ${testResult.message || 'API key is valid'}` : `✗ ${testResult.error}`}
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: 13, color: 'var(--color-danger)', marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <button
          onClick={onTest}
          disabled={testing || !apiKey.trim()}
          style={{
            flex: 1,
            padding: '11px',
            background: 'var(--color-bg)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            fontSize: 14,
            fontWeight: 600,
            cursor: (testing || !apiKey.trim()) ? 'not-allowed' : 'pointer',
            opacity: (testing || !apiKey.trim()) ? 0.6 : 1,
            fontFamily: 'var(--font-family)',
          }}
        >
          {testing ? 'Testing…' : 'Test Key'}
        </button>
        <button onClick={onSubmit} disabled={loading} style={{ flex: 2, ...primaryBtn(loading) }}>
          {loading ? 'Activating…' : 'Enter Your Operating Room →'}
        </button>
      </div>

      <div style={{ textAlign: 'center', marginTop: 8 }}>
        <button onClick={onSkip} disabled={loading} style={secondaryBtn}>
          Skip for now — I'll set this up later
        </button>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const { workspace, subscription, setWorkspace } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    businessName: workspace?.name || '',
    industry: workspace?.industry || '',
    companySize: '',
  });
  const [connected, setConnected] = useState({ email: false, phone: false, payments: false });
  const [apiKey, setApiKey] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isActive = subscription?.status === 'active' || subscription?.status === 'trialing';

  function handleFormChange(field, value) {
    setFormData(f => ({ ...f, [field]: value }));
  }

  function handleToggle(key, value) {
    setConnected(c => ({ ...c, [key]: value }));
  }

  async function handleTest() {
    if (!apiKey.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.post('/credentials/anthropic/test', { credentials: { api_key: apiKey.trim(), model: 'claude-sonnet-4-20250514' } });
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, error: err.message || 'Test failed.' });
    } finally {
      setTesting(false);
    }
  }

  async function handleFinish() {
    setError('');
    setLoading(true);
    try {
      // Save AI key if provided
      if (apiKey.trim()) {
        await api.put('/credentials/anthropic', { credentials: { api_key: apiKey.trim(), model: 'claude-sonnet-4-20250514' } });
      }
      // Complete onboarding
      const updated = await api.post(`/workspaces/${workspace.id}/complete-onboarding`, {
        company_size: formData.companySize,
        industry: formData.industry,
      });
      setWorkspace(updated);
      navigate(isActive ? '/' : '/checkout');
    } catch (err) {
      setError(err.message || 'Failed to complete setup.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSkip() {
    setError('');
    setLoading(true);
    try {
      const updated = await api.post(`/workspaces/${workspace.id}/complete-onboarding`, {
        company_size: formData.companySize,
        industry: formData.industry,
      });
      setWorkspace(updated);
      navigate(isActive ? '/' : '/checkout');
    } catch (err) {
      setError(err.message || 'Failed to complete setup.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={wrap}>
      <div style={card}>
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
            connected={connected}
            onToggle={handleToggle}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <Step3
            onSubmit={handleFinish}
            onSkip={handleSkip}
            loading={loading}
            error={error}
            apiKey={apiKey}
            onApiKeyChange={setApiKey}
            testResult={testResult}
            onTest={handleTest}
            testing={testing}
          />
        )}
      </div>
    </div>
  );
}

