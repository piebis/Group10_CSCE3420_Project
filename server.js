// BorrowBuddy — CSCE 3420: server and JSON-backed REST API.
// No third-party packages are required. Tested on Node.js 22.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const DATA_DIR = process.env.BORROWBUDDY_DATA_DIR || path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'borrowbuddy.json');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const CATEGORIES = ['Electronics', 'Textbooks', 'Tools', 'School Supplies', 'Outdoor', 'Other'];
const CONDITIONS = ['Like new', 'Good', 'Fair'];
const STATUS = ['pending', 'approved', 'declined', 'canceled', 'returned'];
const sessions = new Map();

function makeId() { return crypto.randomUUID(); }
function today() { return new Date().toISOString().slice(0, 10); }
function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users: [], items: [], requests: [] }, null, 2));
  }
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (!Array.isArray(data.users) || !Array.isArray(data.items) || !Array.isArray(data.requests)) {
    throw new Error('Invalid local database structure');
  }
  return data;
}
let db = load();
function persist() {
  const temporary = DATA_FILE + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(db, null, 2));
  fs.renameSync(temporary, DATA_FILE);
}
function json(res, status, payload, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(JSON.stringify(payload));
}
function problem(res, status, message) { json(res, status, { error: message }); }
async function body(req) {
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    throw Object.assign(new Error('Use Content-Type: application/json'), { status: 415 });
  }
  let buffer = '';
  for await (const chunk of req) {
    buffer += chunk.toString();
    if (buffer.length > 32000) throw Object.assign(new Error('Request body is too large'), { status: 413 });
  }
  try {
    const value = JSON.parse(buffer || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Expected object');
    return value;
  } catch { throw Object.assign(new Error('Invalid JSON object'), { status: 400 }); }
}
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}
function parseCookies(value) {
  return Object.fromEntries(String(value || '').split(';').map(v => v.trim().split('=').slice(0,2))
    .filter(pair => pair.length === 2));
}
function userFor(req) {
  const token = parseCookies(req.headers.cookie).borrowbuddy_session;
  const session = token && sessions.get(token);
  if (!session || session.expires < Date.now()) { if (token) sessions.delete(token); return null; }
  return db.users.find(user => user.id === session.userId) || null;
}
function publicUser(u) { return u ? { id: u.id, name: u.name, email: u.email, createdAt: u.createdAt } : null; }
function auth(res, user) {
  if (!user) { problem(res, 401, 'Please sign in to continue.'); return false; }
  return true;
}
function sessionHeader(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId: user.id, expires: Date.now() + 7 * 86400000 });
  return 'borrowbuddy_session=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800';
}
function str(v, max = 200) { return typeof v === 'string' ? v.trim().slice(0, max + 1) : ''; }
function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 160; }
function validDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(v + 'T12:00:00Z')) && new Date(v + 'T12:00:00Z').toISOString().slice(0,10) === v;
}
function daySpan(a, b) { return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000) + 1; }
function publicItem(item) {
  const owner = db.users.find(u => u.id === item.ownerId);
  const active = db.requests.some(r => r.itemId === item.id && r.status === 'approved');
  return { ...item, lenderName: owner?.name || 'Former member', available: item.isListed && !active };
}
function publicRequest(r) {
  const borrower = db.users.find(u => u.id === r.borrowerId);
  const lender = db.users.find(u => u.id === r.lenderId);
  return { ...r, borrowerName: borrower?.name || 'Former member', lenderName: lender?.name || 'Former member',
    itemTitle: db.items.find(item => item.id === r.itemId)?.title || r.itemTitle };
}
function requireItemInput(input) {
  const title = str(input.title, 80);
  const description = str(input.description, 600);
  const category = str(input.category, 40);
  const condition = str(input.condition, 30);
  const location = str(input.location, 80);
  if (title.length < 4 || title.length > 80) throw Object.assign(new Error('Item title must be 4–80 characters.'), {status: 400});
  if (description.length < 12 || description.length > 600) throw Object.assign(new Error('Description must be 12–600 characters.'), {status: 400});
  if (!CATEGORIES.includes(category)) throw Object.assign(new Error('Select a valid item category.'), {status: 400});
  if (!CONDITIONS.includes(condition)) throw Object.assign(new Error('Select a valid item condition.'), {status: 400});
  if (location.length < 3 || location.length > 80) throw Object.assign(new Error('Provide a public campus pickup location.'), {status: 400});
  if (typeof input.isListed !== 'boolean') throw Object.assign(new Error('Availability must be true or false.'), {status: 400});
  return { title, description, category, condition, location, isListed: input.isListed };
}
function file(req, res, pathname) {
  const files = { '/': 'index.html', '/index.html': 'index.html', '/styles.css': 'styles.css', '/app.js': 'app.js' };
  const name = files[pathname];
  if (!name) { problem(res, 404, 'Not found'); return; }
  const content = fs.readFileSync(path.join(PUBLIC_DIR, name));
  const type = name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8';
  res.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control':'no-cache' });
  res.end(content);
}
async function api(req, res, pathname, search) {
  const method = req.method;
  const user = userFor(req);
  if (method === 'GET' && pathname === '/api/health') return json(res, 200, { ok: true, service:'BorrowBuddy' });
  if (method === 'GET' && pathname === '/api/auth/me') return json(res, 200, { user: publicUser(user) });
  if (method === 'POST' && pathname === '/api/auth/register') {
    const input = await body(req), name = str(input.name, 60), email = str(input.email,160).toLowerCase();
    const password = input.password;
    if (name.length < 2 || name.length > 60) return problem(res, 400, 'Enter a name between 2 and 60 characters.');
    if (!validEmail(email)) return problem(res, 400, 'Enter a valid email address.');
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) return problem(res, 400, 'Password must be 8–128 characters.');
    if (db.users.some(u => u.email === email)) return problem(res, 409, 'An account with this email already exists.');
    const salt = crypto.randomBytes(16).toString('hex');
    const created = { id: makeId(), name, email, passwordSalt: salt, passwordHash: hashPassword(password, salt), createdAt: new Date().toISOString() };
    db.users.push(created); persist();
    return json(res, 201, { user: publicUser(created) }, { 'Set-Cookie': sessionHeader(created) });
  }
  if (method === 'POST' && pathname === '/api/auth/login') {
    const input = await body(req), email = str(input.email,160).toLowerCase();
    const found = db.users.find(u => u.email === email);
    const supplied = typeof input.password === 'string' ? input.password : '';
    const expected = found?.passwordHash || '00'.repeat(64);
    const actual = hashPassword(supplied, found?.passwordSalt || 'dummy-salt');
    if (!crypto.timingSafeEqual(Buffer.from(expected,'hex'), Buffer.from(actual,'hex')) || !found) {
      return problem(res, 401, 'Incorrect email or password.');
    }
    return json(res, 200, { user: publicUser(found) }, { 'Set-Cookie': sessionHeader(found) });
  }
  if (method === 'POST' && pathname === '/api/auth/logout') {
    const token = parseCookies(req.headers.cookie).borrowbuddy_session;
    if (token) sessions.delete(token);
    return json(res, 200, { ok:true }, { 'Set-Cookie': 'borrowbuddy_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
  }
  if (method === 'GET' && pathname === '/api/items') {
    const mine = search.get('mine') === 'true';
    if (mine && !auth(res,user)) return;
    const q = str(search.get('q') || '',100).toLowerCase();
    const category = str(search.get('category') || '',40);
    const avail = search.get('available');
    const items = db.items.map(publicItem).filter(item => {
      if (mine ? item.ownerId !== user.id : !item.isListed) return false;
      if (category && category !== 'All' && item.category !== category) return false;
      if (avail === 'true' && !item.available) return false;
      if (q && ![item.title,item.description,item.category,item.location].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
    items.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
    return json(res, 200, { items });
  }
  const matchItem = pathname.match(/^\/api\/items\/([\w-]+)$/);
  if (method === 'GET' && matchItem) {
    const found = db.items.find(i => i.id === matchItem[1]);
    if (!found) return problem(res, 404, 'Item not found.');
    if (!found.isListed && found.ownerId !== user?.id) return problem(res, 404, 'Item not found.');
    return json(res,200,{ item: publicItem(found) });
  }
  if (method === 'POST' && pathname === '/api/items') {
    if (!auth(res,user)) return;
    const itemFields = requireItemInput(await body(req));
    const now = new Date().toISOString();
    const item = { id:makeId(), ownerId:user.id, ...itemFields, createdAt:now, updatedAt:now };
    db.items.push(item); persist(); return json(res,201,{ item:publicItem(item) });
  }
  if ((method === 'PUT' || method === 'DELETE') && matchItem) {
    if (!auth(res,user)) return;
    const existing = db.items.find(i => i.id === matchItem[1]);
    if (!existing) return problem(res,404,'Item not found.');
    if (existing.ownerId !== user.id) return problem(res,403,'Only the item owner can change this listing.');
    if (method === 'PUT') {
      const edited = requireItemInput(await body(req));
      Object.assign(existing, edited, { updatedAt:new Date().toISOString() });
      persist(); return json(res,200,{ item:publicItem(existing) });
    }
    if (db.requests.some(r => r.itemId === existing.id && ['pending','approved'].includes(r.status))) {
      return problem(res,409,'Resolve open requests before deleting this item.');
    }
    db.items = db.items.filter(i => i.id !== existing.id); persist(); return json(res,200,{ok:true});
  }
  if (method === 'GET' && pathname === '/api/requests') {
    if (!auth(res,user)) return;
    const role = search.get('role') || 'all';
    if (!['all','borrower','lender'].includes(role)) return problem(res,400,'Invalid request filter.');
    const requests = db.requests.filter(r => role === 'borrower' ? r.borrowerId === user.id : role === 'lender' ? r.lenderId === user.id : r.lenderId === user.id || r.borrowerId === user.id)
      .map(publicRequest).sort((a,b) => b.requestedAt.localeCompare(a.requestedAt));
    return json(res,200,{ requests });
  }
  if (method === 'POST' && pathname === '/api/requests') {
    if (!auth(res,user)) return;
    const input = await body(req);
    const item = db.items.find(i => i.id === input.itemId);
    if (!item || !item.isListed) return problem(res,404,'This item is not listed.');
    if (item.ownerId === user.id) return problem(res,400,'You cannot borrow your own item.');
    if (!publicItem(item).available) return problem(res,409,'This item is already on loan.');
    if (!validDate(input.startDate) || !validDate(input.endDate) || input.startDate < today()) return problem(res,400,'Choose valid current or future dates.');
    const days = daySpan(input.startDate,input.endDate);
    if (days < 1 || days > 14) return problem(res,400,'Borrow periods must be between 1 and 14 days.');
    const notes = str(input.notes || '',240);
    if (db.requests.some(r => r.itemId === item.id && r.borrowerId === user.id && r.status === 'pending')) return problem(res,409,'You already have a pending request for this item.');
    const record = { id:makeId(),itemId:item.id,itemTitle:item.title,borrowerId:user.id,lenderId:item.ownerId,startDate:input.startDate,endDate:input.endDate,notes,status:'pending',requestedAt:new Date().toISOString(),reviewedAt:null,returnedAt:null };
    db.requests.push(record); persist(); return json(res,201,{request:publicRequest(record)});
  }
  const matchRequest = pathname.match(/^\/api\/requests\/([\w-]+)$/);
  if (method === 'PATCH' && matchRequest) {
    if (!auth(res,user)) return;
    const record = db.requests.find(r => r.id === matchRequest[1]);
    if (!record) return problem(res,404,'Request not found.');
    const { action } = await body(req);
    if (!['approve','decline','cancel','return'].includes(action)) return problem(res,400,'Unknown request action.');
    const lender = record.lenderId === user.id;
    const borrower = record.borrowerId === user.id;
    if ((action === 'approve' || action === 'decline' || action === 'return') && !lender) return problem(res,403,'Only the lender can perform this action.');
    if (action === 'cancel' && !borrower) return problem(res,403,'Only the borrower can cancel a request.');
    if (action === 'approve') {
      if (record.status !== 'pending') return problem(res,409,'Only pending requests can be approved.');
      const item = db.items.find(i => i.id === record.itemId);
      if (!item || !item.isListed || db.requests.some(r => r.itemId === record.itemId && r.status === 'approved')) return problem(res,409,'This item is no longer available.');
      record.status = 'approved'; record.reviewedAt = new Date().toISOString();
      for (const other of db.requests) {
        if (other.id !== record.id && other.itemId === record.itemId && other.status === 'pending') {
          other.status = 'declined'; other.reviewedAt = record.reviewedAt;
        }
      }
    } else if (action === 'decline') {
      if (record.status !== 'pending') return problem(res,409,'Only pending requests can be declined.');
      record.status = 'declined'; record.reviewedAt = new Date().toISOString();
    } else if (action === 'cancel') {
      if (record.status !== 'pending') return problem(res,409,'Only pending requests can be canceled.');
      record.status = 'canceled'; record.reviewedAt = new Date().toISOString();
    } else if (action === 'return') {
      if (record.status !== 'approved') return problem(res,409,'Only active loans can be marked returned.');
      record.status = 'returned'; record.returnedAt = new Date().toISOString();
    }
    persist(); return json(res,200,{request:publicRequest(record)});
  }
  return problem(res,404,'API route not found.');
}
function originAllowed(req) {
  if (!['POST','PUT','PATCH','DELETE'].includes(req.method)) return true;
  if (!req.headers.origin) return true; // scripts and curl normally omit Origin
  try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; }
}
const server = http.createServer(async (req, res) => {
  const started = Date.now();
  try {
    if (!originAllowed(req)) return problem(res,403,'Cross-origin requests are not allowed.');
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) await api(req,res,url.pathname,url.searchParams);
    else if (req.method === 'GET') file(req,res,url.pathname);
    else problem(res,405,'Method not allowed.');
  } catch (error) {
    console.error('[BorrowBuddy]', req.method, req.url, error.message);
    problem(res,error.status || 500,error.status ? error.message : 'An unexpected server error occurred.');
  } finally {
    if (process.env.NODE_ENV !== 'test') console.log(req.method, req.url, Date.now()-started+'ms');
  }
});
if (require.main === module) server.listen(PORT, HOST, () => console.log(`BorrowBuddy running at http://${HOST}:${PORT}`));
module.exports = { server };
