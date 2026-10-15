import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';
import {
  encryptSecret,
  decryptSecret,
  maskSecret,
  maskUsername,
  rotateSecret,
  getKeyRing
} from '../../utils/credential-crypto.js';
import { resolveUserPermissions } from '../../middleware/authorize.js';

export class CredentialsService {
  /**
   * Determine user's credential role: 'admin' | 'client' | 'employee'
   */
  static async getUserScope(user) {
    if (!user) return { scope: 'unauthorized', isOwner: false };

    // 1. Check if user is owner or has admin credentials permission
    const { permissions, isOwner, roles } = await resolveUserPermissions(user.id);

    const isAdmin =
      isOwner ||
      roles.some((r) => r.slug === 'owner' || r.slug === 'admin') ||
      permissions.includes('credentials.manage') ||
      permissions.includes('credentials.view_all');

    if (isAdmin) {
      return { scope: 'admin', isOwner, permissions, roles };
    }

    // 2. Check if client user
    const isClient =
      Boolean(user.client_id) ||
      roles.some((r) => r.slug === 'client') ||
      permissions.includes('credentials.client_access');

    if (isClient) {
      return { scope: 'client', clientId: user.client_id, permissions, roles };
    }

    // 3. Otherwise standard employee / team member
    return { scope: 'employee', permissions, roles };
  }

