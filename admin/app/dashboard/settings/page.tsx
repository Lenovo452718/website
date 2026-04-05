'use client';
import { useEffect, useState } from 'react';
import { settings, auth } from '@/lib/api';
import type { SiteSettings } from '@/lib/api';

export default function SettingsPage() {
  const [data,    setData]    = useState<Partial<SiteSettings>>({});
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [success, setSuccess] = useState('');
  const [error,   setError]   = useState('');

  // Password change
  const [newPwd,     setNewPwd]     = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdSaving,  setPwdSaving]  = useState(false);
  const [pwdMsg,     setPwdMsg]     = useState('');

  // 2FA
  const [twoFa,       setTwoFa]       = useState(false);
  const [qrData,      setQrData]      = useState('');
  const [totpCode,    setTotpCode]    = useState('');
  const [twoFaSaving, setTwoFaSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [s, t] = await Promise.all([settings.get(), auth.get2faStatus()]);
        setData(s);
        setTwoFa(t.enabled);
      } catch {}
      finally { setLoading(false); }
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const updated = await settings.update(data);
      setData(updated);
      setSuccess('Settings saved!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  async function handlePasswordChange() {
    if (newPwd !== confirmPwd) { setPwdMsg('Passwords do not match'); return; }
    setPwdSaving(true);
    setPwdMsg('');
    try {
      await auth.changePassword(newPwd);
      setPwdMsg('Password updated!');
      setNewPwd(''); setConfirmPwd('');
    } catch (e: unknown) { setPwdMsg(e instanceof Error ? e.message : 'Failed'); }
    finally { setPwdSaving(false); }
  }

  async function setup2fa() {
    setTwoFaSaving(true);
    try {
      const res = await auth.setup2fa();
      setQrData(res.qr);
    } catch {}
    finally { setTwoFaSaving(false); }
  }

  async function verify2fa() {
    setTwoFaSaving(true);
    try {
      await auth.verify2fa(totpCode);
      setTwoFa(true);
      setQrData('');
      setTotpCode('');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Invalid code'); }
    finally { setTwoFaSaving(false); }
  }

  async function disable2fa() {
    if (!confirm('Disable 2FA?')) return;
    setTwoFaSaving(true);
    try { await auth.disable2fa(); setTwoFa(false); }
    catch {}
    finally { setTwoFaSaving(false); }
  }

  const update = (k: keyof SiteSettings, v: unknown) => setData(d => ({ ...d, [k]: v }));

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-[#c8a96e] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Store configuration and admin access</p>
      </div>

      {error && <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>}
      {success && <div className="px-4 py-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg">{success}</div>}

      {/* Store Settings */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-gray-800">Store Settings</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            { label: 'Store Name',  key: 'storeName',  type: 'text',  ph: 'StreetStore' },
            { label: 'WhatsApp',    key: 'whatsapp',   type: 'text',  ph: '212771152186' },
            { label: 'Currency',    key: 'currency',   type: 'text',  ph: 'MAD' },
            { label: 'Contact Email', key: 'email',   type: 'email', ph: 'contact@…' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">{f.label}</label>
              <input type={f.type} value={(data as Record<string,string>)[f.key] || ''} placeholder={f.ph}
                onChange={e => update(f.key as keyof SiteSettings, e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#c8a96e] transition" />
            </div>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {[
            { label: 'Primary Color', key: 'primaryColor' },
            { label: 'Accent Color',  key: 'accentColor'  },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">{f.label}</label>
              <div className="flex items-center gap-2">
                <input type="color" value={(data as Record<string,string>)[f.key] || '#000000'}
                  onChange={e => update(f.key as keyof SiteSettings, e.target.value)}
                  className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5" />
                <input type="text" value={(data as Record<string,string>)[f.key] || ''}
                  onChange={e => update(f.key as keyof SiteSettings, e.target.value)}
                  className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:border-[#c8a96e] transition" />
              </div>
            </div>
          ))}
        </div>

        {/* Announcement bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Announcement Bar</label>
            <label className="flex items-center gap-2 cursor-pointer">
              <div className={`w-9 h-5 rounded-full transition-colors relative ${data.announcementActive ? 'bg-green-500' : 'bg-gray-300'}`}
                onClick={() => update('announcementActive', !data.announcementActive)}>
                <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-transform ${data.announcementActive ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
              </div>
              <span className="text-xs text-gray-500">Show on storefront</span>
            </label>
          </div>
          <input value={data.announcementBar || ''} onChange={e => update('announcementBar', e.target.value)}
            placeholder="Free delivery over 500 MAD 🚚"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#c8a96e] transition" />
        </div>

        <button onClick={handleSave} disabled={saving}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #c8a96e, #a8864e)' }}>
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>

      {/* Hero Video */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">Hero Video Intro</h2>
            <p className="text-xs text-gray-500 mt-0.5">Video plays first, then reveals the hero title and buttons</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <div className={`w-9 h-5 rounded-full transition-colors relative ${data.heroVideoActive ? 'bg-green-500' : 'bg-gray-300'}`}
              onClick={() => update('heroVideoActive', !data.heroVideoActive)}>
              <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-transform ${data.heroVideoActive ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
            </div>
            <span className="text-xs text-gray-500">{data.heroVideoActive ? 'Active' : 'Inactive'}</span>
          </label>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Video URL (Cloudinary or direct .mp4)</label>
          <input value={data.heroVideoUrl || ''} onChange={e => update('heroVideoUrl', e.target.value)}
            placeholder="https://res.cloudinary.com/…/video/upload/…/hero.mp4"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#c8a96e] transition font-mono" />
        </div>
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #c8a96e, #a8864e)' }}>
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-gray-800">Change Password</h2>
        <p className="text-xs text-gray-500">Min 8 characters · must include a letter and a number</p>
        {pwdMsg && (
          <p className={`text-sm px-3 py-2 rounded-lg border ${pwdMsg.includes('updated') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
            {pwdMsg}
          </p>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">New Password</label>
            <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)}
              placeholder="New password"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#c8a96e] transition" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Confirm Password</label>
            <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
              placeholder="Repeat password"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#c8a96e] transition" />
          </div>
        </div>
        <button onClick={handlePasswordChange} disabled={pwdSaving}
          className="px-5 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 transition disabled:opacity-60">
          {pwdSaving ? 'Updating…' : 'Update Password'}
        </button>
      </div>

      {/* 2FA */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Two-Factor Authentication</h2>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${twoFa ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {twoFa ? '🔒 Enabled' : 'Disabled'}
          </span>
        </div>

        {!twoFa && !qrData && (
          <>
            <p className="text-sm text-gray-600">Add a second layer of security to your admin account.</p>
            <button onClick={setup2fa} disabled={twoFaSaving}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60 transition hover:opacity-90"
              style={{ background: '#0f1a2e' }}>
              {twoFaSaving ? '…' : 'Enable 2FA'}
            </button>
          </>
        )}

        {qrData && !twoFa && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Scan with your authenticator app, then enter the code:</p>
            <div className="flex justify-center">
              <img src={qrData} alt="QR Code" className="w-44 h-44 border border-gray-200 rounded-xl p-2" />
            </div>
            <input type="text" inputMode="numeric" value={totpCode}
              onChange={e => setTotpCode(e.target.value.replace(/\D/g,'').slice(0,6))}
              placeholder="000000"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-2xl font-mono text-center tracking-[0.5em] focus:outline-none focus:border-[#c8a96e] transition" />
            <button onClick={verify2fa} disabled={twoFaSaving || totpCode.length !== 6}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60 transition hover:opacity-90"
              style={{ background: '#0f1a2e' }}>
              {twoFaSaving ? '…' : 'Confirm & Enable'}
            </button>
          </div>
        )}

        {twoFa && (
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <p className="font-medium text-gray-800 text-sm">2FA is active</p>
              <p className="text-xs text-gray-500">Your account is protected with a second factor.</p>
            </div>
            <button onClick={disable2fa}
              className="text-xs font-semibold px-3 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition">
              Disable 2FA
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
