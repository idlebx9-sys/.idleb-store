interface Env {
  STORE_DATA: KVNamespace;
  ASSETS: Fetcher;
}

const STORE_KEY = 'catalog-v1';
const USERS_KEY = 'users-v1';
const TOPUPS_KEY = 'topups-v1';
const COMPLAINTS_KEY = 'complaints-v1';
const ADMIN_API_KEY = 'IDLEB@2026';

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
      'access-control-allow-headers': 'Content-Type, X-Admin-Key',
      ...extraHeaders,
    },
  });
}

function corsOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
      'access-control-allow-headers': 'Content-Type, X-Admin-Key',
      'access-control-max-age': '86400',
    },
  });
}

function isAdmin(request: Request) {
  return request.headers.get('X-Admin-Key') === ADMIN_API_KEY;
}

function isValidCatalog(body: any) {
  return Boolean(
    body &&
    Array.isArray(body.categories) &&
    Array.isArray(body.products) &&
    body.settings &&
    typeof body.settings === 'object' &&
    !Array.isArray(body.settings)
  );
}

async function getCatalog(env: Env): Promise<any> {
  const value = await env.STORE_DATA.get(STORE_KEY, 'json');
  return value || { categories: [], products: [], settings: {} };
}

async function getList<T>(env: Env, key: string, legacyField: string): Promise<T[]> {
  const value = await env.STORE_DATA.get(key, 'json');
  if (Array.isArray(value)) return value as T[];

  // Backward compatibility with the previous version that stored these
  // collections inside catalog-v1.
  const catalog = await getCatalog(env);
  return Array.isArray(catalog?.[legacyField]) ? catalog[legacyField] as T[] : [];
}

async function putList(env: Env, key: string, list: unknown[]) {
  await env.STORE_DATA.put(key, JSON.stringify(list));
}

function normalizeTopup(body: any) {
  return {
    id: String(body?.id || ''),
    username: String(body?.username || ''),
    email: String(body?.email || ''),
    txNumber: String(body?.txNumber || body?.ref || ''),
    amount: Number(body?.amount || 0),
    currency: String(body?.currency || 'USD'),
    status: String(body?.status || 'pending'),
    date: String(body?.date || new Date().toISOString()),
  };
}

