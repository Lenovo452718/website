const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('ss_admin_token');
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });

  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ss_admin_token');
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data as T;
}

// ── Auth ──────────────────────────────────────────
export const auth = {
  login: (password: string, totpCode?: string) =>
    request<{ token?: string; require2fa?: boolean; expiresIn?: string }>(
      '/api/admin/login',
      { method: 'POST', body: JSON.stringify({ password, totpCode }) }
    ),
  changePassword: (newPassword: string) =>
    request('/api/admin/change-password', { method: 'POST', body: JSON.stringify({ newPassword }) }),
  get2faStatus: () => request<{ enabled: boolean }>('/api/admin/2fa/status'),
  setup2fa: () => request<{ qr: string; secret: string }>('/api/admin/2fa/setup'),
  verify2fa: (code: string) =>
    request('/api/admin/2fa/verify', { method: 'POST', body: JSON.stringify({ code }) }),
  disable2fa: () => request('/api/admin/2fa/disable', { method: 'POST', body: '{}' }),
};

// ── Products ──────────────────────────────────────
export const products = {
  list: (params?: { status?: string; q?: string }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string,string>).toString() : '';
    return request<Product[]>(`/api/admin/products${qs}`);
  },
  get: (id: string) => request<Product>(`/api/admin/products/${id}`),
  create: (data: Partial<Product>) =>
    request<Product>('/api/admin/products', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Product>) =>
    request<Product>(`/api/admin/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request(`/api/admin/products/${id}`, { method: 'DELETE' }),
  bulk: (action: string, ids: string[]) =>
    request('/api/admin/products/bulk', { method: 'POST', body: JSON.stringify({ action, ids }) }),
  updateVariants: (id: string, variants: Partial<Variant>[]) =>
    request<Product>(`/api/admin/products/${id}/variants`, { method: 'POST', body: JSON.stringify({ variants }) }),
  addImage: (id: string, data: { url: string; publicId?: string; alt?: string; isMain?: boolean }) =>
    request(`/api/admin/products/${id}/images`, { method: 'POST', body: JSON.stringify(data) }),
  deleteImage: (productId: string, imageId: string) =>
    request(`/api/admin/products/${productId}/images/${imageId}`, { method: 'DELETE' }),
  setMainImage: (productId: string, imageId: string) =>
    request(`/api/admin/products/${productId}/images/${imageId}`, { method: 'PATCH', body: JSON.stringify({ isMain: true }) }),
  reorderImages: (productId: string, imageIds: string[]) =>
    request(`/api/admin/products/${productId}/images/reorder`, { method: 'POST', body: JSON.stringify({ imageIds }) }),
  upload: async (file: File): Promise<{ url: string; publicId: string }> => {
    const token = getToken();
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API}/api/admin/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data;
  },
};

// ── Orders ────────────────────────────────────────
export const orders = {
  list: (params?: { status?: string; limit?: number }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string,string>).toString() : '';
    return request<Order[]>(`/api/admin/orders${qs}`);
  },
  get: (id: string) => request<Order>(`/api/admin/orders/${id}`),
  update: (id: string, data: Partial<Order>) =>
    request<Order>(`/api/admin/orders/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/api/admin/orders/${id}`, { method: 'DELETE' }),
  stats: () => request<Stats>('/api/admin/stats'),
};

// ── Banners ───────────────────────────────────────
export const banners = {
  list: () => request<Banner[]>('/api/admin/banners'),
  create: (data: Partial<Banner>) =>
    request<Banner>('/api/admin/banners', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Banner>) =>
    request<Banner>(`/api/admin/banners/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/api/admin/banners/${id}`, { method: 'DELETE' }),
};

// ── Settings ──────────────────────────────────────
export const settings = {
  get: () => request<SiteSettings>('/api/admin/settings'),
  update: (data: Partial<SiteSettings>) =>
    request<SiteSettings>('/api/admin/settings', { method: 'PATCH', body: JSON.stringify(data) }),
};

// ── Olivraison ────────────────────────────────────
export const olivraison = {
  getConfig: () => request<OlivraisonConfig>('/api/admin/olivraison/config'),
  saveConfig: (data: Partial<OlivraisonConfig>) =>
    request<OlivraisonConfig>('/api/admin/olivraison/config', { method: 'PATCH', body: JSON.stringify(data) }),
  send: (orderIds: string[], publicKey: string, privateKey: string) =>
    request<{ results: OlivraisonResult[] }>('/api/admin/olivraison/send', {
      method: 'POST',
      body: JSON.stringify({ orderIds, publicKey, privateKey }),
    }),
};

// ── Types ─────────────────────────────────────────
export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  price: number;
  comparePrice?: number | null;
  badge?: string | null;
  fit?: string | null;
  fitFilter?: string | null;
  category?: string | null;
  href?: string | null;
  color?: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  images: Image[];
  variants: Variant[];
}

export interface Image {
  id: string;
  productId: string;
  url: string;
  publicId: string;
  alt?: string | null;
  sortOrder: number;
  isMain: boolean;
}

export interface Variant {
  id: string;
  productId: string;
  size?: string | null;
  inStock: boolean;
  stock: number;
  sortOrder: number;
}

export interface Order {
  id: string;
  status: string;
  customer: string;
  phone: string;
  city: string;
  address?: string;
  product: string;
  size?: string;
  qty: number;
  price: string;
  createdAt: string;
  updatedAt: string;
  trackingCode?: string;
  olivraisonId?: string;
}

export interface Banner {
  id: string;
  title: string;
  subtitle?: string | null;
  imageUrl: string;
  linkUrl?: string | null;
  position: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface SiteSettings {
  id: string;
  storeName: string;
  primaryColor: string;
  accentColor: string;
  currency: string;
  whatsapp: string;
  email: string;
  logo?: string | null;
  announcementBar?: string | null;
  announcementActive: boolean;
}

export interface OlivraisonConfig {
  id: string;
  apiKey: string;
  apiSecret: string;
  storeId: string;
  isActive: boolean;
}

export interface OlivraisonResult {
  orderId: string;
  customer?: string;
  success: boolean;
  trackingCode?: string;
  error?: string;
}

export interface Stats {
  total: number;
  pending: number;
  confirmed: number;
  cancelled: number;
  processing: number;
  productCount: number;
}
