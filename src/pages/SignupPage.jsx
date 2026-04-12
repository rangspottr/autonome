import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import styles from './AuthLayout.module.css';

export default function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) return setError('Passwords do not match');
    if (password.length < 8) return setError('Password must be at least 8 characters');
    setLoading(true);
    try {
      await signup(email, password, fullName);
      navigate('/create-workspace');
    } catch (err) {
      setError(err.message || 'Signup failed');
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
          <div className={styles.brandTagline}>Start automating your business today</div>
          <div className={styles.brandTaglineSub}>Join teams using Autonome to automate operations, close more deals, and make smarter financial decisions.</div>
          <div className={styles.brandFeatures}>
            <div className={styles.brandFeature}><span className={styles.brandFeatureDot} />14-day free trial included</div>
            <div className={styles.brandFeature}><span className={styles.brandFeatureDot} />No setup required</div>
            <div className={styles.brandFeature}><span className={styles.brandFeatureDot} />Cancel anytime</div>
          </div>
        </div>
      </div>
      <div className={styles.formSide}>
        <div className={styles.formCard}>
          <h1 className={styles.formTitle}>Create your account</h1>
          <p className={styles.formSubtitle}>Get started with Autonome for free</p>
          {error && <div className={styles.errorBanner}>{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="fullName">Full Name</label>
              <input id="fullName" type="text" value={fullName} onChange={e => setFullName(e.target.value)} required className={styles.formInput} placeholder="Jane Smith" autoComplete="name" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="email">Email</label>
              <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required className={styles.formInput} placeholder="you@company.com" autoComplete="email" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="password">Password</label>
              <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required className={styles.formInput} autoComplete="new-password" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="confirm">Confirm Password</label>
              <input id="confirm" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required className={styles.formInput} autoComplete="new-password" />
            </div>
            <button type="submit" disabled={loading} className={styles.formSubmit}>
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
          <div className={styles.formFooter}>
            Already have an account? <Link to="/login">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
