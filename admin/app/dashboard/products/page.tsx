'use client';
import { useEffect, useState, useCallback } from 'react';
import { products } from '@/lib/api';
import type { Product } from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const STATUS_BADGE: Record<string, string> = {
  ACTIVE:   'bg-green-100 text-green-700 border-green-200',
  DRAFT:    'bg-amber-100 text-amber-700 border-amber-200',
  ARCHIVED: 'bg-gray-100 text-gray-500 border-gray-200',
};

export default function ProductsPage() {
  const router = useRouter();
  const [list,     setList]     = useState<Product[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search,   setSearch]   = useState('');
  const [filter,   setFilter]   = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await products.list({ ...(filter && { status: filter }), ...(search && { q: search }) });
      setList(data);
    } catch {}
    finally { setLoading(false); }
  }, [filter, search]);

  useEffect(() => { load(); }, [load]);

  async function handleBulk(action: string) {
    if (!selected.size) return;
    if (action === 'delete' && !confirm(`Delete ${selected.size} product(s)?`)) return;
    try {
      await products.bulk(action, [...selected]);
      setSelected(new Set());
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Action failed');
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    setDeleting(true);
    try { await products.delete(id); load(); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'Delete failed'); }
    finally { setDeleting(false); }
  }

  const toggleSelect = (id: string) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const toggleAll = () => {
    setSelected(selected.size === list.length ? new Set() : new Set(list.map(p => p.id)));
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-sm text-gray-500 mt-0.5">{list.length} product{list.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/dashboard/products/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #c8a96e, #a8864e)' }}>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Product
        </Link>
      </div>

      {/* Filters + Search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Search products…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#c8a96e] focus:ring-2 focus:ring-[#c8a96e]/20 transition"
          />
        </div>
        {(['', 'ACTIVE', 'DRAFT', 'ARCHIVED'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              filter === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm">
          <span className="font-semibold text-blue-800">{selected.size} selected</span>
          <div className="flex gap-2 ml-auto">
            {[
              { action: 'publish', label: 'Publish', cls: 'bg-green-600 text-white hover:bg-green-700' },
              { action: 'archive', label: 'Archive', cls: 'bg-gray-600 text-white hover:bg-gray-700' },
              { action: 'delete',  label: 'Delete',  cls: 'bg-red-600 text-white hover:bg-red-700' },
            ].map(b => (
              <button key={b.action} onClick={() => handleBulk(b.action)}
                className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition ${b.cls}`}>
                {b.label}
              </button>
            ))}
            <button onClick={() => setSelected(new Set())}
              className="px-3 py-1.5 rounded-lg font-semibold text-xs bg-white border border-gray-200 text-gray-600 hover:bg-gray-50">
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-[#c8a96e] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">👕</div>
            <p className="font-semibold text-gray-700">No products found</p>
            <p className="text-sm text-gray-500 mt-1">
              {search || filter ? 'Try adjusting your filters' : 'Add your first product to get started'}
            </p>
            {!search && !filter && (
              <Link href="/dashboard/products/new"
                className="inline-block mt-4 px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
                style={{ background: '#c8a96e' }}>
                Add Product
              </Link>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" className="rounded" checked={selected.size === list.length && list.length > 0}
                    onChange={toggleAll} />
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Product</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 hidden md:table-cell">Category</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Price</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 hidden sm:table-cell">Sizes</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Status</th>
                <th className="w-20 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {list.map(p => (
                <tr key={p.id} className="hover:bg-gray-50/50 transition group">
                  <td className="px-4 py-3">
                    <input type="checkbox" className="rounded" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden shrink-0 border border-gray-200">
                        {p.images[0] ? (
                          <img src={p.images[0].url} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300 text-lg">👕</div>
                        )}
                      </div>
                      <div>
                        <button onClick={() => router.push(`/dashboard/products/${p.id}`)}
                          className="font-semibold text-sm text-gray-900 hover:text-[#c8a96e] transition text-left">
                          {p.name}
                        </button>
                        {p.badge && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">
                            {p.badge}
                          </span>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">{p.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-sm text-gray-600">{p.category || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <span className="text-sm font-bold text-gray-900">{p.price} MAD</span>
                      {p.comparePrice && (
                        <span className="block text-xs text-gray-400 line-through">{p.comparePrice} MAD</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {p.variants.slice(0, 4).map(v => (
                        <span key={v.id} className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                          v.inStock ? 'bg-white border-gray-200 text-gray-700' : 'bg-gray-50 border-gray-100 text-gray-400 line-through'
                        }`}>{v.size}</span>
                      ))}
                      {p.variants.length > 4 && (
                        <span className="text-[10px] text-gray-400">+{p.variants.length - 4}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full border ${STATUS_BADGE[p.status] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <Link href={`/dashboard/products/${p.id}`}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition">
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </Link>
                      <button onClick={() => handleDelete(p.id, p.name)} disabled={deleting}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition">
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
