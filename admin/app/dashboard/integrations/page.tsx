'use client';
import { useEffect, useState } from 'react';
import { olivraison, orders } from '@/lib/api';
import type { OlivraisonConfig, OlivraisonResult, Order } from '@/lib/api';

export default function IntegrationsPage() {
  const [config,   setConfig]   = useState<OlivraisonConfig | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [testing,  setTesting]  = useState(false);
  const [success,  setSuccess]  = useState('');
  const [error,    setError]    = useState('');

  const [apiKey,    setApiKey]    = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [storeId,   setStoreId]   = useState('');
  const [isActive,  setIsActive]  = useState(false);

  // Send orders to Olivraison
  const [confirmed,   setConfirmed]   = useState<Order[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sending,     setSending]     = useState(false);
  const [results,     setResults]     = useState<OlivraisonResult[] | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [c, o] = await Promise.all([
          olivraison.getConfig(),
          orders.list({ status: 'confirmed' }),
        ]);
        setConfig(c);
        setApiKey(c.apiKey || '');
        setApiSecret(c.apiSecret || '');
        setStoreId(c.storeId || '');
        setIsActive(c.isActive || false);
        setConfirmed(o);
      } catch {}
      finally { setLoading(false); }
    }
    load();
  }, []);

  const flash = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const c = await olivraison.saveConfig({ apiKey, apiSecret, storeId, isActive });
      setConfig(c);
      flash('Credentials saved!');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  async function handleSend() {
    if (!selectedIds.size) return;
    if (!apiKey || !apiSecret) { setError('Please save your API credentials first.'); return; }
    if (!confirm(`Send ${selectedIds.size} order(s) to Olivraison?`)) return;
    setSending(true);
    setError('');
    setResults(null);
    try {
      const res = await olivraison.send([...selectedIds], apiKey, apiSecret);
      setResults(res.results);
      const ok = res.results.filter(r => r.success).length;
      flash(`${ok} of ${res.results.length} orders sent successfully`);
      setSelectedIds(new Set());
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Send failed'); }
    finally { setSending(false); }
  }

  const toggleOrder = (id: string) => {
    const s = new Set(selectedIds);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedIds(s);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-[#c8a96e] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
        <p className="text-sm text-gray-500 mt-0.5">Connect Olivraison Maroc to manage your deliveries</p>
      </div>

      {error && <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>}
      {success && <div className="px-4 py-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg">{success}</div>}

      {/* Olivraison Card */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center text-2xl">
              🚚
            </div>
            <div>
              <h2 className="font-bold text-gray-900">Olivraison Maroc</h2>
              <p className="text-xs text-gray-500">Moroccan delivery & logistics API</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${isActive && config?.apiKey ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {isActive && config?.apiKey ? '● Connected' : '○ Not connected'}
            </span>
            <label className="flex items-center gap-2 cursor-pointer">
              <div className={`w-10 h-6 rounded-full transition-colors relative ${isActive ? 'bg-green-500' : 'bg-gray-300'}`}
                onClick={() => setIsActive(a => !a)}>
                <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${isActive ? 'translate-x-5' : 'translate-x-1'}`} />
              </div>
            </label>
          </div>
        </div>

        {/* Credentials */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600">
            Enter your Olivraison API credentials to connect your delivery account.
            Once saved, select confirmed orders below and send them to Olivraison in one click.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Public API Key</label>
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder="pk_live_…"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:border-[#c8a96e] transition" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Private API Key</label>
              <input type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)}
                placeholder="sk_live_…"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:border-[#c8a96e] transition" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Store ID (optional)</label>
              <input type="text" value={storeId} onChange={e => setStoreId(e.target.value)}
                placeholder="Your Olivraison store ID"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#c8a96e] transition" />
            </div>
          </div>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #c8a96e, #a8864e)' }}>
            {saving ? 'Saving…' : 'Save Credentials'}
          </button>
        </div>

        {/* How to get API key */}
        <div className="px-6 py-4 bg-blue-50 border-t border-blue-100">
          <p className="text-sm font-semibold text-blue-800 mb-1">How to get your API key</p>
          <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
            <li>Log in to your Olivraison Maroc account at olivraison.com</li>
            <li>Go to <strong>Settings → API & Integrations</strong></li>
            <li>Generate a new API key and copy both the public and private keys</li>
            <li>Paste them above and click Save</li>
          </ol>
        </div>
      </div>

      {/* Send Orders */}
      <div className="bg-white rounded-2xl border border-gray-200">
        <div className="px-6 py-5 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Send Confirmed Orders to Olivraison</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {confirmed.length} confirmed order{confirmed.length !== 1 ? 's' : ''} ready to ship
          </p>
        </div>

        {confirmed.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <div className="text-3xl mb-2">✅</div>
            <p className="text-sm font-medium text-gray-600">No confirmed orders</p>
            <p className="text-xs mt-1">Confirm orders in the Orders page first</p>
          </div>
        ) : (
          <>
            {selectedIds.size > 0 && (
              <div className="mx-6 mt-4 px-4 py-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
                <span className="text-sm font-semibold text-green-800">{selectedIds.size} order(s) selected</span>
                <button onClick={handleSend} disabled={sending}
                  className="ml-auto px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60 transition hover:opacity-90"
                  style={{ background: '#27ae60' }}>
                  {sending ? 'Sending…' : '🚚 Send to Olivraison'}
                </button>
              </div>
            )}

            <div className="divide-y divide-gray-50 px-2 py-2">
              {confirmed.map(o => (
                <label key={o.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer hover:bg-gray-50/80 transition ${selectedIds.has(o.id) ? 'bg-green-50/50' : ''}`}>
                  <input type="checkbox" checked={selectedIds.has(o.id)} onChange={() => toggleOrder(o.id)}
                    className="rounded accent-green-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{o.customer}</p>
                    <p className="text-xs text-gray-500 truncate">{o.product} · {o.city} · {o.phone}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-gray-800">{o.price} MAD</p>
                    <p className="text-xs text-gray-400">Qty: {o.qty}</p>
                  </div>
                </label>
              ))}
            </div>
          </>
        )}

        {/* Results */}
        {results && results.length > 0 && (
          <div className="px-6 pb-5">
            <h4 className="font-semibold text-gray-800 text-sm mb-3">Send Results</h4>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {results.map(r => (
                <div key={r.orderId} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border ${
                  r.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                }`}>
                  <span className="text-lg">{r.success ? '✅' : '❌'}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">{r.customer || r.orderId}</p>
                    {r.success && r.trackingCode && (
                      <p className="text-xs text-green-700 font-mono">Tracking: {r.trackingCode}</p>
                    )}
                    {!r.success && r.error && (
                      <p className="text-xs text-red-700">{r.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
