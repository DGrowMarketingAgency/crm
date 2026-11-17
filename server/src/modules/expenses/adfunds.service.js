import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';
import { httpError, round2, todayIst, dstr, periodRange } from './expenses.service.js';

const audit = (actor, action, entityType, id, details, req) => AuditService.log({ actorId: actor.id, action, entityType, entityId: id, details, req });
export const LOW_BALANCE_DAYS = 3; // warn when the wallet covers fewer than 3 days of active budgets

/**
 * Client ad-fund wallets. The client deposits money for ads; the agency spends it on Meta / Google etc.
 * Balance = deposits − spend − refunds ± adjustments. Client money, so it is kept apart from agency expenses.
 */
export class AdFundsService {
  static #balanceSql(alias = 't') {
    return `COALESCE(SUM(CASE ${alias}.txn_type WHEN 'deposit' THEN ${alias}.amount WHEN 'spend' THEN -${alias}.amount WHEN 'refund' THEN -${alias}.amount ELSE ${alias}.amount END), 0)`;
  }

  static async #assertClient(clientId) {
    const [[c]] = await pool.query('SELECT id, COALESCE(company_name, name) AS name FROM clients WHERE id = ?', [clientId]);
    if (!c) throw httpError(400, 'Client not found', 'INVALID_CLIENT');
    return c;
  }

  static async balance(clientId, conn = pool) {
    const [[r]] = await conn.query(`SELECT ${this.#balanceSql()} AS bal FROM ad_fund_transactions t WHERE t.client_id = ?`, [clientId]);
    return round2(r.bal);
  }

  /**
   * Pay-later clients: money received settles the oldest spends first (FIFO), so the first spend that is not
   * fully covered is the date the dues started. Due date = that date + payment terms.
   */
  static #dues(txns, termsDays, today) {
    const credits = txns.filter((t) => t.txn_type === 'deposit' || (t.txn_type === 'adjustment' && Number(t.amount) > 0)).reduce((a, t) => a + Number(t.amount), 0);
    let cum = 0;
    for (const t of txns) {
      const debit = t.txn_type === 'spend' || t.txn_type === 'refund' ? Number(t.amount) : t.txn_type === 'adjustment' && Number(t.amount) < 0 ? -Number(t.amount) : 0;
      if (!debit) continue;
      cum += debit;
      if (cum > credits + 0.005) {
        const since = dstr(t.txn_date);
        const d = new Date(`${since}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + termsDays);
        const dueDate = d.toISOString().slice(0, 10);
        const overdueDays = Math.round((new Date(`${today}T00:00:00Z`) - d) / 86400000);
        return { owed_since: since, due_date: dueDate, overdue_days: Math.max(0, overdueDays) };
      }
    }
    return { owed_since: null, due_date: null, overdue_days: 0 };
  }

  static async settings(clientId) {
    const [[s]] = await pool.query('SELECT * FROM ad_wallet_settings WHERE client_id = ?', [clientId]);
    return {
      client_id: Number(clientId), billing_mode: s?.billing_mode || 'prepaid',
      credit_limit: s?.credit_limit == null ? null : Number(s.credit_limit), payment_terms_days: s?.payment_terms_days ?? 7, notes: s?.notes || null
    };
  }

  static async saveSettings(clientId, { billingMode, creditLimit, paymentTermsDays, notes }, actor, req) {
    await this.#assertClient(clientId);
    await pool.query(
      `INSERT INTO ad_wallet_settings (client_id, billing_mode, credit_limit, payment_terms_days, notes, updated_by) VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE billing_mode = VALUES(billing_mode), credit_limit = VALUES(credit_limit), payment_terms_days = VALUES(payment_terms_days),
                               notes = VALUES(notes), updated_by = VALUES(updated_by)`,
      [clientId, billingMode, creditLimit ?? null, paymentTermsDays ?? 7, notes || null, actor.id]
    );
    await audit(actor, 'adfund.settings', 'client', clientId, { billingMode, creditLimit, paymentTermsDays }, req);
    return this.settings(clientId);
  }

  /** Every client with ad activity: totals, budget runway (prepaid) or money owed and its age (pay later). */
  static async wallets() {
    const [rows] = await pool.query(
      `SELECT c.id AS client_id, COALESCE(c.company_name, c.name) AS client_name, c.account_manager_id,
              COALESCE(SUM(CASE WHEN t.txn_type = 'deposit' THEN t.amount END), 0) AS deposits,
              COALESCE(SUM(CASE WHEN t.txn_type = 'spend' THEN t.amount END), 0) AS spend,
              COALESCE(SUM(CASE WHEN t.txn_type = 'refund' THEN t.amount END), 0) AS refunds,
              COALESCE(SUM(CASE WHEN t.txn_type = 'adjustment' THEN t.amount END), 0) AS adjustments,
              ${this.#balanceSql()} AS balance, MAX(t.txn_date) AS last_activity,
              (SELECT COALESCE(SUM(a.daily_budget), 0) FROM ad_campaigns a WHERE a.client_id = c.id AND a.status = 'active') AS daily_budget,
              (SELECT COUNT(*) FROM ad_campaigns a WHERE a.client_id = c.id AND a.status = 'active') AS active_campaigns
       FROM clients c LEFT JOIN ad_fund_transactions t ON t.client_id = c.id
       WHERE EXISTS (SELECT 1 FROM ad_fund_transactions x WHERE x.client_id = c.id) OR EXISTS (SELECT 1 FROM ad_campaigns y WHERE y.client_id = c.id)
          OR EXISTS (SELECT 1 FROM ad_wallet_settings z WHERE z.client_id = c.id)
       GROUP BY c.id, c.company_name, c.name, c.account_manager_id ORDER BY client_name`
    );
    if (!rows.length) return [];
    const ids = rows.map((r) => r.client_id);
    const [settings] = await pool.query('SELECT * FROM ad_wallet_settings WHERE client_id IN (?)', [ids]);
    const [txns] = await pool.query('SELECT client_id, txn_type, txn_date, amount FROM ad_fund_transactions WHERE client_id IN (?) ORDER BY txn_date, id', [ids]);
    const today = todayIst();
    return rows.map((r) => {
      const s = settings.find((x) => x.client_id === r.client_id);
      const mode = s?.billing_mode || 'prepaid';
      const creditLimit = s?.credit_limit == null ? null : Number(s.credit_limit);
      const terms = s?.payment_terms_days ?? 7;
      const balance = round2(r.balance);
      const daily = Number(r.daily_budget);
      const daysLeft = daily > 0 && balance > 0 ? Math.floor(balance / daily) : daily > 0 ? 0 : null;
      const owed = balance < 0 ? round2(-balance) : 0;
      const dues = owed ? this.#dues(txns.filter((t) => t.client_id === r.client_id), terms, today) : { owed_since: null, due_date: null, overdue_days: 0 };
      let health;
      if (mode === 'postpaid') {
        health = !owed ? 'ok' : creditLimit != null && owed > creditLimit ? 'over_limit' : dues.overdue_days > 0 ? 'overdue' : 'due';
      } else {
        health = balance < 0 ? 'negative' : daily > 0 && daysLeft < 1 ? 'empty' : daily > 0 && daysLeft < LOW_BALANCE_DAYS ? 'low' : 'ok';
      }
      return {
        ...r, deposits: Number(r.deposits), spend: Number(r.spend), refunds: Number(r.refunds), adjustments: Number(r.adjustments), balance,
        daily_budget: daily, active_campaigns: Number(r.active_campaigns), last_activity: dstr(r.last_activity), days_left: mode === 'prepaid' ? daysLeft : null,
        billing_mode: mode, credit_limit: creditLimit, payment_terms_days: terms,
        owed, ...dues, credit_used_pct: creditLimit ? Math.round((owed / creditLimit) * 100) : null,
        health
      };
    });
  }

  static async summary({ period = 'month', from, to } = {}) {
    const [start, end] = periodRange(period, from, to);
    const [[p]] = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN txn_type = 'deposit' THEN amount END), 0) AS deposits,
              COALESCE(SUM(CASE WHEN txn_type = 'spend' THEN amount END), 0) AS spend,
              COALESCE(SUM(CASE WHEN txn_type = 'refund' THEN amount END), 0) AS refunds,
              SUM(txn_type = 'deposit') AS deposit_count, SUM(txn_type = 'spend') AS spend_count
       FROM ad_fund_transactions WHERE txn_date BETWEEN ? AND ?`,
      [start, end]
    );
    const wallets = await this.wallets();
    const [[run]] = await pool.query("SELECT COALESCE(SUM(daily_budget), 0) AS daily FROM ad_campaigns WHERE status = 'active'");
    return {
      range: { from: start, to: end },
      period: { deposits: Number(p.deposits), spend: Number(p.spend), refunds: Number(p.refunds), depositCount: Number(p.deposit_count || 0), spendCount: Number(p.spend_count || 0) },
      dailyRunningCost: Number(run.daily),
      // Money held for clients (positive balances) and money clients owe the agency (spent first, not paid yet)
      totalBalance: round2(wallets.reduce((a, w) => a + Math.max(0, w.balance), 0)),
      toCollect: round2(wallets.reduce((a, w) => a + w.owed, 0)),
      overdueCollect: round2(wallets.filter((w) => ['overdue', 'over_limit'].includes(w.health) || (w.billing_mode === 'prepaid' && w.owed > 0)).reduce((a, w) => a + w.owed, 0)),
      clientsOwing: wallets.filter((w) => w.owed > 0).length,
      lowWallets: wallets.filter((w) => ['low', 'empty'].includes(w.health)).length,
      wallets
    };
  }

  static async transactions({ clientId, type, period = 'all', from, to } = {}) {
    const [start, end] = periodRange(period, from, to);
    const where = ['t.txn_date BETWEEN ? AND ?'];
    const params = [start, end];
    if (clientId) { where.push('t.client_id = ?'); params.push(Number(clientId)); }
    if (type) { where.push('t.txn_type = ?'); params.push(type); }
    const [rows] = await pool.query(
      `SELECT t.*, COALESCE(c.company_name, c.name) AS client_name, a.name AS campaign_name, u.name AS created_by_name
       FROM ad_fund_transactions t JOIN clients c ON c.id = t.client_id LEFT JOIN ad_campaigns a ON a.id = t.campaign_id
       LEFT JOIN users u ON u.id = t.created_by WHERE ${where.join(' AND ')} ORDER BY t.txn_date DESC, t.id DESC LIMIT 1000`,
      params
    );
    return rows.map((r) => ({ ...r, amount: Number(r.amount), txn_date: dstr(r.txn_date) }));
  }

  static async record({ clientId, txnType, txnDate, amount, campaignId, platform, paymentMode, reference, notes }, actor, req) {
    await this.#assertClient(clientId);
    if (txnType === 'refund') {
      const bal = await this.balance(clientId);
      if (round2(amount) > bal) throw httpError(409, `Refund is more than the wallet balance (₹${bal.toLocaleString('en-IN')})`, 'OVER_REFUND');
    }
    if (campaignId) {
      const [[c]] = await pool.query('SELECT id, client_id, platform FROM ad_campaigns WHERE id = ?', [campaignId]);
      if (!c || c.client_id !== Number(clientId)) throw httpError(400, 'That campaign belongs to another client', 'INVALID_CAMPAIGN');
      platform = platform || c.platform;
    }
    const [r] = await pool.query(
      `INSERT INTO ad_fund_transactions (client_id, campaign_id, txn_type, txn_date, amount, platform, payment_mode, reference, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [clientId, campaignId || null, txnType, txnDate || todayIst(), round2(amount), platform || null, paymentMode || null, reference || null, notes || null, actor.id]
    );
    await audit(actor, `adfund.${txnType}`, 'ad_fund_transaction', r.insertId, { clientId, amount }, req);
    return { id: r.insertId, balance: await this.balance(clientId) };
  }

  /** Daily spend for several campaigns of one client in one go. */
  static async recordDailySpend({ clientId, txnDate, entries }, actor, req) {
    await this.#assertClient(clientId);
    const rows = entries.filter((e) => Number(e.amount) > 0);
    if (!rows.length) throw httpError(400, 'Enter at least one amount', 'NO_ENTRIES');
    const [camps] = await pool.query('SELECT id, platform FROM ad_campaigns WHERE client_id = ?', [clientId]);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const e of rows) {
        const c = camps.find((x) => x.id === Number(e.campaignId));
        if (e.campaignId && !c) throw httpError(400, 'A campaign does not belong to this client', 'INVALID_CAMPAIGN');
        await conn.query(
          `INSERT INTO ad_fund_transactions (client_id, campaign_id, txn_type, txn_date, amount, platform, notes, created_by)
           VALUES (?, ?, 'spend', ?, ?, ?, ?, ?)`,
          [clientId, e.campaignId || null, txnDate || todayIst(), round2(e.amount), c?.platform || e.platform || null, e.notes || null, actor.id]
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    await audit(actor, 'adfund.daily_spend', 'client', clientId, { count: rows.length, total: round2(rows.reduce((a, e) => a + Number(e.amount), 0)) }, req);
    return { recorded: rows.length, balance: await this.balance(clientId) };
  }

  static async removeTxn(id, actor, req) {
    const [[t]] = await pool.query('SELECT * FROM ad_fund_transactions WHERE id = ?', [id]);
    if (!t) throw httpError(404, 'Entry not found', 'NOT_FOUND');
    if (t.txn_type === 'deposit') {
      const bal = await this.balance(t.client_id);
      if (round2(bal - Number(t.amount)) < 0) throw httpError(409, 'Removing this deposit would make the wallet negative. Remove or correct the later spend first.', 'WOULD_GO_NEGATIVE');
    }
    await pool.query('DELETE FROM ad_fund_transactions WHERE id = ?', [id]);
    await audit(actor, 'adfund.delete', 'ad_fund_transaction', id, { type: t.txn_type, amount: Number(t.amount), clientId: t.client_id }, req);
    return { deleted: true, balance: await this.balance(t.client_id) };
  }

  // ───────────── campaigns ─────────────

  static async campaigns({ clientId } = {}) {
    const [rows] = await pool.query(
      `SELECT a.*, COALESCE(c.company_name, c.name) AS client_name,
              (SELECT COALESCE(SUM(t.amount), 0) FROM ad_fund_transactions t WHERE t.campaign_id = a.id AND t.txn_type = 'spend') AS total_spend
       FROM ad_campaigns a JOIN clients c ON c.id = a.client_id ${clientId ? 'WHERE a.client_id = ?' : ''} ORDER BY a.status, client_name, a.name`,
      clientId ? [Number(clientId)] : []
    );
    return rows.map((r) => ({ ...r, daily_budget: Number(r.daily_budget), total_spend: Number(r.total_spend), start_date: dstr(r.start_date) }));
  }

  static async saveCampaign(id, d, actor, req) {
    await this.#assertClient(d.clientId);
    if (id) {
      await pool.query('UPDATE ad_campaigns SET client_id = ?, name = ?, platform = ?, daily_budget = ?, status = ?, start_date = ?, notes = ? WHERE id = ?',
        [d.clientId, d.name.trim(), d.platform, round2(d.dailyBudget || 0), d.status || 'active', d.startDate || null, d.notes || null, id]);
    } else {
      const [r] = await pool.query(
        'INSERT INTO ad_campaigns (client_id, name, platform, daily_budget, status, start_date, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [d.clientId, d.name.trim(), d.platform, round2(d.dailyBudget || 0), d.status || 'active', d.startDate || todayIst(), d.notes || null, actor.id]
      );
      id = r.insertId;
    }
    await audit(actor, 'adfund.campaign_save', 'ad_campaign', id, { name: d.name }, req);
    return (await this.campaigns({ clientId: d.clientId })).find((c) => c.id === Number(id));
  }

  static async removeCampaign(id, actor, req) {
    const [[c]] = await pool.query('SELECT id, name, (SELECT COUNT(*) FROM ad_fund_transactions t WHERE t.campaign_id = ad_campaigns.id) AS n FROM ad_campaigns WHERE id = ?', [id]);
    if (!c) throw httpError(404, 'Campaign not found', 'NOT_FOUND');
    if (Number(c.n) > 0) throw httpError(409, 'This campaign has spend on record. Mark it Ended instead.', 'HAS_SPEND');
    await pool.query('DELETE FROM ad_campaigns WHERE id = ?', [id]);
    await audit(actor, 'adfund.campaign_delete', 'ad_campaign', id, { name: c.name }, req);
    return { deleted: true };
  }

  /** Client statement for a period: opening balance, every movement, closing balance. */
  static async statement(clientId, { from, to }) {
    const client = await this.#assertClient(clientId);
    const start = from || '2000-01-01';
    const end = to || todayIst();
    const [[open]] = await pool.query(`SELECT ${this.#balanceSql()} AS bal FROM ad_fund_transactions t WHERE t.client_id = ? AND t.txn_date < ?`, [clientId, start]);
    const rows = (await this.transactions({ clientId, period: 'custom', from: start, to: end })).reverse();
    let running = round2(open.bal);
    const lines = rows.map((r) => {
      const delta = r.txn_type === 'deposit' ? r.amount : r.txn_type === 'adjustment' ? r.amount : -r.amount;
      running = round2(running + delta);
      return { ...r, delta, running };
    });
    const sum = (t) => round2(rows.filter((r) => r.txn_type === t).reduce((a, r) => a + r.amount, 0));
    const [[agency]] = await pool.query('SELECT agency_name, gstin, phone, email, address, city FROM agency_settings WHERE id = 1');
    const wallet = (await this.wallets()).find((w) => w.client_id === Number(clientId)) || null;
    return {
      client, agency, from: start, to: end, opening: round2(open.bal), closing: running, lines,
      settings: await this.settings(clientId),
      dues: wallet ? { owed: wallet.owed, owed_since: wallet.owed_since, due_date: wallet.due_date, overdue_days: wallet.overdue_days, health: wallet.health } : null,
      totals: { deposits: sum('deposit'), spend: sum('spend'), refunds: sum('refund'), adjustments: sum('adjustment') }
    };
  }
}
