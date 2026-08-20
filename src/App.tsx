import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Route, Switch, useLocation, useParams } from 'wouter';
import {
  Activity, ArrowLeft, ArrowRight, BadgeCheck, BarChart3, Bell, Box, Check,
  ClipboardCheck, Clock3, Copy, CreditCard, ExternalLink, Gamepad2, Headphones,
  Home, LayoutGrid, ListFilter, LockKeyhole, LogIn, LogOut, Menu,
  MessageCircle, Moon, Package, Pencil, Plus, Search, Send, Settings,
  ShieldCheck, ShoppingCart, Sun, TicketCheck, Trash2, TrendingUp, Users,
  WalletCards, X
} from 'lucide-react';
import NotFound from '@/pages/not-found';

type Category = { id: string; name: string; image?: string; order?: number };
type Product = { id: string; name: string; desc?: string; price: number; image?: string; categoryId: string; type: string; active: boolean; sales?: number; unitSize?: number; pricingNote?: string };
type User = { username: string; email: string; passwordHash?: string; password?: string; balance: number; isVerified?: boolean; createdAt?: string };
type CartItem = { productId: string; qty: number };
type Requirement = { platform?: string; accountId?: string; username?: string; targetLink?: string; quantity?: string; notes?: string };
type OrderItem = { productId: string; name: string; type: string; qty: number; price: number; requirements?: Requirement };
type Order = { id: string; date: string; username: string; email: string; whatsapp: string; items: OrderItem[]; total: number; status: string; paymentMethod: string; requirements: Requirement; };
type Topup = { id: string; username: string; email: string; txNumber: string; amount: number; currency: string; status: string; date: string };
type Complaint = { id: string; username: string; email: string; subject: string; message: string; status: 'open' | 'resolved'; date: string };
type Toast = { id: number; text: string; error?: boolean };
type PendingVerification = {
  username: string;
  email: string;
  passwordHash: string;
  code: string;
  expiresAt: number;
};

const KEY = {
  categories: 'idleb_categories', products: 'idleb_products', users: 'idleb_users',
  pending: 'idleb_pending_users', current: 'idleb_current_user', cart: 'idleb_cart',
  topups: 'idleb_topups', orders: 'idleb_orders', complaints: 'idleb_complaints', admin: 'idleb_admin_session',
  settings: 'idleb_site_settings', theme: 'idleb_theme'
};
// Local-only credentials/configuration. Frontend-only Admin credentials are necessarily shipped to the browser.
const ADMIN_CREDENTIALS = {
  username: 'admin',
  email: 'admin@idleb.store',
  password: 'IDLEB@2026',
} as const;
const STORE_API = '/api/store';
const ADMIN_API_KEY = ADMIN_CREDENTIALS.password;

type RemoteStore = { categories: Category[]; products: Product[]; settings: Record<string, string>; users?: User[]; topups?: Topup[]; complaints?: Complaint[] };

async function fetchRemoteStore(): Promise<RemoteStore | null> {
  try {
    const response = await fetch(STORE_API, { cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data || !Array.isArray(data.categories) || !Array.isArray(data.products)) return null;
    return {
      categories: data.categories,
      products: data.products,
      settings: data.settings || {},
      users: Array.isArray(data.users) ? data.users : undefined,
      topups: Array.isArray(data.topups) ? data.topups : undefined,
      complaints: Array.isArray(data.complaints) ? data.complaints : undefined,
    };
  } catch {
    return null;
  }
}

async function fetchRemoteOrders(username?: string, admin = false): Promise<Order[]> {
  try {
    const params = username && !admin ? `?username=${encodeURIComponent(username)}` : '';
    const response = await fetch(`/api/orders${params}`, {
      cache: 'no-store',
      headers: admin ? { 'X-Admin-Key': ADMIN_API_KEY } : undefined,
    });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data.orders) ? data.orders.map(normalizeOrder) : [];
  } catch { return []; }
}

async function createRemoteOrder(order: Order): Promise<boolean> {
  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order),
    });
    return response.ok;
  } catch { return false; }
}

async function updateRemoteOrder(id: string, status: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_API_KEY },
      body: JSON.stringify({ status }),
    });
    return response.ok;
  } catch { return false; }
}

async function saveRemoteStore(store: RemoteStore): Promise<boolean> {
  try {
    const response = await fetch(STORE_API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_API_KEY },
      body: JSON.stringify(store),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function resizeImageFile(file: File, maxWidth = 1200, maxHeight = 800, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة الصورة'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('الملف ليس صورة صالحة'));
      image.onload = () => {
        const ratio = Math.min(1, maxWidth / image.width, maxHeight / image.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * ratio));
        canvas.height = Math.max(1, Math.round(image.height * ratio));
        const context = canvas.getContext('2d');
        if (!context) return reject(new Error('تعذر معالجة الصورة'));
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/webp', quality));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
const BACKGROUND_VIDEO_URL = `${import.meta.env.BASE_URL}store-background.mp4`;
const EMAILJS = {
  serviceId: 'service_y22dlbp',
  templateId: 'template_ncqtx0e',
  publicKey: '-MV0a0jjrdW0VbOML',
} as const;
const TYPE_LABEL: Record<string, string> = {
  accounts: 'تبنيد حسابات', unban: 'فك باند', boost_followers: 'رشق متابعين',
  boost_engagement: 'رشق تفاعل', boost_views: 'رشق مشاهدات', games: 'شحن ألعاب', other: 'خدمة رقمية'
};
const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat1', name: 'تبنيد حسابات', order: 1 }, { id: 'cat2', name: 'فك باند', order: 2 },
  { id: 'cat3', name: 'خدمات الرشق', order: 3 }, { id: 'cat4', name: 'شحن ألعاب', order: 4 }
];
const DEFAULT_PRODUCTS: Product[] = [
  { id: 'p1', name: 'تبنيد انستغرام', desc: 'معالجة احترافية لحسابات انستغرام', price: 15, categoryId: 'cat1', type: 'accounts', active: true, sales: 42 },
  { id: 'p2', name: 'تبنيد فيسبوك', desc: 'حسابات فيسبوك قديمة', price: 12, categoryId: 'cat1', type: 'accounts', active: true, sales: 35 },
  { id: 'p3', name: 'تبنيد تليجرام', desc: 'معالجة أرقام وحسابات تليجرام', price: 10, categoryId: 'cat1', type: 'accounts', active: true, sales: 28 },
  { id: 'p4', name: 'تبنيد واتساب', desc: 'أرقام واتساب مع متابعة', price: 18, categoryId: 'cat1', type: 'accounts', active: true, sales: 50 },
  { id: 'p5', name: 'فك باند انستغرام', desc: 'استعادة حسابات انستغرام المحظورة', price: 25, categoryId: 'cat2', type: 'unban', active: true, sales: 60 },
  { id: 'p6', name: 'فك باند واتساب', desc: 'استعادة رقم محظور', price: 30, categoryId: 'cat2', type: 'unban', active: true, sales: 45 },
  { id: 'p7', name: 'فك باند فيسبوك', desc: 'فك حظر حسابات فيسبوك', price: 22, categoryId: 'cat2', type: 'unban', active: true, sales: 33 },
  { id: 'p8', name: 'فك باند تليجرام', desc: 'فك حظر قنوات وحسابات', price: 20, categoryId: 'cat2', type: 'unban', active: true, sales: 20 },
  { id: 'p9', name: 'رشق متابعين انستغرام', desc: 'متابعون حقيقيون بالعدد الذي تحدده', price: 2, unitSize: 1000, categoryId: 'cat3', type: 'boost_followers', active: true, sales: 90, pricingNote: 'كل 1000 متابع = 2$' },
  { id: 'p10', name: 'رشق تفاعل انستغرام', desc: 'تفاعل لحسابات ومنشوراتك', price: 1.5, unitSize: 1000, categoryId: 'cat3', type: 'boost_engagement', active: true, sales: 55, pricingNote: 'كل 1000 تفاعل = 1.5$' },
  { id: 'p11', name: 'رشق مشاهدات', desc: 'مشاهدات لمحتواك بسرعة', price: 1, unitSize: 1000, categoryId: 'cat3', type: 'boost_views', active: true, sales: 40, pricingNote: 'كل 1000 مشاهدة = 1$' },
  { id: 'p12', name: 'شحن ببجي', desc: 'شحن UC لحسابك', price: 10, categoryId: 'cat4', type: 'games', active: true, sales: 120, pricingNote: 'كل وحدة = 10$' },
  { id: 'p13', name: 'شحن فري فاير', desc: 'شحن جواهر فري فاير', price: 9, categoryId: 'cat4', type: 'games', active: true, sales: 95, pricingNote: 'كل وحدة = 9$' },
  { id: 'p14', name: 'شحن جواكر', desc: 'شحن عملات جواكر', price: 7, categoryId: 'cat4', type: 'games', active: true, sales: 48, pricingNote: 'كل وحدة = 7$' }
];

function read<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
function write(key: string, value: unknown) { localStorage.setItem(key, JSON.stringify(value)); }
function uid(prefix: string) { return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
async function hashValue(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function sendEmailOtp(email: string, code: string, username: string) {
  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS.serviceId,
      template_id: EMAILJS.templateId,
      user_id: EMAILJS.publicKey,
      template_params: {
        to_email: email,
        email,
        to_name: username,
        username,
        verification_code: code,
        verificationCode: code,
        otp: code,
        passcode: code,
      },
    }),
  });
  if (!response.ok) {
    let details = `HTTP ${response.status}`;
    try {
      const body = await response.text();
      if (body) details += `: ${body.slice(0, 240)}`;
    } catch {
      // Keep the HTTP status when the response body cannot be read.
    }
    throw new Error(`EMAIL_SEND_FAILED: ${details}`);
  }
}
function money(value: number) { return `${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} $`; }
function lineTotal(product: Product, qty: number) {
  return product.unitSize ? product.price * (qty / product.unitSize) : product.price * qty;
}
function dateLabel(value: string) { return new Date(value).toLocaleDateString('ar-SY', { day: 'numeric', month: 'short', year: 'numeric' }); }
function statusLabel(value: string) { return ({ pending: 'قيد المراجعة', processing: 'قيد التنفيذ', completed: 'مكتمل', cancelled: 'ملغى' } as Record<string, string>)[value] || value; }
function iconFor(type: string) {
  if (type === 'games') return <Gamepad2 size={19} />;
  if (type === 'accounts') return <ShieldCheck size={19} />;
  if (type === 'unban') return <LockKeyhole size={19} />;
  return <TrendingUp size={19} />;
}
function serviceFields(type: string) {
  if (type === 'games') return [{ key: 'accountId', label: 'Player ID', placeholder: 'أدخل Player ID', required: true }];
  if (type === 'accounts' || type === 'unban') return [{ key: 'targetLink', label: 'رابط الحساب', placeholder: 'https://...', required: true }];
  if (type.startsWith('boost_')) return [{ key: 'targetLink', label: 'الرابط', placeholder: 'رابط الحساب أو المنشور', required: true }, { key: 'quantity', label: 'الكمية', placeholder: 'مثال: 1000', required: true }];
  return [{ key: 'accountId', label: 'المعرّف أو اسم المستخدم', placeholder: '@username أو المعرف', required: true }];
}
function serviceInstructions(type: string) {
  if (type === 'games') return 'تأكد من أن Player ID صحيح وأن الحساب مستعد لاستقبال الشحن. لا نطلب كلمة المرور.';
  if (type === 'accounts') return 'أرسل رابط الحساب العام فقط. لا ترسل كلمة المرور أو رموز الدخول.';
  if (type === 'unban') return 'أرسل رابط الحساب المحظور واشرح سبب الحظر إن كان معروفاً.';
  if (type.startsWith('boost_')) return 'يجب أن يكون الرابط عاماً وقابلاً للفتح. اكتب الكمية المطلوبة بدقة.';
  return 'أرسل البيانات الضرورية فقط، ولا تشارك كلمات المرور أو رموز التحقق.';
}
function productArt(product: Product, className = 'product-art') {
  if (product.image) return <div className={className} style={{ backgroundImage: `url(\"${product.image}\")`, backgroundSize: 'cover', backgroundPosition: 'center' }} aria-label={product.name}><span className="art-code" style={{ background: 'rgba(0,0,0,.55)', padding: '4px 6px', borderRadius: 7 }}>{product.id.toUpperCase()}</span></div>;
  return <div className={className}><span className="art-code">{product.id.toUpperCase()}</span><span className="art-icon">{iconFor(product.type)}</span></div>;
}
function normalizeOrder(raw: any): Order {
  const items: OrderItem[] = Array.isArray(raw?.items) ? raw.items.map((item: any) => ({
    productId: item.productId || item.id || uid('service'),
    name: item.name || item.productName || 'خدمة رقمية',
    type: item.type || item.serviceType || 'other',
    qty: Number(item.qty || 1),
    price: Number(item.price || item.lineTotal || 0),
    requirements: item.requirements || { targetLink: item.targetUrl || item.targetLink, notes: item.notes, accountId: item.accountId, platform: item.platform, username: item.username, quantity: item.quantity }
  })) : [];
  const firstRequirements = items[0]?.requirements || {};
  const requirements = raw?.requirements || {
    platform: firstRequirements.platform || raw?.platform,
    accountId: firstRequirements.accountId || raw?.accountId || raw?.username,
    username: firstRequirements.username,
    targetLink: firstRequirements.targetLink || raw?.targetUrl || raw?.targetLink,
    notes: firstRequirements.notes || raw?.notes,
    quantity: firstRequirements.quantity || raw?.quantity
  };
  return {
    id: raw?.id || uid('ORD'),
    date: raw?.date || raw?.createdAt || new Date().toISOString(),
    username: raw?.username || 'عميل',
    email: raw?.email || '',
    whatsapp: raw?.whatsapp || '',
    items,
    total: Number(raw?.total || 0),
    status: raw?.status || 'pending',
    paymentMethod: raw?.paymentMethod || 'المحفظة',
    requirements
  };
}

