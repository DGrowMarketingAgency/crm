import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { WorkflowEngineService } from '../automation/workflow-engine.service.js';
import bcrypt from 'bcrypt';


export const LIFECYCLE_STAGES = [
  { stage: 'lead', label: 'Lead / Opportunity', owner: 'BD Executive', exitCriteria: 'Lead qualified with budget and scope alignment.' },
  { stage: 'qualified', label: 'Qualified', owner: 'BD Executive / AM', exitCriteria: 'Requirements assessed and feasibility confirmed.' },
  { stage: 'proposal', label: 'Proposal / Discussion', owner: 'Account Manager', exitCriteria: 'Proposal submitted and under client review.' },
  { stage: 'won', label: 'Won', owner: 'Account Manager / Owner', exitCriteria: 'Contract approved; ready for formal onboarding.' },
  { stage: 'onboarding', label: 'Onboarding', owner: 'Account Manager', exitCriteria: 'Checklist completed, assets secured, services configured.' },
  { stage: 'active', label: 'Active', owner: 'Account Manager + Production', exitCriteria: 'Ongoing service deliverables, projects, and reporting active.' },
  { stage: 'paused', label: 'Paused', owner: 'Account Manager', exitCriteria: 'Temporarily on hold pending client feedback or billing.' },
  { stage: 'offboarded', label: 'Completed / Offboarded', owner: 'Account Manager / Owner', exitCriteria: 'Engagement concluded or formally offboarded.' }
];

// Mapping for backward-compatibility with L0-L6
const STAGE_COMPAT_MAP = {
  'L0': 'lead',
  'L1': 'onboarding',
  'L2': 'active',
  'L3': 'active',
  'L4': 'active',
  'L5': 'active',
  'L6': 'offboarded'
};

export class ClientsService {
  /**
   * Helper to verify if user has global administrative visibility
   */
  static isGlobalViewer(user) {
    if (!user) return false;
    if (user.is_owner) return true;
    const slugs = user.roles?.map((r) => r.slug) || [];
    return slugs.includes('owner') || slugs.includes('admin') || slugs.includes('leadership');
  }

  /**
   * Helper to record client activity log
   */
  static async logActivity(clientId, actorId, activityType, title, description = null, metadata = null) {
    try {
      await pool.query(
        `INSERT INTO client_activity_logs (client_id, actor_id, activity_type, title, description, metadata)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [clientId, actorId || null, activityType, title, description || null, metadata ? JSON.stringify(metadata) : null]
      );
    } catch (err) {
      console.error('Failed to log client activity:', err.message);
    }
  }

  /**
   * Generates a unique client code (e.g. CLT-2026-001)
   */
  static async generateClientCode() {
    const prefix = 'CLT';
    const year = new Date().getFullYear();
    const [rows] = await pool.query('SELECT COUNT(*) as count FROM clients');
    const count = Number(rows[0].count) + 1;
    const pad = String(count).padStart(3, '0');
    let code = `${prefix}-${year}-${pad}`;

    const [existing] = await pool.query('SELECT id FROM clients WHERE client_code = ?', [code]);
    if (existing.length > 0) {
      const rand = Math.floor(1000 + Math.random() * 9000);
      code = `${prefix}-${year}-${rand}`;
    }
    return code;
  }

  /**
   * Initializes standard 8 onboarding checklist items for a client
   */
  static async initializeOnboardingChecklist(clientId, defaultOwnerId = null) {
    const defaultItems = [
      { key: 'req_collected', title: 'Client requirements collected', desc: 'Gather initial scope, business objectives, and brand guidelines.', order: 1 },
      { key: 'contact_verified', title: 'Main contact verified', desc: 'Verify primary stakeholder contact info, communication channels, and availability.', order: 2 },
      { key: 'am_assigned', title: 'Account Manager assigned', desc: 'Designate dedicated internal Account Manager to head client relationship.', order: 3 },
      { key: 'contract_recorded', title: 'Contract or proposal recorded', desc: 'Upload and record signed agreement, quotation, or service SLA.', order: 4 },
      { key: 'scope_confirmed', title: 'Service scope confirmed', desc: 'Confirm department workflows, deliverables frequency, and deadlines.', order: 5 },
      { key: 'assets_collected', title: 'Required assets and access collected', desc: 'Secure branding assets, credentials, portal access, and accounts.', order: 6 },
      { key: 'channel_established', title: 'Communication channel established', desc: 'Set up WhatsApp group, Slack connect, email loop, or dashboard portal.', order: 7 },
      { key: 'initial_service_planned', title: 'Initial project or service planned', desc: 'Map out kickoff sprint, first month deliverable schedule, and milestones.', order: 8 }
    ];

    for (const item of defaultItems) {
      const [existing] = await pool.query(
        'SELECT id FROM client_onboarding_items WHERE client_id = ? AND item_key = ?',
        [clientId, item.key]
      );
      if (existing.length === 0) {
        await pool.query(
          `INSERT INTO client_onboarding_items (client_id, item_key, title, description, owner_user_id, display_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [clientId, item.key, item.title, item.desc, defaultOwnerId || null, item.order]
        );
      }
    }
  }

  /**
   * Retrieves paginated client list with D-Grow fields and RBAC/AM isolation
   */
  static async listClients(
    {
      search = '',
      status = '',
      entity = '',
      vertical = '',
      lifecycleStage = '',
      accountManagerId = '',
      industry = '',
      service = '',
      sortBy = 'name',
      sortOrder = 'ASC',
      limit = 50,
      offset = 0
    },
    actorUser = null
  ) {
    const params = [];
    const whereClauses = [];

    // Account Manager isolation check (PDF Section 3.2):
    // AM only sees clients where clients.account_manager_id = current_user.id
    if (actorUser && !this.isGlobalViewer(actorUser)) {
      const userSlugs = actorUser.roles?.map((r) => r.slug) || [];
      const isClientRole = userSlugs.includes('client') || actorUser.client_id;
      const isAM = userSlugs.includes('account-manager') || actorUser.role === 'account_manager';

      if (isClientRole) {
        whereClauses.push('(c.id = ? OR c.user_id = ?)');
        params.push(actorUser.client_id || 0, actorUser.id);
      } else if (isAM) {
        whereClauses.push('c.account_manager_id = ?');
        params.push(actorUser.id);
      }
    }

    if (search.trim()) {
      whereClauses.push(`(
        c.name LIKE ? OR 
        c.client_code LIKE ? OR 
        c.email LIKE ? OR 
        c.company_name LIKE ? OR 
        EXISTS (SELECT 1 FROM client_contacts cc WHERE cc.client_id = c.id AND (cc.name LIKE ? OR cc.email LIKE ?))
      )`);
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s, s, s);
    }

    if (status.trim()) {
      whereClauses.push('c.status = ?');
      params.push(status.trim());
    }

    if (entity.trim()) {
      whereClauses.push('c.entity = ?');
      params.push(entity.trim());
    }

    if (vertical.trim()) {
      whereClauses.push('c.vertical = ?');
      params.push(vertical.trim());
    }

    if (industry.trim()) {
      whereClauses.push('c.industry = ?');
      params.push(industry.trim());
    }

    if (lifecycleStage.trim()) {
      whereClauses.push('(c.lifecycle_stage = ? OR c.status = ?)');
      params.push(lifecycleStage.trim(), lifecycleStage.trim());
    }

    if (accountManagerId) {
      whereClauses.push('c.account_manager_id = ?');
      params.push(Number(accountManagerId));
    }

