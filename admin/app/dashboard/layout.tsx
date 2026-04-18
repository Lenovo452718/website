'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

const NAV = [
  { href: '/dashboard',                   icon: '⬛', label: 'Dashboard' },
  { href: '/dashboard/products',          icon: '👕', label: 'Products' },
  { href: '/dashboard/orders',            icon: '📦', label: 'Orders' },
  { href: '/dashboard/banners',           icon: '🖼️', label: 'Banners' },
  { href: '/dashboard/notifications',     icon: '🔔', label: 'Notifications' },
  { href: '/dashboard/integrations',      icon: '🚚', label: 'Integrations' },
  { href: '/dashboard/settings',          icon: '⚙️', label: 'Settings' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [storeName, setStoreName]     = useState('StreetStore');

  useEffect(() => {
    const token = localStorage.getItem('ss_admin_token');
    if (!token) { router.replace('/login'); return; }
    // Load store name
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/settings`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json()).then(d => { if (d.storeName) setStoreName(d.storeName); }).catch(() => {});
  }, [router]);

  function logout() {
    localStorage.removeItem('ss_admin_token');
    router.replace('/login');
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #c8a96e, #a8864e)' }}>
            <span className="text-[#0f1a2e] font-black text-xs">SS</span>
          </div>
          <div>
            <div className="text-white font-bold text-sm tracking-wider">{storeName}</div>
            <div className="text-[#c8a96e]/60 text-[10px] tracking-widest uppercase">Admin Panel</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 overflow-y-auto">
        <div className="text-[10px] font-bold tracking-widest uppercase text-white/20 px-3 py-3">
          Main Menu
        </div>
        {NAV.map(item => {
          const active = pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm font-medium transition-all ${
                active
                  ? 'text-white border-l-2 border-[#c8a96e] pl-[10px]'
                  : 'text-white/55 hover:text-white hover:bg-white/[0.05]'
              }`}
              style={active ? { background: 'rgba(200,169,110,0.1)' } : {}}>
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-white/[0.06]">
        <button onClick={logout}
          className="flex items-center gap-2 text-white/30 hover:text-white/70 text-sm transition w-full px-1 py-1">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
          </svg>
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc]">
      {/* Desktop Sidebar */}
      <aside className="w-56 shrink-0 hidden lg:flex flex-col h-full" style={{ background: '#0f1a2e' }}>
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-64 flex flex-col h-full z-10" style={{ background: '#0f1a2e' }}>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3 shrink-0 z-10">
          <button className="lg:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition"
            onClick={() => setSidebarOpen(true)}>
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>

          <div className="flex-1 text-sm font-semibold text-gray-800 capitalize">
            {NAV.find(n => n.href === pathname || (n.href !== '/dashboard' && pathname.startsWith(n.href)))?.label || 'Dashboard'}
          </div>

          <a href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}`}
            target="_blank" rel="noopener noreferrer"
            className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition">
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>
            </svg>
            View Store
          </a>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
