'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [totp, setTotp]         = useState('');
  const [need2fa, setNeed2fa]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    if (localStorage.getItem('ss_admin_token')) router.replace('/dashboard');
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await auth.login(password, need2fa ? totp : undefined);
      if (res.require2fa) { setNeed2fa(true); setLoading(false); return; }
      if (res.token) {
        localStorage.setItem('ss_admin_token', res.token);
        router.replace('/dashboard');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #06101f 0%, #0f1a2e 50%, #1a3060 100%)' }}>
      <div className="w-full max-w-md mx-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #c8a96e, #a8864e)' }}>
              <span className="text-[#0f1a2e] font-black text-sm">SS</span>
            </div>
            <span className="text-white font-black text-xl tracking-widest">STREETSTORE</span>
          </div>
          <p className="text-white/40 text-xs tracking-widest uppercase mt-2">Admin Panel</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h1 className="text-xl font-bold text-gray-900 mb-1">
            {need2fa ? 'Two-Factor Authentication' : 'Welcome back'}
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {need2fa ? 'Enter the 6-digit code from your authenticator app.' : 'Sign in to your admin panel.'}
          </p>

          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!need2fa ? (
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoFocus
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#c8a96e] focus:ring-2 focus:ring-[#c8a96e]/20 transition"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
                  Authenticator Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={totp}
                  onChange={e => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  required
                  autoFocus
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg text-2xl font-mono text-center tracking-[0.5em] focus:outline-none focus:border-[#c8a96e] focus:ring-2 focus:ring-[#c8a96e]/20 transition"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg text-sm font-bold tracking-wide transition-all disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #c8a96e, #a8864e)', color: '#0f1a2e' }}
            >
              {loading ? 'Signing in…' : need2fa ? 'Verify Code' : 'Sign In'}
            </button>

            {need2fa && (
              <button type="button" onClick={() => setNeed2fa(false)}
                className="w-full text-sm text-gray-500 hover:text-gray-700 transition">
                ← Back to password
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
