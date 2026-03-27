'use client';
import { useEffect, useState } from 'react';
import { banners, products } from '@/lib/api';
import type { Banner } from '@/lib/api';

const POSITIONS = ['hero', 'top-bar', 'popup'];

export default function BannersPage() {
  const [list,    setList]    = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [form,    setForm]    = useState({ title: '', subtitle: '', imageUrl: '', linkUrl: '', position: 'hero', isActive: true });
  const [editing, setEditing] = useState<Banner | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setList(await banners.list()); } catch {}
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  function startEdit(b: Banner) {
    setEditing(b);
    setForm({ title: b.title, subtitle: b.subtitle || '', imageUrl: b.imageUrl, linkUrl: b.linkUrl || '', position: b.position, isActive: b.isActive });
  }

  function resetForm() {
    setEditing(null);
    setForm({ title: '', subtitle: '', imageUrl: '', linkUrl: '', position: 'hero', isActive: true });
    setError('');
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const token = localStorage.getItem('ss_admin_token');
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json();
      if (data.url) setForm(f => ({ ...f, imageUrl: data.url }));
    } catch { setError('Upload failed'); }
    finally { setUploading(false); }
  }

  async function handleSave() {
    if (!form.title || !form.imageUrl) { setError('Title and image are required'); return; }
    setSaving(true);
    setError('');
    try {
      if (editing) {
        const updated = await banners.update(editing.id, form);
        setList(prev => prev.map(b => b.id === editing.id ? updated : b));
      } else {
        const created = await banners.create(form);
        setList(prev => [...prev, created]);
      }
      resetForm();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  async function toggleActive(b: Banner) {
    try {
      const updated = await banners.update(b.id, { isActive: !b.isActive });
      setList(prev => prev.map(x => x.id === b.id ? updated : x));
    } catch {}
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this banner?')) return;
    try {
      await banners.delete(id);
      setList(prev => prev.filter(b => b.id !== id));
    } catch {}
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Banners</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage homepage banners and announcements</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-800">{editing ? 'Edit Banner' : 'Add Banner'}</h2>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Title *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Banner title" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#c8a96e] transition" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Subtitle</label>
            <input value={form.subtitle} onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))}
              placeholder="Optional subtitle" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#c8a96e] transition" />
          </div>

          {/* Image */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Image *</label>
            {form.imageUrl && (
              <img src={form.imageUrl} alt="preview" className="w-full h-24 object-cover rounded-lg border border-gray-200 mb-2" />
            )}
            <div className="flex gap-2">
              <input value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                placeholder="Image URL or upload below" className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#c8a96e] transition" />
              <label className="cursor-pointer px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition shrink-0">
                {uploading ? '…' : '📎'}
                <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Link URL</label>
            <input value={form.linkUrl} onChange={e => setForm(f => ({ ...f, linkUrl: e.target.value }))}
              placeholder="shop.html or https://…" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#c8a96e] transition" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Position</label>
              <select value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-[#c8a96e] transition">
                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer pb-2.5">
                <div className={`w-9 h-5 rounded-full transition-colors relative ${form.isActive ? 'bg-green-500' : 'bg-gray-300'}`}
                  onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}>
                  <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-transform ${form.isActive ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                </div>
                <span className="text-sm text-gray-600">Active</span>
              </label>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #c8a96e, #a8864e)' }}>
              {saving ? 'Saving…' : editing ? 'Update Banner' : 'Add Banner'}
            </button>
            {editing && (
              <button onClick={resetForm} className="px-4 py-2.5 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition">
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-7 h-7 border-2 border-[#c8a96e] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : list.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-2">🖼️</div>
              <p className="font-semibold text-gray-600">No banners yet</p>
            </div>
          ) : list.map(b => (
            <div key={b.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {b.imageUrl && (
                <img src={b.imageUrl} alt={b.title} className="w-full h-24 object-cover" />
              )}
              <div className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-800 truncate">{b.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400">{b.position}</span>
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                      b.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {b.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => toggleActive(b)}
                    className={`p-1.5 rounded-lg border transition text-xs font-semibold ${
                      b.isActive ? 'border-gray-200 text-gray-500 hover:bg-gray-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}>
                    {b.isActive ? 'Disable' : 'Enable'}
                  </button>
                  <button onClick={() => startEdit(b)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition">
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <button onClick={() => handleDelete(b.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition">
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
