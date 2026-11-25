/**
 * Videographer availability smoke test (shoot booking, Phase 1) — local development only.
 * Freelancer login via invite, own monthly availability, overlap/past/range rules, managers' "who's free"
 * board, access limits for the freelancer login, and keeping freelancers out of staff pickers.
 *   node src/scripts/shoots-smoke-test.js [--keep] [--purge-only]   (API must be running)
 */
import bcrypt from 'bcrypt';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { istNow } from '../modules/shoots/shootTime.js';

if (env.NODE_ENV === 'production') {
  console.error('Refusing to run against production.');
  process.exit(1);
}
const API = (process.env.API_URL || `http://localhost:${env.PORT || 5000}`) + '/api';
const PASSWORD = 'ShootTest#2026'; // test-only credential for the @shoots.test fixture accounts
const DOMAIN = '@shoots.test';

class Session {
  constructor() { this.cookies = {}; }
  async req(method, path, body) {
    const headers = { 'Content-Type': 'application/json', Cookie: Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ') };
    if (this.cookies.xsrf_token) headers['X-CSRF-Token'] = this.cookies.xsrf_token;
    const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    for (const c of res.headers.getSetCookie?.() || []) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      this.cookies[pair.slice(0, i)] = pair.slice(i + 1);
    }
    let json = null;
    try { json = await res.json(); } catch { /* none */ }
    return { status: res.status, body: json };
  }
  async login(email) {
    await this.req('GET', '/auth/csrf-token');
    const r = await this.req('POST', '/auth/login', { email, password: PASSWORD });
    if (r.status !== 200) throw new Error(`login failed ${email}: ${r.status} ${JSON.stringify(r.body)}`);
  }
}

const results = [];
const check = (label, actual, expected, extra = '') => {
  const ok = typeof expected === 'function' ? expected(actual) : actual === expected;
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} → ${JSON.stringify(actual)}${ok ? '' : '  (unexpected)'}${extra ? `  ${extra}` : ''}`);
};
const msg = (r) => r.body?.error?.message || '';

async function purge() {
  const [us] = await pool.query('SELECT id FROM users WHERE email LIKE ?', [`%${DOMAIN}`]);
  const uids = us.map((u) => u.id);
  const [cs] = await pool.query('SELECT id FROM clients WHERE email LIKE ?', [`%${DOMAIN}`]);
  const cids = cs.map((c) => c.id);
  if (cids.length) {
    const [ss] = await pool.query('SELECT id FROM shoot_slots WHERE client_id IN (?)', [cids]);
    if (ss.length) await pool.query('DELETE FROM shoot_reminder_log WHERE ref_id IN (?) AND kind LIKE ?', [ss.map((s) => s.id), 'shoot_%']);
    await pool.query('DELETE FROM calendar_events WHERE client_id IN (?)', [cids]);
    await pool.query('DELETE FROM expenses WHERE client_id IN (?)', [cids]);
    await pool.query('DELETE t FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.client_id IN (?)', [cids]);
    await pool.query('DELETE ps FROM project_steps ps JOIN projects p ON p.id = ps.project_id WHERE p.client_id IN (?)', [cids]);
    await pool.query('DELETE FROM projects WHERE client_id IN (?)', [cids]);
  }
  await pool.query('DELETE FROM email_jobs WHERE recipient_email LIKE ?', [`%${DOMAIN}`]).catch(() => {});
  if (uids.length) {
    await pool.query('DELETE FROM shoot_reminder_log WHERE user_id IN (?)', [uids]);
    await pool.query('DELETE FROM invitations WHERE user_id IN (?)', [uids]).catch(() => {});
    await pool.query('DELETE FROM notifications WHERE recipient_user_id IN (?)', [uids]).catch(() => {});
    await pool.query('DELETE FROM audit_logs WHERE actor_id IN (?)', [uids]).catch(() => {});
    await pool.query('DELETE FROM refresh_tokens WHERE user_id IN (?)', [uids]).catch(() => {});
    await pool.query('DELETE FROM users WHERE id IN (?)', [uids]); // profiles / availability / bookings cascade
  }
  // Clients last (their portal logins are gone now); slots, bookings and proposals cascade.
  if (cids.length) await pool.query('DELETE FROM clients WHERE id IN (?)', [cids]);
}

const fx = {};
async function setup() {
  await purge();
  const hash = await bcrypt.hash(PASSWORD, 10);
  for (const [key, slug] of [['admin', 'admin'], ['am', 'account-manager'], ['vexec', 'video-exec'], ['emp', 'employee']]) {
    const [r] = await pool.query(
      "INSERT INTO users (name, email, password_hash, role, status, must_change_password, department) VALUES (?, ?, ?, 'member', 'active', 0, 'Video')",
      [`SHOOT ${key}`, `${key}${DOMAIN}`, hash]
    );
    const [[role]] = await pool.query('SELECT id FROM roles WHERE slug = ?', [slug]);
    if (!role) throw new Error(`role ${slug} missing — restart the API so the registry syncs`);
    await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [r.insertId, role.id]);
    fx[key] = { id: r.insertId, s: new Session() };
    await fx[key].s.login(`${key}${DOMAIN}`);
  }
}

const pad = (n) => String(n).padStart(2, '0');
const ym = (offset) => {
  const d = new Date();
  const x = new Date(d.getFullYear(), d.getMonth() + offset, 1);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`;
};
const datesOn = (month, weekdays) => {
  const [y, m] = month.split('-').map(Number);
  const out = [];
  for (let d = 1; d <= new Date(y, m, 0).getDate(); d += 1) {
    if (weekdays.includes(new Date(y, m - 1, d).getDay())) out.push(`${month}-${pad(d)}`);
  }
  return out;
};