function App() {
  const [categories, setCategories] = useState<Category[]>(() => read(KEY.categories, DEFAULT_CATEGORIES));
  const [products, setProducts] = useState<Product[]>(() => read(KEY.products, DEFAULT_PRODUCTS));
  const [users, setUsers] = useState<User[]>(() => read(KEY.users, []));
  const [orders, setOrders] = useState<Order[]>(() => read<any[]>(KEY.orders, []).map(normalizeOrder));
  const [topups, setTopups] = useState<Topup[]>(() => read(KEY.topups, []));
  const [complaints, setComplaints] = useState<Complaint[]>(() => read(KEY.complaints, []));
  const [cart, setCart] = useState<CartItem[]>(() => read(KEY.cart, []));
  const [currentUser, setCurrentUser] = useState<User | null>(() => read(KEY.current, null));
  const [settings, setSettings] = useState<Record<string, string>>(() => read(KEY.settings, {}));
  const [dark, setDark] = useState(() => read<string>(KEY.theme, 'light') === 'dark');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mobileNav, setMobileNav] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!localStorage.getItem(KEY.categories)) write(KEY.categories, DEFAULT_CATEGORIES);
    if (!localStorage.getItem(KEY.products)) write(KEY.products, DEFAULT_PRODUCTS);
    if (!localStorage.getItem(KEY.users)) write(KEY.users, []);
    if (!localStorage.getItem(KEY.orders)) write(KEY.orders, []);
    if (!localStorage.getItem(KEY.topups)) write(KEY.topups, []);
    if (!localStorage.getItem(KEY.complaints)) write(KEY.complaints, []);
    if (!localStorage.getItem(KEY.cart)) write(KEY.cart, []);
  }, []);
  const persistUsers = async (next: User[]) => {
    const previous = users;
    const changed = next.filter((u) => {
      const oldUser = previous.find((p) => p.username === u.username);
      return !oldUser || JSON.stringify(oldUser) !== JSON.stringify(u);
    });
    setUsers(next);
    write(KEY.users, next);
    try {
      await Promise.all(changed.map((user) => fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'تعذر حفظ العميل');
      })));
    } catch (error) {
      notify(error instanceof Error ? error.message : 'تعذر حفظ العملاء', true);
    }
  };

  const persistTopups = async (next: Topup[]) => {
    const previous = topups;
    const changed = next.filter((t) => {
      const oldTopup = previous.find((p) => p.id === t.id);
      return !oldTopup || JSON.stringify(oldTopup) !== JSON.stringify(t);
    });
    setTopups(next);
    write(KEY.topups, next);
    try {
      await Promise.all(changed.map(async (topup) => {
        const oldTopup = previous.find((p) => p.id === topup.id);
        const response = await fetch(oldTopup ? `/api/topups/${encodeURIComponent(topup.id)}` : '/api/topups', {
          method: oldTopup ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(localStorage.getItem(KEY.admin) === '1' ? { 'X-Admin-Key': ADMIN_API_KEY } : {}),
          },
          body: JSON.stringify(topup),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data?.error || 'تعذر حفظ طلب الشحن');
        }
      }));
    } catch (error) {
      notify(error instanceof Error ? error.message : 'تعذر حفظ طلبات الشحن', true);
    }
  };

  const persistComplaints = async (next: Complaint[]) => {
    const previous = complaints;
    const changed = next.filter((c) => {
      const oldComplaint = previous.find((p) => p.id === c.id);
      return !oldComplaint || JSON.stringify(oldComplaint) !== JSON.stringify(c);
    });
    setComplaints(next);
    write(KEY.complaints, next);
    try {
      await Promise.all(changed.map(async (complaint) => {
        const oldComplaint = previous.find((p) => p.id === complaint.id);
        const response = await fetch(oldComplaint ? `/api/complaints/${encodeURIComponent(complaint.id)}` : '/api/complaints', {
          method: oldComplaint ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(localStorage.getItem(KEY.admin) === '1' ? { 'X-Admin-Key': ADMIN_API_KEY } : {}),
          },
          body: JSON.stringify(complaint),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data?.error || 'تعذر حفظ الشكوى');
        }
      }));
    } catch (error) {
      notify(error instanceof Error ? error.message : 'تعذر حفظ الشكاوى', true);
    }
  };

  const hydrateRemote = async () => {
    const remote = await fetchRemoteStore();
    if (!remote) return;
    setCategories(remote.categories);
    setProducts(remote.products);
    setSettings(remote.settings);
    write(KEY.categories, remote.categories);
    write(KEY.products, remote.products);
    write(KEY.settings, remote.settings);
    if (remote.users) {
      setUsers(remote.users);
      write(KEY.users, remote.users);
      if (currentUser?.username) {
        const remoteCurrentUser = remote.users.find((user) => user.username === currentUser.username);
        if (remoteCurrentUser) {
          setCurrentUser(remoteCurrentUser);
          write(KEY.current, remoteCurrentUser);
        }
      }
    }
    if (remote.topups) { setTopups(remote.topups); write(KEY.topups, remote.topups); }
    if (remote.complaints) { setComplaints(remote.complaints); write(KEY.complaints, remote.complaints); }
  };

  useEffect(() => {
    let alive = true;
    const loadOrders = async () => {
      const admin = localStorage.getItem(KEY.admin) === '1';
      const remoteOrders = await fetchRemoteOrders(currentUser?.username, admin);
      if (!alive || !remoteOrders.length) return;
      const sorted = remoteOrders.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setOrders(sorted);
      write(KEY.orders, sorted);
    };
    loadOrders();
    const timer = window.setInterval(loadOrders, 5000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [currentUser?.username]);

  useEffect(() => {
    let alive = true;
    const load = async () => { if (alive) await hydrateRemote(); };
    load();
    const timer = window.setInterval(() => { if (alive) load(); }, 5000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [currentUser?.username]);

  const saveStore = async (nextCategories: Category[] = categories, nextProducts: Product[] = products, nextSettings: Record<string, string> = settings) => {
    const ok = await saveRemoteStore({ categories: nextCategories, products: nextProducts, settings: nextSettings });
    if (!ok) throw new Error('تعذر حفظ التغييرات على الخادم');
    write(KEY.categories, nextCategories);
    write(KEY.products, nextProducts);
    write(KEY.settings, nextSettings);
  };

  useEffect(() => { document.documentElement.classList.toggle('dark', dark); write(KEY.theme, dark ? 'dark' : 'light'); }, [dark]);
  const notify = (text: string, error = false) => {
    const id = Date.now(); setToasts((old) => [...old, { id, text, error }]);
    window.setTimeout(() => setToasts((old) => old.filter((toast) => toast.id !== id)), 3400);
  };
  const saveCart = (next: CartItem[]) => { setCart(next); write(KEY.cart, next); };
  const saveUser = (next: User | null) => { setCurrentUser(next); write(KEY.current, next); };
  const syncUser = (user: User) => {
    const exists = users.some((item) => item.username === user.username);
    const next = exists ? users.map((item) => item.username === user.username ? user : item) : [user, ...users];
    persistUsers(next);
    saveUser(user);
  };
  const addToCart = (id: string, qty = 1) => {
    if (!currentUser) { notify('سجّل دخولك أولاً لإضافة الخدمة إلى السلة', true); setLocation('/login'); return; }
    const next = [...cart]; const found = next.find((item) => item.productId === id);
    if (found) found.qty += qty; else next.push({ productId: id, qty });
    saveCart(next); notify('أُضيفت الخدمة إلى السلة');
  };
  const logout = () => { saveUser(null); notify('تم تسجيل الخروج'); setLocation('/'); };
  const updateOrder = (id: string, status: string) => {
    const next = orders.map((order) => order.id === id ? { ...order, status } : order);
    setOrders(next); write(KEY.orders, next);
    updateRemoteOrder(id, status).then((ok) => {
      if (!ok) notify('تم التحديث محلياً لكن تعذر مزامنة الطلب مع الخادم', true);
      else notify('تم تحديث حالة الطلب');
    });
  };
  const nav = (path: string) => { setMobileNav(false); setLocation(path); };
  return (
    <div className="app-shell" dir="rtl">
      <div className="site-video" aria-hidden="true"><video autoPlay muted loop playsInline src={BACKGROUND_VIDEO_URL} /><span /></div>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand" data-testid="link-brand" onClick={() => setMobileNav(false)}>
            <span className="brand-mark">IS</span><span>IDLEB STORE<small>SYRIAN DIGITAL DESK</small></span>
          </Link>
          <nav className={`nav-links ${mobileNav ? 'open' : ''}`} data-testid="nav-main">
            <NavLink href="/" label="الرئيسية" icon={<Home size={16} />} onClick={() => setMobileNav(false)} />
            <NavLink href="/categories" label="الخدمات" icon={<LayoutGrid size={16} />} onClick={() => setMobileNav(false)} />
            <NavLink href="/orders" label="طلباتي" icon={<TicketCheck size={16} />} onClick={() => setMobileNav(false)} />
            <NavLink href="/wallet" label="المحفظة" icon={<WalletCards size={16} />} onClick={() => setMobileNav(false)} />
            <NavLink href="/about" label="عن المتجر" icon={<Headphones size={16} />} onClick={() => setMobileNav(false)} />
          </nav>
          <div className="top-actions">
            {currentUser && <span className="user-balance tag" data-testid="text-user-balance">{money(currentUser.balance)}</span>}
            <Link href="/cart" className="icon-btn" data-testid="link-cart" aria-label="السلة"><ShoppingCart size={17} /><span className="cart-count">{cart.reduce((sum, item) => sum + item.qty, 0)}</span></Link>
            <button className="icon-btn" onClick={() => setDark((value) => !value)} data-testid="button-toggle-theme" aria-label="تبديل المظهر">{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
            {currentUser ? <button className="icon-btn" onClick={logout} data-testid="button-logout" aria-label="خروج"><LogOut size={17} /></button> : <Link href="/login" className="btn btn-primary btn-sm" data-testid="link-login"><LogIn size={15} /> دخول</Link>}
            <button className="icon-btn mobile-toggle" onClick={() => setMobileNav((value) => !value)} data-testid="button-mobile-menu"><Menu size={18} /></button>
          </div>
        </div>
      </header>
      <main>
        <Switch>
          <Route path="/"><HomePage products={products} categories={categories} addToCart={addToCart} /></Route>
          <Route path="/categories"><CategoriesPage products={products} categories={categories} addToCart={addToCart} /></Route>
          <Route path="/product/:id"><ProductPage products={products} categories={categories} addToCart={addToCart} /></Route>
           <Route path="/cart"><CartPage cart={cart} products={products} currentUser={currentUser} saveCart={saveCart} users={users} setOrders={setOrders} orders={orders} setUsers={persistUsers} saveUser={saveUser} notify={notify} /></Route>
          <Route path="/wallet"><WalletPage currentUser={currentUser} users={users} setUsers={persistUsers} saveUser={saveUser} topups={topups} setTopups={persistTopups} notify={notify} walletCode={settings.walletCode} /></Route>
          <Route path="/orders"><OrdersPage currentUser={currentUser} orders={orders} /></Route>
          <Route path="/login"><LoginPage users={users} setUsers={persistUsers} saveUser={saveUser} notify={notify} /></Route>
          <Route path="/about"><AboutPage settings={settings} /></Route>
           <Route path="/complaints"><ComplaintsPage currentUser={currentUser} complaints={complaints} setComplaints={persistComplaints} notify={notify} /></Route>
           <Route path="/admin"><AdminPage categories={categories} products={products} setCategories={setCategories} setProducts={setProducts} users={users} setUsers={persistUsers} orders={orders} updateOrder={updateOrder} topups={topups} setTopups={persistTopups} complaints={complaints} setComplaints={persistComplaints} settings={settings} setSettings={setSettings} notify={notify} saveStore={saveStore} /></Route>
          <Route path="/admin/"><AdminPage categories={categories} products={products} setCategories={setCategories} setProducts={setProducts} users={users} setUsers={persistUsers} orders={orders} updateOrder={updateOrder} topups={topups} setTopups={persistTopups} complaints={complaints} setComplaints={persistComplaints} settings={settings} setSettings={setSettings} notify={notify} saveStore={saveStore} /></Route>
          <Route component={NotFound} />
        </Switch>
      </main>
      <footer className="footer"><div className="footer-inner"><span>IDLEB STORE — مكتبك للخدمات الرقمية في سوريا</span><span>سرعة واضحة. متابعة حقيقية. خدمة مسؤولة.</span></div></footer>
      <div className="toast-stack" aria-live="polite">{toasts.map((toast) => <div className={`toast ${toast.error ? 'error' : ''}`} key={toast.id} data-testid={`toast-${toast.id}`}>{toast.error ? <X size={16} /> : <Check size={16} />}{toast.text}</div>)}</div>
    </div>
  );
}

function NavLink({ href, label, icon, onClick }: { href: string; label: string; icon: ReactNode; onClick: () => void }) {
  const [location] = useLocation();
  return <Link href={href} className={`nav-link ${location === href ? 'active' : ''}`} onClick={onClick} data-testid={`link-nav-${href.replace('/', '') || 'home'}`}>{icon}{label}</Link>;
}

function HomePage({ products, categories, addToCart }: { products: Product[]; categories: Category[]; addToCart: (id: string) => void }) {
  const best = [...products].filter((p) => p.active).sort((a, b) => (b.sales || 0) - (a.sales || 0)).slice(0, 6);
  return <div className="page-wrap">
    <section className="hero" data-testid="section-hero"><div className="hero-copy"><div className="eyebrow">IDLEB / 2026 OPERATIONS DESK</div><h1>خدمات رقمية<br /><span>تنجزها بثقة.</span></h1><p>متجر سوري متخصص في التبنيد، فك الباند، الرشق، وشحن الألعاب. اختر خدمتك، أرسل التفاصيل، وتابع التنفيذ من مكان واحد.</p><div className="hero-actions"><Link href="/categories" className="btn btn-primary" data-testid="link-hero-services">تصفح الخدمات <ArrowLeft size={16} /></Link><Link href="/orders" className="btn btn-secondary" data-testid="link-hero-orders">تتبع طلباً <TicketCheck size={16} /></Link></div></div><div className="hero-orbit" aria-hidden="true" /><span className="hero-index">01 — TRUSTED SERVICE ROUTE</span></section>
    <section className="section-pad"><div className="section-head"><div><div className="eyebrow">DIRECTORY</div><h2>ابدأ من القسم الصحيح</h2><p>مسارات مرتبة للخدمات الأكثر طلباً.</p></div><Link href="/categories" className="btn btn-quiet" data-testid="link-home-all-categories">كل الأقسام <ArrowLeft size={14} /></Link></div><div className="category-grid">{categories.map((category, index) => <Link href={`/categories?category=${category.id}`} className="category-tile" key={category.id} data-testid={`card-category-${category.id}`}><span className="category-number">0{index + 1}</span>{category.image ? <img src={category.image} alt={category.name} style={{ width: '100%', height: 88, objectFit: 'cover', borderRadius: 12, marginBottom: 8 }} /> : <span className="category-icon">{category.id === 'cat4' ? <Gamepad2 size={19} /> : category.id === 'cat2' ? <LockKeyhole size={19} /> : category.id === 'cat1' ? <ShieldCheck size={19} /> : <TrendingUp size={19} />}</span>}<strong>{category.name}</strong><span>{products.filter((product) => product.categoryId === category.id && product.active).length} خدمات متاحة</span></Link>)}</div></section>
    <section className="section-pad"><div className="section-head"><div><div className="eyebrow">MOST REQUESTED</div><h2>الخدمات التي تتحرك بسرعة</h2><p>اختيارات عملية من سجل الطلبات المحلي.</p></div><Link href="/categories" className="btn btn-quiet" data-testid="link-home-all-products">عرض الكل <ArrowLeft size={14} /></Link></div><div className="product-grid">{best.map((product) => <ProductCard product={product} key={product.id} addToCart={addToCart} />)}</div></section>
    <section className="section-pad"><div className="panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', padding: 25 }}><div><div className="eyebrow">NEED A HAND?</div><h2 style={{ margin: '7px 0', fontSize: 22 }}>لا تعرف أي خدمة تناسبك؟</h2><p style={{ margin: 0, color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>أرسل تفاصيل الحالة للإدارة، وسنوجهك إلى المسار الأقصر.</p></div><Link className="btn btn-secondary" href="/complaints" data-testid="link-support"><MessageCircle size={16} /> تواصل مع الدعم</Link></div></section>
  </div>;
}

function ProductCard({ product, addToCart }: { product: Product; addToCart: (id: string) => void }) {
  return <article className="product-card" data-testid={`card-product-${product.id}`}><Link href={`/product/${product.id}`} data-testid={`link-product-${product.id}`}>{productArt(product)}<div className="product-body"><span className="tag">{TYPE_LABEL[product.type] || TYPE_LABEL.other}</span><h3>{product.name}</h3><p>{product.desc}</p><div className="product-footer"><span className="price">{money(product.price)}<small>{product.unitSize ? ` / ${product.unitSize}` : ''}</small></span><button className="btn btn-primary btn-sm" onClick={(event) => { event.preventDefault(); addToCart(product.id); }} data-testid={`button-add-${product.id}`}><Plus size={14} /> إضافة</button></div></div></Link></article>;
}

function CategoriesPage({ products, categories, addToCart }: { products: Product[]; categories: Category[]; addToCart: (id: string) => void }) {
  const [query, setQuery] = useState(''); const [category, setCategory] = useState('all'); const [sort, setSort] = useState('popular');
  const filtered = useMemo(() => products.filter((p) => p.active && (category === 'all' || p.categoryId === category) && `${p.name} ${p.desc} ${TYPE_LABEL[p.type]}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === 'low' ? a.price - b.price : sort === 'high' ? b.price - a.price : (b.sales || 0) - (a.sales || 0)), [products, category, query, sort]);
  return <div className="page-wrap section-pad"><div className="page-heading"><div><div className="eyebrow">SERVICE CATALOG</div><h1>كل الخدمات</h1><p>فلتر سريع، تفاصيل واضحة، وطلب بلا خطوات زائدة.</p></div><div className="search-bar"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث عن خدمة..." data-testid="input-service-search" /></div></div><div className="filter-row"><div className="filter-controls"><ListFilter size={16} color="hsl(var(--muted-foreground))" /><select className="select-input" value={category} onChange={(event) => setCategory(event.target.value)} data-testid="select-service-category"><option value="all">كل الأقسام</option>{categories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><select className="select-input" value={sort} onChange={(event) => setSort(event.target.value)} data-testid="select-service-sort"><option value="popular">الأكثر طلباً</option><option value="low">السعر: الأقل أولاً</option><option value="high">السعر: الأعلى أولاً</option></select></div><span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 12 }}>{filtered.length} خدمة</span></div>{filtered.length ? <div className="product-grid">{filtered.map((product) => <ProductCard product={product} key={product.id} addToCart={addToCart} />)}</div> : <div className="empty-state"><Search size={29} /><h2>لم نجد ما تبحث عنه</h2><p>جرّب كلمة مختلفة أو اعرض كل الأقسام.</p><button className="btn btn-secondary" onClick={() => { setQuery(''); setCategory('all'); }} data-testid="button-clear-filters">مسح الفلاتر</button></div>}</div>;
}

function ProductPage({ products, categories, addToCart }: { products: Product[]; categories: Category[]; addToCart: (id: string, qty?: number) => void }) {
  const { id } = useParams<{ id: string }>(); const product = products.find((item) => item.id === id && item.active); const category = categories.find((item) => item.id === product?.categoryId);
  const [qty, setQty] = useState(product?.unitSize || 1);
  if (!product) return <div className="page-wrap section-pad"><div className="empty-state"><Package size={30} /><h2>الخدمة غير موجودة</h2><Link href="/categories" className="btn btn-primary" data-testid="link-back-catalog">العودة للخدمات</Link></div></div>;
   return <div className="page-wrap section-pad"><Link href="/categories" className="btn btn-quiet" data-testid="link-back-categories"><ArrowRight size={15} /> العودة للخدمات</Link><div className="detail-layout" style={{ marginTop: 17 }}><section className="detail-card"><div className="detail-intro">{productArt(product)}<div><span className="tag">{category?.name || TYPE_LABEL[product.type]}</span><h1>{product.name}</h1><p>{product.desc}</p><div className="price" style={{ marginTop: 15, fontSize: 20 }}>{money(product.price)}{product.unitSize && <small> / {product.unitSize} وحدة</small>}</div></div></div><div className="detail-features"><div className="feature-box"><BadgeCheck size={18} /><strong>متابعة مباشرة</strong><span>يظهر كل تحديث في صفحة طلباتك.</span></div><div className="feature-box"><Clock3 size={18} /><strong>بدء سريع</strong><span>نراجع المتطلبات فور وصول الطلب.</span></div><div className="feature-box"><LockKeyhole size={18} /><strong>بيانات محمية</strong><span>لا نطلب كلمات المرور أو رموز الدخول.</span></div><div className="feature-box"><Headphones size={18} /><strong>دعم واضح</strong><span>تعليمات خاصة قبل تنفيذ كل خدمة.</span></div></div><div className="instruction-box"><strong>تعليمات الخدمة</strong><p>{serviceInstructions(product.type)}</p></div></section><aside className="panel order-form"><div className="eyebrow">ORDER ENTRY</div><h2>ابدأ طلبك</h2><p>أضف الخدمة إلى السلة ثم أدخل البيانات الضرورية فقط.</p>{product.unitSize && <div className="field"><label>الكمية / الوحدات</label><input className="text-input" type="number" min={product.unitSize || 1} step={product.unitSize || 1} value={qty} onChange={(event) => setQty(Math.max(1, Number(event.target.value)))} data-testid="input-product-quantity" /><span className="field-note">{product.pricingNote}</span></div>}<div className="summary-line total"><span>التقدير</span><strong>{money(lineTotal(product, qty))}</strong></div><button className="btn btn-primary" style={{ width: '100%' }} onClick={() => addToCart(product.id, qty)} data-testid={`button-buy-${product.id}`}><ShoppingCart size={16} /> أضف إلى السلة</button><Link href="/cart" className="btn btn-secondary" style={{ width: '100%', marginTop: 8 }} data-testid="link-open-cart">الانتقال للدفع <ArrowLeft size={15} /></Link></aside></div></div>;
}

function CartPage({ cart, products, currentUser, saveCart, users, setOrders, orders, setUsers, saveUser, notify }: { cart: CartItem[]; products: Product[]; currentUser: User | null; saveCart: (items: CartItem[]) => void; users: User[]; setOrders: (items: Order[]) => void; orders: Order[]; setUsers: (items: User[]) => void; saveUser: (user: User | null) => void; notify: (text: string, error?: boolean) => void }) {
  const [, setLocation] = useLocation(); const [form, setForm] = useState<Requirement & { whatsapp: string; payment: string }>({ whatsapp: '', payment: 'wallet', platform: '', accountId: '', targetLink: '', quantity: '', notes: '' });
  const items = cart.map((item) => ({ ...item, product: products.find((product) => product.id === item.productId) })).filter((item): item is CartItem & { product: Product } => Boolean(item.product));
  const total = items.reduce((sum, item) => sum + lineTotal(item.product, item.qty), 0);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentUser) { notify('تحتاج إلى تسجيل الدخول قبل تأكيد الطلب', true); setLocation('/login'); return; }
    const primaryType = items[0]?.product.type || 'other'; const needed = serviceFields(primaryType);
    if (!form.whatsapp || needed.some((field) => !String((form as Record<string, unknown>)[field.key] || '').trim())) { notify('أكمل البيانات الضرورية لهذه الخدمة ورقم التواصل', true); return; }
    if (form.payment === 'wallet' && currentUser.balance < total) { notify('الرصيد غير كافٍ، اشحن المحفظة أولاً', true); return; }
    const requirements: Requirement = { platform: form.platform, accountId: form.accountId, username: form.accountId, targetLink: form.targetLink, quantity: form.quantity, notes: form.notes };
    const order: Order = { id: uid('ORD'), date: new Date().toISOString(), username: currentUser.username, email: currentUser.email, whatsapp: form.whatsapp, items: items.map((item) => ({ productId: item.product.id, name: item.product.name, type: item.product.type, qty: item.qty, price: item.product.price, requirements })), total, status: 'pending', paymentMethod: form.payment === 'wallet' ? 'المحفظة' : 'شام كاش — مراجعة', requirements };
    const nextOrders = [order, ...orders];
    setOrders(nextOrders); write(KEY.orders, nextOrders);
    const remoteSaved = await createRemoteOrder(order);
    if (!remoteSaved) { notify('تعذر إرسال الطلب إلى الإدارة، حاول مرة أخرى', true); return; }
    if (form.payment === 'wallet') { const updated = { ...currentUser, balance: currentUser.balance - total }; const nextUsers = users.map((user) => user.username === updated.username ? updated : user); setUsers(nextUsers); saveUser(updated); }
    saveCart([]); notify('تم استلام طلبك بنجاح'); setLocation('/orders');
  };
  if (!items.length) return <div className="page-wrap section-pad"><div className="page-heading"><div><div className="eyebrow">ORDER BAG</div><h1>السلة</h1></div></div><div className="empty-state"><ShoppingCart size={32} /><h2>السلة جاهزة لشيء جيد</h2><p>أضف خدمة واحدة على الأقل، وستظهر لك متطلبات الدفع هنا.</p><Link href="/categories" className="btn btn-primary" data-testid="link-empty-cart-services">تصفح الخدمات <ArrowLeft size={15} /></Link></div></div>;
   const fields = serviceFields(items[0]?.product.type || 'other');
   return <div className="page-wrap section-pad"><div className="page-heading"><div><div className="eyebrow">ORDER BAG</div><h1>راجع طلبك</h1><p>{items.length} خدمات · {serviceInstructions(items[0]?.product.type || 'other')}</p></div></div><form className="cart-layout" onSubmit={submit}><div><div className="cart-list">{items.map((item) => <div className="cart-item" key={item.productId} data-testid={`row-cart-${item.productId}`}>{productArt(item.product, 'product-art')}<div className="cart-item-main"><h3>{item.product.name}</h3><p>{TYPE_LABEL[item.product.type]} · {money(item.product.price)} للخدمة</p></div><div className="cart-item-actions"><button type="button" className="icon-btn" onClick={() => saveCart(cart.map((entry) => entry.productId === item.productId ? { ...entry, qty: Math.max(1, entry.qty - 1) } : entry))}>−</button><span className="qty">{item.qty}</span><button type="button" className="icon-btn" onClick={() => saveCart(cart.map((entry) => entry.productId === item.productId ? { ...entry, qty: entry.qty + 1 } : entry))}><Plus size={13} /></button><button type="button" className="icon-btn" onClick={() => saveCart(cart.filter((entry) => entry.productId !== item.productId))}><Trash2 size={14} /></button></div></div>)}</div><section className="panel" style={{ marginTop: 16, padding: 21 }}><div className="panel-title"><h2>بيانات التنفيذ</h2><span>الضروري فقط</span></div><div className="form-grid"><div className="field"><label>رقم التواصل *</label><input className="text-input" value={form.whatsapp} onChange={(event) => setForm({ ...form, whatsapp: event.target.value })} placeholder="+963 9xx xxx xxx" required /></div>{fields.map((field) => <div className="field" key={field.key}><label>{field.label} *</label><input className="text-input" dir={field.key === 'targetLink' ? 'ltr' : undefined} value={String((form as Record<string, unknown>)[field.key] || '')} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} placeholder={field.placeholder} required /></div>)}<div className="field field-full"><label>ملاحظات إضافية (اختياري)</label><textarea className="textarea-input" rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="لا ترسل كلمات مرور أو رموز تحقق" /></div></div></section></div><aside className="panel summary-card"><h2>ملخص الدفع</h2><div className="summary-line"><span>الخدمات</span><strong>{money(total)}</strong></div><div className="field" style={{ marginTop: 19 }}><label>طريقة الدفع</label><select className="select-input" value={form.payment} onChange={(event) => setForm({ ...form, payment: event.target.value })}><option value="wallet">من رصيد المحفظة ({money(currentUser?.balance || 0)})</option><option value="cash">شام كاش — أرسل إثباتاً</option></select></div><div className="summary-line total"><span>الإجمالي</span><strong data-testid="text-cart-total">{money(total)}</strong></div><button className="btn btn-primary" style={{ width: '100%' }} type="submit"><CreditCard size={16} /> تأكيد الطلب</button></aside></form></div>;
}

function WalletPage({ currentUser, users, setUsers, saveUser, topups, setTopups, notify, walletCode }: { currentUser: User | null; users: User[]; setUsers: (items: User[]) => void; saveUser: (user: User | null) => void; topups: Topup[]; setTopups: (items: Topup[]) => void; notify: (text: string, error?: boolean) => void; walletCode?: string }) {
  const [, setLocation] = useLocation(); const [form, setForm] = useState({ txNumber: '', amount: '', currency: 'USD' });
  const liveUser = currentUser ? (users.find((user) => user.username === currentUser.username) || currentUser) : null;
  if (!liveUser) return <LoginPrompt title="المحفظة متاحة بعد تسجيل الدخول" />;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.txNumber || Number(form.amount) <= 0) { notify('أدخل رقم العملية والمبلغ', true); return; }
    const topup: Topup = { id: uid('TOP'), username: liveUser.username, email: liveUser.email, txNumber: form.txNumber, amount: Number(form.amount), currency: form.currency, status: 'pending', date: new Date().toISOString() };
    const next = [topup, ...topups];
    await setTopups(next);
    setForm({ txNumber: '', amount: '', currency: 'USD' });
    notify('أُرسل طلب الشحن للمراجعة');
  };
  const code = walletCode || 'SY-IDLEB-2025-SCASH';
  return <div className="page-wrap section-pad"><div className="page-heading"><div><div className="eyebrow">PERSONAL WALLET</div><h1>المحفظة</h1><p>رصيدك، طلبات الشحن، ومسار الدفع في مكان واحد.</p></div></div><section className="wallet-card wallet-hero"><small>الرصيد المتاح</small><h1 data-testid="text-wallet-balance">{money(liveUser.balance)}</h1><button className="btn" onClick={() => document.getElementById('topup-form')?.scrollIntoView({ behavior: 'smooth' })} data-testid="button-scroll-topup"><Plus size={16} /> شحن الرصيد</button></section><div className="wallet-grid"><section className="panel topup-box" id="topup-form"><div className="eyebrow">SHAM CASH ROUTE</div><h2 style={{ margin: '7px 0', fontSize: 19 }}>إرسال طلب شحن</h2><p style={{ color: 'hsl(var(--muted-foreground))', fontSize: 12 }}>حوّل المبلغ إلى محفظة IDLEB ثم أرسل رقم العملية.</p><div className="payment-code"><code data-testid="text-wallet-code">{code}</code><button className="btn btn-secondary btn-sm" type="button" onClick={() => { navigator.clipboard?.writeText(code); notify('تم نسخ رمز المحفظة'); }} data-testid="button-copy-wallet-code"><Copy size={13} /> نسخ</button></div><form onSubmit={submit}><div className="field"><label>رقم العملية *</label><input className="text-input" value={form.txNumber} onChange={(event) => setForm({ ...form, txNumber: event.target.value })} data-testid="input-topup-transaction" /></div><div className="form-grid"><div className="field"><label>المبلغ *</label><input className="text-input" type="number" min={1} value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} data-testid="input-topup-amount" /></div><div className="field"><label>العملة</label><select className="select-input" value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })} data-testid="select-topup-currency"><option value="USD">دولار USD</option><option value="SYP">ليرة سورية SYP</option></select></div></div><button className="btn btn-primary" style={{ width: '100%' }} data-testid="button-submit-topup"><Send size={15} /> إرسال للمراجعة</button></form></section><section className="panel topup-box"><div className="panel-title"><h2>سجل الشحن</h2><span>{topups.filter((item) => item.username === liveUser.username).length} طلب</span></div>{topups.filter((item) => item.username === liveUser.username).slice(0, 5).map((item) => <div className="order-meta" key={item.id} data-testid={`row-topup-${item.id}`}><span><strong>{item.txNumber}</strong></span><span>{money(item.amount)} {item.currency}</span><span className={`status ${item.status === 'approved' ? 'completed' : 'pending'}`}>{item.status === 'approved' ? 'تمت الإضافة' : 'قيد المراجعة'}</span></div>)}{!topups.some((item) => item.username === liveUser.username) && <div className="empty-state" style={{ padding: 32 }}><WalletCards size={24} /><p>لا توجد عمليات شحن بعد.</p></div>}</section></div></div>;
}

function LoginPrompt({ title }: { title: string }) { return <div className="page-wrap auth-layout"><div className="empty-state"><LockKeyhole size={30} /><h2>{title}</h2><Link href="/login" className="btn btn-primary" data-testid="link-login-required">تسجيل الدخول</Link></div></div>; }

function OrdersPage({ currentUser, orders }: { currentUser: User | null; orders: Order[] }) {
  if (!currentUser) return <LoginPrompt title="سجّل الدخول لتتابع طلباتك" />;
  const own = orders.filter((order) => order.username === currentUser.username);
  return <div className="page-wrap section-pad"><div className="page-heading"><div><div className="eyebrow">CUSTOMER TRACKING</div><h1>طلباتي</h1><p>تتبع واضح من الاستلام إلى التنفيذ.</p></div></div>{own.length ? <div style={{ maxWidth: 780 }}>{own.map((order) => <CustomerOrder order={order} key={order.id} />)}</div> : <div className="empty-state"><TicketCheck size={30} /><h2>لا توجد طلبات حتى الآن</h2><p>ابدأ من دليل الخدمات، وسنحتفظ بكل تحديث هنا.</p><Link href="/categories" className="btn btn-primary" data-testid="link-orders-services">تصفح الخدمات</Link></div>}</div>;
}
function CustomerOrder({ order }: { order: Order }) {
  const steps = ['pending', 'processing', 'completed']; const current = steps.indexOf(order.status);
  return <article className="panel order-card" data-testid={`card-order-${order.id}`}><div className="order-card-head"><div><h3>{order.items.map((item) => item.name).join('، ')}</h3><p>{order.id} · {dateLabel(order.date)}</p></div><span className={`status ${order.status}`}>{statusLabel(order.status)}</span></div><div className="order-meta"><span>الإجمالي <strong>{money(order.total)}</strong></span><span>الدفع <strong>{order.paymentMethod}</strong></span><span>واتساب <strong dir="ltr">{order.whatsapp}</strong></span></div><div className="timeline">{steps.map((step, index) => <div className={`timeline-item ${index <= current && order.status !== 'cancelled' ? 'done' : ''}`} key={step}><span className="timeline-dot">{index <= current && order.status !== 'cancelled' ? <Check size={15} /> : <span style={{ fontSize: 10 }}>{index + 1}</span>}</span><div><h4>{statusLabel(step)}</h4><p>{step === 'pending' ? 'استلمنا البيانات ونراجعها الآن.' : step === 'processing' ? 'بدأ فريق التنفيذ بمعالجة طلبك.' : 'اكتمل الطلب. شكراً لثقتك.'}</p></div></div>)}</div></article>;
}

function LoginPage({ users, setUsers, saveUser, notify }: { users: User[]; setUsers: (items: User[]) => void; saveUser: (user: User | null) => void; notify: (text: string, error?: boolean) => void }) {
  const [, setLocation] = useLocation();
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' });
  const [pending, setPending] = useState<PendingVerification | null>(() => {
    const saved = read<PendingVerification[]>(KEY.pending, [])[0];
    return saved && Date.now() < saved.expiresAt ? saved : null;
  });
  const [otp, setOtp] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (pending) write(KEY.pending, [pending]);
  }, [pending]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const username = form.username.trim();
    const email = form.email.trim().toLowerCase();
    if (username === ADMIN_CREDENTIALS.username && email === ADMIN_CREDENTIALS.email && form.password === ADMIN_CREDENTIALS.password) {
      localStorage.setItem(KEY.admin, '1');
      notify('تم تسجيل دخول الإدارة');
      setLocation('/admin');
      return;
    }
    const existing = users.find((user) => user.username === username || user.email === email);
    const enteredHash = await hashValue(form.password);

    if (existing) {
      if (!existing.isVerified) {
        notify('أكد بريدك الإلكتروني أولاً لإتاحة الحساب', true);
        return;
      }
      if ((existing.passwordHash || existing.password) !== enteredHash && existing.password !== form.password) {
        notify('كلمة المرور غير صحيحة', true);
        return;
      }
      saveUser({ ...existing, isVerified: true });
      notify('مرحباً بعودتك');
      setLocation('/');
      return;
    }

    if (username.length < 3 || !email || form.password.length < 4 || form.password !== form.confirm) {
      notify('أكمل البيانات وتأكد من تطابق كلمتي المرور', true);
      return;
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const nextPending = { username, email, passwordHash: enteredHash, code, expiresAt: Date.now() + 10 * 60 * 1000 };
    write(KEY.pending, [nextPending]);
    setPending(nextPending);
    setSending(true);

    try {
      await sendEmailOtp(email, code, username);
      notify('أرسلنا رمز التفعيل إلى بريدك الإلكتروني');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'خطأ غير معروف';
      console.error('[IDLEB] EmailJS OTP error:', message);
      notify(`فشل إرسال رمز التفعيل عبر EmailJS: ${message}`, true);
    } finally {
      setSending(false);
    }
  };

  const resend = async () => {
    if (!pending) return;
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const nextPending = { ...pending, code, expiresAt: Date.now() + 10 * 60 * 1000 };
    setPending(nextPending);
    setSending(true);
    try {
      await sendEmailOtp(pending.email, code, pending.username);
      notify('أرسلنا رمزاً جديداً');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'خطأ غير معروف';
      console.error('[IDLEB] EmailJS resend error:', message);
      notify(`فشل إعادة إرسال الرمز: ${message}`, true);
    } finally {
      setSending(false);
    }
  };

  const verify = () => {
    if (!pending || Date.now() > pending.expiresAt) {
      setPending(null);
      write(KEY.pending, []);
      notify('انتهت صلاحية الرمز، أرسل رمزاً جديداً', true);
      return;
    }
    if (!/^\d{6}$/.test(otp) || otp !== pending.code) {
      notify('رمز التفعيل غير صحيح', true);
      return;
    }
    const user: User = {
      username: pending.username,
      email: pending.email,
      passwordHash: pending.passwordHash,
      balance: 0,
      isVerified: true,
      createdAt: new Date().toISOString(),
    };
    const next = [...users, user];
    setUsers(next);
    write(KEY.users, next);
    write(KEY.pending, []);
    setPending(null);
    saveUser(user);
    notify('تم تفعيل الحساب بنجاح');
    setLocation('/');
  };

  return <div className="page-wrap auth-layout"><section className="auth-card">
    <div className="eyebrow">ACCOUNT ACCESS</div>
    <h1>أهلاً بك في IDLEB</h1>
    <p>سجّل الدخول لمتابعة طلباتك. الحسابات الجديدة لا تُتاح قبل تأكيد البريد الإلكتروني.</p>
    <form onSubmit={submit}>
      <div className="field"><label>اسم المستخدم</label><input className="text-input" autoComplete="username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} data-testid="input-auth-username" /></div>
      <div className="field"><label>البريد الإلكتروني *</label><input className="text-input" type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} data-testid="input-auth-email" /></div>
      <div className="field"><label>كلمة المرور *</label><input className="text-input" type="password" autoComplete="current-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} data-testid="input-auth-password" /></div>
      <div className="field"><label>تأكيد كلمة المرور</label><input className="text-input" type="password" autoComplete="new-password" value={form.confirm} onChange={(event) => setForm({ ...form, confirm: event.target.value })} data-testid="input-auth-confirm" /></div>
      <button className="btn btn-primary" style={{ width: '100%' }} disabled={sending} data-testid="button-auth-submit"><LogIn size={16} /> {sending ? 'جارٍ إرسال الرمز...' : 'دخول / إنشاء حساب'}</button>
    </form>
    {pending && <div className="otp-box" data-testid="panel-otp">
      <strong>أدخل رمز التفعيل المرسل إلى بريدك — صالح لمدة 10 دقائق</strong>
      <input className="text-input" style={{ marginTop: 10, letterSpacing: 4, direction: 'ltr', textAlign: 'center' }} inputMode="numeric" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))} placeholder="000000" data-testid="input-auth-otp" />
      <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: 9 }} onClick={verify} data-testid="button-verify-otp"><BadgeCheck size={15} /> تأكيد البريد</button>
      <button type="button" className="btn btn-quiet" style={{ width: '100%', marginTop: 4 }} onClick={resend} disabled={sending}><Send size={14} /> إعادة إرسال الرمز</button>
    </div>}
    <div className="auth-switch">لا نطلب كلمات المرور أو رموز التحقق لأي خدمة.</div>
  </section></div>;
}

function AboutPage({ settings }: { settings: Record<string, string> }) {
  const owner = settings.ownerName || 'MOOHAMED || IDLEB X'; const bio = settings.ownerBio || 'صاحب ومشرف IDLEB STORE — نوفر خدمات رقمية باحترافية وسرعة، مع متابعة مباشرة للطلبات وخدمة عملاء واضحة.';
  return <div className="page-wrap section-pad owner-layout"><div className="page-heading"><div><div className="eyebrow">THE DESK BEHIND THE STORE</div><h1>عن IDLEB STORE</h1></div></div><section className="panel owner-card"><div className="owner-avatar">{owner.slice(0, 2).toUpperCase()}</div><div className="eyebrow">STORE OWNER</div><h1>{owner}</h1><p>{bio}</p><div className="contact-grid"><a className="contact-box" href={`https://wa.me/${settings.adminPhone || ''}`} target="_blank" rel="noreferrer"><MessageCircle size={18} /><small>رقم الإدارة</small><strong>{settings.adminPhone || 'تواصل معنا'}</strong></a><a className="contact-box" href="mailto:support@idleb.store"><Bell size={18} /><small>البريد</small><strong>دعم العملاء</strong></a></div></section><section className="section-pad"><div className="section-head"><div><div className="eyebrow">OUR PROMISE</div><h2>ثلاث قواعد لكل طلب</h2></div></div><div className="category-grid"><div className="category-tile"><span className="category-icon"><ClipboardCheck size={18} /></span><strong>بيانات واضحة</strong><span>لا نبدأ قبل فهم المطلوب.</span></div><div className="category-tile"><span className="category-icon"><Activity size={18} /></span><strong>متابعة مستمرة</strong><span>كل حالة لها تحديث مفهوم.</span></div><div className="category-tile"><span className="category-icon"><ShieldCheck size={18} /></span><strong>مسؤولية الخدمة</strong><span>نتعامل مع بياناتك بعناية.</span></div></div></section></div>;
}

function ComplaintsPage({ currentUser, complaints, setComplaints, notify }: { currentUser: User | null; complaints: Complaint[]; setComplaints: (items: Complaint[]) => void; notify: (text: string, error?: boolean) => void }) {
  const [form, setForm] = useState({ subject: '', message: '' });
  if (!currentUser) return <LoginPrompt title="سجّل الدخول لإرسال شكوى" />;
  const own = complaints.filter((item) => item.username === currentUser.username);
  return <div className="page-wrap section-pad"><div className="page-heading"><div><div className="eyebrow">CUSTOMER CARE</div><h1>الشكاوى</h1><p>أرسل المشكلة وسيتابعها فريق الإدارة.</p></div></div><section className="panel" style={{ maxWidth: 720 }}><form onSubmit={async (event) => { event.preventDefault(); if (!form.subject || !form.message) { notify('أكمل عنوان الشكوى وتفاصيلها', true); return; } const next = [{ id: uid('CMP'), username: currentUser.username, email: currentUser.email, subject: form.subject, message: form.message, status: 'open' as const, date: new Date().toISOString() }, ...complaints]; await setComplaints(next); setForm({ subject: '', message: '' }); notify('تم إرسال الشكوى'); }}><div className="field"><label>عنوان الشكوى</label><input className="text-input" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} /></div><div className="field"><label>التفاصيل</label><textarea className="textarea-input" rows={5} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} /></div><button className="btn btn-primary"><Send size={15} /> إرسال الشكوى</button></form></section>{own.map((item) => <article className="panel order-card" key={item.id}><div className="order-card-head"><div><h3>{item.subject}</h3><p>{dateLabel(item.date)}</p></div><span className={`status ${item.status === 'open' ? 'pending' : 'completed'}`}>{item.status === 'open' ? 'مفتوحة' : 'تم الحل'}</span></div><p>{item.message}</p></article>)}</div>;
}

function AdminComplaints({ complaints, setComplaints, notify }: { complaints: Complaint[]; setComplaints: (items: Complaint[]) => void; notify: (text: string, error?: boolean) => void }) {
  return <div className="admin-order-list">{complaints.length ? complaints.map((item) => <article className="admin-order-card" key={item.id}><div className="admin-order-top"><div><div className="admin-order-id">{item.id}</div><div className="admin-order-name">{item.subject}</div><div className="admin-order-date">{item.username} · {dateLabel(item.date)}</div></div><span className={`status ${item.status === 'open' ? 'pending' : 'completed'}`}>{item.status === 'open' ? 'مفتوحة' : 'تم الحل'}</span></div><div className="requirements-box"><p>{item.message}</p><small>{item.email}</small></div><button className="btn btn-secondary btn-sm" onClick={() => { const next = complaints.map((entry) => entry.id === item.id ? { ...entry, status: entry.status === 'open' ? 'resolved' as const : 'open' as const } : entry); setComplaints(next); notify('تم تحديث الشكوى'); }}>{item.status === 'open' ? 'تحديد كمحلولة' : 'إعادة فتح'}</button></article>) : <div className="empty-state"><MessageCircle size={28} /><h2>لا توجد شكاوى</h2></div>}</div>;
}

function AdminPage(props: { categories: Category[]; products: Product[]; setCategories: (items: Category[]) => void; setProducts: (items: Product[]) => void; users: User[]; setUsers: (items: User[]) => void; orders: Order[]; updateOrder: (id: string, status: string) => void; topups: Topup[]; setTopups: (items: Topup[]) => void; complaints: Complaint[]; setComplaints: (items: Complaint[]) => void; settings: Record<string, string>; setSettings: (settings: Record<string, string>) => void; notify: (text: string, error?: boolean) => void; saveStore: (categories?: Category[], products?: Product[], settings?: Record<string, string>) => Promise<void> }) {
  const [, setLocation] = useLocation();
  const loggedIn = localStorage.getItem(KEY.admin) === '1';
  useEffect(() => { if (!loggedIn) setLocation('/login'); }, [loggedIn, setLocation]);
  if (!loggedIn) return <div className="page-wrap auth-layout"><div className="empty-state"><LockKeyhole size={30} /><h2>جارٍ تحويلك لتسجيل الدخول</h2></div></div>;
  const navItems = [{ id: 'overview', label: 'نظرة عامة', icon: <BarChart3 size={16} /> }, { id: 'orders', label: 'الطلبات', icon: <Package size={16} /> }, { id: 'catalog', label: 'كتالوج الخدمات', icon: <Box size={16} /> }, { id: 'customers', label: 'العملاء', icon: <Users size={16} /> }, { id: 'topups', label: 'طلبات الشحن', icon: <WalletCards size={16} /> }, { id: 'complaints', label: 'الشكاوى', icon: <MessageCircle size={16} /> }, { id: 'settings', label: 'الإعدادات', icon: <Settings size={16} /> }];
  const [tab, setTab] = useState('overview');
  return <div className="page-wrap"><div className="admin-layout"><aside className="panel admin-side"><h2>IDLEB / DESK</h2><div className="admin-nav">{navItems.map((item) => <button className={tab === item.id ? 'active' : ''} key={item.id} onClick={() => setTab(item.id)}>{item.icon}{item.label}</button>)}<button onClick={() => { localStorage.removeItem(KEY.admin); setLocation('/login'); }}><LogOut size={16} /> تسجيل الخروج</button></div></aside><main className="admin-main"><div className="admin-topline"><div><div className="eyebrow">OPERATIONS CENTER</div><h1>{navItems.find((item) => item.id === tab)?.label}</h1><p>إدارة موحدة للمحتوى والطلبات.</p></div><span className="tag"><Activity size={13} /> مزامنة المحتوى عبر Cloudflare</span></div>{tab === 'overview' && <AdminOverview {...props} setTab={setTab} />}{tab === 'orders' && <AdminOrders {...props} />}{tab === 'catalog' && <AdminCatalog {...props} />}{tab === 'customers' && <AdminCustomers {...props} />}{tab === 'topups' && <AdminTopups {...props} />}{tab === 'complaints' && <AdminComplaints complaints={props.complaints} setComplaints={props.setComplaints} notify={props.notify} />}{tab === 'settings' && <AdminSettings {...props} />}</main></div></div>;
}

function AdminOverview({ orders, users, products, topups, setTab }: { orders: Order[]; users: User[]; products: Product[]; topups: Topup[]; setTab: (tab: string) => void }) {
  const revenue = orders.filter((o) => o.status !== 'cancelled').reduce((sum, o) => sum + o.total, 0); const pending = orders.filter((o) => o.status === 'pending').length; const max = Math.max(...orders.map((o) => o.total), 10); const bars = Array.from({ length: 8 }, (_, i) => orders.filter((o) => new Date(o.date).getDate() % 8 === i).reduce((sum, o) => sum + o.total, 0));
  return <><div className="metric-grid"><Metric icon={<TrendingUp size={16} />} label="الإيرادات المسجلة" value={money(revenue)} test="revenue" /><Metric icon={<Package size={16} />} label="كل الطلبات" value={String(orders.length)} test="orders" /><Metric icon={<Clock3 size={16} />} label="بانتظار المراجعة" value={String(pending)} test="pending" /><Metric icon={<Users size={16} />} label="العملاء" value={String(users.length)} test="customers" /></div><div className="admin-grid"><section className="panel"><div className="panel-title"><h2>نشاط الإيرادات</h2><span>محلي / آخر 8 نقاط</span></div><div className="bar-chart">{bars.map((value, index) => <div className="bar" style={{ height: `${Math.max(10, (value / max) * 100)}%` }} key={index}><small>{value ? money(value).replace(' $', '') : '—'}</small></div>)}</div></section><section className="panel"><div className="panel-title"><h2>تنبيهات التشغيل</h2><span>{topups.filter((t) => t.status === 'pending').length} جديدة</span></div><div className="activity-list"><div className="activity"><span className="activity-icon"><Clock3 size={14} /></span><p><strong>{pending} طلب</strong><br /><small>تحتاج مراجعة الحالة</small></p></div><div className="activity"><span className="activity-icon"><WalletCards size={14} /></span><p><strong>{topups.filter((t) => t.status === 'pending').length} طلب شحن</strong><br /><small>بانتظار المطابقة</small></p></div><div className="activity"><span className="activity-icon"><Box size={14} /></span><p><strong>{products.filter((p) => p.active).length} خدمة نشطة</strong><br /><small>في الكتالوج الحالي</small></p></div></div></section></div><section className="panel"><div className="panel-title"><h2>إجراءات سريعة</h2><span>اختصارات الفريق</span></div><div className="admin-actions"><button className="btn btn-primary" onClick={() => setTab('orders')} data-testid="button-quick-orders"><Package size={15} /> افتح طابور الطلبات</button><button className="btn btn-secondary" onClick={() => setTab('topups')} data-testid="button-quick-topups"><WalletCards size={15} /> راجع الشحن</button><button className="btn btn-secondary" onClick={() => setTab('catalog')} data-testid="button-quick-catalog"><Plus size={15} /> أدر الكتالوج</button></div></section></>;
}
function Metric({ icon, label, value, test }: { icon: ReactNode; label: string; value: string; test: string }) { return <div className="metric-card" data-testid={`metric-${test}`}><div><span>{label}</span>{icon}</div><strong>{value}</strong></div>; }

function AdminOrders({ orders, updateOrder, notify }: { orders: Order[]; updateOrder: (id: string, status: string) => void; notify: (text: string, error?: boolean) => void }) {
  const [query, setQuery] = useState(''); const [status, setStatus] = useState('all'); const [type, setType] = useState('all'); const [selected, setSelected] = useState<Order | null>(null);
  const visible = orders.filter((order) => (status === 'all' || order.status === status) && (type === 'all' || order.items.some((item) => item.type === type)) && `${order.id} ${order.username} ${order.email} ${order.whatsapp} ${order.items.map((i) => i.name).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  return <><div className="admin-toolbar"><div className="search-bar"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالرقم، العميل، الخدمة..." data-testid="input-admin-order-search" /></div><div className="filter-controls"><select className="select-input" value={status} onChange={(event) => setStatus(event.target.value)} data-testid="select-admin-order-status"><option value="all">كل الحالات</option><option value="pending">قيد المراجعة</option><option value="processing">قيد التنفيذ</option><option value="completed">مكتمل</option><option value="cancelled">ملغى</option></select><select className="select-input" value={type} onChange={(event) => setType(event.target.value)} data-testid="select-admin-order-type"><option value="all">كل الأنواع</option>{Object.entries(TYPE_LABEL).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></div></div>{visible.length ? <div className="admin-order-list">{visible.map((order) => <AdminOrderCard order={order} key={order.id} updateOrder={updateOrder} setSelected={setSelected} />)}</div> : <div className="empty-state"><Package size={28} /><h2>لا توجد طلبات مطابقة</h2><p>غيّر البحث أو الفلاتر لرؤية طابور آخر.</p></div>}{selected && <OrderModal order={selected} updateOrder={updateOrder} close={() => setSelected(null)} notify={notify} />}</>;
}
function AdminOrderCard({ order, updateOrder, setSelected }: { order: Order; updateOrder: (id: string, status: string) => void; setSelected: (order: Order) => void }) {
  const req = order.requirements || order.items[0]?.requirements || {}; const primary = order.items[0];
  return <article className="admin-order-card" data-testid={`card-admin-order-${order.id}`}><div className="admin-order-top"><div><div className="admin-order-id">{order.id}</div><div className="admin-order-name">{primary?.name || 'طلب متعدد الخدمات'}</div><div className="admin-order-date">{dateLabel(order.date)} · {order.items.length} خدمات</div></div><span className={`status ${order.status}`} data-testid={`status-admin-order-${order.id}`}>{statusLabel(order.status)}</span></div><div className="admin-info-grid"><div className="info-block"><label>العميل</label><strong data-testid={`text-order-customer-${order.id}`}>{order.username}</strong><span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 10 }}>{order.email}</span></div><div className="info-block"><label>واتساب</label><strong className="ltr">{order.whatsapp}</strong></div><div className="info-block"><label>الخدمة / النوع</label><strong>{TYPE_LABEL[primary?.type] || 'خدمة'} </strong><span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 10 }}>{primary?.type}</span></div></div><div className="requirements-box"><h4>متطلبات التنفيذ — تفاصيل الحساب</h4><div className="requirement-row"><label>المنصة</label><strong>{req.platform || '—'}</strong></div><div className="requirement-row"><label>المعرّف / المستخدم</label><strong>{req.accountId || req.username || '—'}</strong></div>{(primary?.type === 'accounts' || primary?.type === 'unban' || req.targetLink) && <div className="requirement-row"><label>رابط الحساب المستهدف</label><div className="copy-row"><code data-testid={`text-target-link-${order.id}`}>{req.targetLink || 'لم يقدّم رابطاً'}</code>{req.targetLink && <button className="icon-btn" onClick={() => { navigator.clipboard?.writeText(req.targetLink || ''); }} data-testid={`button-copy-target-${order.id}`} aria-label="نسخ الرابط"><Copy size={13} /></button>}</div></div>}{primary?.type?.startsWith('boost_') && <div className="requirement-row"><label>الكمية</label><strong>{req.quantity || primary.qty || '—'}</strong></div>}<div className="requirement-row"><label>ملاحظات العميل</label><span>{req.notes || 'لا توجد ملاحظات'}</span></div></div><div className="admin-order-bottom"><strong>{money(order.total)}</strong><span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>الدفع: {order.paymentMethod}</span><div className="admin-actions"><button className="btn btn-secondary btn-sm" onClick={() => setSelected(order)} data-testid={`button-view-order-${order.id}`}><ExternalLink size={13} /> كل التفاصيل</button><select className="select-input" style={{ width: 'auto' }} value={order.status} onChange={(event) => updateOrder(order.id, event.target.value)} data-testid={`select-update-order-${order.id}`}><option value="pending">قيد المراجعة</option><option value="processing">قيد التنفيذ</option><option value="completed">مكتمل</option><option value="cancelled">ملغى</option></select></div></div></article>;
}
function OrderModal({ order, updateOrder, close, notify }: { order: Order; updateOrder: (id: string, status: string) => void; close: () => void; notify: (text: string, error?: boolean) => void }) {
  const req = order.requirements || {}; return <div className="modal-backdrop" onClick={close}><div className="modal" onClick={(event) => event.stopPropagation()} data-testid={`modal-order-${order.id}`}><div className="modal-head"><div><div className="eyebrow">FULL ORDER RECORD</div><h2>{order.id}</h2><p>{dateLabel(order.date)} · {order.username}</p></div><button className="icon-btn" onClick={close} data-testid="button-close-order-modal"><X size={16} /></button></div><div className="admin-info-grid"><div className="info-block"><label>العميل</label><strong>{order.username}</strong><span>{order.email}</span></div><div className="info-block"><label>واتساب</label><strong className="ltr">{order.whatsapp}</strong></div><div className="info-block"><label>المبلغ / الدفع</label><strong>{money(order.total)}</strong><span>{order.paymentMethod}</span></div></div><div className="requirements-box"><h4>كل المتطلبات المقدمة</h4><div className="requirement-row"><label>الخدمة والنوع</label><strong>{order.items.map((item) => `${item.name} (${TYPE_LABEL[item.type]}) × ${item.qty}`).join('، ')}</strong></div><div className="requirement-row"><label>المنصة</label><strong>{req.platform || '—'}</strong></div><div className="requirement-row"><label>اسم المستخدم / المعرف</label><strong>{req.accountId || req.username || '—'}</strong></div><div className="requirement-row"><label>رابط الحساب المستهدف</label><div className="copy-row"><code>{req.targetLink || 'لم يتم تقديم رابط'}</code>{req.targetLink && <button className="btn btn-secondary btn-sm" onClick={() => { navigator.clipboard?.writeText(req.targetLink || ''); notify('تم نسخ رابط الحساب'); }} data-testid="button-modal-copy-link"><Copy size={13} /> نسخ الرابط</button>}</div></div><div className="requirement-row"><label>ملاحظات العميل</label><span>{req.notes || 'لا توجد ملاحظات'}</span></div></div><div className="admin-actions"><select className="select-input" value={order.status} onChange={(event) => updateOrder(order.id, event.target.value)} data-testid="select-modal-order-status"><option value="pending">قيد المراجعة</option><option value="processing">قيد التنفيذ</option><option value="completed">مكتمل</option><option value="cancelled">ملغى</option></select><button className="btn btn-primary" onClick={close} data-testid="button-save-order-modal"><Check size={15} /> حفظ وإغلاق</button></div></div></div>;
}

function AdminCatalog({ products, categories, setProducts, setCategories, notify, saveStore }: { products: Product[]; categories: Category[]; setProducts: (items: Product[]) => void; setCategories: (items: Category[]) => void; notify: (text: string, error?: boolean) => void; saveStore: (categories?: Category[], products?: Product[], settings?: Record<string, string>) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Partial<Product>>({});
  const [categoryName, setCategoryName] = useState('');
  const [categoryImage, setCategoryImage] = useState('');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: '', image: '' });
  const [saving, setSaving] = useState(false);
  const persist = async (nextCategories: Category[], nextProducts: Product[], success: string) => {
    setSaving(true);
    try { await saveStore(nextCategories, nextProducts); setCategories(nextCategories); setProducts(nextProducts); notify(success); }
    catch (error) { notify(error instanceof Error ? error.message : 'تعذر الحفظ العالمي', true); }
    finally { setSaving(false); }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name || !form.price || !form.categoryId || !form.type) { notify('أكمل اسم الخدمة والسعر والقسم والنوع', true); return; }
    const item: Product = { id: editing?.id || uid('p'), name: String(form.name), desc: form.desc || '', price: Number(form.price), categoryId: String(form.categoryId), type: String(form.type), active: form.active !== false, sales: editing?.sales || 0, pricingNote: form.pricingNote, unitSize: Number(form.unitSize) || undefined, image: form.image || undefined };
    const next = editing ? products.map((p) => p.id === editing.id ? item : p) : [item, ...products];
    await persist(categories, next, editing ? 'تم حفظ الخدمة لجميع الزوار' : 'أُضيفت الخدمة لجميع الزوار');
    setOpen(false); setEditing(null);
  };
  const start = (product?: Product) => { setEditing(product || null); setForm(product || { active: true, categoryId: categories[0]?.id, type: 'other' }); setOpen(true); };
  const handleImage = async (file?: File) => { if (!file) return; try { setForm((current) => ({ ...current, image: undefined })); const image = await resizeImageFile(file); setForm((current) => ({ ...current, image })); } catch (error) { notify(error instanceof Error ? error.message : 'تعذر تحميل الصورة', true); } };
  const addCategory = async () => { if (!categoryName.trim()) return; const next = [...categories, { id: uid('cat'), name: categoryName.trim(), image: categoryImage || undefined, order: categories.length + 1 }]; await persist(next, products, 'أُضيف القسم لجميع الزوار'); setCategoryName(''); setCategoryImage(''); };
  const startCategoryEdit = (category: Category) => { setEditingCategory(category); setCategoryForm({ name: category.name, image: category.image || '' }); };
  const saveCategoryEdit = async (event: FormEvent) => { event.preventDefault(); if (!editingCategory || !categoryForm.name.trim()) return; const next = categories.map((item) => item.id === editingCategory.id ? { ...item, name: categoryForm.name.trim(), image: categoryForm.image || undefined } : item); await persist(next, products, 'تم تعديل القسم والصورة لجميع الزوار'); setEditingCategory(null); };
  const deleteCategory = async (id: string) => { if (!window.confirm('حذف القسم؟')) return; const next = categories.filter((item) => item.id !== id); await persist(next, products, 'تم حذف القسم لجميع الزوار'); };
  const deleteProduct = async (id: string) => { if (!window.confirm('حذف هذه الخدمة؟')) return; const next = products.filter((p) => p.id !== id); await persist(categories, next, 'تم حذف الخدمة لجميع الزوار'); };
  const toggleProduct = async (product: Product) => { const next = products.map((p) => p.id === product.id ? { ...p, active: !p.active } : p); await persist(categories, next, product.active ? 'تم إيقاف الخدمة للجميع' : 'تم تفعيل الخدمة للجميع'); };
  return <><section className="panel" style={{ marginBottom: 14 }}><div className="panel-title"><h2>أقسام المتجر</h2><span>{categories.length} أقسام</span></div><div className="filter-controls" style={{ marginBottom: 12 }}>{categories.map((category) => <span className="tag" key={category.id}>{category.image && <img src={category.image} alt="" style={{ width: 22, height: 22, objectFit: 'cover', borderRadius: 6, verticalAlign: 'middle', marginLeft: 5 }} />} {category.name}<button type="button" className="btn btn-quiet btn-sm" style={{ padding: 0, marginRight: 4 }} onClick={() => startCategoryEdit(category)} title="تعديل القسم"><Pencil size={11} /></button><button type="button" className="btn btn-quiet btn-sm" style={{ padding: 0 }} onClick={() => deleteCategory(category.id)} title="حذف القسم"><X size={11} /></button></span>)}</div><div className="form-grid"><div className="field"><label>اسم قسم جديد</label><input className="text-input" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="اسم القسم" /></div><div className="field"><label>رابط صورة القسم</label><input className="text-input" dir="ltr" value={categoryImage} onChange={(event) => setCategoryImage(event.target.value)} placeholder="https://..." /></div><div className="field"><label>أو صورة من المعرض</label><input className="text-input" type="file" accept="image/*" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { setCategoryImage(await resizeImageFile(file)); } catch (error) { notify(error instanceof Error ? error.message : 'تعذر قراءة الصورة', true); } }} /></div></div><button className="btn btn-secondary btn-sm" onClick={addCategory} disabled={saving}><Plus size={14} /> إضافة قسم</button></section>{editingCategory && <div className="modal-backdrop" onClick={() => setEditingCategory(null)}><form className="modal" onSubmit={saveCategoryEdit} onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><div className="eyebrow">CATEGORY EDITOR</div><h2>تعديل القسم</h2></div><button type="button" className="icon-btn" onClick={() => setEditingCategory(null)}><X size={16} /></button></div><div className="form-grid"><div className="field field-full"><label>اسم القسم</label><input className="text-input" value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} /></div><div className="field field-full"><label>رابط الصورة</label><input className="text-input" dir="ltr" value={categoryForm.image} onChange={(event) => setCategoryForm({ ...categoryForm, image: event.target.value })} placeholder="https://..." /></div><div className="field field-full"><label>أو اختر من المعرض</label><input className="text-input" type="file" accept="image/*" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const image = await resizeImageFile(file); setCategoryForm({ ...categoryForm, image }); } catch (error) { notify(error instanceof Error ? error.message : 'تعذر قراءة الصورة', true); } }} /></div>{categoryForm.image && <div className="field field-full"><img src={categoryForm.image} alt="معاينة" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 12 }} /></div>}</div><button className="btn btn-primary" style={{ width: '100%' }} disabled={saving}><Check size={15} /> حفظ القسم للجميع</button></form></div>}<div className="admin-toolbar"><span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 12 }}>{products.length} خدمة مسجلة</span><button className="btn btn-primary" onClick={() => start()}><Plus size={15} /> إضافة خدمة</button></div><div className="catalog-grid">{products.map((product) => <div className="catalog-row" key={product.id}><div className="catalog-row-main">{productArt(product, 'product-art')}<div><h3>{product.name}</h3><p>{TYPE_LABEL[product.type]} · {money(product.price)} · {product.active ? 'نشطة' : 'متوقفة'}</p></div></div><div className="admin-actions"><button className="icon-btn" onClick={() => start(product)}><Pencil size={14} /></button><button className="btn btn-secondary btn-sm" onClick={() => toggleProduct(product)} disabled={saving}>{product.active ? 'إيقاف' : 'تفعيل'}</button><button className="icon-btn" onClick={() => deleteProduct(product.id)} disabled={saving}><Trash2 size={14} /></button></div></div>)}</div>{open && <div className="modal-backdrop" onClick={() => setOpen(false)}><form className="modal" onSubmit={save} onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><div className="eyebrow">CATALOG EDITOR</div><h2>{editing ? 'تعديل الخدمة' : 'خدمة جديدة'}</h2></div><button type="button" className="icon-btn" onClick={() => setOpen(false)}><X size={16} /></button></div><div className="form-grid"><div className="field field-full"><label>اسم الخدمة *</label><input className="text-input" value={form.name || ''} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div><div className="field field-full"><label>الوصف</label><textarea className="textarea-input" rows={2} value={form.desc || ''} onChange={(event) => setForm({ ...form, desc: event.target.value })} /></div><div className="field"><label>السعر *</label><input className="text-input" type="number" step=".1" value={form.price || ''} onChange={(event) => setForm({ ...form, price: Number(event.target.value) })} /></div><div className="field"><label>القسم *</label><select className="select-input" value={form.categoryId || ''} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></div><div className="field"><label>النوع *</label><select className="select-input" value={form.type || 'other'} onChange={(event) => setForm({ ...form, type: event.target.value })}>{Object.entries(TYPE_LABEL).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></div><div className="field"><label>وحدة التسعير</label><input className="text-input" type="number" value={form.unitSize || ''} onChange={(event) => setForm({ ...form, unitSize: Number(event.target.value) })} /></div><div className="field field-full"><label>ملاحظة التسعير</label><input className="text-input" value={form.pricingNote || ''} onChange={(event) => setForm({ ...form, pricingNote: event.target.value })} /></div><div className="field field-full"><label>رابط صورة الخدمة</label><input className="text-input" dir="ltr" value={form.image || ''} onChange={(event) => setForm({ ...form, image: event.target.value })} placeholder="https://..." /></div><div className="field field-full"><label>أو اختر صورة من المعرض</label><input className="text-input" type="file" accept="image/*" onChange={(event) => handleImage(event.target.files?.[0])} /></div>{form.image && <div className="field field-full"><img src={form.image} alt="معاينة" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 12, border: '1px solid hsl(var(--border))' }} /></div>}</div><button className="btn btn-primary" style={{ width: '100%' }} disabled={saving}><Check size={15} /> {saving ? 'جارٍ الحفظ للجميع...' : 'حفظ للجميع'}</button></form></div>}</>;
}

function AdminCustomers({ users, setUsers, notify }: { users: User[]; setUsers: (items: User[]) => void; notify: (text: string, error?: boolean) => void }) {
  const [query, setQuery] = useState(''); const [selected, setSelected] = useState(''); const [amount, setAmount] = useState('');
  const visible = users.filter((user) => `${user.username} ${user.email}`.toLowerCase().includes(query.toLowerCase()));
  const addBalance = () => { const user = users.find((item) => item.username === selected); if (!user || Number(amount) <= 0) { notify('اختر عميلاً وأدخل مبلغاً صالحاً', true); return; } const next = users.map((item) => item.username === selected ? { ...item, balance: item.balance + Number(amount) } : item); setUsers(next); setAmount(''); notify('تمت إضافة الرصيد'); };
  return <><div className="panel" style={{ marginBottom: 14 }}><div className="panel-title"><h2>إضافة رصيد يدوي</h2><span>للمطابقة أو التعويض</span></div><div className="form-grid"><div className="field"><label>العميل</label><select className="select-input" value={selected} onChange={(event) => setSelected(event.target.value)} data-testid="select-customer-balance"><option value="">اختر عميلاً</option>{users.map((user) => <option value={user.username} key={user.username}>{user.username} — {user.email}</option>)}</select></div><div className="field"><label>المبلغ</label><input className="text-input" type="number" min={1} value={amount} onChange={(event) => setAmount(event.target.value)} data-testid="input-customer-balance" /></div></div><button className="btn btn-primary" onClick={addBalance} data-testid="button-add-customer-balance"><Plus size={15} /> إضافة الرصيد</button></div><div className="admin-toolbar"><div className="search-bar"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث عن عميل..." data-testid="input-customer-search" /></div></div><div className="panel admin-table-wrap"><table className="admin-table"><thead><tr><th>المستخدم</th><th>البريد</th><th>الرصيد</th><th>الحالة</th><th>الانضمام</th></tr></thead><tbody>{visible.map((user) => <tr key={user.username} data-testid={`row-customer-${user.username}`}><td><strong>{user.username}</strong></td><td dir="ltr">{user.email}</td><td><strong style={{ color: 'hsl(var(--primary))' }}>{money(user.balance)}</strong></td><td><span className="status completed">مفعل</span></td><td>{user.createdAt ? dateLabel(user.createdAt) : '—'}</td></tr>)}</tbody></table>{!visible.length && <div className="empty-state" style={{ border: 0 }}><Users size={25} /><p>لا يوجد عملاء مطابقون.</p></div>}</div></>;
}

function AdminTopups({ topups, setTopups, users, setUsers, notify }: { topups: Topup[]; setTopups: (items: Topup[]) => void | Promise<void>; users: User[]; setUsers: (items: User[]) => void; notify: (text: string, error?: boolean) => void }) {
  const update = async (topup: Topup, status: string) => {
    try {
      const next = topups.map((item) => item.id === topup.id ? { ...item, status } : item);
      await Promise.resolve(setTopups(next));

      // IMPORTANT: the Worker performs the wallet credit atomically.
      // Do not add the amount again from the browser; doing so can race with
      // the Worker and double-credit the customer.
      if (status === 'approved' && topup.status !== 'approved') {
        const remote = await fetchRemoteStore();
        if (remote?.users) {
          setUsers(remote.users);
          write(KEY.users, remote.users);
        }
      }

      notify(status === 'approved' ? 'تم قبول الشحن وإضافة الرصيد فعلياً' : 'تم تحديث طلب الشحن');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'تعذر تحديث طلب الشحن', true);
    }
  };
  return <div className="panel admin-table-wrap"><table className="admin-table"><thead><tr><th>المستخدم</th><th>رقم العملية</th><th>المبلغ</th><th>العملة</th><th>التاريخ</th><th>الحالة والإجراء</th></tr></thead><tbody>{topups.map((topup) => <tr key={topup.id} data-testid={`row-admin-topup-${topup.id}`}><td><strong>{topup.username}</strong><br /><span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 10 }}>{topup.email}</span></td><td dir="ltr">{topup.txNumber}</td><td>{money(topup.amount)}</td><td>{topup.currency}</td><td>{dateLabel(topup.date)}</td><td><div className="admin-actions"><span className={`status ${topup.status === 'approved' ? 'completed' : 'pending'}`}>{topup.status === 'approved' ? 'مقبول' : 'قيد المراجعة'}</span>{topup.status !== 'approved' && <button className="btn btn-primary btn-sm" onClick={() => update(topup, 'approved')} data-testid={`button-approve-topup-${topup.id}`}><Check size={13} /> قبول</button>}<button className="icon-btn" onClick={() => update(topup, 'rejected')} data-testid={`button-reject-topup-${topup.id}`}><X size={14} /></button></div></td></tr>)}</tbody></table>{!topups.length && <div className="empty-state" style={{ border: 0 }}><WalletCards size={25} /><p>لا توجد طلبات شحن.</p></div>}</div>;
}

function AdminSettings({ settings, setSettings, notify, saveStore }: { settings: Record<string, string>; setSettings: (settings: Record<string, string>) => void; notify: (text: string, error?: boolean) => void; saveStore: (categories?: Category[], products?: Product[], settings?: Record<string, string>) => Promise<void> }) {
  const [form, setForm] = useState({ ownerName: settings.ownerName || 'MOOHAMED || IDLEB X', ownerBio: settings.ownerBio || '', adminPhone: settings.adminPhone || '', walletCode: settings.walletCode || 'SY-IDLEB-2025-SCASH' });
  const save = async () => { try { await saveStore(undefined, undefined, form); setSettings(form); notify('تم حفظ الإعدادات لجميع الزوار'); } catch (error) { notify(error instanceof Error ? error.message : 'تعذر الحفظ العالمي', true); } };
  return <section className="panel" style={{ maxWidth: 720 }}><div className="panel-title"><h2>هوية المتجر وقنوات التواصل</h2><span>تظهر للجميع</span></div><div className="form-grid"><div className="field field-full"><label>اسم صاحب المتجر</label><input className="text-input" value={form.ownerName} onChange={(event) => setForm({ ...form, ownerName: event.target.value })} /></div><div className="field field-full"><label>النبذة</label><textarea className="textarea-input" rows={4} value={form.ownerBio} onChange={(event) => setForm({ ...form, ownerBio: event.target.value })} /></div><div className="field"><label>رقم الإدارة</label><input className="text-input" value={form.adminPhone} onChange={(event) => setForm({ ...form, adminPhone: event.target.value })} /></div><div className="field"><label>رمز المحفظة</label><input className="text-input" value={form.walletCode} onChange={(event) => setForm({ ...form, walletCode: event.target.value })} /></div></div><button className="btn btn-primary" onClick={save}><Check size={15} /> حفظ الإعدادات للجميع</button></section>;
}

export default App;