import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import styles from './AuthLayout.module.css';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.authWrap}>
      <div className={styles.brand}>
        <div className={styles.brandLogo}>
          <div className={styles.brandLogoMark}>A</div>
          <span className={styles.brandLogoText}>Autonome</span>
        </div>
        <div style={{ marginTop: 'auto' }}>
          <div className={styles.brandTagline}>Your AI-powered business operator</div>
          <div className={styles.brandTaglineSub}>Autonomously manage finance, sales, operations, and growth — so you can focus on what matters.</div>
          <div className={styles.brandFeatures}>
            <div className={styles.brandFeature}><span className={styles.brandFeatureDot} />Automated agent decisions</div>
            <div className={styles.brandFeature}><span className={styles.brandFeatureDot} />Real-time business intelligence</div>
            <div className={styles.brandFeature}><span className={styles.brandFeatureDot} />Integrated finance &amp; CRM</div>
          </div>
        </div>
      </div>
      <div className={styles.formSide}>
        <div className={styles.formCard}>
          <h1 className={styles.formTitle}>Welcome back</h1>
          <p className={styles.formSubtitle}>Sign in to your Autonome account</p>
          {error && <div className={styles.errorBanner}>{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="email">Email</label>
              <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required className={styles.formInput} placeholder="you@company.com" autoComplete="email" />
            </div>
            <div className={styles.formGroup}>
              <div className={styles.formLabelRow}>
                <label className={styles.formLabel} htmlFor="password">Password</label>
                <Link to="/forgot-password" className={styles.forgotLink}>Forgot password?</Link>
              </div>
              <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required className={styles.formInput} autoComplete="current-password" />
            </div>
            <button type="submit" disabled={loading} className={styles.formSubmit}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
          <div className={styles.formFooter}>
            Don&apos;t have an account? <Link to="/signup">Sign up</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