async function run() {
  await setup();
  const admin = fx.admin.s;
  const am = fx.am.s;
  const vexec = fx.vexec.s;
  const emp = fx.emp.s;
  const next = ym(1);

  console.log('\n── Videographer list ──');
  let r = await admin.req('GET', `/shoots/videographers?month=${next}`);
  const listed = (r.body?.data?.videographers || []).find((v) => v.id === fx.vexec.id);
  check('in-house video exec shows up automatically', listed?.kind, 'in_house', msg(r));
  check('due date is the 25th of the month before', r.body?.data?.due_date, `${ym(0)}-25`);

  console.log('\n── Add a freelancer (login via invite link) ──');
  r = await admin.req('POST', '/shoots/videographers', {
    kind: 'freelance', name: 'SHOOT freelancer', email: `free${DOMAIN}`, phone: '9000000000',
    rateAmount: 3500, rateUnit: 'shoot', kit: 'A7 IV, gimbal', areas: 'Chennai'
  });
  check('admin adds freelancer', r.status, 201, msg(r));
  const freeId = r.body?.data?.id;
  const token = new URL(r.body?.data?.invite_url || 'http://x/?token=').searchParams.get('token');
  check('invite link returned', Boolean(token), true);
  r = await admin.req('POST', '/shoots/videographers', { kind: 'freelance', name: 'Dup', email: `free${DOMAIN}` });
  check('same email again → refused until they accept? (pending invite is re-issued)', r.status, (s) => s === 201 || s === 409);
  const token2 = r.status === 201 ? new URL(r.body.data.invite_url).searchParams.get('token') : token;
  const anon = new Session();
  await anon.req('GET', '/auth/csrf-token');
  r = await anon.req('POST', '/auth/accept-invitation', { token: token2, password: PASSWORD });
  check('freelancer accepts invite', r.status, (s) => s === 200 || s === 201, msg(r));
  const free = new Session();
  await free.login(`free${DOMAIN}`);
  r = await admin.req('POST', '/shoots/videographers', { kind: 'freelance', name: 'Dup', email: `free${DOMAIN}` });
  check('active login with that email can’t be added twice', r.status, 409);

  console.log('\n── Freelancer marks availability ──');
  r = await free.req('GET', '/shoots/availability');
  const me = r.body?.data;
  check('freelancer opens own calendar', r.status, 200, msg(r));
  check('…as a freelancer', me?.videographer?.kind, 'freelance');
  check('can plan this month + next two', me?.months?.length, 3);
  const weekends = datesOn(next, [6, 0]);
  r = await free.req('POST', '/shoots/availability', { dates: weekends, fullDay: true });
  check(`every Sat/Sun of ${next}, full day`, r.body?.data?.added, weekends.length, msg(r));
  r = await free.req('POST', '/shoots/availability', { dates: [weekends[0]], start: '10:00', end: '12:00' });
  check('overlapping time on a full day is skipped', `${r.body?.data?.added}/${r.body?.data?.skipped?.length}`, '0/1');
  const wed = datesOn(next, [3])[0];
  r = await free.req('POST', '/shoots/availability', { dates: [wed], start: '17:00', end: '21:00', note: 'only OMR' });
  check('evening on a Wednesday', r.body?.data?.added, 1, msg(r));
  r = await free.req('POST', '/shoots/availability', { dates: [wed], start: '09:00', end: '13:00' });
  check('…and the morning too (no overlap)', r.body?.data?.added, 1);
  r = await free.req('POST', '/shoots/availability', { dates: [wed], start: '12:00', end: '18:00' });
  check('…but not 12–6 (overlaps both)', r.body?.data?.added, 0);
  r = await free.req('POST', '/shoots/availability', { dates: ['2020-01-04'], fullDay: true });
  check('past date rejected', r.status, 400);
  r = await free.req('POST', '/shoots/availability', { dates: [`${ym(3)}-10`], fullDay: true });
  check('more than 2 months ahead rejected', r.status, 400);
  r = await free.req('POST', '/shoots/availability', { dates: [wed], start: '15:00', end: '14:00' });
  check('end before start rejected', r.status, 400);
  r = await free.req('POST', '/shoots/availability', { dates: [`${next}-32`], fullDay: true });
  check('impossible date rejected', r.status, 400);

  r = await free.req('GET', `/shoots/availability?month=${next}`);
  const wedSlots = (r.body?.data?.slots || []).filter((s) => s.date === wed);
  check('Wednesday has 2 ranges, sorted', wedSlots.map((s) => `${s.start}-${s.end}`).join(','), '09:00-13:00,17:00-21:00');
  check('note kept', wedSlots[1]?.note, 'only OMR');
  r = await free.req('DELETE', `/shoots/availability/${wedSlots[0].id}`);
  check('remove one range', r.status, 200, msg(r));
  r = await free.req('POST', '/shoots/availability/clear-day', { date: weekends[1] });
  check('clear a whole day', r.body?.data?.removed, 1);
  r = await free.req('POST', '/shoots/availability/submit', { month: next, done: true });
  check('mark month as done', Boolean(r.body?.data?.submitted_at), true, msg(r));

  console.log('\n── Freelancer login is limited ──');
  r = await free.req('POST', '/shoots/availability', { userId: fx.vexec.id, dates: [wed], fullDay: true });
  check('cannot edit someone else’s calendar', r.status, 403);
  r = await free.req('GET', `/shoots/board?month=${next}`);
  check('cannot see the team board', r.status, 403);
  for (const path of ['/clients', '/tasks', '/project-flow/month-plans', '/calendar', '/users', '/invoices']) {
    r = await free.req('GET', path);
    check(`blocked from ${path}`, r.status, (s) => s === 403 || s === 404);
  }
  r = await emp.req('GET', '/shoots/availability');
  check('plain employee has no shoot calendar', r.status, 403);

  console.log('\n── Managers: who is free ──');
  await vexec.req('POST', '/shoots/availability', { dates: [weekends[0]], start: '09:00', end: '13:00' });
  r = await am.req('GET', `/shoots/board?month=${next}`);
  check('account manager sees the board', r.status, 200, msg(r));
  const board = r.body?.data;
  const freeOnFirst = (board?.slots || []).filter((s) => s.date === weekends[0]).map((s) => s.user_id);
  check(`${weekends[0]}: freelancer + in-house both free`, [freeId, fx.vexec.id].every((id) => freeOnFirst.includes(id)), true);
  check('freelancer shows as done for the month', Boolean(board?.videographers?.find((v) => v.id === freeId)?.submitted_at), true);
  r = await am.req('GET', `/shoots/videographers?month=${next}`);
  check('account manager doesn’t see rates', r.body?.data?.videographers?.find((v) => v.id === freeId)?.rate_amount, null);
  r = await am.req('POST', '/shoots/videographers', { kind: 'in_house', userId: fx.emp.id });
  check('account manager cannot add videographers', r.status, 403);
  r = await admin.req('GET', `/shoots/videographers?month=${next}`);
  const fv = r.body?.data?.videographers?.find((v) => v.id === freeId);
  check('admin sees rate + free days', `${fv?.rate_amount}/${fv?.free_days}`, `3500/${weekends.length - 1 + 1}`);
  r = await admin.req('POST', '/shoots/availability', { userId: freeId, dates: [weekends[1]], start: '14:00', end: '18:00' });
  check('admin fills in for a videographer', r.body?.data?.added, 1, msg(r));

  console.log('\n── In-house from existing staff ──');
  r = await admin.req('GET', '/shoots/videographers/candidates');
  check('employee is a candidate; freelancer is not', (r.body?.data || []).some((u) => u.id === fx.emp.id) && !(r.body?.data || []).some((u) => u.id === freeId), true);
  r = await admin.req('POST', '/shoots/videographers', { kind: 'in_house', userId: fx.emp.id, rateUnit: 'day' });
  check('admin adds employee as in-house', r.status, 201, msg(r));
  r = await emp.req('GET', '/shoots/availability');
  check('…who can now mark availability', r.body?.data?.videographer?.kind, 'in_house', msg(r));
  r = await admin.req('POST', '/shoots/videographers', { kind: 'in_house', userId: freeId });
  check('a freelancer can’t be made in-house staff', r.status, 404);

  console.log('\n── Freelancers stay out of staff pickers ──');
  r = await admin.req('GET', '/users?staffOnly=true&limit=500');
  const staff = r.body?.users || r.body?.data?.users || r.body?.data || [];
  check('staff picker excludes freelancer', Array.isArray(staff) && staff.length > 0 && !staff.some((u) => u.id === freeId), true);
  check('…but keeps in-house', staff.some((u) => u.id === fx.vexec.id), true);

  await phase2({ admin, am, vexec, emp, free, freeId, weekends, next });

  console.log('\n── Deactivate ──');
  r = await admin.req('PATCH', `/shoots/videographers/${freeId}`, { isActive: false });
  check('admin deactivates freelancer', r.status, 200, msg(r));
  r = await admin.req('GET', `/shoots/board?month=${next}`);
  check('deactivated drops off the board', (r.body?.data?.videographers || []).some((v) => v.id === freeId), false);
}

