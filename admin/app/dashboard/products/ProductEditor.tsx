'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { products } from '@/lib/api';
import type { Product, Image, Variant } from '@/lib/api';

const SIZES = ['34','36','38','40','42','44','46','XS','S','M','L','XL','2XL'];
const BADGE_OPTS = ['', 'sale', 'new', 'trending', 'limited'];

function sortVariants(arr: Array<{size: string; inStock: boolean; stock: number}>) {
  return [...arr].sort((a, b) => {
    const ai = SIZES.indexOf(a.size);
    const bi = SIZES.indexOf(b.size);
    const aIdx = ai === -1 ? SIZES.length : ai;
    const bIdx = bi === -1 ? SIZES.length : bi;
    return aIdx - bIdx;
  });
}
const FIT_FILTER_OPTS = ['wide', 'skinny', 'straight', 'baggy', 'balloon'];
const TABS = ['Details', 'Images', 'Variants', 'Pricing'] as const;
type Tab = typeof TABS[number];

interface Props { productId?: string; }

export default function ProductEditor({ productId }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const isNew   = !productId;

  const [tab,       setTab]       = useState<Tab>('Details');
  const [loading,   setLoading]   = useState(!isNew);
  const [saving,    setSaving]    = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState('');

  // Form state
  const [name,         setName]         = useState('');
  const [description,  setDescription]  = useState('');
  const [status,       setStatus]       = useState<'ACTIVE'|'DRAFT'|'ARCHIVED'>('ACTIVE');
  const [price,        setPrice]        = useState('');
  const [comparePrice, setComparePrice] = useState('');
  const [badge,        setBadge]        = useState('');
  const [fit,          setFit]          = useState('');
  const [fitFilter,    setFitFilter]    = useState('wide');
  const [category,     setCategory]     = useState('');
  const [href,         setHref]         = useState('');
  const [color,        setColor]        = useState('');
  const [images,       setImages]       = useState<Image[]>([]);
  const [variants,     setVariants]     = useState<Array<{size: string; inStock: boolean; stock: number}>>([]);
  const [savedId,      setSavedId]      = useState<string | null>(null);
  const [sizeInput,    setSizeInput]    = useState('');
  const [pendingSizes, setPendingSizes] = useState<string[]>([]);
  const [dragIdx,      setDragIdx]      = useState<number | null>(null);
  const dragIdxRef = useRef<number | null>(null);

  // Load existing product
  useEffect(() => {
    if (!productId) return;
    products.get(productId).then(p => {
      setName(p.name);
      setDescription(p.description || '');
      setStatus(p.status);
      setPrice(String(p.price));
      setComparePrice(p.comparePrice ? String(p.comparePrice) : '');
      setBadge(p.badge || '');
      setFit(p.fit || '');
      setFitFilter(p.fitFilter || 'wide');
      setCategory(p.category || '');
      setHref(p.href || '');
      setColor(p.color || '');
      setImages(p.images);
      setVariants(sortVariants(p.variants.map(v => ({ size: v.size || '', inStock: v.inStock, stock: v.stock }))));
      setSavedId(p.id);
      setLoading(false);
    }).catch(() => { setError('Product not found'); setLoading(false); });
  }, [productId]);

  // Flash message helper
  const flash = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };

  async function save() {
    if (!name || !price) { setError('Name and price are required'); return; }
    setError('');
    setSaving(true);
    try {
      const data = { name, description, status, price: parseFloat(price),
        comparePrice: comparePrice ? parseFloat(comparePrice) : null,
        badge: badge || null, fit: fit || null, fitFilter, category: category || null, href: href || null,
        color: color || null };

      let p: Product;
      if (isNew && !savedId) {
        p = await products.create(data);
        setSavedId(p.id);
        router.replace(`/dashboard/products/${p.id}`);
      } else {
        const id = savedId || productId!;
        p = await products.update(id, data);
        setSavedId(p.id);
      }
      // Save variants if any
      if (variants.length > 0) {
        const id = savedId || productId!;
        await products.updateVariants(id, variants);
      }
      flash('Product saved!');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  }

  async function handleUpload(files: FileList | null) {
    if (!files) return;
    // Must save product first
    if (!savedId && isNew) {
      if (!name || !price) { setError('Save basic details first (name & price required)'); return; }
      setSaving(true);
      try {
        const p = await products.create({ name, description, status, price: parseFloat(price),
          comparePrice: comparePrice ? parseFloat(comparePrice) : null,
          badge: badge || null, fit: fit || null, fitFilter, category: category || null });
        setSavedId(p.id);
        router.replace(`/dashboard/products/${p.id}`, { scroll: false });
      } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Save failed'); setSaving(false); return; }
      setSaving(false);
    }

    setUploading(true);
    const id = savedId || productId!;
    for (const file of Array.from(files)) {
      try {
        const uploaded = await products.upload(file);
        const img = await products.addImage(id, { url: uploaded.url, publicId: uploaded.publicId });
        setImages(prev => [...prev, img as unknown as Image]);
      } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Upload failed'); }
    }
    setUploading(false);
  }

  async function removeImage(imgId: string) {
    const id = savedId || productId!;
    if (!id) return;
    try {
      await products.deleteImage(id, imgId);
      setImages(prev => prev.filter(i => i.id !== imgId));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Delete failed'); }
  }

  async function setMainImage(imgId: string) {
    const id = savedId || productId!;
    if (!id) return;
    try {
      await products.setMainImage(id, imgId);
      setImages(prev => prev.map(i => ({ ...i, isMain: i.id === imgId })));
    } catch {}
  }

  function toggleSize(size: string) {
    setVariants(prev => {
      const exists = prev.find(v => v.size === size);
      if (exists) return prev.filter(v => v.size !== size);
      const next = [...prev, { size, inStock: true, stock: 10 }];
      return sortVariants(next);
    });
  }

  function commitPending() {
    const all = [...pendingSizes, ...(sizeInput.trim() ? [sizeInput.trim()] : [])];
    if (!all.length) return;
    setVariants(prev => {
      const existing = new Set(prev.map(v => v.size));
      const toAdd = all.filter(s => !existing.has(s)).map(s => ({ size: s, inStock: true, stock: 10 }));
      return sortVariants([...prev, ...toAdd]);
    });
    setPendingSizes([]);
    setSizeInput('');
  }

  function addBulkSizes() { commitPending(); }

  async function saveVariants() {
    const id = savedId || productId!;
    if (!id) { setError('Save the product first'); return; }
    setSaving(true);
    try {
      await products.updateVariants(id, variants);
      flash('Variants saved!');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-[#c8a96e] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/dashboard/products')}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition">
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{isNew && !savedId ? 'New Product' : name || 'Edit Product'}</h1>
          <p className="text-xs text-gray-500">Manage product details, images, and variants</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <select value={status} onChange={e => setStatus(e.target.value as typeof status)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#c8a96e] bg-white">
            <option value="ACTIVE">Active</option>
            <option value="DRAFT">Draft</option>
            <option value="ARCHIVED">Archived</option>
          </select>
          <button onClick={save} disabled={saving}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #c8a96e, #a8864e)' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-center gap-2">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-700">×</button>
        </div>
      )}
      {success && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg flex items-center gap-2">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="20,6 9,17 4,12"/></svg>
          {success}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6 gap-1">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
              tab === t ? 'border-[#c8a96e] text-[#a8864e]' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}>{t}</button>
        ))}
      </div>

      {/* ── TAB: Details ── */}
      {tab === 'Details' && (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <h3 className="font-semibold text-gray-800 text-sm">Basic Info</h3>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Product Name *</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. Wide Leg Denim Jeans"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#c8a96e] focus:ring-2 focus:ring-[#c8a96e]/20 transition" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  rows={4} placeholder="Product description…"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#c8a96e] focus:ring-2 focus:ring-[#c8a96e]/20 transition resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Fit Type</label>
                  <input value={fit} onChange={e => setFit(e.target.value)}
                    placeholder="e.g. Wide Leg"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#c8a96e] transition" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Fit Filter</label>
                  <select value={fitFilter} onChange={e => setFitFilter(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#c8a96e] bg-white transition">
                    {FIT_FILTER_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Category</label>
                  <input value={category} onChange={e => setCategory(e.target.value)}
                    placeholder="e.g. Jeans, Skirts"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#c8a96e] transition" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Product Page URL</label>
                  <input value={href} onChange={e => setHref(e.target.value)}
                    placeholder="product-name.html"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#c8a96e] transition" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Colors</label>
                <input value={color} onChange={e => setColor(e.target.value)}
                  placeholder="e.g. Dark Blue:#1a2744, Navy:#253660, Black:#1a1a1a"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#c8a96e] transition font-mono" />
                <p className="text-xs text-gray-400 mt-1">Format: <span className="font-mono">Label:#hex</span> — separate multiple colors with commas</p>
                {color && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {color.split(',').map((entry, i) => {
                      const [label, hex] = entry.includes(':') ? entry.split(':').map(s => s.trim()) : [entry.trim(), entry.trim()];
                      const bg = hex?.startsWith('#') ? hex : '#888';
                      return (
                        <div key={i} className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1">
                          <span style={{ background: bg }} className="w-4 h-4 rounded-full inline-block border border-white shadow-sm flex-shrink-0" />
                          <span className="text-xs font-medium text-gray-700">{label || hex}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <h3 className="font-semibold text-gray-800 text-sm">Status & Badge</h3>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Status</label>
                <select value={status} onChange={e => setStatus(e.target.value as typeof status)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#c8a96e] bg-white transition">
                  <option value="ACTIVE">Active</option>
                  <option value="DRAFT">Draft</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Badge</label>
                <select value={badge} onChange={e => setBadge(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#c8a96e] bg-white transition">
                  {BADGE_OPTS.map(o => <option key={o} value={o}>{o || 'None'}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: Images ── */}
      {tab === 'Images' && (
        <div className="space-y-5">
          {/* Drop zone */}
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleUpload(e.dataTransfer.files); }}
            className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center cursor-pointer hover:border-[#c8a96e] hover:bg-[#c8a96e]/5 transition group">
            {uploading ? (
              <div className="flex items-center justify-center gap-2 text-[#c8a96e]">
                <div className="w-5 h-5 border-2 border-[#c8a96e] border-t-transparent rounded-full animate-spin" />
                Uploading…
              </div>
            ) : (
              <>
                <div className="text-3xl mb-2">📸</div>
                <p className="font-semibold text-gray-700 group-hover:text-[#a8864e] transition">
                  Drop images here or click to upload
                </p>
                <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP · up to 100MB each</p>
              </>
            )}
            <input ref={fileRef} type="file" multiple accept="image/*,video/*"
              className="hidden" onChange={e => handleUpload(e.target.files)} />
          </div>

          {/* Image grid */}
          {images.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {images.map((img, i) => (
                <div
                  key={img.id}
                  draggable
                  onDragStart={() => { dragIdxRef.current = i; setDragIdx(i); }}
                  onDragOver={e => { e.preventDefault(); }}
                  onDrop={e => {
                    e.preventDefault();
                    const from = dragIdxRef.current;
                    if (from === null || from === i) return;
                    const reordered = [...images];
                    const [moved] = reordered.splice(from, 1);
                    reordered.splice(i, 0, moved);
                    setImages(reordered);
                    const id = savedId || productId!;
                    if (id) products.reorderImages(id, reordered.map(x => x.id));
                    dragIdxRef.current = null;
                    setDragIdx(null);
                  }}
                  onDragEnd={() => { dragIdxRef.current = null; setDragIdx(null); }}
                  className={`relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-50 aspect-square cursor-grab ${dragIdx === i ? 'opacity-40' : ''}`}
                >
                  <img src={img.url} alt={img.alt || ''} draggable={false} style={{ pointerEvents: 'none', userSelect: 'none' }} className="w-full h-full object-cover" />
                  {img.isMain && (
                    <span className="absolute top-2 left-2 text-[10px] font-bold uppercase bg-[#c8a96e] text-white px-2 py-0.5 rounded-full">
                      Main
                    </span>
                  )}
                  <span className="absolute top-2 right-2 text-gray-400 opacity-0 group-hover:opacity-100 transition text-base leading-none select-none" title="Drag to reorder">⠿</span>
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                    {!img.isMain && (
                      <button onClick={() => setMainImage(img.id)}
                        className="px-2 py-1 bg-white/90 text-gray-800 text-xs font-semibold rounded-lg hover:bg-white transition">
                        Set Main
                      </button>
                    )}
                    <button onClick={() => removeImage(img.id)}
                      className="p-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition">
                      <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Variants ── */}
      {tab === 'Variants' && (
        <div className="space-y-5">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="font-semibold text-gray-800 text-sm mb-4">Available Sizes</h3>
            <div className="flex flex-wrap gap-2">
              {SIZES.map(size => {
                const active = variants.some(v => v.size === size);
                return (
                  <button key={size} onClick={() => toggleSize(size)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition ${
                      active ? 'bg-[#0f1a2e] text-white border-[#0f1a2e]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                    }`}>{size}</button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-3 mb-5 px-2 py-1.5 min-h-[38px] border border-gray-200 rounded-lg focus-within:border-[#c8a96e] focus-within:ring-2 focus-within:ring-[#c8a96e]/20 transition cursor-text">
              {pendingSizes.map((s, i) => (
                <span key={i} className="flex items-center gap-1 px-2 py-0.5 bg-[#0f1a2e] text-white text-xs font-semibold rounded-md">
                  {s}
                  <button type="button" onClick={() => setPendingSizes(p => p.filter((_, j) => j !== i))}
                    className="ml-0.5 opacity-60 hover:opacity-100 leading-none">×</button>
                </span>
              ))}
              <input
                value={sizeInput}
                onChange={e => {
                  const val = e.target.value;
                  if (val.endsWith(',')) {
                    const tag = val.slice(0, -1).trim();
                    if (tag) setPendingSizes(p => [...p, tag]);
                    setSizeInput('');
                  } else {
                    setSizeInput(val);
                  }
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitPending(); }
                  if (e.key === 'Backspace' && sizeInput === '' && pendingSizes.length > 0) {
                    setPendingSizes(p => p.slice(0, -1));
                  }
                }}
                placeholder={pendingSizes.length === 0 ? '36, 38, 40 … then Enter' : ''}
                className="flex-1 min-w-[100px] text-sm outline-none bg-transparent py-0.5"
              />
              {(pendingSizes.length > 0 || sizeInput.trim()) && (
                <button type="button" onClick={commitPending}
                  className="px-3 py-0.5 rounded-md text-xs font-semibold text-white transition hover:opacity-90 shrink-0"
                  style={{ background: 'linear-gradient(135deg, #c8a96e, #a8864e)' }}>
                  Add
                </button>
              )}
            </div>

            {variants.length > 0 && (
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">Size</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">In Stock</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">Stock Qty</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {variants.map((v, i) => (
                      <tr key={v.size}>
                        <td className="px-4 py-2.5 font-semibold text-gray-800">{v.size}</td>
                        <td className="px-4 py-2.5">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <div className={`w-9 h-5 rounded-full transition-colors relative ${v.inStock ? 'bg-green-500' : 'bg-gray-300'}`}
                              onClick={() => setVariants(prev => prev.map((x, j) => j === i ? { ...x, inStock: !x.inStock } : x))}>
                              <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-transform ${v.inStock ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                            </div>
                            <span className="text-xs text-gray-600">{v.inStock ? 'In stock' : 'Out of stock'}</span>
                          </label>
                        </td>
                        <td className="px-4 py-2.5">
                          <input type="number" min="0" value={v.stock}
                            onChange={e => setVariants(prev => prev.map((x, j) => j === i ? { ...x, stock: parseInt(e.target.value) || 0 } : x))}
                            className="w-20 px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:border-[#c8a96e] text-center" />
                        </td>
                        <td className="px-4 py-2.5">
                          <button onClick={() => toggleSize(v.size)}
                            className="text-gray-400 hover:text-red-500 transition">
                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <button onClick={saveVariants} disabled={saving}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #c8a96e, #a8864e)' }}>
            {saving ? 'Saving…' : 'Save Variants'}
          </button>
        </div>
      )}

      {/* ── TAB: Pricing ── */}
      {tab === 'Pricing' && (
        <div className="max-w-md space-y-5">
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-gray-800 text-sm">Pricing</h3>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Price (MAD) *</label>
              <input type="number" min="0" value={price} onChange={e => setPrice(e.target.value)}
                placeholder="179"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#c8a96e] focus:ring-2 focus:ring-[#c8a96e]/20 transition" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Compare-at Price (MAD)</label>
              <input type="number" min="0" value={comparePrice} onChange={e => setComparePrice(e.target.value)}
                placeholder="249 (shows as strikethrough)"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#c8a96e] transition" />
              <p className="text-xs text-gray-400 mt-1">Shows as strikethrough price on the storefront</p>
            </div>
            {price && comparePrice && parseFloat(price) < parseFloat(comparePrice) && (
              <div className="px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm font-semibold text-green-700">
                  Discount: {Math.round((1 - parseFloat(price) / parseFloat(comparePrice)) * 100)}% off
                </p>
                <p className="text-xs text-green-600 mt-0.5">
                  Customer saves {(parseFloat(comparePrice) - parseFloat(price)).toFixed(0)} MAD
                </p>
              </div>
            )}
          </div>
          <button onClick={save} disabled={saving}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #c8a96e, #a8864e)' }}>
            {saving ? 'Saving…' : 'Save Pricing'}
          </button>
        </div>
      )}
    </div>
  );
}
