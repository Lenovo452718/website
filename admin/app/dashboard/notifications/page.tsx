'use client';
import { useState, useEffect, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('ss_admin_token');
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string>),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
}

interface Notification {
  id: string;
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  title: string;
  message: string;
  createdAt: string;
}

export default function NotificationsPage() {
  const [audience, setAudience]           = useState<'all' | 'specific'>('all');
  const [search, setSearch]               = useState('');
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [selected, setSelected]           = useState<Customer[]>([]);
  const [title, setTitle]                 = useState('');
  const [message, setMessage]             = useState('');
  const [sending, setSending]             = useState(false);
  const [toast, setToast]                 = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);
  const [history, setHistory]             = useState<Notification[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    apiFetch('/api/admin/push/subscriber-count')
      .then(d => setSubscriberCount(d.count))
      .catch(() => {});

    apiFetch('/api/admin/notifications')
      .then(d => setHistory(d))
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, []);

  const searchCustomers = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    try {
      const rows = await apiFetch(`/api/admin/registered-customers`);
      const lower = q.toLowerCase();
      setSearchResults(
        (rows as Customer[])
          .filter(c => c.name.toLowerCase().includes(lower) || c.email.toLowerCase().includes(lower))
          .slice(0, 8)
      );
    } catch (_) {}
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchCustomers(search), 300);
    return () => clearTimeout(t);
  }, [search, searchCustomers]);

  function addCustomer(c: Customer) {
    if (!selected.find(s => s.id === c.id)) setSelected(prev => [...prev, c]);
    setSearch('');
    setSearchResults([]);
  }

  function removeCustomer(id: string) {
    setSelected(prev => prev.filter(c => c.id !== id));
  }

  function showToast(type: 'ok' | 'err', text: string) {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleSend() {
    if (!title.trim() || !message.trim()) {
      showToast('err', 'Title and message are required.');
      return;
    }
    if (audience === 'specific' && selected.length === 0) {
      showToast('err', 'Select at least one customer.');
      return;
    }

    setSending(true);
    try {
      if (audience === 'all') {
        await apiFetch('/api/admin/notifications', {
          method: 'POST',
          body: JSON.stringify({ title, message, customerId: null }),
        });
      } else {
        await Promise.all(
          selected.map(c =>
            apiFetch('/api/admin/notifications', {
              method: 'POST',
              body: JSON.stringify({ title, message, customerId: c.id }),
            })
          )
        );
      }
      showToast('ok', 'Notification sent successfully!');
      setTitle('');
      setMessage('');
      setSelected([]);
      // Refresh history
      const updated = await apiFetch('/api/admin/notifications').catch(() => []);
      setHistory(updated);
    } catch (e: unknown) {
      showToast('err', e instanceof Error ? e.message : 'Failed to send notification.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Send Push Notification</h1>
      <p className="text-sm text-gray-500 mb-6">
        {subscriberCount !== null
          ? `${subscriberCount} active subscriber${subscriberCount !== 1 ? 's' : ''}`
          : 'Loading subscribers…'}
      </p>

      {/* Toast */}
      {toast && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
          toast.type === 'ok' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {toast.text}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
        {/* Audience */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Audience</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="audience" value="all"
                checked={audience === 'all'}
                onChange={() => { setAudience('all'); setSelected([]); }}
                className="accent-gray-900" />
              <span className="text-sm text-gray-700">All subscribers</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="audience" value="specific"
                checked={audience === 'specific'}
                onChange={() => setAudience('specific')}
                className="accent-gray-900" />
              <span className="text-sm text-gray-700">Specific customers</span>
            </label>
          </div>
        </div>

        {/* Customer search (only for specific) */}
        {audience === 'specific' && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Search customers</label>
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Name or email…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
              />
              {searchResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                  {searchResults.map(c => (
                    <button key={c.id} onClick={() => addCustomer(c)}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0">
                      <span className="font-medium text-gray-900">{c.name}</span>
                      <span className="text-gray-400 ml-2">{c.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {selected.map(c => (
                  <span key={c.id}
                    className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-800 text-xs font-medium px-3 py-1.5 rounded-full">
                    {c.name}
                    <button onClick={() => removeCustomer(c.id)}
                      className="text-gray-400 hover:text-gray-700 leading-none">✕</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Title */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. New arrivals just dropped 🔥"
            maxLength={100}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
          />
        </div>

        {/* Message */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Message</label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="What do you want to tell your customers?"
            maxLength={500}
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-900 resize-none"
          />
        </div>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={sending}
          className="w-full bg-gray-900 text-white text-sm font-semibold py-3 rounded-lg hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed">
          {sending ? 'Sending…' : audience === 'all'
            ? `Send to all${subscriberCount !== null ? ` (${subscriberCount})` : ''}`
            : `Send to ${selected.length} customer${selected.length !== 1 ? 's' : ''}`}
        </button>
      </div>

      {/* History */}
      <div className="mt-8">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Recent Notifications</h2>
        {loadingHistory ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-400">No notifications sent yet.</p>
        ) : (
          <div className="space-y-3">
            {history.map(n => (
              <div key={n.id} className="bg-white border border-gray-200 rounded-xl px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{n.title}</div>
                    <div className="text-sm text-gray-500 mt-0.5">{n.message}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-gray-400">
                      {new Date(n.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {n.customerName ? `→ ${n.customerName}` : '→ All'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