function normalizeComplaint(body: any) {
  return {
    id: String(body?.id || ''),
    username: String(body?.username || ''),
    email: String(body?.email || ''),
    subject: String(body?.subject || ''),
    message: String(body?.message || ''),
    status: body?.status === 'resolved' ? 'resolved' : 'open',
    date: String(body?.date || new Date().toISOString()),
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return corsOptions();

    /* =========================
       ORDERS — existing working API
       ========================= */
    if (url.pathname === '/api/orders' || url.pathname.startsWith('/api/orders/')) {
      if (request.method === 'GET') {
        const admin = isAdmin(request);
        const username = url.searchParams.get('username')?.trim();

        if (!admin && !username) {
          return json({ error: 'Username required' }, 400);
        }

        try {
          let listed: KVNamespaceListResult<unknown> | null = null;

          for (let attempt = 0; attempt < 8; attempt++) {
            listed = await env.STORE_DATA.list({ prefix: 'order:' });
            if (listed.keys.length > 0) break;
            if (attempt < 7) await new Promise((resolve) => setTimeout(resolve, 1000));
          }

          const orders = (
            await Promise.all(
              (listed?.keys || []).map(async (key) => {
                const value = await env.STORE_DATA.get(key.name, 'json');
                return value || null;
              })
            )
          ).filter(Boolean) as any[];

          const filtered = admin
            ? orders
            : orders.filter((order) => order.username === username);

          filtered.sort((a, b) =>
            String(b.date || '').localeCompare(String(a.date || ''))
          );

          return json({ orders: filtered });
        } catch (error) {
          console.error('KV orders read failed:', error);
          return json({ error: 'Orders read failed' }, 500);
        }
      }

      if (request.method === 'POST' && url.pathname === '/api/orders') {
        const body = await request.json().catch(() => null) as any;
        if (!body || typeof body.id !== 'string' || typeof body.username !== 'string' || !Array.isArray(body.items)) {
          return json({ error: 'Invalid order payload' }, 400);
        }

        const clean = {
          id: body.id,
          date: body.date || new Date().toISOString(),
          username: body.username,
          email: body.email || '',
          whatsapp: body.whatsapp || '',
          items: body.items,
          total: Number(body.total || 0),
          status: body.status || 'pending',
          paymentMethod: body.paymentMethod || 'المحفظة',
          requirements: body.requirements || {},
        };

        try {
          await env.STORE_DATA.put(`order:${clean.id}`, JSON.stringify(clean));
          return json({ ok: true, order: clean }, 201);
        } catch (error) {
          console.error('KV order write failed:', error);
          return json({ error: 'Order write failed' }, 500);
        }
      }

      if (request.method === 'PUT' && url.pathname.startsWith('/api/orders/')) {
        if (!isAdmin(request)) return json({ error: 'Unauthorized' }, 401);

        const id = decodeURIComponent(url.pathname.slice('/api/orders/'.length));
        const body = await request.json().catch(() => null) as any;
        const status = body?.status;

        if (!id || typeof status !== 'string') {
          return json({ error: 'Invalid order update' }, 400);
        }

        try {
          const key = `order:${id}`;
          const order = await env.STORE_DATA.get(key, 'json') as any;
          if (!order) return json({ error: 'Order not found' }, 404);

          order.status = status;
          await env.STORE_DATA.put(key, JSON.stringify(order));
          return json({ ok: true, order });
        } catch (error) {
          console.error('KV order update failed:', error);
          return json({ error: 'Order update failed' }, 500);
        }
      }

      return json({ error: 'Method not allowed' }, 405);
    }

    /* =========================
       USERS / CUSTOMERS
       ========================= */
    if (url.pathname === '/api/users' || url.pathname.startsWith('/api/users/')) {
      if (request.method === 'GET') {
        try {
          const users = await getList<any>(env, USERS_KEY, 'users');
          const username = url.searchParams.get('username')?.trim();
          const email = url.searchParams.get('email')?.trim().toLowerCase();

          if (isAdmin(request)) return json({ users });

          if (username || email) {
            const filtered = users.filter((u) =>
              (username && u.username === username) ||
              (email && String(u.email || '').toLowerCase() === email)
            );
            return json({ users: filtered });
          }

          return json({ users: [] });
        } catch (error) {
          console.error('KV users read failed:', error);
          return json({ error: 'Users read failed' }, 500);
        }
      }

      if (request.method === 'POST' || request.method === 'PUT') {
        const body = await request.json().catch(() => null) as any;
        if (!body || typeof body.username !== 'string' || !body.username.trim()) {
          return json({ error: 'Invalid user payload' }, 400);
        }

        const clean = {
          username: body.username.trim(),
          email: String(body.email || '').trim().toLowerCase(),
          passwordHash: body.passwordHash || undefined,
          password: body.password || undefined,
          balance: Number(body.balance || 0),
          isVerified: body.isVerified !== false,
          createdAt: body.createdAt || new Date().toISOString(),
        };

        try {
          const users = await getList<any>(env, USERS_KEY, 'users');
          const index = users.findIndex((u) => u.username === clean.username);

          if (request.method === 'POST' && index >= 0) {
            return json({ error: 'User already exists' }, 409);
          }

          if (index >= 0) users[index] = { ...users[index], ...clean };
          else users.unshift(clean);

          await putList(env, USERS_KEY, users);
          return json({ ok: true, user: clean }, request.method === 'POST' ? 201 : 200);
        } catch (error) {
          console.error('KV user write failed:', error);
          return json({ error: 'User write failed' }, 500);
        }
      }

      return json({ error: 'Method not allowed' }, 405);
    }

    /* =========================
       TOPUPS / WALLET RECHARGE
       ========================= */
    if (url.pathname === '/api/topups' || url.pathname.startsWith('/api/topups/')) {
      if (request.method === 'GET') {
        try {
          const topups = await getList<any>(env, TOPUPS_KEY, 'topups');
          const username = url.searchParams.get('username')?.trim();

          if (!isAdmin(request) && !username) {
            return json({ error: 'Username required' }, 400);
          }

          return json({
            topups: isAdmin(request)
              ? topups
              : topups.filter((item) => item.username === username),
          });
        } catch (error) {
          console.error('KV topups read failed:', error);
          return json({ error: 'Topups read failed' }, 500);
        }
      }

      if (request.method === 'POST' && url.pathname === '/api/topups') {
        const body = await request.json().catch(() => null) as any;
        const topup = normalizeTopup(body);

        if (!topup.id || !topup.username || !topup.txNumber || topup.amount <= 0) {
          return json({ error: 'Invalid topup payload' }, 400);
        }

        try {
          const topups = await getList<any>(env, TOPUPS_KEY, 'topups');
          if (topups.some((item) => item.id === topup.id)) {
            return json({ error: 'Topup already exists' }, 409);
          }

          topups.unshift(topup);
          await putList(env, TOPUPS_KEY, topups);
          return json({ ok: true, topup }, 201);
        } catch (error) {
          console.error('KV topup write failed:', error);
          return json({ error: 'Topup write failed' }, 500);
        }
      }

      if (request.method === 'PUT' && url.pathname.startsWith('/api/topups/')) {
        if (!isAdmin(request)) return json({ error: 'Unauthorized' }, 401);

        const id = decodeURIComponent(url.pathname.slice('/api/topups/'.length));
        const body = await request.json().catch(() => null) as any;
        const requestedStatus = String(body?.status || '');

        if (!id || !requestedStatus) {
          return json({ error: 'Invalid topup update' }, 400);
        }

        try {
          const topups = await getList<any>(env, TOPUPS_KEY, 'topups');
          const index = topups.findIndex((item) => item.id === id);

          if (index < 0) return json({ error: 'Topup not found' }, 404);

          const current = topups[index];

          if (current.status === 'approved' && requestedStatus !== 'approved') {
            return json({ error: 'Approved topup cannot be reversed automatically' }, 400);
          }

          // The Worker is the single authority for wallet crediting.
          // Credit only once when moving from pending -> approved.
          if (requestedStatus === 'approved' && current.status !== 'approved') {
            const users = await getList<any>(env, USERS_KEY, 'users');
            const userIndex = users.findIndex((u) => u.username === current.username);

            if (userIndex < 0) {
              return json({ error: 'Customer not found; wallet was not credited' }, 404);
            }

            users[userIndex] = {
              ...users[userIndex],
              balance: Number(users[userIndex].balance || 0) + Number(current.amount || 0),
            };
            await putList(env, USERS_KEY, users);
          }

          topups[index] = { ...current, status: requestedStatus };
          await putList(env, TOPUPS_KEY, topups);
          return json({ ok: true, topup: topups[index] });
        } catch (error) {
          console.error('KV topup update failed:', error);
          return json({ error: 'Topup update failed' }, 500);
        }
      }

      return json({ error: 'Method not allowed' }, 405);
    }

    /* =========================
       COMPLAINTS / SUPPORT
       ========================= */
    if (url.pathname === '/api/complaints' || url.pathname.startsWith('/api/complaints/')) {
      if (request.method === 'GET') {
        try {
          const complaints = await getList<any>(env, COMPLAINTS_KEY, 'complaints');
          const username = url.searchParams.get('username')?.trim();

          if (!isAdmin(request) && !username) {
            return json({ error: 'Username required' }, 400);
          }

          return json({
            complaints: isAdmin(request)
              ? complaints
              : complaints.filter((item) => item.username === username),
          });
        } catch (error) {
          console.error('KV complaints read failed:', error);
          return json({ error: 'Complaints read failed' }, 500);
        }
      }

      if (request.method === 'POST' && url.pathname === '/api/complaints') {
        const body = await request.json().catch(() => null) as any;
        const complaint = normalizeComplaint(body);

        if (!complaint.id || !complaint.username || !complaint.subject || !complaint.message) {
          return json({ error: 'Invalid complaint payload' }, 400);
        }

        try {
          const complaints = await getList<any>(env, COMPLAINTS_KEY, 'complaints');
          if (complaints.some((item) => item.id === complaint.id)) {
            return json({ error: 'Complaint already exists' }, 409);
          }

          complaints.unshift(complaint);
          await putList(env, COMPLAINTS_KEY, complaints);
          return json({ ok: true, complaint }, 201);
        } catch (error) {
          console.error('KV complaint write failed:', error);
          return json({ error: 'Complaint write failed' }, 500);
        }
      }

      if (request.method === 'PUT' && url.pathname.startsWith('/api/complaints/')) {
        if (!isAdmin(request)) return json({ error: 'Unauthorized' }, 401);

        const id = decodeURIComponent(url.pathname.slice('/api/complaints/'.length));
        const body = await request.json().catch(() => null) as any;
        const status = body?.status === 'resolved' ? 'resolved' : 'open';

        try {
          const complaints = await getList<any>(env, COMPLAINTS_KEY, 'complaints');
          const index = complaints.findIndex((item) => item.id === id);

          if (index < 0) return json({ error: 'Complaint not found' }, 404);

          complaints[index] = { ...complaints[index], status };
          await putList(env, COMPLAINTS_KEY, complaints);

          return json({ ok: true, complaint: complaints[index] });
        } catch (error) {
          console.error('KV complaint update failed:', error);
          return json({ error: 'Complaint update failed' }, 500);
        }
      }

      return json({ error: 'Method not allowed' }, 405);
    }

    /* =========================
       STORE / CATALOG / SETTINGS
       ========================= */
    if (url.pathname === '/api/store') {
      if (request.method === 'GET') {
        try {
          const catalog = await getCatalog(env);
          const users = await getList<any>(env, USERS_KEY, 'users');
          const topups = await getList<any>(env, TOPUPS_KEY, 'topups');
          const complaints = await getList<any>(env, COMPLAINTS_KEY, 'complaints');

          return json({
            categories: Array.isArray(catalog.categories) ? catalog.categories : [],
            products: Array.isArray(catalog.products) ? catalog.products : [],
            settings: catalog.settings && typeof catalog.settings === 'object' ? catalog.settings : {},
            users,
            topups,
            complaints,
          });
        } catch (error) {
          console.error('KV store read failed:', error);
          return json({ error: 'Store read failed' }, 500);
        }
      }

      if (request.method === 'PUT') {
        if (!isAdmin(request)) return json({ error: 'Unauthorized' }, 401);

        const body = await request.json().catch(() => null);
        if (!isValidCatalog(body)) {
          return json({ error: 'Invalid store payload' }, 400);
        }

        try {
          const current = await getCatalog(env);
          const clean = {
            categories: body.categories,
            products: body.products,
            settings: body.settings,
          };

          // Keep dynamic collections out of catalog writes so an admin editing
          // products/settings can never overwrite new customer activity.
          await env.STORE_DATA.put(STORE_KEY, JSON.stringify({
            ...current,
            ...clean,
          }));

          return json({ ok: true, store: clean });
        } catch (error) {
          console.error('KV store write failed:', error);
          return json({ error: 'Store write failed' }, 500);
        }
      }

      return json({ error: 'Method not allowed' }, 405);
    }

    const assetResponse = await env.ASSETS.fetch(request);

    if (assetResponse.status !== 404) {
      return assetResponse;
    }

    const accept = request.headers.get('Accept') || '';
    if (request.method === 'GET' && accept.includes('text/html')) {
      const indexUrl = new URL('/index.html', request.url);
      return env.ASSETS.fetch(new Request(indexUrl.toString(), request));
    }

    return assetResponse;
  },
};