  /**
   * Log entry in dedicated credential_access_logs AND system audit_logs
   */
  static async recordAccessLog({
    credentialId,
    clientId,
    actorId,
    grantId = null,
    action,
    accessLevel = null,
    accessReason = null,
    outcome = 'success',
    failureReason = null,
    req = null
  }) {
    try {
      const ip = req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null) : null;
      const userAgent = req ? (req.headers['user-agent']?.slice(0, 255) || null) : null;

      // 1. Dedicated credential access audit trail
      if (credentialId && clientId) {
        await pool.query(
          `INSERT INTO credential_access_logs
           (credential_id, client_id, actor_id, grant_id, action, access_level, access_reason, outcome, failure_reason, ip_address, user_agent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            credentialId,
            clientId,
            actorId,
            grantId,
            action,
            accessLevel,
            accessReason,
            outcome,
            failureReason,
            ip,
            userAgent
          ]
        );
      }

      // 2. Existing system audit logs (never store secrets)
      await AuditService.log({
        actorId,
        action: `credential.${action}`,
        entityType: 'credential',
        entityId: credentialId,
        details: {
          clientId,
          outcome,
          accessLevel,
          failureReason
        },
        req
      });
    } catch (err) {
      console.error('Failed to record credential audit log:', err.message);
    }
  }

  /**
   * List credentials permitted to caller
   */
  static async listCredentials(user, query = {}) {
    const userScope = await this.getUserScope(user);
    const { clientId, category, search, status = 'active' } = query;

    let sql = '';
    const params = [];

    if (userScope.scope === 'admin') {
      sql = `
        SELECT 
          c.id, c.client_id, cl.name as client_name, cl.company_name,
          c.project_id, p.name as project_name,
          c.platform_name, c.category, c.login_url, c.username,
          c.account_id, c.notes, c.internal_notes, c.status,
          c.key_version, c.created_at, c.updated_at,
          (
            SELECT COUNT(*) 
            FROM credential_access_grants g 
            WHERE g.credential_id = c.id 
              AND g.revoked_at IS NULL 
              AND (g.expires_at IS NULL OR g.expires_at > NOW())
          ) as authorized_employee_count
        FROM client_credentials c
        JOIN clients cl ON c.client_id = cl.id
        LEFT JOIN projects p ON c.project_id = p.id
        WHERE 1=1
      `;

      if (status !== 'all') {
        sql += ` AND c.status = ?`;
        params.push(status);
      }

      if (clientId) {
        sql += ` AND c.client_id = ?`;
        params.push(clientId);
      }
    } else if (userScope.scope === 'client') {
      if (!user.client_id) {
        return [];
      }

      sql = `
        SELECT 
          c.id, c.client_id, cl.name as client_name, cl.company_name,
          c.project_id, p.name as project_name,
          c.platform_name, c.category, c.login_url, c.username,
          c.account_id, c.notes, c.status,
          c.created_at, c.updated_at,
          (
            SELECT COUNT(*) 
            FROM credential_access_grants g 
            WHERE g.credential_id = c.id 
              AND g.revoked_at IS NULL 
              AND (g.expires_at IS NULL OR g.expires_at > NOW())
          ) as authorized_employee_count
        FROM client_credentials c
        JOIN clients cl ON c.client_id = cl.id
        LEFT JOIN projects p ON c.project_id = p.id
        WHERE c.client_id = ?
      `;
      params.push(user.client_id);

      if (status !== 'all') {
        sql += ` AND c.status = ?`;
        params.push(status);
      }
    } else {
      // Employee: strictly filter by active, unexpired grant in credential_access_grants
      sql = `
        SELECT 
          c.id, c.client_id, cl.name as client_name, cl.company_name,
          c.project_id, p.name as project_name,
          c.platform_name, c.category, c.login_url, c.username,
          c.account_id, c.notes, c.status,
          c.created_at, c.updated_at,
          g.id as grant_id, g.access_level, g.expires_at as grant_expires_at,
          1 as is_authorized
        FROM credential_access_grants g
        JOIN client_credentials c ON g.credential_id = c.id
        JOIN clients cl ON c.client_id = cl.id
        LEFT JOIN projects p ON c.project_id = p.id
        WHERE g.employee_id = ?
          AND g.revoked_at IS NULL
          AND (g.expires_at IS NULL OR g.expires_at > NOW())
          AND c.status = 'active'
      `;
      params.push(user.id);
    }

    if (category) {
      sql += ` AND c.category = ?`;
      params.push(category);
    }

    if (search && search.trim()) {
      sql += ` AND (c.platform_name LIKE ? OR c.username LIKE ? OR cl.name LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    sql += ` ORDER BY c.updated_at DESC`;

    const [rows] = await pool.query(sql, params);

    // Format safe response (NEVER include encrypted_password or plaintext password)
    return rows.map((row) => ({
      ...row,
      username_masked: maskUsername(row.username),
      password_masked: maskSecret('sample123456') // UI representation
    }));
  }

  /**
   * Get single credential metadata and access grant details
   */
  static async getCredentialDetails(user, credentialId) {
    const userScope = await this.getUserScope(user);

    const [rows] = await pool.query(
      `SELECT 
        c.id, c.client_id, cl.name as client_name, cl.company_name,
        c.project_id, p.name as project_name,
        c.platform_name, c.category, c.login_url, c.username,
        c.account_id, c.notes, c.internal_notes, c.status,
        c.key_version, c.additional_fields, c.created_at, c.updated_at,
        u1.name as created_by_name, u2.name as updated_by_name
       FROM client_credentials c
       JOIN clients cl ON c.client_id = cl.id
       LEFT JOIN projects p ON c.project_id = p.id
       LEFT JOIN users u1 ON c.created_by = u1.id
       LEFT JOIN users u2 ON c.last_updated_by = u2.id
       WHERE c.id = ?`,
      [credentialId]
    );

    if (rows.length === 0) {
      const err = new Error('Credential record not found.');
      err.status = 404;
      err.code = 'CREDENTIAL_NOT_FOUND';
      throw err;
    }

    const cred = rows[0];

    // Authorization check
    let callerAccessLevel = null;
    let activeGrant = null;

    if (userScope.scope === 'admin') {
      callerAccessLevel = 'manage_access';
    } else if (userScope.scope === 'client') {
      if (Number(cred.client_id) !== Number(user.client_id)) {
        const err = new Error('Unauthorized access. Credential belongs to another client.');
        err.status = 403;
        err.code = 'FORBIDDEN_CLIENT_MISMATCH';
        throw err;
      }
      callerAccessLevel = 'manage_access';
      delete cred.internal_notes; // Client cannot see internal admin notes
    } else {
      // Employee check
      const [grants] = await pool.query(
        `SELECT id, access_level, expires_at, revoked_at
         FROM credential_access_grants
         WHERE credential_id = ? AND employee_id = ?
           AND revoked_at IS NULL
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [credentialId, user.id]
      );

      if (grants.length === 0) {
        const err = new Error('Access denied. You have not been granted access to this client credential.');
        err.status = 403;
        err.code = 'NO_ACTIVE_CREDENTIAL_GRANT';
        throw err;
      }

      activeGrant = grants[0];
      callerAccessLevel = activeGrant.access_level;
      delete cred.internal_notes;
    }

    // Get authorized employees list
    let authorizedEmployees = [];
    if (userScope.scope === 'admin' || (userScope.scope === 'employee' && callerAccessLevel === 'manage_access')) {
      const [allGrants] = await pool.query(
        `SELECT 
          g.id as grant_id, g.employee_id, u.name as employee_name, u.email as employee_email,
          u.department, u.designations, g.access_level, g.access_reason,
          g.expires_at, g.revoked_at, g.created_at as granted_at,
          granter.name as granted_by_name
         FROM credential_access_grants g
         JOIN users u ON g.employee_id = u.id
         LEFT JOIN users granter ON g.granted_by = granter.id
         WHERE g.credential_id = ?
         ORDER BY g.revoked_at IS NULL DESC, g.created_at DESC`,
        [credentialId]
      );
      authorizedEmployees = allGrants;
    } else if (userScope.scope === 'client') {
      // Client sees who has access, but WITHOUT internal admin notes/reasons
      const [clientGrants] = await pool.query(
        `SELECT 
          g.id as grant_id, u.name as employee_name, u.department,
          g.access_level, g.expires_at, g.created_at as granted_at
         FROM credential_access_grants g
         JOIN users u ON g.employee_id = u.id
         WHERE g.credential_id = ? AND g.revoked_at IS NULL
           AND (g.expires_at IS NULL OR g.expires_at > NOW())
         ORDER BY g.created_at DESC`,
        [credentialId]
      );
      authorizedEmployees = clientGrants;
    }

    return {
      credential: {
        ...cred,
        username_masked: maskUsername(cred.username),
        password_masked: maskSecret('sample123456')
      },
      callerAccessLevel,
      authorizedEmployees
    };
  }

  /**
   * Create a new client credential
   */
  static async createCredential(user, data, req = null) {
    const userScope = await this.getUserScope(user);

    let targetClientId = data.client_id;

    if (userScope.scope === 'client') {
      if (!user.client_id) {
        const err = new Error('Client organization context is missing for this account.');
        err.status = 400;
        err.code = 'CLIENT_CONTEXT_MISSING';
        throw err;
      }
      targetClientId = user.client_id;
    } else if (userScope.scope !== 'admin') {
      const err = new Error('Employees are not permitted to register new client credentials.');
      err.status = 403;
      err.code = 'FORBIDDEN_EMPLOYEE_CREATION';
      throw err;
    }

    if (!targetClientId) {
      const err = new Error('Client ID is required.');
      err.status = 400;
      err.code = 'CLIENT_REQUIRED';
      throw err;
    }

    // Verify client exists
    const [clients] = await pool.query('SELECT id, name FROM clients WHERE id = ?', [targetClientId]);
    if (clients.length === 0) {
      const err = new Error('Selected client does not exist.');
      err.status = 404;
      err.code = 'CLIENT_NOT_FOUND';
      throw err;
    }

    // Server-side encryption using AES-256-GCM
    const encryptedPassword = encryptSecret(data.password);
    const encryptedUsername = data.username ? encryptSecret(data.username) : null;
    const encryptedRecoveryEmail = data.recovery_email ? encryptSecret(data.recovery_email) : null;
    const encryptedRecoveryPhone = data.recovery_phone ? encryptSecret(data.recovery_phone) : null;

    const [res] = await pool.query(
      `INSERT INTO client_credentials
       (client_id, project_id, platform_name, category, login_url, username, encrypted_username,
        encrypted_password, encrypted_recovery_email, encrypted_recovery_phone, account_id,
        notes, internal_notes, key_version, status, additional_fields, created_by, last_updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'v1', 'active', ?, ?, ?)`,
      [
        targetClientId,
        data.project_id || null,
        data.platform_name,
        data.category || 'Other',
        data.login_url || null,
        data.username,
        encryptedUsername,
        encryptedPassword,
        encryptedRecoveryEmail,
        encryptedRecoveryPhone,
        data.account_id || null,
        data.notes || null,
        userScope.scope === 'admin' ? (data.internal_notes || null) : null,
        data.additional_fields ? JSON.stringify(data.additional_fields) : null,
        user.id,
        user.id
      ]
    );

    const credentialId = res.insertId;

    // Record audit logs
    await this.recordAccessLog({
      credentialId,
      clientId: targetClientId,
      actorId: user.id,
      action: 'created',
      accessLevel: 'full',
      accessReason: 'Initial credential registration',
      outcome: 'success',
      req
    });

    return {
      id: credentialId,
      client_id: targetClientId,
      platform_name: data.platform_name,
      category: data.category || 'Other',
      login_url: data.login_url,
      username: data.username,
      username_masked: maskUsername(data.username),
      password_masked: maskSecret('sample123456'),
      status: 'active'
    };
  }

  /**
   * Update credential metadata and/or password
   */
  static async updateCredential(user, credentialId, data, req = null) {
    const userScope = await this.getUserScope(user);

    const [rows] = await pool.query('SELECT * FROM client_credentials WHERE id = ?', [credentialId]);
    if (rows.length === 0) {
      const err = new Error('Credential not found.');
      err.status = 404;
      err.code = 'CREDENTIAL_NOT_FOUND';
      throw err;
    }

    const cred = rows[0];

    // Authorization check
    if (userScope.scope === 'client') {
      if (Number(cred.client_id) !== Number(user.client_id)) {
        const err = new Error('Unauthorized. You can only update credentials belonging to your organization.');
        err.status = 403;
        err.code = 'FORBIDDEN_CLIENT_MISMATCH';
        throw err;
      }
    } else if (userScope.scope === 'employee') {
      const [grants] = await pool.query(
        `SELECT access_level FROM credential_access_grants
         WHERE credential_id = ? AND employee_id = ?
           AND revoked_at IS NULL
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [credentialId, user.id]
      );

      if (grants.length === 0 || !['edit_credentials', 'manage_access'].includes(grants[0].access_level)) {
        const err = new Error('Access denied. You do not have permission to edit this credential.');
        err.status = 403;
        err.code = 'FORBIDDEN_EDIT_ACCESS_REQUIRED';
        throw err;
      }
    }

    const updates = [];
    const values = [];
    let isPasswordReplaced = false;

    if (data.platform_name !== undefined) {
      updates.push('platform_name = ?');
      values.push(data.platform_name);
    }
    if (data.category !== undefined) {
      updates.push('category = ?');
      values.push(data.category);
    }
    if (data.login_url !== undefined) {
      updates.push('login_url = ?');
      values.push(data.login_url || null);
    }
    if (data.username !== undefined) {
      updates.push('username = ?');
      values.push(data.username);
      updates.push('encrypted_username = ?');
      values.push(encryptSecret(data.username));
    }
    if (data.password !== undefined && data.password !== '') {
      isPasswordReplaced = true;
      updates.push('encrypted_password = ?');
      values.push(encryptSecret(data.password));
    }
    if (data.recovery_email !== undefined) {
      updates.push('encrypted_recovery_email = ?');
      values.push(data.recovery_email ? encryptSecret(data.recovery_email) : null);
    }
    if (data.recovery_phone !== undefined) {
      updates.push('encrypted_recovery_phone = ?');
      values.push(data.recovery_phone ? encryptSecret(data.recovery_phone) : null);
    }
    if (data.account_id !== undefined) {
      updates.push('account_id = ?');
      values.push(data.account_id || null);
    }
    if (data.notes !== undefined) {
      updates.push('notes = ?');
      values.push(data.notes || null);
    }
    if (data.internal_notes !== undefined && userScope.scope === 'admin') {
      updates.push('internal_notes = ?');
      values.push(data.internal_notes || null);
    }
    if (data.project_id !== undefined && userScope.scope === 'admin') {
      updates.push('project_id = ?');
      values.push(data.project_id || null);
    }
    if (data.status !== undefined && userScope.scope === 'admin') {
      updates.push('status = ?');
      values.push(data.status);
    }
    if (data.additional_fields !== undefined) {
      updates.push('additional_fields = ?');
      values.push(data.additional_fields ? JSON.stringify(data.additional_fields) : null);
    }

    updates.push('last_updated_by = ?');
    values.push(user.id);

    values.push(credentialId);

    if (updates.length > 1) {
      await pool.query(
        `UPDATE client_credentials SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }

    // Record audit events safely WITHOUT secrets
    const action = isPasswordReplaced ? 'password_replaced' : 'updated';
    await this.recordAccessLog({
      credentialId,
      clientId: cred.client_id,
      actorId: user.id,
      action,
      accessReason: isPasswordReplaced ? 'Password updated by user' : 'Metadata updated',
      outcome: 'success',
      req
    });

    return {
      id: credentialId,
      platform_name: data.platform_name || cred.platform_name,
      isPasswordReplaced,
      status: 'success'
    };
  }

  /**
   * Explicitly reveal secret credentials with strict authorization and rate limiting
   */
  static async revealCredential(user, credentialId, req = null) {
    const userScope = await this.getUserScope(user);

    const [rows] = await pool.query(
      `SELECT id, client_id, platform_name, username, encrypted_username,
              encrypted_password, encrypted_recovery_email, encrypted_recovery_phone,
              account_id, key_version, status
       FROM client_credentials WHERE id = ?`,
      [credentialId]
    );

    if (rows.length === 0) {
      const err = new Error('Credential not found.');
      err.status = 404;
      err.code = 'CREDENTIAL_NOT_FOUND';
      throw err;
    }

    const cred = rows[0];

    // Check credential status
    if (cred.status !== 'active') {
      const err = new Error(`Cannot reveal secrets for credential with status: ${cred.status}`);
      err.status = 400;
      err.code = 'CREDENTIAL_NOT_ACTIVE';
      throw err;
    }

    let authorizedGrantId = null;
    let accessLevel = null;

    if (userScope.scope === 'admin') {
      accessLevel = 'manage_access';
    } else if (userScope.scope === 'client') {
      if (Number(cred.client_id) !== Number(user.client_id)) {
        await this.recordAccessLog({
          credentialId,
          clientId: cred.client_id,
          actorId: user.id,
          action: 'unauthorized_attempt',
          outcome: 'denied',
          failureReason: 'Client mismatch violation',
          req
        });
        const err = new Error('Access denied. Credential does not belong to your organization.');
        err.status = 403;
        err.code = 'FORBIDDEN_CLIENT_MISMATCH';
        throw err;
      }
      accessLevel = 'view_credentials';
    } else {
      // Employee: strictly verify active, unexpired grant with required access level
      const [grants] = await pool.query(
        `SELECT id, access_level, expires_at, revoked_at
         FROM credential_access_grants
         WHERE credential_id = ? AND employee_id = ?
           AND revoked_at IS NULL
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [credentialId, user.id]
      );

      if (grants.length === 0) {
        await this.recordAccessLog({
          credentialId,
          clientId: cred.client_id,
          actorId: user.id,
          action: 'unauthorized_attempt',
          outcome: 'denied',
          failureReason: 'No active employee grant',
          req
        });
        const err = new Error('Access denied. You have not been granted permission to reveal this secret.');
        err.status = 403;
        err.code = 'FORBIDDEN_NO_ACTIVE_GRANT';
        throw err;
      }

      const grant = grants[0];
      authorizedGrantId = grant.id;
      accessLevel = grant.access_level;

      if (grant.access_level === 'metadata_only') {
        await this.recordAccessLog({
          credentialId,
          clientId: cred.client_id,
          actorId: user.id,
          grantId: grant.id,
          action: 'unauthorized_attempt',
          accessLevel: 'metadata_only',
          outcome: 'denied',
          failureReason: 'Metadata-only permission cannot reveal credentials',
          req
        });
        const err = new Error('Access denied. Your grant is restricted to Metadata Only and cannot reveal credentials.');
        err.status = 403;
        err.code = 'FORBIDDEN_METADATA_ONLY';
        throw err;
      }
    }

    // Decrypt sensitive secrets
    const password = decryptSecret(cred.encrypted_password);
    const recoveryEmail = cred.encrypted_recovery_email ? decryptSecret(cred.encrypted_recovery_email) : null;
    const recoveryPhone = cred.encrypted_recovery_phone ? decryptSecret(cred.encrypted_recovery_phone) : null;

    // Record audit event WITHOUT secret
    await this.recordAccessLog({
      credentialId,
      clientId: cred.client_id,
      actorId: user.id,
      grantId: authorizedGrantId,
      action: 'revealed',
      accessLevel,
      outcome: 'success',
      req
    });

    return {
      credentialId: cred.id,
      platform_name: cred.platform_name,
      username: cred.username,
      password,
      recovery_email: recoveryEmail,
      recovery_phone: recoveryPhone,
      account_id: cred.account_id,
      revealed_at: new Date().toISOString()
    };
  }

  /**
   * Grant credential access to an employee
   */
  static async grantEmployeeAccess(user, credentialId, data, req = null) {
    const userScope = await this.getUserScope(user);

    // Verify credential exists
    const [creds] = await pool.query('SELECT id, client_id FROM client_credentials WHERE id = ?', [credentialId]);
    if (creds.length === 0) {
      const err = new Error('Credential not found.');
      err.status = 404;
      err.code = 'CREDENTIAL_NOT_FOUND';
      throw err;
    }
    const cred = creds[0];

    // Check authorization: Admin OR employee with manage_access
    if (userScope.scope !== 'admin') {
      const [grants] = await pool.query(
        `SELECT access_level FROM credential_access_grants
         WHERE credential_id = ? AND employee_id = ?
           AND revoked_at IS NULL
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [credentialId, user.id]
      );
      if (grants.length === 0 || grants[0].access_level !== 'manage_access') {
        const err = new Error('Access denied. Only Admins or managers with Manage Access grant can authorize employees.');
        err.status = 403;
        err.code = 'FORBIDDEN_MANAGE_ACCESS_REQUIRED';
        throw err;
      }
    }

    // Verify target employee
    const [targetEmp] = await pool.query(
      `SELECT id, name, email, client_id, status FROM users WHERE id = ?`,
      [data.employee_id]
    );

    if (targetEmp.length === 0) {
      const err = new Error('Target employee not found.');
      err.status = 404;
      err.code = 'EMPLOYEE_NOT_FOUND';
      throw err;
    }

    const emp = targetEmp[0];
    if (emp.client_id !== null) {
      const err = new Error('Cannot grant credential access to client users.');
      err.status = 400;
      err.code = 'INVALID_EMPLOYEE_TARGET';
      throw err;
    }

    if (emp.status !== 'active') {
      const err = new Error(`Cannot grant access to employee with status: ${emp.status}`);
      err.status = 400;
      err.code = 'EMPLOYEE_NOT_ACTIVE';
      throw err;
    }

    const expiresAt = data.expires_at ? new Date(data.expires_at) : null;

    // Check if an existing grant exists
    const [existing] = await pool.query(
      `SELECT id, revoked_at FROM credential_access_grants
       WHERE credential_id = ? AND employee_id = ?`,
      [credentialId, data.employee_id]
    );

    let grantId = null;

    if (existing.length > 0) {
      grantId = existing[0].id;
      await pool.query(
        `UPDATE credential_access_grants
         SET access_level = ?, access_reason = ?, expires_at = ?,
             revoked_at = NULL, revoked_by = NULL, granted_by = ?
         WHERE id = ?`,
        [data.access_level, data.access_reason || null, expiresAt, user.id, grantId]
      );
    } else {
      const [insertRes] = await pool.query(
        `INSERT INTO credential_access_grants
         (credential_id, employee_id, access_level, access_reason, granted_by, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [credentialId, data.employee_id, data.access_level, data.access_reason || null, user.id, expiresAt]
      );
      grantId = insertRes.insertId;
    }

    await this.recordAccessLog({
      credentialId,
      clientId: cred.client_id,
      actorId: user.id,
      grantId,
      action: 'access_granted',
      accessLevel: data.access_level,
      accessReason: data.access_reason || 'Granted by administrator',
      outcome: 'success',
      req
    });

    return {
      grant_id: grantId,
      credential_id: credentialId,
      employee_id: data.employee_id,
      employee_name: emp.name,
      access_level: data.access_level,
      expires_at: expiresAt,
      status: 'active'
    };
  }

  /**
   * Modify existing access grant
   */
  static async updateEmployeeGrant(user, credentialId, grantId, data, req = null) {
    const userScope = await this.getUserScope(user);

    const [grants] = await pool.query(
      `SELECT g.*, c.client_id
       FROM credential_access_grants g
       JOIN client_credentials c ON g.credential_id = c.id
       WHERE g.id = ? AND g.credential_id = ?`,
      [grantId, credentialId]
    );

    if (grants.length === 0) {
      const err = new Error('Access grant not found.');
      err.status = 404;
      err.code = 'GRANT_NOT_FOUND';
      throw err;
    }

    const grant = grants[0];

    // Authorization check
    if (userScope.scope !== 'admin') {
      const [mgrGrants] = await pool.query(
        `SELECT access_level FROM credential_access_grants
         WHERE credential_id = ? AND employee_id = ?
           AND revoked_at IS NULL
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [credentialId, user.id]
      );
      if (mgrGrants.length === 0 || mgrGrants[0].access_level !== 'manage_access') {
        const err = new Error('Access denied. Manage Access permission is required.');
        err.status = 403;
        err.code = 'FORBIDDEN_MANAGE_ACCESS_REQUIRED';
        throw err;
      }
    }

    const updates = [];
    const values = [];

    if (data.access_level !== undefined) {
      updates.push('access_level = ?');
      values.push(data.access_level);
    }
    if (data.access_reason !== undefined) {
      updates.push('access_reason = ?');
      values.push(data.access_reason || null);
    }
    if (data.expires_at !== undefined) {
      updates.push('expires_at = ?');
      values.push(data.expires_at ? new Date(data.expires_at) : null);
    }

    if (updates.length > 0) {
      values.push(grantId);
      await pool.query(
        `UPDATE credential_access_grants SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }

    await this.recordAccessLog({
      credentialId,
      clientId: grant.client_id,
      actorId: user.id,
      grantId,
      action: 'access_updated',
      accessLevel: data.access_level || grant.access_level,
      accessReason: data.access_reason || 'Updated by administrator',
      outcome: 'success',
      req
    });

    return {
      grant_id: grantId,
      status: 'updated'
    };
  }

  /**
   * Revoke an employee's access immediately
   */
  static async revokeEmployeeAccess(user, credentialId, grantId, req = null) {
    const userScope = await this.getUserScope(user);

    const [grants] = await pool.query(
      `SELECT g.*, c.client_id
       FROM credential_access_grants g
       JOIN client_credentials c ON g.credential_id = c.id
       WHERE g.id = ? AND g.credential_id = ?`,
      [grantId, credentialId]
    );

    if (grants.length === 0) {
      const err = new Error('Access grant not found.');
      err.status = 404;
      err.code = 'GRANT_NOT_FOUND';
      throw err;
    }

    const grant = grants[0];

    // Authorization: Admin, Client (for own cred), or Manage Access
    if (userScope.scope === 'client') {
      if (Number(grant.client_id) !== Number(user.client_id)) {
        const err = new Error('Unauthorized. You can only revoke access for your own credentials.');
        err.status = 403;
        err.code = 'FORBIDDEN_CLIENT_MISMATCH';
        throw err;
      }
    } else if (userScope.scope !== 'admin') {
      const [mgrGrants] = await pool.query(
        `SELECT access_level FROM credential_access_grants
         WHERE credential_id = ? AND employee_id = ?
           AND revoked_at IS NULL
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [credentialId, user.id]
      );
      if (mgrGrants.length === 0 || mgrGrants[0].access_level !== 'manage_access') {
        const err = new Error('Access denied. Manage Access permission is required.');
        err.status = 403;
        err.code = 'FORBIDDEN_MANAGE_ACCESS_REQUIRED';
        throw err;
      }
    }

    await pool.query(
      `UPDATE credential_access_grants
       SET revoked_at = NOW(), revoked_by = ?
       WHERE id = ?`,
      [user.id, grantId]
    );

    await this.recordAccessLog({
      credentialId,
      clientId: grant.client_id,
      actorId: user.id,
      grantId,
      action: 'access_revoked',
      accessReason: 'Access revoked by administrator or client',
      outcome: 'success',
      req
    });

    return {
      grant_id: grantId,
      status: 'revoked'
    };
  }

  /**
   * Client-initiated revocation of all employee grants for their credential
   */
  static async clientRevokeAllAccess(user, credentialId, req = null) {
    const [creds] = await pool.query('SELECT id, client_id FROM client_credentials WHERE id = ?', [credentialId]);
    if (creds.length === 0) {
      const err = new Error('Credential not found.');
      err.status = 404;
      err.code = 'CREDENTIAL_NOT_FOUND';
      throw err;
    }
    const cred = creds[0];

    if (Number(cred.client_id) !== Number(user.client_id)) {
      const err = new Error('Access denied. Credential does not belong to your organization.');
      err.status = 403;
      err.code = 'FORBIDDEN_CLIENT_MISMATCH';
      throw err;
    }

    await pool.query(
      `UPDATE credential_access_grants
       SET revoked_at = NOW(), revoked_by = ?
       WHERE credential_id = ? AND revoked_at IS NULL`,
      [user.id, credentialId]
    );

    await this.recordAccessLog({
      credentialId,
      clientId: cred.client_id,
      actorId: user.id,
      action: 'access_revoked_by_client',
      accessReason: 'Client requested complete revocation of all shared employee access',
      outcome: 'success',
      req
    });

    return { success: true, message: 'All shared employee access has been revoked.' };
  }

  /**
   * Retrieve audit history for a credential
   */
  static async getAuditHistory(user, credentialId) {
    const userScope = await this.getUserScope(user);

    const [creds] = await pool.query('SELECT id, client_id FROM client_credentials WHERE id = ?', [credentialId]);
    if (creds.length === 0) {
      const err = new Error('Credential not found.');
      err.status = 404;
      err.code = 'CREDENTIAL_NOT_FOUND';
      throw err;
    }
    const cred = creds[0];

    if (userScope.scope === 'client' && Number(cred.client_id) !== Number(user.client_id)) {
      const err = new Error('Access denied.');
      err.status = 403;
      err.code = 'FORBIDDEN_CLIENT_MISMATCH';
      throw err;
    }

    if (userScope.scope === 'employee') {
      const err = new Error('Audit logs are restricted to Administrators and Clients.');
      err.status = 403;
      err.code = 'FORBIDDEN_AUDIT_LOGS';
      throw err;
    }

    const [logs] = await pool.query(
      `SELECT 
        l.id, l.credential_id, l.client_id, l.actor_id,
        u.name as actor_name, u.email as actor_email,
        l.action, l.access_level, l.access_reason, l.outcome,
        l.failure_reason, l.ip_address, l.created_at
       FROM credential_access_logs l
       LEFT JOIN users u ON l.actor_id = u.id
       WHERE l.credential_id = ?
       ORDER BY l.created_at DESC
       LIMIT 100`,
      [credentialId]
    );

    return logs;
  }

  /**
   * Delete or archive credential
   */
  static async archiveCredential(user, credentialId, req = null) {
    const userScope = await this.getUserScope(user);

    const [creds] = await pool.query('SELECT id, client_id, platform_name FROM client_credentials WHERE id = ?', [credentialId]);
    if (creds.length === 0) {
      const err = new Error('Credential not found.');
      err.status = 404;
      err.code = 'CREDENTIAL_NOT_FOUND';
      throw err;
    }
    const cred = creds[0];

    if (userScope.scope === 'client' && Number(cred.client_id) !== Number(user.client_id)) {
      const err = new Error('Unauthorized.');
      err.status = 403;
      err.code = 'FORBIDDEN_CLIENT_MISMATCH';
      throw err;
    } else if (userScope.scope === 'employee') {
      const err = new Error('Employees cannot delete or archive credentials.');
      err.status = 403;
      err.code = 'FORBIDDEN_EMPLOYEE_ARCHIVE';
      throw err;
    }

    await pool.query(
      `UPDATE client_credentials SET status = 'archived', last_updated_by = ? WHERE id = ?`,
      [user.id, credentialId]
    );

    // Also revoke active grants
    await pool.query(
      `UPDATE credential_access_grants SET revoked_at = NOW(), revoked_by = ? WHERE credential_id = ? AND revoked_at IS NULL`,
      [user.id, credentialId]
    );

    await this.recordAccessLog({
      credentialId,
      clientId: cred.client_id,
      actorId: user.id,
      action: 'archived',
      accessReason: 'Credential archived by user',
      outcome: 'success',
      req
    });

    return { success: true, message: 'Credential archived successfully.' };
  }

  /**
   * Get eligible employees for granting access (Excludes clients)
   */
  static async getEligibleEmployees() {
    const [employees] = await pool.query(
      `SELECT id, name, email, department, designations, role
       FROM users
       WHERE client_id IS NULL AND status = 'active'
       ORDER BY name ASC`
    );
    return employees;
  }

  /**
   * Re-encrypt credentials for key rotation
   */
  static async rotateAllCredentials(targetKeyVersion) {
    const [rows] = await pool.query(
      `SELECT id, encrypted_password, encrypted_username, encrypted_recovery_email, encrypted_recovery_phone, key_version
       FROM client_credentials
       WHERE key_version != ?`,
      [targetKeyVersion]
    );

    let count = 0;
    for (const row of rows) {
      const newPwd = rotateSecret(row.encrypted_password, targetKeyVersion);
      const newUname = row.encrypted_username ? rotateSecret(row.encrypted_username, targetKeyVersion).newPayload : null;
      const newRecEmail = row.encrypted_recovery_email ? rotateSecret(row.encrypted_recovery_email, targetKeyVersion).newPayload : null;
      const newRecPhone = row.encrypted_recovery_phone ? rotateSecret(row.encrypted_recovery_phone, targetKeyVersion).newPayload : null;

      await pool.query(
        `UPDATE client_credentials
         SET encrypted_password = ?, encrypted_username = ?,
             encrypted_recovery_email = ?, encrypted_recovery_phone = ?,
             key_version = ?
         WHERE id = ?`,
        [newPwd.newPayload, newUname, newRecEmail, newRecPhone, targetKeyVersion, row.id]
      );
      count++;
    }

    return { rotatedCount: count, targetKeyVersion };
  }
}