const notes = async (userId, type) => {
  const [rows] = await pool.query('SELECT COUNT(*) AS n FROM notifications WHERE recipient_user_id = ? AND type = ?', [userId, type]);
  return Number(rows[0].n);
};

/** Phase 2: shoot slots, first-come booking, clashes, withdraw/assign/cancel, privacy, calendar link. */
async function phase2({ admin, am, vexec, emp, free, freeId, weekends, next }) {
  console.log('\n── Phase 2: post a shoot ──');
  const [c] = await pool.query(
    "INSERT INTO clients (name, client_code, email, company_name, status) VALUES ('SHOOT client', ?, ?, 'SHOOT Clinic', 'active')",
    [`SH-${Date.now()}`, `client${DOMAIN}`]
  );
  const clientId = c.insertId;
  // A second freelancer, created straight in the DB (profile comes from the role).
  const hash = await bcrypt.hash(PASSWORD, 10);
  const [u2] = await pool.query(
    "INSERT INTO users (name, email, password_hash, role, status, must_change_password, department) VALUES ('SHOOT free2', ?, ?, 'member', 'active', 0, 'Video')",
    [`free2${DOMAIN}`, hash]
  );
  const [[frole]] = await pool.query("SELECT id FROM roles WHERE slug = 'freelance-videographer'");
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [u2.insertId, frole.id]);
  const free2 = new Session();
  await free2.login(`free2${DOMAIN}`);
  const free2Id = u2.insertId;
  const day = weekends[0];
  await free2.req('POST', '/shoots/availability', { dates: [day], fullDay: true });

  let r = await admin.req('GET', `/shoots/slots/free?date=${day}&start=10:00&end=12:00`);
  const freeIds = (r.body?.data || []).map((p) => p.id);
  check('who’s free 10–12 lists both freelancers + in-house', [freeId, free2Id, fx.vexec.id].every((id) => freeIds.includes(id)), true, msg(r));

  const slotBody = {
    clientId, title: 'Clinic reel — doctor intro', shootType: 'Reels', date: day, start: '10:00', end: '12:00',
    area: 'Anna Nagar', address: '12 Main Road, Anna Nagar', mapUrl: 'https://maps.google.com/?q=anna+nagar',
    brief: 'Doctor intro + clinic walkthrough', payAmount: 3000
  };
  r = await admin.req('POST', '/shoots/slots', slotBody);
  check('admin posts a shoot', r.status, 201, msg(r));
  const s1 = r.body?.data;
  const notified = (s1?.notified || []).map((n) => n.id);
  check('everyone free that time is notified', [freeId, free2Id, fx.vexec.id].every((id) => notified.includes(id)), true);
  const [real] = notified.length
    ? await pool.query('SELECT COUNT(*) AS n FROM users WHERE id IN (?) AND email NOT LIKE ?', [notified, `%${DOMAIN}`])
    : [[{ n: 0 }]];
  check('…and nobody outside the test accounts', Number(real[0].n), 0);
  check('freelancer got a "shoot open" notification', await notes(freeId, 'shoot_open'), 1);
  r = await admin.req('GET', `/calendar?clientId=${clientId}&month=${next}`);
  const ev = (r.body?.data || []).find((e) => e.id === s1?.calendar_event_id);
  check('shoot is on the client’s content calendar', ev?.event_type, 'Video Shoot', msg(r));
  r = await admin.req('POST', '/shoots/slots', { ...slotBody, date: '2020-01-04' });
  check('past shoot rejected', r.status, 400);
  r = await am.req('POST', '/shoots/slots', slotBody);
  check('account manager cannot post shoots', r.status, 403);

  console.log('\n── Open shoots: privacy + first come, first served ──');
  r = await free.req('GET', '/shoots/slots/open');
  const teaser = (r.body?.data?.slots || []).find((s) => s.id === s1.id);
  check('freelancer sees the open shoot', Boolean(teaser), true, msg(r));
  check('…marked as fitting their availability', teaser?.fits, true);
  check('…without client name, address or brief', ['client_name', 'address', 'brief', 'map_url'].some((k) => k in (teaser || {})), false);
  check('…but with area and pay', `${teaser?.area}/${teaser?.pay_amount}`, 'Anna Nagar/3000');
  r = await free.req('GET', `/shoots/slots/${s1.id}`);
  check('freelancer can’t open the full shoot before booking', r.status, 403);

  const race = await Promise.all([free.req('POST', `/shoots/slots/${s1.id}/accept`), free2.req('POST', `/shoots/slots/${s1.id}/accept`)]);
  check('two accept at once → exactly one wins', race.map((x) => x.status).sort().join(','), '200,409');
  const loserRes = race.find((x) => x.status === 409);
  check('…the other is told it’s taken', loserRes?.body?.error?.code, 'SHOOT_TAKEN');
  const winnerIdx = race.findIndex((x) => x.status === 200);
  const [winner, loser] = winnerIdx === 0 ? [free, free2] : [free2, free];
  const winnerId = winnerIdx === 0 ? freeId : free2Id;
  r = await loser.req('GET', '/shoots/slots/open');
  check('taken shoot disappears from the other’s list', (r.body?.data?.slots || []).some((s) => s.id === s1.id), false);
  r = await winner.req('GET', '/shoots/slots/mine');
  const mine = (r.body?.data?.slots || []).find((s) => s.id === s1.id);
  check('winner sees full details', `${mine?.client_name}|${mine?.address}|${mine?.brief}`, 'SHOOT Clinic|12 Main Road, Anna Nagar|Doctor intro + clinic walkthrough');
  check('…and can still drop it (48h+ away)', mine?.can_withdraw, true);
  check('admin told it’s booked', await notes(fx.admin.id, 'shoot_booked'), 1);
  const [[evRow]] = await pool.query('SELECT assigned_to FROM calendar_events WHERE id = ?', [s1.calendar_event_id]);
  check('calendar item assigned to the videographer', Number(evRow?.assigned_to), winnerId);
  r = await winner.req('POST', `/shoots/slots/${s1.id}/accept`);
  check('accepting twice is refused', r.body?.error?.code, 'ALREADY_BOOKED');

  console.log('\n── No double booking ──');
  r = await admin.req('POST', '/shoots/slots', { ...slotBody, title: 'Second shoot', start: '11:00', end: '13:00' });
  const s2 = r.body?.data;
  r = await winner.req('POST', `/shoots/slots/${s2.id}/accept`);
  check('overlapping shoot refused for the same person', r.body?.error?.code, 'SHOOT_CLASH');
  r = await admin.req('POST', `/shoots/slots/${s2.id}/assign`, { userId: winnerId });
  check('admin can’t force a clash either', r.status, 409);
  r = await admin.req('POST', `/shoots/slots/${s2.id}/assign`, { userId: fx.vexec.id });
  check('admin assigns in-house videographer', r.status, 200, msg(r));
  check('…who is notified', await notes(fx.vexec.id, 'shoot_assigned'), 1);
  r = await winner.req('POST', '/shoots/availability/clear-day', { date: day });
  check('can’t clear a day you’re booked on', r.body?.error?.code, 'BOOKED_TIME');
  r = await winner.req('GET', `/shoots/availability?month=${next}`);
  check('booked shoot shows on own availability calendar', (r.body?.data?.shoots || []).some((s) => s.id === s1.id), true);
  r = await admin.req('PATCH', `/shoots/slots/${s1.id}`, { start: '09:00' });
  check('can’t move a booked shoot', r.status, 409);
  r = await admin.req('PATCH', `/shoots/slots/${s1.id}`, { brief: 'Updated brief' });
  check('can edit the brief', r.body?.data?.brief, 'Updated brief', msg(r));

  console.log('\n── Two people needed ──');
  const day2 = weekends[2];
  await free.req('POST', '/shoots/availability', { dates: [day2], fullDay: true }); // may already exist
  r = await admin.req('POST', '/shoots/slots', { ...slotBody, title: 'Event shoot', shootType: 'Event', date: day2, start: '16:00', end: '20:00', peopleNeeded: 2 });
  const s3 = r.body?.data;
  r = await free.req('POST', `/shoots/slots/${s3.id}/accept`);
  check('first of two accepts → still open', r.body?.data?.status, 'open', msg(r));
  r = await free2.req('POST', `/shoots/slots/${s3.id}/accept`);
  check('second accepts → booked', r.body?.data?.status, 'booked', msg(r));
  r = await vexec.req('POST', `/shoots/slots/${s3.id}/accept`);
  check('third is refused', r.body?.error?.code, 'SHOOT_TAKEN');
  r = await free.req('POST', `/shoots/slots/${s3.id}/withdraw`, { reason: 'family function' });
  check('videographer drops it 48h+ ahead', r.status, 200, msg(r));
  r = await admin.req('GET', `/shoots/slots/${s3.id}`);
  check('…slot reopens for one more', `${r.body?.data?.status}/${r.body?.data?.spots_left}`, 'open/1');
  check('…admin told', await notes(fx.admin.id, 'shoot_withdrawn'), 1);

  console.log('\n── Inside 48 hours ──');
  const t = new Date(Date.now() + 26 * 3600000);
  const soon = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  r = await admin.req('POST', '/shoots/slots', { ...slotBody, title: 'Soon shoot', date: soon, start: '22:00', end: '23:00' });
  const s4 = r.body?.data;
  r = await free2.req('POST', `/shoots/slots/${s4?.id}/accept`);
  check('accept a shoot tomorrow', r.status, 200, msg(r));
  r = await free2.req('POST', `/shoots/slots/${s4?.id}/withdraw`, {});
  check('can’t drop it inside 48 hours', r.body?.error?.code, 'TOO_LATE_TO_WITHDRAW');
  r = await admin.req('POST', `/shoots/slots/${s4?.id}/unassign`, { userId: free2Id, reason: 'swap' });
  check('admin can still take them off', r.body?.data?.status, 'open', msg(r));
  check('…and they’re told', await notes(free2Id, 'shoot_removed'), 1);

  console.log('\n── Cancel + access ──');
  r = await admin.req('POST', `/shoots/slots/${s1.id}/cancel`, { reason: 'client rescheduled' });
  check('admin cancels a booked shoot', r.status, 200, msg(r));
  check('booked videographer told', await notes(winnerId, 'shoot_cancelled'), 1);
  const [[evAfter]] = await pool.query('SELECT status FROM calendar_events WHERE id = ?', [s1.calendar_event_id]);
  check('calendar item cancelled too', evAfter?.status, 'cancelled');
  r = await winner.req('GET', '/shoots/slots/mine');
  check('gone from their shoots', (r.body?.data?.slots || []).some((s) => s.id === s1.id), false);
  r = await loser.req('POST', `/shoots/slots/${s1.id}/accept`);
  check('cancelled shoot can’t be accepted', r.body?.error?.code, 'SHOOT_CANCELLED');
  r = await am.req('GET', `/shoots/slots?month=${next}`);
  check('account manager sees shoots without pay', r.status === 200 && (r.body?.data?.slots || []).every((s) => s.pay_amount === null), true, msg(r));
  r = await free.req('GET', `/shoots/slots?month=${next}`);
  check('freelancer can’t list all shoots', r.status, 403);
  r = await emp.req('GET', '/shoots/slots/open');
  check('in-house (added earlier) sees open shoots', r.status, 200, msg(r));

  await phase3({ admin, emp, free, free2, freeId, free2Id, clientId, weekends, next });
}

