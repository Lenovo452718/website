'use client';
import { useEffect, useState } from 'react';
import { orders, products } from '@/lib/api';
import type { Stats, Order, Product } from '@/lib/api';
import Link from 'next/link';

const STATUS_COLORS: Record<string, string> = {
  pending:    'bg-amber-100 text-amber-800',
  confirmed:  'bg-green-100 text-green-800',
  cancelled:  'bg-red-100 text-red-800',
  processing: 'bg-blue-100 text-blue-800',
  called:     'bg-purple-100 text-purple-800',
  done:       'bg-gray-100 text-gray-600',
  edited:     'bg-orange-100 text-orange-800',
};

export default function DashboardPage() {
  const [stats,         setStats]         = useState<Stats | null>(null);
  const [recentOrders,  setRecentOrders]  = useState<Order[]>([]);
  const [recentProducts,setRecentProducts]= useState<Product[]>([]);
  const [loading,       setLoading]       = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [s, o, p] = await Promise.all([
          orders.stats(),
          orders.list({ limit: 8 }),
          products.list(),
        ]);
        setStats(s);
        setRecentOrders(o);
        setRecentProducts(p.slice(0, 5));
      } catch {}
      finally { setLoading(false); }
    }
    load();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-[#c8a96e] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const kpis = [
    { label: 'Total Orders',    value: stats?.total     ?? 0, color: '#3b82f6', icon: '📦' },
    { label: 'Pending',         value: stats?.pending   ?? 0, color: '#f97316', icon: '⏳' },
    { label: 'Confirmed',       value: stats?.confirmed ?? 0, color: '#22c55e', icon: '✅' },
    { label: 'Active Products', value: stats?.productCount ?? 0, color: '#c8a96e', icon: '👕' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Overview of your store activity</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{k.label}</p>
                <p className="text-3xl font-bold mt-1" style={{ color: k.color }}>{k.value}</p>
              </div>
              <span className="text-2xl">{k.icon}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent Orders */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Recent Orders</h2>
            <Link href="/dashboard/orders" className="text-xs text-[#c8a96e] hover:underline font-medium">
              View all →
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentOrders.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">No orders yet</p>
            )}
            {recentOrders.map(order => (
              <div key={order.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/50 transition">
                <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-gray-500">
                    {(order.customer || '?')[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{order.customer}</p>
                  <p className="text-xs text-gray-500 truncate">{order.product} · {order.city}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className={`inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-600'}`}>
                    {order.status}
                  </span>
                  <p className="text-xs text-gray-500 mt-0.5">{order.price} MAD</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Products snapshot */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Products</h2>
            <Link href="/dashboard/products" className="text-xs text-[#c8a96e] hover:underline font-medium">
              Manage →
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentProducts.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-400 text-sm mb-3">No products yet</p>
                <Link href="/dashboard/products/new"
                  className="text-xs font-semibold px-4 py-2 rounded-lg text-white"
                  style={{ background: '#c8a96e' }}>
                  Add First Product
                </Link>
              </div>
            )}
            {recentProducts.map(p => (
              <Link key={p.id} href={`/dashboard/products/${p.id}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/50 transition">
                <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                  {p.images[0] ? (
                    <img src={p.images[0].url} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">👕</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                  <p className="text-xs text-gray-500">{p.price} MAD</p>
                </div>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                  p.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                  p.status === 'DRAFT'  ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-500'
                }`}>{p.status}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