    if (service.trim()) {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM service_instances si 
        WHERE si.client_id = c.id AND (si.label LIKE ? OR si.service_type LIKE ?)
      )`);
      params.push(`%${service.trim()}%`, `%${service.trim()}%`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM clients c ${whereSql}`,
      params
    );
    const total = Number(countRows[0].total);

    // Validate sort column
    const allowedSort = {
      name: 'c.name',
      created_at: 'c.created_at',
      updated_at: 'c.updated_at',
      lifecycle_stage: 'c.lifecycle_stage',
      client_code: 'c.client_code'
    };
    const orderCol = allowedSort[sortBy] || 'c.name';
    const orderDir = String(sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const [clients] = await pool.query(
      `SELECT c.*,
              u.name as portal_user_name, u.email as portal_user_email,
              am.name as account_manager_name, am.email as account_manager_email,
              ob.name as onboarding_owner_name,
              (SELECT cc.name FROM client_contacts cc WHERE cc.client_id = c.id AND cc.is_primary = TRUE LIMIT 1) as primary_contact_name,
              (SELECT cc.email FROM client_contacts cc WHERE cc.client_id = c.id AND cc.is_primary = TRUE LIMIT 1) as primary_contact_email,
              (SELECT cc.phone FROM client_contacts cc WHERE cc.client_id = c.id AND cc.is_primary = TRUE LIMIT 1) as primary_contact_phone,
              (SELECT cc.designation FROM client_contacts cc WHERE cc.client_id = c.id AND cc.is_primary = TRUE LIMIT 1) as primary_contact_designation,
              COUNT(DISTINCT si.id) as bundled_services_count,
              COUNT(DISTINCT p.id) as project_count,
              (
                SELECT COUNT(*) FROM client_onboarding_items coi 
                WHERE coi.client_id = c.id AND coi.is_completed = TRUE
              ) as completed_onboarding_count,
              (
                SELECT COUNT(*) FROM client_onboarding_items coi 
                WHERE coi.client_id = c.id
              ) as total_onboarding_count
       FROM clients c
       LEFT JOIN users u ON c.user_id = u.id
       LEFT JOIN users am ON c.account_manager_id = am.id
       LEFT JOIN users ob ON c.onboarding_owner_id = ob.id
       LEFT JOIN service_instances si ON c.id = si.client_id AND si.status = 'active'
       LEFT JOIN projects p ON c.id = p.client_id
       ${whereSql}
       GROUP BY c.id
       ORDER BY ${orderCol} ${orderDir}
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );

    return {
      clients: clients.map((c) => {
        const totalItems = Number(c.total_onboarding_count || 0);
        const completedItems = Number(c.completed_onboarding_count || 0);
        const onboardingProgress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
        return {
          ...c,
          bundled_services_count: Number(c.bundled_services_count || 0),
          project_count: Number(c.project_count || 0),
          onboarding_progress: onboardingProgress
        };
      }),
      total,
      limit: Number(limit),
      offset: Number(offset)
    };
  }

  /**
   * Retrieves real-time Client Management Dashboard stats
   */
  static async getDashboardStats(actorUser = null) {
    const params = [];
    let scopeWhere = '';

    // AM Isolation in dashboard statistics
    if (actorUser && !this.isGlobalViewer(actorUser)) {
      const userSlugs = actorUser.roles?.map((r) => r.slug) || [];
      const isClientRole = userSlugs.includes('client') || actorUser.client_id;
      const isAM = userSlugs.includes('account-manager') || actorUser.role === 'account_manager';

      if (isClientRole) {
        scopeWhere = 'WHERE (c.id = ? OR c.user_id = ?)';
        params.push(actorUser.client_id || 0, actorUser.id);
      } else if (isAM) {
        scopeWhere = 'WHERE c.account_manager_id = ?';
        params.push(actorUser.id);
      }
    }

    // 1. Overall counts
    const [overallRows] = await pool.query(`
      SELECT 
        COUNT(*) as total_clients,
        SUM(CASE WHEN c.status = 'active' THEN 1 ELSE 0 END) as active_clients,
        SUM(CASE WHEN c.status = 'paused' OR c.lifecycle_stage = 'paused' THEN 1 ELSE 0 END) as paused_clients,
        SUM(CASE WHEN c.status = 'onboarding' OR c.lifecycle_stage IN ('onboarding', 'L1') THEN 1 ELSE 0 END) as onboarding_clients,
        SUM(CASE WHEN c.status = 'offboarded' OR c.lifecycle_stage IN ('completed', 'offboarded', 'L6') THEN 1 ELSE 0 END) as offboarded_clients,
        SUM(CASE 
          WHEN (
            c.gstin IS NULL OR c.gstin = '' OR 
            c.billing_address IS NULL OR c.billing_address = '' OR
            EXISTS (
              SELECT 1 FROM client_onboarding_items coi 
              WHERE coi.client_id = c.id AND coi.is_completed = FALSE AND coi.due_date < CURDATE()
            )
          ) THEN 1 ELSE 0 
        END) as awaiting_info_clients
      FROM clients c
      ${scopeWhere}
    `, params);

    const stats = overallRows[0] || {};

    // 2. Grouped by Account Manager
    const [byAmRows] = await pool.query(`
      SELECT 
        COALESCE(am.id, 0) as account_manager_id,
        COALESCE(am.name, 'Unassigned') as account_manager_name,
        COALESCE(am.email, '') as account_manager_email,
        COUNT(c.id) as client_count,
        SUM(CASE WHEN c.status = 'active' THEN 1 ELSE 0 END) as active_count
      FROM clients c
      LEFT JOIN users am ON c.account_manager_id = am.id
      ${scopeWhere}
      GROUP BY am.id, am.name, am.email
      ORDER BY client_count DESC
    `, params);

    // 3. Grouped by Lifecycle Stage
    const [byStageRows] = await pool.query(`
      SELECT 
        c.lifecycle_stage,
        COUNT(c.id) as count
      FROM clients c
      ${scopeWhere}
      GROUP BY c.lifecycle_stage
      ORDER BY count DESC
    `, params);

    // 4. Recently added clients (last 5)
    const [recentlyAdded] = await pool.query(`
      SELECT 
        c.id, c.name, c.client_code, c.company_name, c.lifecycle_stage, c.status,
        c.created_at, am.name as account_manager_name
      FROM clients c
      LEFT JOIN users am ON c.account_manager_id = am.id
      ${scopeWhere}
      ORDER BY c.created_at DESC
      LIMIT 5
    `, params);

    // 5. Upcoming milestones / contract renewals (within next 60 days)
    const [upcomingRenewals] = await pool.query(`
      SELECT 
        c.id, c.name, c.client_code, c.company_name, c.contract_end_date,
        DATEDIFF(c.contract_end_date, CURDATE()) as days_remaining,
        am.name as account_manager_name
      FROM clients c
      LEFT JOIN users am ON c.account_manager_id = am.id
      ${scopeWhere ? `${scopeWhere} AND` : 'WHERE'} c.contract_end_date >= CURDATE() 
        AND c.contract_end_date <= DATE_ADD(CURDATE(), INTERVAL 60 DAY)
      ORDER BY c.contract_end_date ASC
      LIMIT 5
    `, params);

    return {
      totalClients: Number(stats.total_clients || 0),
      activeClients: Number(stats.active_clients || 0),
      onboardingClients: Number(stats.onboarding_clients || 0),
      pausedClients: Number(stats.paused_clients || 0),
      awaitingInfoClients: Number(stats.awaiting_info_clients || 0),
      offboardedClients: Number(stats.offboarded_clients || 0),
      byAccountManager: byAmRows.map(r => ({
        accountManagerId: r.account_manager_id ? Number(r.account_manager_id) : null,
        accountManagerName: r.account_manager_name,
        accountManagerEmail: r.account_manager_email,
        clientCount: Number(r.client_count),
        activeCount: Number(r.active_count)
      })),
      byLifecycleStage: byStageRows.map(r => ({
        stage: r.lifecycle_stage,
        count: Number(r.count)
      })),
      recentlyAdded,
      upcomingRenewals: upcomingRenewals.map(r => ({
        ...r,
        days_remaining: Number(r.days_remaining)
      }))
    };
  }

  /**
   * Retrieves single client details
   */
  static async getClientById(clientId, actorUser = null) {
    const [rows] = await pool.query(
      `SELECT c.*,
              u.name as portal_user_name, u.email as portal_user_email,
              am.name as account_manager_name, am.email as account_manager_email,
              ob.name as onboarding_owner_name, ob.email as onboarding_owner_email,
              COUNT(DISTINCT si.id) as bundled_services_count,
              COUNT(DISTINCT p.id) as project_count
       FROM clients c
       LEFT JOIN users u ON c.user_id = u.id
       LEFT JOIN users am ON c.account_manager_id = am.id
       LEFT JOIN users ob ON c.onboarding_owner_id = ob.id
       LEFT JOIN service_instances si ON c.id = si.client_id AND si.status = 'active'
       LEFT JOIN projects p ON c.id = p.client_id
       WHERE c.id = ?
       GROUP BY c.id`,
      [clientId]
    );

    if (rows.length === 0) {
      const error = new Error('Client not found');
      error.status = 404;
      error.code = 'CLIENT_NOT_FOUND';
      throw error;
    }

    const client = rows[0];

    // Access check
    if (actorUser && !this.isGlobalViewer(actorUser)) {
      const userSlugs = actorUser.roles?.map((r) => r.slug) || [];
      const isClientRole = userSlugs.includes('client') || actorUser.client_id;
      const isAM = userSlugs.includes('account-manager');

      if (isClientRole && Number(client.id) !== Number(actorUser.client_id) && Number(client.user_id) !== Number(actorUser.id)) {
        const error = new Error('Access denied to this client');
        error.status = 403;
        error.code = 'CLIENT_ACCESS_DENIED';
        throw error;
      }

      if (isAM && client.account_manager_id && Number(client.account_manager_id) !== Number(actorUser.id)) {
        const error = new Error('Access denied to client assigned to another Account Manager');
        error.status = 403;
        error.code = 'CLIENT_ACCESS_DENIED';
        throw error;
      }
    }

    // Fetch primary contact
    const [pContacts] = await pool.query(
      'SELECT * FROM client_contacts WHERE client_id = ? AND is_primary = TRUE LIMIT 1',
      [clientId]
    );

    return {
      ...client,
      primary_contact: pContacts[0] || null,
      bundled_services_count: Number(client.bundled_services_count || 0),
      project_count: Number(client.project_count || 0)
    };
  }

  /**
   * Creates a client profile with D-Grow OS fields
   */
  static async createClient(data, actorUser, req = null) {
    const {
      name,
      email,
      clientCode = null,
      entity = 'D-Grow',
      vertical = 'General',
      lifecycleStage = 'onboarding',
      accountManagerId = null,
      onboardingOwnerId = null,
      companyName = null,
      industry = null,
      website = null,
      phone = null,
      address = null,
      city = null,
      country = 'India',
      billingAddress = null,
      gstin = null,
      requirementsNotes = null,
      communicationPreferences = null,
      contractStartDate = null,
      contractEndDate = null,
      status = 'active',
      userId = null,
      primaryContact = null,
      createPortalLogin = true,
      portalPassword = null,
      portalEmail = null
    } = data;

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();


    // Check unique email
    const [existingEmail] = await pool.query('SELECT id FROM clients WHERE email = ?', [trimmedEmail]);
    if (existingEmail.length > 0) {
      const error = new Error('A client with this email already exists');
      error.status = 409;
      error.code = 'CLIENT_EMAIL_EXISTS';
      throw error;
    }

    // Handle Client Code
    let finalCode = clientCode ? clientCode.trim() : await this.generateClientCode();
    const [existingCode] = await pool.query('SELECT id FROM clients WHERE client_code = ?', [finalCode]);
    if (existingCode.length > 0) {
      if (clientCode) {
        const error = new Error(`Client code '${finalCode}' is already in use`);
        error.status = 409;
        error.code = 'CLIENT_CODE_EXISTS';
        throw error;
      }
      finalCode = await this.generateClientCode();
    }

    if (userId) {
      const [userCheck] = await pool.query('SELECT id FROM users WHERE id = ?', [userId]);
      if (userCheck.length === 0) {
        const error = new Error('Selected portal user does not exist');
        error.status = 400;
        error.code = 'INVALID_PORTAL_USER';
        throw error;
      }
    }

    if (accountManagerId) {
      const [amCheck] = await pool.query('SELECT id FROM users WHERE id = ?', [accountManagerId]);
      if (amCheck.length === 0) {
        const error = new Error('Selected account manager does not exist');
        error.status = 400;
        error.code = 'INVALID_ACCOUNT_MANAGER';
        throw error;
      }
    }

    const [result] = await pool.query(
      `INSERT INTO clients (
        name, client_code, email, entity, vertical, lifecycle_stage, account_manager_id, onboarding_owner_id,
        company_name, industry, website, phone, address, city, country, billing_address, gstin,
        requirements_notes, communication_preferences, contract_start_date, contract_end_date,
        status, user_id, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        trimmedName,
        finalCode,
        trimmedEmail,
        entity,
        vertical,
        lifecycleStage,
        accountManagerId || null,
        onboardingOwnerId || null,
        companyName || null,
        industry || null,
        website || null,
        phone || null,
        address || null,
        city || null,
        country || 'India',
        billingAddress || null,
        gstin || null,
        requirementsNotes || null,
        communicationPreferences ? JSON.stringify(communicationPreferences) : null,
        contractStartDate || null,
        contractEndDate || null,
        status,
        userId || null,
        actorUser.id
      ]
    );

    const newClientId = result.insertId;

    // If userId was provided, link users.client_id
    if (userId) {
      await pool.query('UPDATE users SET client_id = ? WHERE id = ?', [newClientId, userId]);
    }

    // Auto-create Primary Contact record
    const contactName = primaryContact?.name || trimmedName;
    const contactEmail = primaryContact?.email ? primaryContact.email.trim().toLowerCase() : trimmedEmail;
    const contactPhone = primaryContact?.phone || phone || null;
    const contactDesignation = primaryContact?.designation || 'Primary Contact';

    await pool.query(
      `INSERT INTO client_contacts (client_id, name, designation, email, phone, is_primary, status, user_id)
       VALUES (?, ?, ?, ?, ?, TRUE, 'active', ?)`,
      [newClientId, contactName, contactDesignation, contactEmail, contactPhone, userId || null]
    );

    // Auto-create client portal user account if requested or password provided
    let portalAccountCreated = null;
    const wantsPortal = createPortalLogin !== false && (portalPassword || createPortalLogin);

    if (wantsPortal) {
      const loginEmail = (portalEmail || contactEmail || trimmedEmail).trim().toLowerCase();
      const rawPassword = portalPassword?.trim() || `Client@${Math.floor(1000 + Math.random() * 9000)}`;

      // Check if user already exists
      const [existingUser] = await pool.query('SELECT id, role, client_id FROM users WHERE email = ?', [loginEmail]);

      let finalUserId = null;

      if (existingUser.length > 0) {
        const u = existingUser[0];
        const passwordHash = await bcrypt.hash(rawPassword, 10);
        await pool.query(
          `UPDATE users 
           SET client_id = ?, password_hash = ?, status = 'active', role = 'client' 
           WHERE id = ?`,
          [newClientId, passwordHash, u.id]
        );
        finalUserId = u.id;
      } else {
        const passwordHash = await bcrypt.hash(rawPassword, 10);
        const [userInsert] = await pool.query(
          `INSERT INTO users (name, email, password_hash, role, client_id, status, must_change_password)
           VALUES (?, ?, ?, 'client', ?, 'active', FALSE)`,
          [contactName || trimmedName, loginEmail, passwordHash, newClientId]
        );
        finalUserId = userInsert.insertId;

        // Assign 'client' role in user_roles
        const [clientRole] = await pool.query("SELECT id FROM roles WHERE slug = 'client'");
        if (clientRole.length > 0) {
          await pool.query(
            "INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)",
            [finalUserId, clientRole[0].id]
          );
        }
      }

      // Link client & contact to this portal user
      await pool.query('UPDATE clients SET user_id = ? WHERE id = ?', [finalUserId, newClientId]);
      await pool.query('UPDATE client_contacts SET user_id = ? WHERE client_id = ? AND is_primary = TRUE', [finalUserId, newClientId]);

      portalAccountCreated = {
        userId: finalUserId,
        email: loginEmail,
        password: rawPassword,
        role: 'client'
      };
    }

    // Initialize onboarding checklist
    await this.initializeOnboardingChecklist(newClientId, onboardingOwnerId || accountManagerId || actorUser.id);

    // Record initial AM in history if assigned
    if (accountManagerId) {
      await pool.query(
        `INSERT INTO account_manager_history (client_id, previous_manager_id, new_manager_id, assigned_by, reason)
         VALUES (?, NULL, ?, ?, 'Initial client creation assignment')`,
        [newClientId, accountManagerId, actorUser.id]
      );
    }

    // Log Activity
    await this.logActivity(
      newClientId,
      actorUser.id,
      'client_created',
      'Client Created',
      `Client record created with code ${finalCode} by ${actorUser.name || 'User'}`,
      { clientCode: finalCode, lifecycleStage, accountManagerId, hasPortalLogin: !!portalAccountCreated }
    );

    await AuditService.log({
      actorUserId: actorUser.id,
      action: 'client.created',
      targetType: 'client',
      targetId: newClientId,
      details: { 
        name: trimmedName, 
        clientCode: finalCode, 
        email: trimmedEmail, 
        entity, 
        vertical, 
        lifecycleStage,
        portalLoginCreated: !!portalAccountCreated 
      },
      req
    });

    const clientRecord = await this.getClientById(newClientId);
    return {
      ...clientRecord,
      portalAccount: portalAccountCreated
    };
  }

  /**
   * Creates or resets client portal login credentials
   */
  static async createOrResetPortalAccount(clientId, data, actorUser, req = null) {
    const client = await this.getClientById(clientId, actorUser);
    const { email: customEmail, password } = data;
    const loginEmail = (customEmail || client.email).trim().toLowerCase();
    const rawPassword = password?.trim() || `Client@${Math.floor(1000 + Math.random() * 9000)}`;

    const [existingUser] = await pool.query('SELECT id, role, client_id FROM users WHERE email = ?', [loginEmail]);
    let finalUserId = null;
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    if (existingUser.length > 0) {
      finalUserId = existingUser[0].id;
      await pool.query(
        `UPDATE users 
         SET client_id = ?, password_hash = ?, status = 'active', role = 'client' 
         WHERE id = ?`,
        [clientId, passwordHash, finalUserId]
      );
    } else {
      const [insertRes] = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, client_id, status, must_change_password)
         VALUES (?, ?, ?, 'client', ?, 'active', FALSE)`,
        [client.name, loginEmail, passwordHash, clientId]
      );
      finalUserId = insertRes.insertId;

      const [clientRole] = await pool.query("SELECT id FROM roles WHERE slug = 'client'");
      if (clientRole.length > 0) {
        await pool.query(
          "INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)",
          [finalUserId, clientRole[0].id]
        );
      }
    }

    await pool.query('UPDATE clients SET user_id = ? WHERE id = ?', [finalUserId, clientId]);
    await pool.query('UPDATE client_contacts SET user_id = ? WHERE client_id = ? AND is_primary = TRUE', [finalUserId, clientId]);

    await AuditService.log({
      actorUserId: actorUser.id,
      action: 'client.portal_credentials_set',
      targetType: 'client',
      targetId: clientId,
      details: { email: loginEmail },
      req
    });

    return {
      success: true,
      portalAccount: {
        userId: finalUserId,
        email: loginEmail,
        password: rawPassword,
        role: 'client'
      }
    };
  }


  /**
   * Updates an existing client profile
   */
  static async updateClient(clientId, data, actorUser, req = null) {
    const client = await this.getClientById(clientId, actorUser);

    const newEmail = data.email ? data.email.trim().toLowerCase() : client.email;
    if (newEmail !== client.email) {
      const [emailCheck] = await pool.query(
        'SELECT id FROM clients WHERE email = ? AND id != ?',
        [newEmail, clientId]
      );
      if (emailCheck.length > 0) {
        const error = new Error('Another client with this email already exists');
        error.status = 409;
        error.code = 'CLIENT_EMAIL_EXISTS';
        throw error;
      }
    }

    if (data.clientCode && data.clientCode.trim() !== client.client_code) {
      const [codeCheck] = await pool.query(
        'SELECT id FROM clients WHERE client_code = ? AND id != ?',
        [data.clientCode.trim(), clientId]
      );
      if (codeCheck.length > 0) {
        const error = new Error('Another client with this code already exists');
        error.status = 409;
        error.code = 'CLIENT_CODE_EXISTS';
        throw error;
      }
    }

    const newName = data.name ? data.name.trim() : client.name;
    const newCode = data.clientCode ? data.clientCode.trim() : client.client_code;
    const newEntity = data.entity || client.entity;
    const newVertical = data.vertical || client.vertical;
    const newLifecycleStage = data.lifecycleStage || client.lifecycle_stage;
    const newAmId = data.accountManagerId !== undefined ? data.accountManagerId : client.account_manager_id;
    const newObId = data.onboardingOwnerId !== undefined ? data.onboardingOwnerId : client.onboarding_owner_id;
    const newCompany = data.companyName !== undefined ? data.companyName : client.company_name;
    const newIndustry = data.industry !== undefined ? data.industry : client.industry;
    const newWebsite = data.website !== undefined ? data.website : client.website;
    const newPhone = data.phone !== undefined ? data.phone : client.phone;
    const newAddress = data.address !== undefined ? data.address : client.address;
    const newCity = data.city !== undefined ? data.city : client.city;
    const newCountry = data.country !== undefined ? data.country : client.country;
    const newBillingAddress = data.billingAddress !== undefined ? data.billingAddress : client.billing_address;
    const newGstin = data.gstin !== undefined ? data.gstin : client.gstin;
    const newReqNotes = data.requirementsNotes !== undefined ? data.requirementsNotes : client.requirements_notes;
    let newCommPrefs = null;
    if (data.communicationPreferences !== undefined) {
      newCommPrefs = data.communicationPreferences ? JSON.stringify(data.communicationPreferences) : null;
    } else if (client.communication_preferences !== undefined && client.communication_preferences !== null) {
      newCommPrefs = typeof client.communication_preferences === 'object'
        ? JSON.stringify(client.communication_preferences)
        : client.communication_preferences;
    }
    const newStart = data.contractStartDate !== undefined ? data.contractStartDate : client.contract_start_date;
    const newEnd = data.contractEndDate !== undefined ? data.contractEndDate : client.contract_end_date;
    const newStatus = data.status || client.status;
    const newUserId = data.userId !== undefined ? data.userId : client.user_id;

    if (newUserId) {
      const [userCheck] = await pool.query('SELECT id FROM users WHERE id = ?', [newUserId]);
      if (userCheck.length === 0) {
        const error = new Error('Selected portal user does not exist');
        error.status = 400;
        error.code = 'INVALID_PORTAL_USER';
        throw error;
      }
      await pool.query('UPDATE users SET client_id = ? WHERE id = ?', [clientId, newUserId]);
    }

    // Check if AM changed
    if (newAmId && Number(newAmId) !== Number(client.account_manager_id)) {
      await this.assignAccountManager(clientId, { accountManagerId: newAmId, reason: 'Updated via client edit form' }, actorUser, req);
    }

    await pool.query(
      `UPDATE clients
       SET name = ?, client_code = ?, email = ?, entity = ?, vertical = ?, lifecycle_stage = ?,
           company_name = ?, industry = ?, website = ?, phone = ?, address = ?, city = ?, country = ?,
           billing_address = ?, gstin = ?, requirements_notes = ?, communication_preferences = ?,
           onboarding_owner_id = ?, contract_start_date = ?, contract_end_date = ?, status = ?, user_id = ?
       WHERE id = ?`,
      [
        newName, newCode, newEmail, newEntity, newVertical, newLifecycleStage,
        newCompany, newIndustry, newWebsite, newPhone, newAddress, newCity, newCountry,
        newBillingAddress, newGstin, newReqNotes, newCommPrefs,
        newObId || null, newStart || null, newEnd || null, newStatus, newUserId || null, clientId
      ]
    );

    await this.logActivity(
      clientId,
      actorUser.id,
      'client_updated',
      'Client Information Updated',
      `Details updated by ${actorUser.name || 'User'}`
    );

    await AuditService.log({
      actorUserId: actorUser.id,
      action: 'client.updated',
      targetType: 'client',
      targetId: clientId,
      details: {
        previous: { name: client.name, email: client.email, lifecycleStage: client.lifecycle_stage },
        updated: { name: newName, email: newEmail, lifecycleStage: newLifecycleStage }
      },
      req
    });

    return this.getClientById(clientId);
  }

  /**
   * Retrieves client lifecycle status, stages, and active progress
   */
  static async getLifecycle(clientId, actorUser) {
    const client = await this.getClientById(clientId, actorUser);

    const [services] = await pool.query(
      `SELECT si.id, si.service_type, si.label, si.current_stage, si.status, si.stage_index,
              COUNT(DISTINCT t.id) as total_tasks,
              SUM(CASE WHEN t.column_status = 'done' OR t.status = 'completed' THEN 1 ELSE 0 END) as completed_tasks
       FROM service_instances si
       LEFT JOIN tasks t ON t.service_instance_id = si.id
       WHERE si.client_id = ?
       GROUP BY si.id`,
      [clientId]
    );

    const [coiRows] = await pool.query(
      `SELECT COUNT(*) as total_items,
              SUM(CASE WHEN is_completed = TRUE THEN 1 ELSE 0 END) as completed_items
       FROM client_onboarding_items
       WHERE client_id = ?`,
      [clientId]
    );
    const totalOnboarding = Number(coiRows[0]?.total_items || 0);
    const completedOnboarding = Number(coiRows[0]?.completed_items || 0);
    const onboardingProgress = totalOnboarding > 0 ? Math.round((completedOnboarding / totalOnboarding) * 100) : 0;

    // Normalizing lifecycle stage
    const currentStageKey = client.lifecycle_stage;
    const normalizedKey = STAGE_COMPAT_MAP[currentStageKey] || currentStageKey;

    const currentIdx = LIFECYCLE_STAGES.findIndex(s => s.stage === normalizedKey);

    return {
      client_id: client.id,
      client_name: client.name,
      client_code: client.client_code,
      current_stage: currentStageKey,
      normalized_stage: normalizedKey,
      client_status: client.status,
      onboarding_progress: onboardingProgress,
      offboarding_reason: client.offboarding_reason,
      offboarded_at: client.offboarded_at,
      account_manager: {
        id: client.account_manager_id,
        name: client.account_manager_name,
        email: client.account_manager_email
      },
      stages: LIFECYCLE_STAGES.map((s, idx) => ({
        ...s,
        is_current: s.stage === normalizedKey,
        is_completed: currentIdx >= 0 && idx < currentIdx
      })),
      services: services.map((s) => ({
        ...s,
        total_tasks: Number(s.total_tasks || 0),
        completed_tasks: Number(s.completed_tasks || 0)
      }))
    };
  }

  /**
   * Transitions client lifecycle stage
   */
  static async updateLifecycle(clientId, { stage, lifecycleStage, reason = null, notes = null }, actorUser, req = null) {
    const client = await this.getClientById(clientId, actorUser);
    const targetStage = stage || lifecycleStage;

    const validStages = [
      'L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6',
      'lead', 'qualified', 'proposal', 'won', 'onboarding', 'active', 'paused', 'completed', 'offboarded'
    ];
    if (!validStages.includes(targetStage)) {
      const error = new Error(`Invalid lifecycle stage: ${targetStage}`);
      error.status = 400;
      error.code = 'INVALID_LIFECYCLE_STAGE';
      throw error;
    }

    const previousStage = client.lifecycle_stage;

    // Determine status adjustment based on stage
    let nextStatus = client.status;
    let offboardingReason = client.offboarding_reason;
    let offboardedAt = client.offboarded_at;
    let offboardedBy = client.offboarded_by;

    if (targetStage === 'paused') {
      nextStatus = 'paused';
    } else if (targetStage === 'offboarded' || targetStage === 'completed' || targetStage === 'L6') {
      nextStatus = 'offboarded';
      offboardingReason = reason || notes || 'Client completed or offboarded';
      offboardedAt = new Date();
      offboardedBy = actorUser.id;
    } else if (targetStage === 'onboarding' || targetStage === 'L1') {
      nextStatus = 'onboarding';
      await this.initializeOnboardingChecklist(clientId, client.account_manager_id || actorUser.id);
    } else if (targetStage === 'active' || targetStage === 'L2' || targetStage === 'L3' || targetStage === 'L4' || targetStage === 'L5') {
      nextStatus = 'active';
    }

    await pool.query(
      `UPDATE clients 
       SET lifecycle_stage = ?, status = ?, offboarding_reason = ?, offboarded_at = ?, offboarded_by = ?
       WHERE id = ?`,
      [targetStage, nextStatus, offboardingReason, offboardedAt, offboardedBy, clientId]
    );

    // Activity logging
    await this.logActivity(
      clientId,
      actorUser.id,
      'lifecycle_transition',
      `Lifecycle Transition: ${previousStage} -> ${targetStage}`,
      reason ? `Reason: ${reason}` : (notes ? `Notes: ${notes}` : `Status transitioned by ${actorUser.name}`),
      { previousStage, newStage: targetStage, reason, notes, nextStatus }
    );

    await AuditService.log({
      actorUserId: actorUser.id,
      action: 'client.lifecycle_transition',
      targetType: 'client',
      targetId: clientId,
      details: { previousStage, newStage: targetStage, reason, nextStatus },
      req
    });

    return this.getLifecycle(clientId, actorUser);
  }

  /**
   * Retrieves list of eligible Account Managers
   */
  static async getEligibleAccountManagers() {
    const [rows] = await pool.query(`
      SELECT DISTINCT u.id, u.name, u.email, u.role, u.designation, u.status
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.status = 'active'
        AND (
          u.role IN ('account_manager', 'admin', 'owner')
          OR r.slug IN ('account-manager', 'admin', 'owner')
          OR u.is_owner = TRUE
        )
      ORDER BY u.name ASC
    `);
    return rows;
  }

  /**
   * Assigns or reassigns Account Manager to a client
   */
  static async assignAccountManager(clientId, { accountManagerId, reason = null }, actorUser, req = null) {
    const client = await this.getClientById(clientId, actorUser);

    const [amRows] = await pool.query('SELECT id, name, email FROM users WHERE id = ? AND status = "active"', [accountManagerId]);
    if (amRows.length === 0) {
      const error = new Error('Selected Account Manager does not exist or is inactive');
      error.status = 400;
      error.code = 'INVALID_ACCOUNT_MANAGER';
      throw error;
    }
    const newAm = amRows[0];
    const prevAmId = client.account_manager_id;

    // Update client record
    await pool.query('UPDATE clients SET account_manager_id = ? WHERE id = ?', [accountManagerId, clientId]);

    // Record in history table
    await pool.query(
      `INSERT INTO account_manager_history (client_id, previous_manager_id, new_manager_id, assigned_by, reason)
       VALUES (?, ?, ?, ?, ?)`,
      [clientId, prevAmId || null, accountManagerId, actorUser.id, reason || 'Account Manager updated']
    );

    // Notify newly assigned Account Manager
    if (Number(accountManagerId) !== Number(actorUser.id)) {
      try {
        await NotificationsService.createNotification({
          recipientUserId: accountManagerId,
          actorUserId: actorUser.id,
          type: 'client_assigned',
          title: 'New Client Assigned',
          message: `You have been assigned as the Account Manager for ${client.name} (${client.client_code || 'Client'}).`,
          entityType: 'client',
          entityId: clientId,
          actionUrl: `/clients/${clientId}`
        });
      } catch (notifErr) {
        console.warn('Failed to send notification on AM assignment:', notifErr.message);
      }
    }

    // Log Activity
    await this.logActivity(
      clientId,
      actorUser.id,
      'am_reassigned',
      'Account Manager Assigned',
      `Assigned to ${newAm.name} by ${actorUser.name}. ${reason ? `Reason: ${reason}` : ''}`,
      { previousManagerId: prevAmId, newManagerId: accountManagerId, reason }
    );

    await AuditService.log({
      actorUserId: actorUser.id,
      action: 'client.am_reassigned',
      targetType: 'client',
      targetId: clientId,
      details: { previousManagerId: prevAmId, newManagerId: accountManagerId, reason },
      req
    });

    return this.getClientById(clientId);
  }

  /**
   * Retrieves Account Manager assignment history
   */
  static async getAccountManagerHistory(clientId, actorUser = null) {
    await this.getClientById(clientId, actorUser);

    const [rows] = await pool.query(
      `SELECT amh.*,
              prev.name as previous_manager_name, prev.email as previous_manager_email,
              new_m.name as new_manager_name, new_m.email as new_manager_email,
              assigner.name as assigned_by_name, assigner.email as assigned_by_email
       FROM account_manager_history amh
       LEFT JOIN users prev ON amh.previous_manager_id = prev.id
       LEFT JOIN users new_m ON amh.new_manager_id = new_m.id
       LEFT JOIN users assigner ON amh.assigned_by = assigner.id
       WHERE amh.client_id = ?
       ORDER BY amh.assigned_at DESC, amh.id DESC`,
      [clientId]
    );

    return rows;
  }

  /**
   * Retrieves multiple contacts for client
   */
  static async getContacts(clientId, actorUser = null) {
    await this.getClientById(clientId, actorUser);

    const [contacts] = await pool.query(
      `SELECT cc.*, u.name as portal_user_name, u.email as portal_user_email
       FROM client_contacts cc
       LEFT JOIN users u ON cc.user_id = u.id
       WHERE cc.client_id = ?
       ORDER BY cc.is_primary DESC, cc.name ASC`,
      [clientId]
    );

    return contacts;
  }

  /**
   * Adds a new contact for a client
   */
  static async addContact(clientId, data, actorUser, req = null) {
    await this.getClientById(clientId, actorUser);

    const {
      name,
      designation = null,
      email,
      phone = null,
      isPrimary = false,
      status = 'active',
      portalAccessEnabled = false
    } = data;

    const trimmedEmail = email.trim().toLowerCase();

    // If isPrimary, unset other primary contacts for this client
    if (isPrimary) {
      await pool.query('UPDATE client_contacts SET is_primary = FALSE WHERE client_id = ?', [clientId]);
    }

    const [res] = await pool.query(
      `INSERT INTO client_contacts (client_id, name, designation, email, phone, is_primary, status, portal_access_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [clientId, name.trim(), designation || null, trimmedEmail, phone || null, isPrimary ? true : false, status, portalAccessEnabled ? true : false]
    );

    const contactId = res.insertId;

    await this.logActivity(
      clientId,
      actorUser.id,
      'contact_added',
      'Client Contact Added',
      `Added contact: ${name.trim()} (${trimmedEmail})`
    );

    await AuditService.log({
      actorUserId: actorUser.id,
      action: 'client.contact_added',
      targetType: 'client',
      targetId: clientId,
      details: { contactId, name, email: trimmedEmail, isPrimary },
      req
    });

    const [created] = await pool.query('SELECT * FROM client_contacts WHERE id = ?', [contactId]);
    return created[0];
  }

  /**
   * Updates an existing contact
   */
  static async updateContact(clientId, contactId, data, actorUser, req = null) {
    await this.getClientById(clientId, actorUser);

    const [existing] = await pool.query('SELECT * FROM client_contacts WHERE id = ? AND client_id = ?', [contactId, clientId]);
    if (existing.length === 0) {
      const error = new Error('Contact not found');
      error.status = 404;
      error.code = 'CONTACT_NOT_FOUND';
      throw error;
    }

    const contact = existing[0];
    const newName = data.name !== undefined ? data.name.trim() : contact.name;
    const newDesignation = data.designation !== undefined ? data.designation : contact.designation;
    const newEmail = data.email !== undefined ? data.email.trim().toLowerCase() : contact.email;
    const newPhone = data.phone !== undefined ? data.phone : contact.phone;
    const newIsPrimary = data.isPrimary !== undefined ? Boolean(data.isPrimary) : Boolean(contact.is_primary);
    const newStatus = data.status !== undefined ? data.status : contact.status;
    const newPortal = data.portalAccessEnabled !== undefined ? Boolean(data.portalAccessEnabled) : Boolean(contact.portal_access_enabled);

    if (newIsPrimary && !contact.is_primary) {
      await pool.query('UPDATE client_contacts SET is_primary = FALSE WHERE client_id = ?', [clientId]);
    }

    await pool.query(
      `UPDATE client_contacts
       SET name = ?, designation = ?, email = ?, phone = ?, is_primary = ?, status = ?, portal_access_enabled = ?
       WHERE id = ? AND client_id = ?`,
      [newName, newDesignation, newEmail, newPhone, newIsPrimary, newStatus, newPortal, contactId, clientId]
    );

    await this.logActivity(
      clientId,
      actorUser.id,
      'contact_updated',
      'Client Contact Updated',
      `Updated contact: ${newName}`
    );

    const [updated] = await pool.query('SELECT * FROM client_contacts WHERE id = ?', [contactId]);
    return updated[0];
  }

  /**
   * Deletes a client contact
   */
  static async deleteContact(clientId, contactId, actorUser, req = null) {
    await this.getClientById(clientId, actorUser);

    const [existing] = await pool.query('SELECT * FROM client_contacts WHERE id = ? AND client_id = ?', [contactId, clientId]);
    if (existing.length === 0) {
      const error = new Error('Contact not found');
      error.status = 404;
      error.code = 'CONTACT_NOT_FOUND';
      throw error;
    }

    const contact = existing[0];
    await pool.query('DELETE FROM client_contacts WHERE id = ? AND client_id = ?', [contactId, clientId]);

    // If was primary, designate next contact as primary if any exist
    if (contact.is_primary) {
      const [nextContact] = await pool.query(
        'SELECT id FROM client_contacts WHERE client_id = ? ORDER BY id ASC LIMIT 1',
        [clientId]
      );
      if (nextContact.length > 0) {
        await pool.query('UPDATE client_contacts SET is_primary = TRUE WHERE id = ?', [nextContact[0].id]);
      }
    }

    await this.logActivity(
      clientId,
      actorUser.id,
      'contact_deleted',
      'Client Contact Removed',
      `Removed contact: ${contact.name}`
    );

    return { success: true, message: 'Contact deleted successfully' };
  }

  /**
   * Sets primary contact
   */
  static async setPrimaryContact(clientId, contactId, actorUser, req = null) {
    await this.getClientById(clientId, actorUser);

    await pool.query('UPDATE client_contacts SET is_primary = FALSE WHERE client_id = ?', [clientId]);
    await pool.query('UPDATE client_contacts SET is_primary = TRUE WHERE id = ? AND client_id = ?', [contactId, clientId]);

    const [contact] = await pool.query('SELECT * FROM client_contacts WHERE id = ?', [contactId]);
    return contact[0];
  }

  /**
   * Retrieves onboarding checklist items
   */
  static async getOnboardingChecklist(clientId, actorUser = null) {
    await this.getClientById(clientId, actorUser);

    const [items] = await pool.query(
      `SELECT coi.*,
              u.name as owner_name, u.email as owner_email,
              comp.name as completed_by_name,
              CASE WHEN coi.due_date IS NOT NULL AND coi.due_date < CURDATE() AND coi.is_completed = FALSE THEN TRUE ELSE FALSE END as is_overdue
       FROM client_onboarding_items coi
       LEFT JOIN users u ON coi.owner_user_id = u.id
       LEFT JOIN users comp ON coi.completed_by = comp.id
       WHERE coi.client_id = ?
       ORDER BY coi.display_order ASC, coi.created_at ASC`,
      [clientId]
    );

    const total = items.length;
    const completed = items.filter(i => Boolean(i.is_completed)).length;
    const overdue = items.filter(i => Boolean(i.is_overdue)).length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      clientId: Number(clientId),
      totalItems: total,
      completedItems: completed,
      overdueItems: overdue,
      progressPercent: progress,
      items: items.map(i => ({
        ...i,
        is_completed: Boolean(i.is_completed),
        is_overdue: Boolean(i.is_overdue)
      }))
    };
  }

  /**
   * Adds a custom onboarding checklist item
   */
  static async addOnboardingItem(clientId, data, actorUser, req = null) {
    await this.getClientById(clientId, actorUser);

    const { title, description = null, ownerUserId = null, dueDate = null, notes = null } = data;
    const itemKey = `custom_${Date.now()}`;

    const [maxOrder] = await pool.query('SELECT MAX(display_order) as m FROM client_onboarding_items WHERE client_id = ?', [clientId]);
    const displayOrder = (Number(maxOrder[0]?.m || 0)) + 1;

    const [res] = await pool.query(
      `INSERT INTO client_onboarding_items (client_id, item_key, title, description, owner_user_id, due_date, notes, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [clientId, itemKey, title.trim(), description || null, ownerUserId || null, dueDate || null, notes || null, displayOrder]
    );

    await this.logActivity(
      clientId,
      actorUser.id,
      'onboarding_item_added',
      'Onboarding Task Added',
      `Added checklist item: ${title.trim()}`
    );

    return this.getOnboardingChecklist(clientId, actorUser);
  }

  /**
   * Updates an onboarding item (status, owner, due date, notes)
   */
  static async updateOnboardingItem(clientId, itemId, data, actorUser, req = null) {
    await this.getClientById(clientId, actorUser);

    const [existing] = await pool.query('SELECT * FROM client_onboarding_items WHERE id = ? AND client_id = ?', [itemId, clientId]);
    if (existing.length === 0) {
      const error = new Error('Onboarding item not found');
      error.status = 404;
      error.code = 'ITEM_NOT_FOUND';
      throw error;
    }

    const item = existing[0];
    const newTitle = data.title !== undefined ? data.title.trim() : item.title;
    const newDesc = data.description !== undefined ? data.description : item.description;
    const newOwner = data.ownerUserId !== undefined ? data.ownerUserId : item.owner_user_id;
    const newDue = data.dueDate !== undefined ? data.dueDate : item.due_date;
    const newNotes = data.notes !== undefined ? data.notes : item.notes;

    let isCompleted = item.is_completed;
    let completedAt = item.completed_at;
    let completedBy = item.completed_by;

    if (data.isCompleted !== undefined) {
      isCompleted = Boolean(data.isCompleted);
      if (isCompleted && !item.is_completed) {
        completedAt = new Date();
        completedBy = actorUser.id;
      } else if (!isCompleted) {
        completedAt = null;
        completedBy = null;
      }
    }

    await pool.query(
      `UPDATE client_onboarding_items
       SET title = ?, description = ?, owner_user_id = ?, due_date = ?, is_completed = ?,
           completed_at = ?, completed_by = ?, notes = ?
       WHERE id = ? AND client_id = ?`,
      [newTitle, newDesc, newOwner || null, newDue || null, isCompleted, completedAt, completedBy, newNotes || null, itemId, clientId]
    );

    await this.logActivity(
      clientId,
      actorUser.id,
      'onboarding_item_updated',
      `Onboarding Item ${isCompleted ? 'Completed' : 'Updated'}`,
      `${newTitle}: ${isCompleted ? 'Marked complete' : 'Details updated'}`
    );

    return this.getOnboardingChecklist(clientId, actorUser);
  }

  /**
   * Deletes an onboarding item
   */
  static async deleteOnboardingItem(clientId, itemId, actorUser, req = null) {
    await this.getClientById(clientId, actorUser);

    await pool.query('DELETE FROM client_onboarding_items WHERE id = ? AND client_id = ?', [itemId, clientId]);
    return this.getOnboardingChecklist(clientId, actorUser);
  }

  /**
   * Retrieves client services
   */
  static async getClientServices(clientId, actorUser = null) {
    await this.getClientById(clientId, actorUser);

    const [services] = await pool.query(
      `SELECT si.*,
              d.name as department_name, d.status as department_status,
              wp.name as workflow_preset_name, wp.status as workflow_preset_status,
              wpv.version_number as workflow_version_number,
              u.name as owner_name, u.email as owner_email,
              COUNT(DISTINCT t.id) as total_tasks,
              SUM(CASE WHEN t.column_status = 'done' OR t.status = 'completed' THEN 1 ELSE 0 END) as completed_tasks
       FROM service_instances si
       LEFT JOIN departments d ON si.department_id = d.id
       LEFT JOIN workflow_presets wp ON si.workflow_preset_id = wp.id
       LEFT JOIN workflow_preset_versions wpv ON si.workflow_preset_version_id = wpv.id
       LEFT JOIN users u ON si.owner_user_id = u.id
       LEFT JOIN tasks t ON t.service_instance_id = si.id
       WHERE si.client_id = ?
       GROUP BY si.id
       ORDER BY si.created_at DESC`,
      [clientId]
    );

    return services.map(s => ({
      ...s,
      total_tasks: Number(s.total_tasks || 0),
      completed_tasks: Number(s.completed_tasks || 0)
    }));
  }

  /**
   * Creates/configures a client service instance
   */
  static async createClientService(clientId, data, actorUser, req = null) {
    await this.getClientById(clientId, actorUser);

    const {
      label,
      serviceType = null,
      departmentId = null,
      workflowPresetId = null,
      workflowPresetVersionId = null,
      scopeDescription = null,
      expectedDeliverables = null,
      serviceFrequency = 'Monthly',
      cycle = 1,
      ownerUserId = null,
      startDate = null,
      endDate = null,
      status = 'active',
      operationalNotes = null
    } = data;

    // If workflow preset selected, verify it is published
    if (workflowPresetId) {
      const [wp] = await pool.query('SELECT id, name, status FROM workflow_presets WHERE id = ?', [workflowPresetId]);
      if (wp.length === 0) {
        const error = new Error('Selected Workflow Preset not found');
        error.status = 404;
        error.code = 'PRESET_NOT_FOUND';
        throw error;
      }
      if (wp[0].status !== 'published') {
        const error = new Error(`Only published workflow presets may be selected (preset '${wp[0].name}' has status '${wp[0].status}')`);
        error.status = 400;
        error.code = 'PRESET_NOT_PUBLISHED';
        throw error;
      }
    }

    const type = serviceType || label;

    const [res] = await pool.query(
      `INSERT INTO service_instances (
        client_id, department_id, workflow_preset_id, workflow_preset_version_id,
        service_type, label, current_stage, scope_description, expected_deliverables,
        service_frequency, cycle, owner_user_id, start_date, end_date,
        status, operational_notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, 'Setup', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        clientId, departmentId || null, workflowPresetId || null, workflowPresetVersionId || null,
        type, label.trim(), scopeDescription || null, expectedDeliverables || null,
        serviceFrequency, cycle, ownerUserId || null, startDate || null, endDate || null,
        status, operationalNotes || null, actorUser.id
      ]
    );

    const serviceId = res.insertId;

    await this.logActivity(
      clientId,
      actorUser.id,
      'service_configured',
      'Client Service Configured',
      `Configured service: ${label.trim()} (${serviceFrequency})`
    );

    await AuditService.log({
      actorUserId: actorUser.id,
      action: 'client.service_configured',
      targetType: 'client',
      targetId: clientId,
      details: { serviceId, label, departmentId, workflowPresetId, status },
      req
    });

    // Trigger A — Service Activation
    if (status === 'active' && (workflowPresetId || departmentId)) {
      try {
        await WorkflowEngineService.onServiceActivated(serviceId, actorUser, req);
      } catch (autoErr) {
        console.error('Trigger A service activation workflow generation error:', autoErr);
      }
    }

    const [created] = await pool.query('SELECT * FROM service_instances WHERE id = ?', [serviceId]);
    return created[0];
  }

  /**
   * Updates a client service instance
   */
  static async updateClientService(clientId, serviceId, data, actorUser, req = null) {
    await this.getClientById(clientId, actorUser);

    const [existing] = await pool.query('SELECT * FROM service_instances WHERE id = ? AND client_id = ?', [serviceId, clientId]);
    if (existing.length === 0) {
      const error = new Error('Client service not found');
      error.status = 404;
      error.code = 'SERVICE_NOT_FOUND';
      throw error;
    }

    const s = existing[0];
    const newLabel = data.label !== undefined ? data.label.trim() : s.label;
    const newType = data.serviceType !== undefined ? data.serviceType : s.service_type;
    const newDept = data.departmentId !== undefined ? data.departmentId : s.department_id;
    const newPreset = data.workflowPresetId !== undefined ? data.workflowPresetId : s.workflow_preset_id;
    const newVersion = data.workflowPresetVersionId !== undefined ? data.workflowPresetVersionId : s.workflow_preset_version_id;
    const newScope = data.scopeDescription !== undefined ? data.scopeDescription : s.scope_description;
    const newDeliverables = data.expectedDeliverables !== undefined ? data.expectedDeliverables : s.expected_deliverables;
    const newFreq = data.serviceFrequency !== undefined ? data.serviceFrequency : s.service_frequency;
    const newCycle = data.cycle !== undefined ? data.cycle : s.cycle;
    const newOwner = data.ownerUserId !== undefined ? data.ownerUserId : s.owner_user_id;
    const newStart = data.startDate !== undefined ? data.startDate : s.start_date;
    const newEnd = data.endDate !== undefined ? data.endDate : s.end_date;
    const newStatus = data.status !== undefined ? data.status : s.status;
    const newNotes = data.operationalNotes !== undefined ? data.operationalNotes : s.operational_notes;

    if (data.workflowPresetId && Number(data.workflowPresetId) !== Number(s.workflow_preset_id)) {
      const [wp] = await pool.query('SELECT id, status FROM workflow_presets WHERE id = ?', [data.workflowPresetId]);
      if (wp.length > 0 && wp[0].status !== 'published') {
        const error = new Error('Only published workflow presets may be selected');
        error.status = 400;
        error.code = 'PRESET_NOT_PUBLISHED';
        throw error;
      }
    }

    await pool.query(
      `UPDATE service_instances
       SET label = ?, service_type = ?, department_id = ?, workflow_preset_id = ?, workflow_preset_version_id = ?,
           scope_description = ?, expected_deliverables = ?, service_frequency = ?, cycle = ?, owner_user_id = ?,
           start_date = ?, end_date = ?, status = ?, operational_notes = ?
       WHERE id = ? AND client_id = ?`,
      [
        newLabel, newType, newDept || null, newPreset || null, newVersion || null,
        newScope || null, newDeliverables || null, newFreq, newCycle, newOwner || null,
        newStart || null, newEnd || null, newStatus, newNotes || null, serviceId, clientId
      ]
    );

    await this.logActivity(
      clientId,
      actorUser.id,
      'service_updated',
      'Client Service Updated',
      `Updated service: ${newLabel} (${newStatus})`
    );

    // Trigger A — Service Activation on update
    if (newStatus === 'active' && s.status !== 'active' && (newPreset || s.workflow_preset_id)) {
      try {
        await WorkflowEngineService.onServiceActivated(serviceId, actorUser, req);
      } catch (autoErr) {
        console.error('Trigger A service activation workflow generation error:', autoErr);
      }
    }

    const [updated] = await pool.query('SELECT * FROM service_instances WHERE id = ?', [serviceId]);
    return updated[0];
  }

  /**
   * Retrieves complete 11-section client detail workspace
   */
  static async getClientWorkspace(clientId, actorUser = null) {
    const client = await this.getClientById(clientId, actorUser);

    // Section 1: Overview (client + primary contact + AM info)
    const contacts = await this.getContacts(clientId, actorUser);
    const primaryContact = contacts.find(c => c.is_primary) || contacts[0] || null;

    // Section 2: Contacts
    // contacts list is already fetched

    // Section 3: Onboarding
    const onboarding = await this.getOnboardingChecklist(clientId, actorUser);

    // Section 4: Services
    const services = await this.getClientServices(clientId, actorUser);

    // Section 5: Projects
    const projects = await this.getClientProjects(clientId, actorUser);

    // Section 6: Tasks
    const [tasks] = await pool.query(
      `SELECT t.id, t.title, t.status, t.priority, t.due_date, t.column_status,
              p.name as project_name, u.name as assignee_name
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       LEFT JOIN users u ON t.assignee_id = u.id
       WHERE p.client_id = ?
       ORDER BY t.created_at DESC
       LIMIT 20`,
      [clientId]
    );

    // Section 7: Expected Deliverables & Actual Submissions
    const deliverables = services.filter(s => s.expected_deliverables).map(s => ({
      serviceId: s.id,
      serviceLabel: s.label,
      expectedDeliverables: s.expected_deliverables,
      frequency: s.service_frequency,
      status: s.status
    }));

    // Fetch actual deliverable submissions
    const isClient = actorUser?.roles?.some(r => r.slug === 'client') || Boolean(actorUser?.client_id);
    let deliverableQuery = `
      SELECT ds.*, 
             t.task_code, t.title as task_title, p.name as project_name,
             sub.name as submitter_name, cli_rev.name as client_reviewer_name
      FROM deliverable_submissions ds
      INNER JOIN tasks t ON ds.task_id = t.id
      LEFT JOIN projects p ON ds.project_id = p.id
      LEFT JOIN users sub ON ds.submitted_by = sub.id
      LEFT JOIN users cli_rev ON ds.client_reviewer_id = cli_rev.id
      WHERE ds.client_id = ?
    `;
    if (isClient) {
      deliverableQuery += ` AND ds.requires_client_approval = TRUE AND ds.internal_review_status = 'approved'`;
    }
    deliverableQuery += ` ORDER BY ds.created_at DESC LIMIT 50`;
    const [deliverableSubmissions] = await pool.query(deliverableQuery, [clientId]);

    // Section 8: Approvals (enriched with deliverable status)
    const [approvals] = await pool.query(
      `SELECT ta.id, ta.task_id, ta.status, ta.created_at,
              t.title as task_title, u.name as submitter_name
       FROM task_approvals ta
       JOIN tasks t ON ta.task_id = t.id
       JOIN projects p ON t.project_id = p.id
       LEFT JOIN users u ON ta.submitted_by = u.id
       WHERE p.client_id = ?
       ORDER BY ta.created_at DESC
       LIMIT 10`,
      [clientId]
    );

    // Section 9: Reports summary
    const reports = {
      available: false,
      message: 'Automated executive reporting compiles at the end of active service cycles.',
      totalServices: services.length,
      activeServices: services.filter(s => s.status === 'active').length,
      completedTasks: tasks.filter(t => t.status === 'completed' || t.column_status === 'done').length
    };

    // Section 10: Documents
    const documents = {
      available: Boolean(client.requirements_notes || client.communication_preferences),
      requirementsNotes: client.requirements_notes,
      communicationPreferences: client.communication_preferences ? (
        typeof client.communication_preferences === 'string' 
          ? JSON.parse(client.communication_preferences) 
          : client.communication_preferences
      ) : null,
      message: 'Dedicated cloud document vault integration activates in Phase 4.'
    };

    // Section 11: Activity Timeline
    const activity = await this.getClientActivity(clientId, actorUser);

    // Section 12: Support Tickets
    const [tickets] = await pool.query(
      `SELECT t.*, u.name as creator_name, a.name as assignee_name
       FROM support_tickets t
       JOIN users u ON t.created_by = u.id
       LEFT JOIN users a ON t.assigned_to = a.id
       WHERE t.client_id = ?
       ORDER BY t.created_at DESC LIMIT 20`,
      [clientId]
    );

    // Section 13: Quotations (Clients only see non-draft quotes)
    const [quotations] = await pool.query(
      `SELECT q.*, u.name as prepared_by_name
       FROM quotations q
       JOIN users u ON q.prepared_by = u.id
       WHERE q.client_id = ? ${isClient ? "AND q.status != 'draft'" : ''}
       ORDER BY q.created_at DESC LIMIT 20`,
      [clientId]
    );

    // Section 14: Invoices (Clients only see non-draft invoices)
    const [invoices] = await pool.query(
      `SELECT i.*, u.name as created_by_name
       FROM invoices i
       JOIN users u ON i.created_by = u.id
       WHERE i.client_id = ? ${isClient ? "AND i.status != 'draft'" : ''}
       ORDER BY i.created_at DESC LIMIT 20`,
      [clientId]
    );

    return {
      overview: {
        ...client,
        primaryContact
      },
      contacts,
      onboarding,
      services,
      projects,
      tasks,
      deliverables,
      deliverableSubmissions,
      approvals,
      reports,
      documents,
      activity,
      tickets,
      quotations,
      invoices
    };
  }

  /**
   * Retrieves client activity timeline
   */
  static async getClientActivity(clientId, actorUser = null) {
    await this.getClientById(clientId, actorUser);

    const [rows] = await pool.query(
      `SELECT cal.*, u.name as actor_name, u.email as actor_email
       FROM client_activity_logs cal
       LEFT JOIN users u ON cal.actor_id = u.id
       WHERE cal.client_id = ?
       ORDER BY cal.created_at DESC
       LIMIT 50`,
      [clientId]
    );

    return rows;
  }

  /**
   * Deletes a client profile if no dependent projects exist
   */
  static async deleteClient(clientId, actorUser, req = null) {
    const client = await this.getClientById(clientId, actorUser);

    const [projects] = await pool.query('SELECT id FROM projects WHERE client_id = ?', [clientId]);
    if (projects.length > 0) {
      const error = new Error(`Cannot delete client with ${projects.length} associated project(s). Please archive or reassign the projects first.`);
      error.status = 400;
      error.code = 'CLIENT_HAS_PROJECTS';
      throw error;
    }

    await pool.query('DELETE FROM clients WHERE id = ?', [clientId]);

    await AuditService.log({
      actorUserId: actorUser.id,
      action: 'client.deleted',
      targetType: 'client',
      targetId: clientId,
      details: { name: client.name, email: client.email },
      req
    });

    return { success: true, message: 'Client deleted successfully' };
  }

  /**
   * Lists projects associated with a client
   */
  static async getClientProjects(clientId, actorUser = null) {
    await this.getClientById(clientId, actorUser);

    const [projects] = await pool.query(
      `SELECT p.id, p.name, p.project_code, p.status, p.priority, p.visibility,
              p.start_date, p.due_date, p.completed_at,
              u.name as manager_name, u.email as manager_email,
              COUNT(DISTINCT t.id) as total_tasks,
              SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed_tasks
       FROM projects p
       LEFT JOIN users u ON p.project_manager_id = u.id
       LEFT JOIN tasks t ON p.id = t.project_id
       WHERE p.client_id = ? AND p.is_archived = FALSE
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [clientId]
    );

    return projects.map((p) => ({
      ...p,
      total_tasks: Number(p.total_tasks || 0),
      completed_tasks: Number(p.completed_tasks || 0)
    }));
  }
}
