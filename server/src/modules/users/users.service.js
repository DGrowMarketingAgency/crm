import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { pool } from '../../config/db.js';
import { env } from '../../config/env.js';
import { hashToken } from '../../utils/tokens.js';
import { AuditService } from '../audit/audit.service.js';

function parseDesignations(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try {
    const parsed = typeof val === 'string' ? JSON.parse(val) : val;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [String(val)];
  }
}

export class UsersService {
  /**
   * Retrieves paginated user list with filters
   */
  static async listUsers({
    search = '',
    role = '',
    status = '',
    limit = 20,
    offset = 0,
    sort = 'created_at',
    order = 'DESC'
  }) {
    const params = [];
    let whereClauses = [];

    if (search.trim()) {
      whereClauses.push('(u.name LIKE ? OR u.email LIKE ?)');
      params.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }

    if (status.trim()) {
      whereClauses.push('u.status = ?');
      params.push(status.trim());
    }

    let roleJoin = '';
    if (role.trim()) {
      roleJoin = 'JOIN user_roles filter_ur ON u.id = filter_ur.user_id JOIN roles filter_r ON filter_ur.role_id = filter_r.id';
      whereClauses.push('filter_r.slug = ?');
      params.push(role.trim());
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Count total users
    const [countRows] = await pool.query(
      `SELECT COUNT(DISTINCT u.id) as total
       FROM users u
       ${roleJoin}
       ${whereSql}`,
      params
    );
    const total = Number(countRows[0].total);

    // Allowed sort columns
    const allowedSorts = ['name', 'email', 'status', 'created_at', 'last_login_at'];
    const safeSort = allowedSorts.includes(sort) ? `u.${sort}` : 'u.created_at';
    const safeOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Fetch users
    const [users] = await pool.query(
      `SELECT DISTINCT u.id, u.name, u.email, u.role as primary_role, u.department, u.phone, u.status, u.designations,
              u.must_change_password, u.last_login_at, u.created_at, u.updated_at
       FROM users u
       ${roleJoin}
       ${whereSql}
       ORDER BY ${safeSort} ${safeOrder}
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );

    if (users.length === 0) {
      return { users: [], total, limit: Number(limit), offset: Number(offset) };
    }

    const userIds = users.map((u) => u.id);

    // Fetch assigned roles for all fetched users
    const [rolesRows] = await pool.query(
      `SELECT ur.user_id, r.id, r.name, r.slug, r.is_system
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id IN (?)`,
      [userIds]
    );

    // Fetch teams for all fetched users
    const [teamsRows] = await pool.query(
      `SELECT tm.user_id, t.id, t.name, tm.team_role
       FROM team_members tm
       JOIN teams t ON tm.team_id = t.id
       WHERE tm.user_id IN (?)`,
      [userIds]
    );

    const rolesMap = new Map();
    rolesRows.forEach((r) => {
      if (!rolesMap.has(r.user_id)) rolesMap.set(r.user_id, []);
      rolesMap.get(r.user_id).push({
        id: r.id,
        name: r.name,
        slug: r.slug,
        is_system: Boolean(r.is_system)
      });
    });

    const teamsMap = new Map();
    teamsRows.forEach((t) => {
      if (!teamsMap.has(t.user_id)) teamsMap.set(t.user_id, []);
      teamsMap.get(t.user_id).push({
        id: t.id,
        name: t.name,
        team_role: t.team_role
      });
    });

    const enrichedUsers = users.map((u) => ({
      ...u,
      designations: parseDesignations(u.designations),
      roles: rolesMap.get(u.id) || [],
      teams: teamsMap.get(u.id) || []
    }));

    return {
      users: enrichedUsers,
      total,
      limit: Number(limit),
      offset: Number(offset)
    };
  }

  /**
   * Retrieves single user details
   */
  static async getUserById(userId) {
    const [users] = await pool.query(
      `SELECT id, name, email, role as primary_role, department, phone, status, designations, must_change_password,
              last_login_at, created_at, updated_at
       FROM users
       WHERE id = ?`,
      [userId]
    );

    if (users.length === 0) {
      const error = new Error('User not found');
      error.status = 404;
      error.code = 'USER_NOT_FOUND';
      throw error;
    }

    const user = users[0];

    // Fetch roles
    const [roles] = await pool.query(
      `SELECT r.id, r.name, r.slug, r.is_system
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = ?`,
      [userId]
    );

    // Fetch teams
    const [teams] = await pool.query(
      `SELECT t.id, t.name, tm.team_role, tm.joined_at
       FROM team_members tm
       JOIN teams t ON tm.team_id = t.id
       WHERE tm.user_id = ?`,
      [userId]
    );

    return {
      ...user,
      designations: parseDesignations(user.designations),
      roles: roles.map((r) => ({ ...r, is_system: Boolean(r.is_system) })),
      teams
    };
  }

  /**
   * Directly creates a user account
   */
  static async createUser(
    { name, email, password, roleIds = [], designations = [], department = null, phone = '', status = 'active' },
    actorUser,
    req = null
  ) {
    const trimmedEmail = email.trim().toLowerCase();

    // Check email uniqueness
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [trimmedEmail]);
    if (existing.length > 0) {
      const error = new Error('A user with this email address already exists');
      error.status = 409;
      error.code = 'EMAIL_EXISTS';
      throw error;
    }

    // Safeguard: Check if Owner role is requested
    let hasOwnerRole = false;
    if (roleIds.length > 0) {
      const [ownerRoleCheck] = await pool.query(
        "SELECT id FROM roles WHERE slug = 'owner' AND id IN (?)",
        [roleIds]
      );
      if (ownerRoleCheck.length > 0) {
        hasOwnerRole = true;
        if (!actorUser.isOwner) {
          const error = new Error('Privilege escalation denied: Only an active Owner can assign Owner privileges.');
          error.status = 403;
          error.code = 'OWNER_ESCALATION_DENIED';
          throw error;
        }
      }
    }

    // Password generation or hash
    const finalPassword = password || crypto.randomBytes(16).toString('hex') + 'A1!';
    const passwordHash = await bcrypt.hash(finalPassword, 12);
    const primaryRole = hasOwnerRole ? 'owner' : 'member';

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const designationsJson = JSON.stringify(designations || []);

      const [insertRes] = await connection.query(
        `INSERT INTO users (name, email, password_hash, role, department, phone, designations, status, must_change_password)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name.trim(), trimmedEmail, passwordHash, primaryRole, department, phone, designationsJson, status, Boolean(!password)]
      );

      const newUserId = insertRes.insertId;

      // Assign designations to normalized user_designations table
      if (Array.isArray(designations) && designations.length > 0) {
        const desValues = designations.map((d) => [newUserId, d.trim()]);
        await connection.query(
          `INSERT IGNORE INTO user_designations (user_id, designation) VALUES ?`,
          [desValues]
        );
      }

      // Assign roles
      if (roleIds.length > 0) {
        const values = roleIds.map((rId) => [newUserId, rId, actorUser.id]);
        await connection.query(
          `INSERT INTO user_roles (user_id, role_id, assigned_by)
           VALUES ?`,
          [values]
        );
      }

      await AuditService.log({
        db: connection,
        actorId: actorUser.id,
        action: 'user.created',
        entityType: 'user',
        entityId: newUserId,
        details: { name: name.trim(), email: trimmedEmail, status, roleIds, designations, department },
        req
      });

      await connection.commit();

      return {
        id: newUserId,
        name: name.trim(),
        email: trimmedEmail,
        status,
        designations: designations || [],
        department,
        primary_role: primaryRole,
        initialPassword: password ? undefined : finalPassword
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Updates user profile
   */
  static async updateUser(userId, { name, email, designations, department, phone }, actorUser, req = null) {
    const existing = await this.getUserById(userId);

    let newEmail = existing.email;
    if (email && email.trim().toLowerCase() !== existing.email) {
      newEmail = email.trim().toLowerCase();
      const [emailExists] = await pool.query(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [newEmail, userId]
      );
      if (emailExists.length > 0) {
        const error = new Error('Another user with this email address already exists');
        error.status = 409;
        error.code = 'EMAIL_EXISTS';
        throw error;
      }
    }

    const newName = name ? name.trim() : existing.name;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      let updateSql = 'UPDATE users SET name = ?, email = ?';
      const updateParams = [newName, newEmail];

      if (designations !== undefined) {
        updateSql += ', designations = ?';
        updateParams.push(JSON.stringify(designations || []));
      }
      if (department !== undefined) {
        updateSql += ', department = ?';
        updateParams.push(department);
      }
      if (phone !== undefined) {
        updateSql += ', phone = ?';
        updateParams.push(phone);
      }

      updateSql += ' WHERE id = ?';
      updateParams.push(userId);

      await connection.query(updateSql, updateParams);

      if (designations !== undefined) {
        await connection.query('DELETE FROM user_designations WHERE user_id = ?', [userId]);
        if (Array.isArray(designations) && designations.length > 0) {
          const desValues = designations.map((d) => [userId, d.trim()]);
          await connection.query(
            `INSERT IGNORE INTO user_designations (user_id, designation) VALUES ?`,
            [desValues]
          );
        }
      }

      await AuditService.log({
        db: connection,
        actorId: actorUser.id,
        action: 'user.updated',
        entityType: 'user',
        entityId: userId,
        details: {
          previous: { name: existing.name, email: existing.email, designations: existing.designations },
          updated: { name: newName, email: newEmail, designations, department }
        },
        req
      });

      await connection.commit();

      return {
        id: Number(userId),
        name: newName,
        email: newEmail,
        designations: designations !== undefined ? designations : existing.designations,
        department: department !== undefined ? department : existing.department,
        status: existing.status
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Changes account status with Session Invalidation and Owner Protection
   */
  static async changeUserStatus(targetUserId, newStatus, actorUser, req = null) {
    const target = await this.getUserById(targetUserId);

    // SAFEGUARD 1: Last Active Owner Protection
    const isTargetOwner = target.roles.some((r) => r.slug === 'owner') || target.primary_role === 'owner';

    if (isTargetOwner && newStatus !== 'active') {
      if (!actorUser.isOwner) {
        const error = new Error('Only an active Owner can modify Owner status.');
        error.status = 403;
        error.code = 'FORBIDDEN';
        throw error;
      }

      const [ownerCount] = await pool.query(
        `SELECT COUNT(DISTINCT u.id) as active_owners
         FROM users u
         JOIN user_roles ur ON u.id = ur.user_id
         JOIN roles r ON ur.role_id = r.id
         WHERE r.slug = 'owner' AND u.status = 'active'`
      );

      if (ownerCount[0].active_owners <= 1) {
        const error = new Error('Cannot deactivate or suspend the last active Owner.');
        error.status = 403;
        error.code = 'CANNOT_DEACTIVATE_LAST_OWNER';
        throw error;
      }
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Update user status
      await connection.query('UPDATE users SET status = ? WHERE id = ?', [newStatus, targetUserId]);

      // SESSION REVOCATION: If inactive or suspended, revoke all active sessions immediately
      if (newStatus !== 'active') {
        await connection.query(
          'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
          [targetUserId]
        );
      }

      await AuditService.log({
        db: connection,
        actorId: actorUser.id,
        action: 'user.status_changed',
        entityType: 'user',
        entityId: targetUserId,
        details: { previousStatus: target.status, newStatus },
        req
      });

      await connection.commit();

      return {
        id: Number(targetUserId),
        email: target.email,
        status: newStatus
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Creates a secure time-limited single-use invitation
   */
  static async createInvitation(
    { name, email, roleIds = [], designations = [], department = null, phone = '' },
    actorUser,
    req = null
  ) {
    const trimmedEmail = email.trim().toLowerCase();

    // Check if user already exists with active status
    const [existing] = await pool.query('SELECT id, status FROM users WHERE email = ?', [trimmedEmail]);
    if (existing.length > 0 && existing[0].status === 'active') {
      const error = new Error('An active user account with this email address already exists');
      error.status = 409;
      error.code = 'EMAIL_EXISTS';
      throw error;
    }

    // SAFEGUARD: Never grant Owner privileges through invitation flow
    if (roleIds.length > 0) {
      const [ownerRole] = await pool.query(
        "SELECT id FROM roles WHERE slug = 'owner' AND id IN (?)",
        [roleIds]
      );
      if (ownerRole.length > 0) {
        const error = new Error('Owner privileges cannot be granted through invitations.');
        error.status = 403;
        error.code = 'OWNER_INVITATION_FORBIDDEN';
        throw error;
      }
    }

    // Generate cryptographically random opaque token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      let targetUserId;
      const designationsJson = JSON.stringify(designations || []);

      if (existing.length > 0) {
        targetUserId = existing[0].id;
        // Revoke any previous pending invitations
        await connection.query(
          'UPDATE invitations SET revoked_at = NOW() WHERE user_id = ? AND accepted_at IS NULL AND revoked_at IS NULL',
          [targetUserId]
        );
        await connection.query(
          'UPDATE users SET name = ?, designations = ?, department = COALESCE(?, department), phone = COALESCE(?, phone) WHERE id = ?',
          [name.trim(), designationsJson, department, phone, targetUserId]
        );
      } else {
        // Create user in inactive status
        const dummyPasswordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
        const [userInsert] = await connection.query(
          `INSERT INTO users (name, email, password_hash, role, department, phone, designations, status, must_change_password)
           VALUES (?, ?, ?, 'member', ?, ?, ?, 'inactive', TRUE)`,
          [name.trim(), trimmedEmail, dummyPasswordHash, department, phone, designationsJson]
        );
        targetUserId = userInsert.insertId;
      }

      // Assign designations to user_designations table
      if (Array.isArray(designations) && designations.length > 0) {
        await connection.query('DELETE FROM user_designations WHERE user_id = ?', [targetUserId]);
        const desValues = designations.map((d) => [targetUserId, d.trim()]);
        await connection.query(
          `INSERT IGNORE INTO user_designations (user_id, designation) VALUES ?`,
          [desValues]
        );
      }

      // Assign initial roles if provided
      if (roleIds.length > 0) {
        await connection.query('DELETE FROM user_roles WHERE user_id = ?', [targetUserId]);
        const values = roleIds.map((rId) => [targetUserId, rId, actorUser.id]);
        await connection.query(
          `INSERT INTO user_roles (user_id, role_id, assigned_by)
           VALUES ?`,
          [values]
        );
      }

      // Insert invitation record
      const [invRes] = await connection.query(
        `INSERT INTO invitations (user_id, token_hash, expires_at, created_by)
         VALUES (?, ?, ?, ?)`,
        [targetUserId, tokenHash, expiresAt, actorUser.id]
      );

      await AuditService.log({
        db: connection,
        actorId: actorUser.id,
        action: 'invitation.created',
        entityType: 'invitation',
        entityId: invRes.insertId,
        details: { email: trimmedEmail, targetUserId, roleIds },
        req
      });

      await connection.commit();

      const inviteUrl = `${env.CLIENT_URL}/accept-invitation?token=${rawToken}`;

      return {
        id: invRes.insertId,
        userId: targetUserId,
        email: trimmedEmail,
        expiresAt,
        token: rawToken,
        inviteUrl,
        deliveryMethod: 'development_link'
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Lists all invitations
   */
  static async listInvitations() {
    const [rows] = await pool.query(
      `SELECT i.id, i.user_id, u.name as user_name, u.email as user_email,
              i.expires_at, i.accepted_at, i.revoked_at, i.created_at,
              inviter.name as inviter_name
       FROM invitations i
       JOIN users u ON i.user_id = u.id
       LEFT JOIN users inviter ON i.created_by = inviter.id
       ORDER BY i.created_at DESC`
    );

    return rows.map((r) => {
      let status = 'pending';
      if (r.accepted_at) status = 'accepted';
      else if (r.revoked_at) status = 'revoked';
      else if (new Date(r.expires_at) < new Date()) status = 'expired';

      return {
        ...r,
        status
      };
    });
  }

  /**
   * Resends invitation by rotating token
   */
  static async resendInvitation(invitationId, actorUser, req = null) {
    const [invRows] = await pool.query(
      `SELECT i.id, i.user_id, i.accepted_at, u.email, u.name
       FROM invitations i
       JOIN users u ON i.user_id = u.id
       WHERE i.id = ?`,
      [invitationId]
    );

    if (invRows.length === 0) {
      const error = new Error('Invitation not found');
      error.status = 404;
      error.code = 'INVITATION_NOT_FOUND';
      throw error;
    }

    const invitation = invRows[0];
    if (invitation.accepted_at) {
      const error = new Error('Cannot resend an already accepted invitation');
      error.status = 400;
      error.code = 'INVITATION_ALREADY_ACCEPTED';
      throw error;
    }

    const newRawToken = crypto.randomBytes(32).toString('hex');
    const newTokenHash = hashToken(newRawToken);
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        `UPDATE invitations
         SET token_hash = ?, expires_at = ?, revoked_at = NULL
         WHERE id = ?`,
        [newTokenHash, newExpiresAt, invitationId]
      );

      await AuditService.log({
        db: connection,
        actorId: actorUser.id,
        action: 'invitation.resent',
        entityType: 'invitation',
        entityId: invitationId,
        details: { email: invitation.email },
        req
      });

      await connection.commit();

      const inviteUrl = `${env.CLIENT_URL}/accept-invitation?token=${newRawToken}`;

      return {
        id: Number(invitationId),
        email: invitation.email,
        token: newRawToken,
        inviteUrl,
        expiresAt: newExpiresAt
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Revokes a pending invitation
   */
  static async revokeInvitation(invitationId, actorUser, req = null) {
    const [invRows] = await pool.query('SELECT id, accepted_at FROM invitations WHERE id = ?', [invitationId]);
    if (invRows.length === 0) {
      const error = new Error('Invitation not found');
      error.status = 404;
      error.code = 'INVITATION_NOT_FOUND';
      throw error;
    }

    if (invRows[0].accepted_at) {
      const error = new Error('Cannot revoke an already accepted invitation');
      error.status = 400;
      error.code = 'INVITATION_ALREADY_ACCEPTED';
      throw error;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query('UPDATE invitations SET revoked_at = NOW() WHERE id = ?', [invitationId]);

      await AuditService.log({
        db: connection,
        actorId: actorUser.id,
        action: 'invitation.revoked',
        entityType: 'invitation',
        entityId: invitationId,
        req
      });

      await connection.commit();
      return true;
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Accepts invitation and activates account
   */
  static async acceptInvitation(rawToken, password, req = null) {
    const tokenHash = hashToken(rawToken);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [invRows] = await connection.query(
        `SELECT i.id, i.user_id, i.expires_at, i.accepted_at, i.revoked_at, u.name, u.email
         FROM invitations i
         JOIN users u ON i.user_id = u.id
         WHERE i.token_hash = ?
         FOR UPDATE`,
        [tokenHash]
      );

      if (invRows.length === 0) {
        await connection.rollback();
        const error = new Error('Invalid invitation token');
        error.status = 400;
        error.code = 'INVALID_INVITATION_TOKEN';
        throw error;
      }

      const inv = invRows[0];

      if (inv.accepted_at) {
        await connection.rollback();
        const error = new Error('This invitation has already been accepted.');
        error.status = 400;
        error.code = 'INVITATION_ALREADY_ACCEPTED';
        throw error;
      }

      if (inv.revoked_at) {
        await connection.rollback();
        const error = new Error('This invitation has been revoked. Please contact administrator.');
        error.status = 400;
        error.code = 'INVITATION_REVOKED';
        throw error;
      }

      if (new Date(inv.expires_at) < new Date()) {
        await connection.rollback();
        const error = new Error('This invitation has expired. Please ask for a new invitation.');
        error.status = 400;
        error.code = 'INVITATION_EXPIRED';
        throw error;
      }

      // Hash password with bcrypt
      const passwordHash = await bcrypt.hash(password, 12);

      // Activate user account and set password
      await connection.query(
        `UPDATE users
         SET password_hash = ?, status = 'active', must_change_password = FALSE
         WHERE id = ?`,
        [passwordHash, inv.user_id]
      );

      // Invalidate/accept invitation
      await connection.query(
        'UPDATE invitations SET accepted_at = NOW() WHERE id = ?',
        [inv.id]
      );

      await AuditService.log({
        db: connection,
        actorId: inv.user_id,
        action: 'invitation.accepted',
        entityType: 'user',
        entityId: inv.user_id,
        details: { email: inv.email },
        req
      });

      await connection.commit();

      return {
        userId: inv.user_id,
        name: inv.name,
        email: inv.email
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Retrieves teams the user belongs to
   */
  static async getUserTeams(userId) {
    const user = await this.getUserById(userId);
    return user.teams;
  }
}
