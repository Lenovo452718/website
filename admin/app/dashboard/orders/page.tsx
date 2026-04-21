'use client';
import { useEffect, useState, useCallback } from 'react';
import { orders } from '@/lib/api';
import type { Order } from '@/lib/api';

const STATUSES = ['pending','confirmed','processing','called','edited','cancelled','done','reported'];
const STATUS_COLORS: Record<string, string> = {
  pending:    'bg-amber-100 text-amber-800 border-amber-200',
  confirmed:  'bg-green-100 text-green-800 border-green-200',
  cancelled:  'bg-red-100 text-red-800 border-red-200',
  processing: 'bg-blue-100 text-blue-800 border-blue-200',
  called:     'bg-purple-100 text-purple-800 border-purple-200',
  done:       'bg-gray-100 text-gray-600 border-gray-200',
  edited:     'bg-orange-100 text-orange-800 border-orange-200',
  reported:   'bg-pink-100 text-pink-800 border-pink-200',
};

export default function OrdersPage() {
  const [list,     setList]     = useState<Order[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState('');
  const [search,   setSearch]   = useState('');
  const [selected, setSelected] = useState<Order | null>(null);
  const [cityDraft, setCityDraft] = useState('');
  const [savingCity, setSavingCity] = useState(false);
  const [priceDraft, setPriceDraft] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await orders.list({ ...(filter && { status: filter }), limit: 200 });
      setList(data);
    } catch {}
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setCityDraft(selected?.city || ''); }, [selected?.id, selected?.city]);
  useEffect(() => {
    if (!selected) {
      setPriceDraft('');
      return;
    }
    const amount = typeof selected.total === 'number'
      ? selected.total
      : Number.parseFloat(String(selected.price || '0'));
    setPriceDraft(Number.isFinite(amount) ? String(amount) : '');
  }, [selected?.id, selected?.total, selected?.price]);

  function getOrderAmount(order: Order) {
    if (typeof order.total === 'number') return order.total;
    const parsed = Number.parseFloat(String(order.price || '0'));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const filtered = list.filter(o =>
    !search ||
    o.customer?.toLowerCase().includes(search.toLowerCase()) ||
    o.phone?.includes(search) ||
    o.id?.toLowerCase().includes(search.toLowerCase())
  );

  async function updateStatus(id: string, status: string) {
    try {
      await orders.update(id, { status });
      setList(prev => prev.map(o => o.id === id ? { ...o, status } : o));
      if (selected?.id === id) setSelected({ ...selected, status });
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Update failed'); }
  }

  async function updateCity(id: string) {
    const city = cityDraft.trim();
    setSavingCity(true);
    try {
      const updated = await orders.update(id, { city });
      setList(prev => prev.map(o => o.id === id ? { ...o, city: updated.city } : o));
      if (selected?.id === id) setSelected({ ...selected, city: updated.city });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'City update failed');
    } finally {
      setSavingCity(false);
    }
  }

  async function updatePrice(id: string) {
    const total = Number.parseFloat(priceDraft);
    if (!Number.isFinite(total) || total < 0) {
      alert('Enter a valid price');
      return;
    }
    setSavingPrice(true);
    try {
      const updated = await orders.update(id, { total });
      setList(prev => prev.map(o => o.id === id ? { ...o, total: updated.total, price: String(updated.total) } : o));
      if (selected?.id === id) {
        setSelected({ ...selected, total: updated.total, price: String(updated.total) });
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Price update failed');
    } finally {
      setSavingPrice(false);
    }
  }

  async function deleteOrder(id: string) {
    if (!confirm('Delete this order?')) return;
    try {
      await orders.delete(id);
      setList(prev => prev.filter(o => o.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Delete failed'); }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} order{filtered.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input type="text" placeholder="Search by name, phone, ID…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#c8a96e] transition" />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[#c8a96e]">
          <option value="">All Status</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>

      <div className="flex gap-5">
        {/* Orders table */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden min-w-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-[#c8a96e] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <div className="text-4xl mb-3">📦</div>
              <p className="font-semibold">No orders found</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Order ID','Customer','Product','City','Price','Status','Date'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 hidden sm:table-cell first:table-cell last:table-cell">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(o => (
                  <tr key={o.id} onClick={() => setSelected(o)}
                    className={`cursor-pointer hover:bg-gray-50/80 transition ${selected?.id === o.id ? 'bg-[#c8a96e]/5' : ''}`}>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-gray-500">{o.id.slice(-8)}</span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{o.customer}</p>
                        <p className="text-xs text-gray-400">{o.phone}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <p className="text-sm text-gray-700 truncate max-w-32">{o.product}</p>
                      {o.size && <p className="text-xs text-gray-400">Size {o.size}</p>}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-sm text-gray-600">{o.city}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-bold text-gray-800">{getOrderAmount(o)} MAD</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full border ${STATUS_COLORS[o.status] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <span className="text-xs text-gray-400">
                        {new Date(o.createdAt).toLocaleDateString('en-GB')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail drawer */}
        {selected && (
          <div className="w-80 shrink-0 bg-white rounded-xl border border-gray-200 overflow-y-auto max-h-[calc(100vh-10rem)] hidden lg:block">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Order Detail</h3>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-700 transition">
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Order ID</p>
                <p className="text-xs font-mono text-gray-700">{selected.id}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Customer', value: selected.customer },
                  { label: 'Phone',    value: selected.phone },
                  { label: 'Product',  value: selected.product },
                  { label: 'Size',     value: selected.size || '—' },
                  { label: 'Qty',      value: String(selected.qty) },
                  { label: 'Price',    value: `${getOrderAmount(selected)} MAD` },
                ].map(row => (
                  <div key={row.label}>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{row.label}</p>
                    <p className="text-sm text-gray-800 mt-0.5 break-words">{row.value}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">City</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={cityDraft}
                    onChange={e => setCityDraft(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-[#c8a96e]"
                    placeholder="Client city"
                  />
                  <button
                    onClick={() => updateCity(selected.id)}
                    disabled={savingCity || cityDraft.trim() === (selected.city || '')}
                    className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    {savingCity ? 'Saving' : 'Save'}
                  </button>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Price (MAD)</p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={priceDraft}
                    onChange={e => setPriceDraft(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-[#c8a96e]"
                    placeholder="Order price"
                  />
                  <button
                    onClick={() => updatePrice(selected.id)}
                    disabled={savingPrice || Number.parseFloat(priceDraft) === getOrderAmount(selected)}
                    className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    {savingPrice ? 'Saving' : 'Save'}
                  </button>
                </div>
              </div>
              {selected.address && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Address</p>
                  <p className="text-sm text-gray-700">{selected.address}</p>
                </div>
              )}

              {/* Status change */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Change Status</p>
                <div className="flex flex-wrap gap-1.5">
                  {STATUSES.map(s => (
                    <button key={s} onClick={() => updateStatus(selected.id, s)}
                      className={`text-xs px-2.5 py-1 rounded-full font-semibold border transition ${
                        selected.status === s
                          ? STATUS_COLORS[s] || 'bg-gray-100 text-gray-600 border-gray-200'
                          : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                      }`}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tracking */}
              {selected.trackingCode && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Tracking Code</p>
                  <p className="text-sm font-mono text-blue-600">{selected.trackingCode}</p>
                </div>
              )}

              <button onClick={() => deleteOrder(selected.id)}
                className="w-full py-2 rounded-lg text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 transition">
                Delete Order
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