/** Phase 3: client picks from proposed dates, attendance / no-show, reminders. */
async function phase3({ admin, emp, free, free2, freeId, free2Id, clientId, weekends }) {
  console.log('\n── Phase 3: propose dates to the client ──');
  const hash = await bcrypt.hash(PASSWORD, 10);
  const [cu] = await pool.query(
    "INSERT INTO users (name, email, password_hash, role, status, must_change_password, client_id) VALUES ('SHOOT client login', ?, ?, 'client', 'active', 0, ?)",
    [`portal${DOMAIN}`, hash, clientId]
  );
  const [[crole]] = await pool.query("SELECT id FROM roles WHERE slug = 'client'");
  await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [cu.insertId, crole.id]);
  const portal = new Session();
  await portal.login(`portal${DOMAIN}`);
  const portalId = cu.insertId;

  const base = { clientId, title: 'Product shoot — new range', shootType: 'Product', area: 'T Nagar', address: '9 Usman Rd', brief: 'Packshots + hands', payAmount: 4000, message: 'Any of these work for our team.' };
  let r = await admin.req('POST', '/shoots/proposals', { ...base, options: [{ date: '2020-01-04', start: '10:00', end: '12:00' }] });
  check('past option rejected', r.status, 400);
  r = await admin.req('POST', '/shoots/proposals', { ...base, options: [{ date: weekends[3], start: '10:00', end: '12:00' }, { date: weekends[3], start: '10:00', end: '13:00' }] });
  check('duplicate option rejected', r.status, 400);
  r = await admin.req('POST', '/shoots/proposals', { ...base, options: [{ date: weekends[3], start: '10:00', end: '12:00' }, { date: weekends[5], start: '15:00', end: '17:00' }] });
  check('admin proposes 2 dates', r.status, 201, msg(r));
  const prop = r.body?.data;
  check('client login notified', `${r.body?.data?.client_logins_notified}/${await notes(portalId, 'shoot_dates_proposed')}`, '1/1');
  check('team sees who is free for each option', (prop?.options || []).every((o) => typeof o.free_now === 'number'), true);
  check('…at least one free on the first option', (prop?.options?.[0]?.free_now || 0) >= 1, true);
  r = await emp.req('POST', '/shoots/proposals', { ...base, options: [{ date: weekends[3], start: '10:00', end: '12:00' }] });
  check('in-house videographer cannot propose', r.status, 403);

  console.log('\n── Client portal: pick a date ──');
  r = await portal.req('GET', '/shoots/client/proposals');
  const mineP = (r.body?.data || []).find((p) => p.id === prop.id);
  check('client sees the request', mineP?.status, 'pending', msg(r));
  check('…without pay, address or brief', ['pay_amount', 'address', 'brief'].some((k) => k in (mineP || {})), false);
  r = await emp.req('POST', `/shoots/client/proposals/${prop.id}/respond`, { optionId: prop.options[0].id });
  check('staff cannot answer for the client', r.status, 403);
  r = await portal.req('POST', `/shoots/client/proposals/${prop.id}/respond`, {});
  check('must pick a date or say none work', r.status, 400);
  const beforeOpen = await notes(freeId, 'shoot_open');
  r = await portal.req('POST', `/shoots/client/proposals/${prop.id}/respond`, { optionId: prop.options[0].id, note: 'Morning is best' });
  check('client picks the first date', r.body?.data?.status, 'accepted', msg(r));
  const [[pRow]] = await pool.query('SELECT slot_id FROM shoot_proposals WHERE id = ?', [prop.id]);
  r = await admin.req('GET', `/shoots/slots/${pRow.slot_id}`);
  check('shoot posted automatically for that date', `${r.body?.data?.date} ${r.body?.data?.start} ${r.body?.data?.status}`, `${weekends[3]} 10:00 open`, msg(r));
  check('…with the details from the proposal', `${r.body?.data?.address}|${r.body?.data?.pay_amount}`, '9 Usman Rd|4000');
  check('free videographers told about the new shoot', (await notes(freeId, 'shoot_open')) > beforeOpen, true);
  check('team told which date the client picked', await notes(fx.admin.id, 'shoot_date_chosen'), 1);
  r = await portal.req('POST', `/shoots/client/proposals/${prop.id}/respond`, { optionId: prop.options[1].id });
  check('can’t answer twice', r.body?.error?.code, 'ALREADY_ANSWERED');

  r = await admin.req('POST', '/shoots/proposals', { ...base, title: 'Second request', options: [{ date: weekends[5], start: '10:00', end: '12:00' }] });
  const prop2 = r.body?.data;
  r = await portal.req('POST', `/shoots/client/proposals/${prop2.id}/respond`, { noneWork: true, note: 'We are travelling that week' });
  check('client says none work', r.body?.data?.status, 'declined', msg(r));
  check('…team told', await notes(fx.admin.id, 'shoot_dates_declined'), 1);
  r = await admin.req('POST', '/shoots/proposals', { ...base, title: 'Third request', options: [{ date: weekends[5], start: '10:00', end: '12:00' }] });
  const prop3 = r.body?.data;
  r = await admin.req('POST', `/shoots/proposals/${prop3.id}/withdraw`);
  check('team withdraws a pending request', r.body?.data?.withdrawn, true, msg(r));
  r = await portal.req('GET', '/shoots/client/proposals');
  check('withdrawn request disappears for the client', (r.body?.data || []).some((p) => p.id === prop3.id), false);
  r = await admin.req('GET', '/shoots/proposals');
  check('team list shows accepted + declined', ['accepted', 'declined'].every((s) => (r.body?.data || []).some((p) => p.status === s)), true, msg(r));

  console.log('\n── Attendance / no-show ──');
  const yest = istNow(new Date(Date.now() - 24 * 3600000)).date;
  const [ps] = await pool.query(
    `INSERT INTO shoot_slots (client_id, title, shoot_type, shoot_date, start_time, end_time, area, status, created_by, people_needed)
     VALUES (?, 'Yesterday shoot', 'Reels', ?, '10:00', '12:00', 'Adyar', 'booked', ?, 2)`,
    [clientId, yest, fx.admin.id]
  );
  await pool.query("INSERT INTO shoot_bookings (slot_id, user_id, status, booked_at) VALUES (?, ?, 'booked', NOW()), (?, ?, 'booked', NOW())", [ps.insertId, freeId, ps.insertId, free2Id]);
  r = await admin.req('POST', `/shoots/slots/${ps.insertId}/attendance`, { userId: freeId, attendance: 'attended' });
  check('mark one attended → shoot not done yet', r.body?.data?.status, 'booked', msg(r));
  r = await admin.req('POST', `/shoots/slots/${ps.insertId}/attendance`, { userId: free2Id, attendance: 'no_show' });
  check('mark the other no-show → shoot done', r.body?.data?.status, 'completed', msg(r));
  check('no-show is told', await notes(free2Id, 'shoot_no_show'), 1);
  r = await admin.req('POST', `/shoots/slots/${pRow.slot_id}/attendance`, { userId: freeId, attendance: 'attended' });
  check('can’t mark attendance before the shoot ends', r.status, 409);
  r = await admin.req('GET', '/shoots/videographers');
  const vs = r.body?.data?.videographers || [];
  check('track record: done / no-shows / dropped', `${vs.find((v) => v.id === freeId)?.shoots_done}/${vs.find((v) => v.id === free2Id)?.no_shows}/${vs.find((v) => v.id === freeId)?.dropped}`, '1/1/1');
  r = await free.req('GET', '/shoots/slots/mine?scope=past');
  check('done shoot in the videographer’s past shoots', (r.body?.data?.slots || []).some((s) => s.id === ps.insertId), true, msg(r));

  console.log('\n── Reminders (IST) ──');
  const { ShootRemindersService } = await import('../modules/shoots/shootReminders.service.js');
  const at = (h) => istNow(new Date(Date.now() + h * 3600000));
  const soon = at(1.5);
  const tom = at(20);
  const later = at(30);
  const mk = async (when, title, status, endH = 1) => {
    const end = istNow(new Date(Date.now() + (when === soon ? 1.5 + endH : when === tom ? 20 + endH : 30 + endH) * 3600000));
    if (end.date !== when.date) return null; // crosses midnight — skip this case
    const [x] = await pool.query(
      `INSERT INTO shoot_slots (client_id, title, shoot_type, shoot_date, start_time, end_time, area, status, created_by, people_needed)
       VALUES (?, ?, 'Reels', ?, ?, ?, 'Mylapore', ?, ?, 1)`,
      [clientId, title, when.date, when.time, end.time, status, fx.admin.id]
    );
    return x.insertId;
  };
  const sSoon = await mk(soon, 'Soon reminder shoot', 'booked');
  const sTom = await mk(tom, 'Tomorrow reminder shoot', 'booked');
  const sLater = await mk(later, 'Unfilled shoot', 'open');
  if (sSoon) await pool.query("INSERT INTO shoot_bookings (slot_id, user_id, status, booked_at) VALUES (?, ?, 'booked', NOW())", [sSoon, free2Id]);
  if (sTom) await pool.query("INSERT INTO shoot_bookings (slot_id, user_id, status, booked_at) VALUES (?, ?, 'booked', NOW())", [sTom, freeId]);
  const [ended] = await pool.query(
    `INSERT INTO shoot_slots (client_id, title, shoot_type, shoot_date, start_time, end_time, area, status, created_by, people_needed)
     VALUES (?, 'Ended unmarked', 'Reels', ?, '09:00', '10:00', 'Adyar', 'booked', ?, 1)`,
    [clientId, yest, fx.admin.id]
  );
  await pool.query("INSERT INTO shoot_bookings (slot_id, user_id, status, booked_at) VALUES (?, ?, 'booked', NOW())", [ended.insertId, freeId]);

  await ShootRemindersService.shootReminders(new Date());
  await ShootRemindersService.shootReminders(new Date()); // second run must not repeat anything
  const [[rem]] = await pool.query(
    "SELECT SUM(kind = 'shoot_2h') AS h2, SUM(kind = 'shoot_24h') AS h24, SUM(kind = 'shoot_unfilled') AS unf, SUM(kind = 'shoot_attendance') AS att FROM shoot_reminder_log WHERE ref_id IN (?)",
    [[sSoon || 0, sTom || 0, sLater || 0, ended.insertId]]
  );
  if (sSoon) check('2-hour reminder once', Number(rem.h2), 1);
  if (sTom) check('"shoot tomorrow" reminder once', Number(rem.h24), 1);
  if (sLater) check('unfilled shoot within 48h → poster alerted once', Number(rem.unf), 1);
  check('ended shoot without attendance → poster asked once', Number(rem.att), 1);
  check('reminders reached the right people', `${await notes(free2Id, 'shoot_reminder')}/${await notes(freeId, 'shoot_reminder')}`, `${sSoon ? 1 : 0}/${sTom ? 1 : 0}`);

  // Availability due on the 20th (from 9 AM IST) for those who haven't marked next month done — test users only.
  const on20 = new Date('2026-11-20T05:00:00Z'); // 10:30 AM IST
  await pool.query("DELETE FROM videographer_month_status WHERE user_id IN (?) AND month = '2026-12'", [[freeId, free2Id]]);
  await pool.query("INSERT INTO videographer_month_status (user_id, month, submitted_at) VALUES (?, '2026-12', NOW())", [freeId]);
  let n = await ShootRemindersService.availabilityReminders(on20, { onlyUserIds: [freeId, free2Id] });
  check('availability reminder on the 20th only to whoever isn’t done', `${n}/${await notes(free2Id, 'availability_due')}/${await notes(freeId, 'availability_due')}`, '1/1/0');
  n = await ShootRemindersService.availabilityReminders(on20, { onlyUserIds: [freeId, free2Id] });
  check('…and only once that day', n, 0);
  n = await ShootRemindersService.availabilityReminders(new Date('2026-11-21T05:00:00Z'), { onlyUserIds: [freeId, free2Id] });
  check('no reminder on other days', n, 0);
  n = await ShootRemindersService.availabilityReminders(new Date('2026-11-20T02:00:00Z'), { onlyUserIds: [freeId, free2Id] }); // 7:30 AM IST
  check('not before 9 AM', n, 0);

  await phase4({ admin, emp, free, free2, freeId, free2Id, clientId, yest });
}

/** Phase 4: link to the client's video project, footage handoff, freelancer payouts, reliability. */
async function phase4({ admin, emp, free, free2, freeId, free2Id, clientId, yest }) {
  console.log('\n── Phase 4: link the shoot to the client’s video project ──');
  const [pj] = await pool.query(
    "INSERT INTO projects (name, project_code, project_manager_id, client_id, status) VALUES ('SHOOT Video project', ?, ?, ?, 'active')",
    [`SHV-${Date.now()}`, fx.admin.id, clientId]
  );
  const projectId = pj.insertId;
  const [st1] = await pool.query(
    "INSERT INTO project_steps (project_id, step_order, name, step_type, status, started_at) VALUES (?, 1, 'Shoot Execution', 'work', 'in_progress', NOW())",
    [projectId]
  );
  await pool.query("INSERT INTO project_steps (project_id, step_order, name, step_type, status) VALUES (?, 2, 'Post-Production', 'work', 'pending')", [projectId]);
  await pool.query(
    "INSERT INTO tasks (task_code, title, creator_id, project_id, project_step_id, client_id, status, column_status) VALUES (?, 'Record the clinic reels', ?, ?, ?, ?, 'todo', 'todo')",
    [`SHV-${projectId}-T1`, fx.admin.id, projectId, st1.insertId, clientId]
  );
  let r = await admin.req('GET', `/shoots/client-projects?clientId=${clientId}`);
  check('client projects list offers the video project', (r.body?.data || []).find((p) => p.id === projectId)?.shoot_stage, 'Shoot Execution', msg(r));
  const [[other]] = await pool.query('SELECT id FROM projects WHERE client_id <> ? AND client_id IS NOT NULL LIMIT 1', [clientId]);

  // A shoot that started 3h ago and ends in an hour, linked to the project, booked by both freelancers.
  const start = istNow(new Date(Date.now() - 3 * 3600000));
  const end = istNow(new Date(Date.now() + 1 * 3600000));
  const sameDay = start.date === end.date;
  const [sl] = await pool.query(
    `INSERT INTO shoot_slots (client_id, project_id, title, shoot_type, shoot_date, start_time, end_time, area, status, pay_amount, people_needed, created_by)
     VALUES (?, ?, 'Linked clinic shoot', 'Reels', ?, ?, ?, 'Adyar', 'booked', 3500, 2, ?)`,
    [clientId, projectId, start.date, start.time, sameDay ? end.time : '23:59', fx.admin.id]
  );
  const slotId = sl.insertId;
  await pool.query("INSERT INTO shoot_bookings (slot_id, user_id, status, booked_at) VALUES (?, ?, 'booked', NOW()), (?, ?, 'booked', NOW())", [slotId, freeId, slotId, free2Id]);
  if (other) {
    r = await admin.req('PATCH', `/shoots/slots/${slotId}`, { projectId: other.id });
    check('can’t link another client’s project', r.status, 400);
  }

  console.log('\n── Footage handoff ──');
  r = await free.req('POST', `/shoots/slots/${slotId}/footage`, { url: 'not a link' });
  check('footage needs a real link', r.status, 400);
  r = await emp.req('POST', `/shoots/slots/${slotId}/footage`, { url: 'https://drive.google.com/x' });
  check('someone not on the shoot can’t hand in footage', r.status, 404);
  r = await free.req('POST', `/shoots/slots/${slotId}/footage`, { url: 'https://drive.google.com/drive/folders/abc', notes: '42 clips, 4K' });
  check('freelancer hands in footage (shoot underway)', r.status, 200, msg(r));
  check('…shoot stage completed → project moves to post-production', r.body?.data?.handoff, 'stage_completed');
  const [[t1]] = await pool.query('SELECT status, deliverable_url FROM tasks WHERE project_step_id = ?', [st1.insertId]);
  check('shoot task done with the footage link', `${t1.status}|${t1.deliverable_url}`, 'completed|https://drive.google.com/drive/folders/abc');
  const [[s2]] = await pool.query("SELECT status FROM project_steps WHERE project_id = ? AND step_order = 2", [projectId]);
  check('post-production stage is now open', s2.status, 'in_progress');
  const [[s1]] = await pool.query('SELECT notes FROM project_steps WHERE id = ?', [st1.insertId]);
  check('footage link noted on the shoot stage', /drive\.google\.com\/drive\/folders\/abc/.test(s1.notes || ''), true);
  check('poster told footage is in', await notes(fx.admin.id, 'shoot_footage'), 1);

  console.log('\n── Payouts ──');
  r = await admin.req('GET', `/shoots/slots/${slotId}`);
  const me = (r.body?.data?.crew || []).find((c) => c.user_id === freeId);
  check('footage counts as attended', me?.attendance, 'attended');
  check('…and creates a pending payout for the freelancer', `${me?.payout?.amount}/${me?.payout?.status}`, '3500/pending');
  const [[ex]] = await pool.query('SELECT e.amount, e.status, e.client_id, s.name AS sub FROM expenses e LEFT JOIN expense_subcategories s ON s.id = e.subcategory_id WHERE e.id = ?', [me?.payout?.expense_id]);
  check('payout is a Client Shoot Expense for the client', `${ex?.sub}|${ex?.client_id}|${ex?.status}`, `Client Shoot Expense|${clientId}|pending`);
  r = await admin.req('POST', `/shoots/slots/${slotId}/attendance`, { userId: free2Id, attendance: 'no_show' });
  check('no-show before the shoot ends is refused', r.status, sameDay ? 409 : (s) => s === 409 || s === 200);
  // End the shoot, then the other freelancer is a no-show → no payout, shoot done.
  await pool.query("UPDATE shoot_slots SET shoot_date = ?, start_time = '09:00', end_time = '10:00' WHERE id = ?", [yest, slotId]);
  r = await admin.req('POST', `/shoots/slots/${slotId}/attendance`, { userId: free2Id, attendance: 'no_show' });
  check('no-show → shoot done', r.body?.data?.status, 'completed', msg(r));
  check('…no payout for the no-show', (r.body?.data?.crew || []).find((c) => c.user_id === free2Id)?.payout, null);
  r = await admin.req('GET', '/shoots/payouts?status=pending');
  const row = (r.body?.data?.payouts || []).find((p) => p.user_id === freeId && p.slot_id === slotId);
  check('payouts list shows it as pending', row?.amount, 3500, msg(r));
  r = await free.req('GET', '/shoots/payouts');
  check('freelancer can’t see everyone’s payouts', r.status, 403);
  r = await admin.req('POST', `/shoots/payouts/${row?.booking_id}/pay`, { paymentMode: 'UPI', reference: 'UPI-778', amount: 3800 });
  check('admin marks it paid (with travel added)', `${r.body?.data?.paid}/${r.body?.data?.amount}`, 'true/3800', msg(r));
  check('…freelancer told', await notes(freeId, 'shoot_paid'), 1);
  r = await admin.req('POST', `/shoots/payouts/${row?.booking_id}/pay`, {});
  check('can’t pay twice', r.body?.error?.code, 'ALREADY_PAID');
  r = await free.req('GET', '/shoots/my-payouts');
  check('freelancer sees their payment history', `${r.body?.data?.totals?.paid}`, '3800', msg(r));
  r = await admin.req('POST', `/shoots/slots/${slotId}/attendance`, { userId: freeId, attendance: 'no_show' });
  check('can’t flip a paid person to no-show', r.body?.error?.code, 'ALREADY_PAID');

  console.log('\n── Reliability ──');
  r = await admin.req('GET', '/shoots/videographers');
  const vs = r.body?.data?.videographers || [];
  const f1 = vs.find((v) => v.id === freeId);
  const f2 = vs.find((v) => v.id === free2Id);
  // free: 2 attended, 1 dropped → 67%. free2: 0 attended, 2 no-shows → 0%.
  check('reliability scores', `${f1?.reliability}/${f2?.reliability}`, '67/0');
  r = await emp.req('POST', `/shoots/payouts/${row?.booking_id}/pay`, {});
  check('in-house staff can’t mark payouts', r.status, 403);
}

const args = process.argv.slice(2);
(async () => {
  try {
    if (args.includes('--purge-only')) {
      await purge();
    } else {
      await run();
      if (args.includes('--keep')) console.log(`\nFixtures kept (admin${DOMAIN} / free${DOMAIN}). Remove with: --purge-only`);
      else await purge();
    }
  } catch (e) {
    console.error(e);
    results.push(false);
    if (!args.includes('--keep')) await purge().catch(() => {});
  }
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
})();
