import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';

export class TeamsService {
  /**
   * Retrieves paginated team list
   */
  static async listTeams({
    search = '',
    status = '',
    limit = 20,
    offset = 0
  }) {
    const params = [];
    const whereClauses = [];

    if (search.trim()) {
      whereClauses.push('(t.name LIKE ? OR t.description LIKE ?)');
      params.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }

    if (status.trim()) {
      whereClauses.push('t.status = ?');
      params.push(status.trim());
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM teams t ${whereSql}`,
      params
    );
    const total = Number(countRows[0].total);

    const [teams] = await pool.query(
      `SELECT t.id, t.name, t.description, t.status, t.leader_id,
              t.created_at, t.updated_at,
              u.name as leader_name, u.email as leader_email,
              COUNT(DISTINCT tm.user_id) as member_count
       FROM teams t
       LEFT JOIN users u ON t.leader_id = u.id
       LEFT JOIN team_members tm ON t.id = tm.team_id
       ${whereSql}
       GROUP BY t.id
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );

    return {
      teams: teams.map((t) => ({
        ...t,
        member_count: Number(t.member_count)
      })),
      total,
      limit: Number(limit),
      offset: Number(offset)
    };
  }

  /**
   * Retrieves single team details with member listing
   */
  static async getTeamById(teamId) {
    const [teamRows] = await pool.query(
      `SELECT t.id, t.name, t.description, t.status, t.leader_id,
              t.created_at, t.updated_at,
              u.name as leader_name, u.email as leader_email
       FROM teams t
       LEFT JOIN users u ON t.leader_id = u.id
       WHERE t.id = ?`,
      [teamId]
    );

    if (teamRows.length === 0) {
      const error = new Error('Team not found');
      error.status = 404;
      error.code = 'TEAM_NOT_FOUND';
      throw error;
    }

    const team = teamRows[0];

    // Fetch members
    const [members] = await pool.query(
      `SELECT tm.user_id, tm.team_role, tm.joined_at,
              u.name, u.email, u.status as user_status, u.role as primary_role
       FROM team_members tm
       JOIN users u ON tm.user_id = u.id
       WHERE tm.team_id = ?
       ORDER BY (tm.team_role = 'leader') DESC, u.name ASC`,
      [teamId]
    );

    return {
      ...team,
      member_count: members.length,
      members
    };
  }

  /**
   * Creates a new team with designated leader and initial members
   */
  static async createTeam({ name, description, status = 'active', leaderId = null, memberIds = [] }, actorUser, req = null) {
    const trimmedName = name.trim();

    // Check unique name
    const [existing] = await pool.query('SELECT id FROM teams WHERE LOWER(name) = LOWER(?)', [trimmedName]);
    if (existing.length > 0) {
      const error = new Error(`A team with name '${trimmedName}' already exists`);
      error.status = 409;
      error.code = 'TEAM_NAME_EXISTS';
      throw error;
    }

    // Verify leader if provided
    if (leaderId) {
      const [leaderRows] = await pool.query('SELECT id, status FROM users WHERE id = ?', [leaderId]);
      if (leaderRows.length === 0) {
        const error = new Error('Designated team leader does not exist');
        error.status = 400;
        error.code = 'LEADER_NOT_FOUND';
        throw error;
      }
      if (leaderRows[0].status !== 'active') {
        const error = new Error('Inactive or suspended users cannot be designated as team leader');
        error.status = 400;
        error.code = 'INACTIVE_USER_CANNOT_BE_MEMBER';
        throw error;
      }
    }

    // Verify members if provided
    let allMemberIds = Array.from(new Set(memberIds));
    if (leaderId && !allMemberIds.includes(leaderId)) {
      allMemberIds.push(leaderId);
    }

    if (allMemberIds.length > 0) {
      const [activeUsers] = await pool.query(
        'SELECT id, status FROM users WHERE id IN (?)',
        [allMemberIds]
      );
      if (activeUsers.length !== allMemberIds.length) {
        const error = new Error('One or more selected member IDs do not exist');
        error.status = 400;
        error.code = 'INVALID_MEMBER_IDS';
        throw error;
      }
      const hasInactive = activeUsers.some((u) => u.status !== 'active');
      if (hasInactive) {
        const error = new Error('Do not allow inactive or suspended users to be added as active team members');
        error.status = 400;
        error.code = 'INACTIVE_USER_CANNOT_BE_MEMBER';
        throw error;
      }
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [insertRes] = await connection.query(
        `INSERT INTO teams (name, description, leader_id, status, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [trimmedName, description || null, leaderId || null, status, actorUser.id]
      );

      const newTeamId = insertRes.insertId;

      // Insert members into team_members
      if (allMemberIds.length > 0) {
        const values = allMemberIds.map((uId) => [
          newTeamId,
          uId,
          uId === leaderId ? 'leader' : 'member'
        ]);
        await connection.query(
          `INSERT INTO team_members (team_id, user_id, team_role)
           VALUES ?`,
          [values]
        );
      }

      await AuditService.log({
        db: connection,
        actorId: actorUser.id,
        action: 'team.created',
        entityType: 'team',
        entityId: newTeamId,
        details: { name: trimmedName, leaderId, memberCount: allMemberIds.length },
        req
      });

      await connection.commit();

      return {
        id: newTeamId,
        name: trimmedName,
        description,
        status,
        leaderId,
        memberCount: allMemberIds.length
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Updates an existing team
   */
  static async updateTeam(teamId, { name, description, status }, actorUser, req = null) {
    const existing = await this.getTeamById(teamId);

    let newName = existing.name;
    if (name && name.trim().toLowerCase() !== existing.name.toLowerCase()) {
      newName = name.trim();
      const [nameExists] = await pool.query(
        'SELECT id FROM teams WHERE LOWER(name) = LOWER(?) AND id != ?',
        [newName, teamId]
      );
      if (nameExists.length > 0) {
        const error = new Error(`Another team with name '${newName}' already exists`);
        error.status = 409;
        error.code = 'TEAM_NAME_EXISTS';
        throw error;
      }
    }

    const newDesc = description !== undefined ? description : existing.description;
    const newStatus = status || existing.status;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        `UPDATE teams
         SET name = ?, description = ?, status = ?
         WHERE id = ?`,
        [newName, newDesc, newStatus, teamId]
      );

      await AuditService.log({
        db: connection,
        actorId: actorUser.id,
        action: 'team.updated',
        entityType: 'team',
        entityId: teamId,
        details: {
          previous: { name: existing.name, status: existing.status },
          updated: { name: newName, status: newStatus }
        },
        req
      });

      await connection.commit();

      return {
        id: Number(teamId),
        name: newName,
        description: newDesc,
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
   * Deletes / archives a team
   */
  static async deleteTeam(teamId, actorUser, req = null) {
    const existing = await this.getTeamById(teamId);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query('DELETE FROM teams WHERE id = ?', [teamId]);

      await AuditService.log({
        db: connection,
        actorId: actorUser.id,
        action: 'team.deleted',
        entityType: 'team',
        entityId: teamId,
        details: { name: existing.name },
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
   * Retrieves members of a team
   */
  static async getTeamMembers(teamId) {
    const team = await this.getTeamById(teamId);
    return team.members;
  }

  /**
   * Adds a member to a team
   */
  static async addTeamMember(teamId, { userId, teamRole = 'member' }, actorUser, req = null) {
    await this.getTeamById(teamId);

    // Verify user exists and status is active
    const [userRows] = await pool.query('SELECT id, name, email, status FROM users WHERE id = ?', [userId]);
    if (userRows.length === 0) {
      const error = new Error('User not found');
      error.status = 404;
      error.code = 'USER_NOT_FOUND';
      throw error;
    }

    if (userRows[0].status !== 'active') {
      const error = new Error('Inactive or suspended users cannot be added as active team members');
      error.status = 400;
      error.code = 'INACTIVE_USER_CANNOT_BE_MEMBER';
      throw error;
    }

    // Check for duplicate membership
    const [existingMember] = await pool.query(
      'SELECT user_id FROM team_members WHERE team_id = ? AND user_id = ?',
      [teamId, userId]
    );
    if (existingMember.length > 0) {
      const error = new Error('User is already a member of this team');
      error.status = 409;
      error.code = 'DUPLICATE_TEAM_MEMBERSHIP';
      throw error;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        `INSERT INTO team_members (team_id, user_id, team_role)
         VALUES (?, ?, ?)`,
        [teamId, userId, teamRole]
      );

      await AuditService.log({
        db: connection,
        actorId: actorUser.id,
        action: 'team.member_added',
        entityType: 'team',
        entityId: teamId,
        details: { userId, userName: userRows[0].name, teamRole },
        req
      });

      await connection.commit();

      return {
        teamId: Number(teamId),
        userId,
        teamRole,
        user: userRows[0]
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Removes a member from a team
   */
  static async removeTeamMember(teamId, userId, actorUser, req = null) {
    const team = await this.getTeamById(teamId);

    // Safeguard: Cannot remove current designated team leader directly
    if (Number(team.leader_id) === Number(userId)) {
      const error = new Error('Cannot remove the designated team leader. Please assign a new team leader first.');
      error.status = 400;
      error.code = 'CANNOT_REMOVE_TEAM_LEADER';
      throw error;
    }

    const [memberCheck] = await pool.query(
      'SELECT user_id FROM team_members WHERE team_id = ? AND user_id = ?',
      [teamId, userId]
    );
    if (memberCheck.length === 0) {
      const error = new Error('User is not a member of this team');
      error.status = 404;
      error.code = 'MEMBER_NOT_FOUND';
      throw error;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        'DELETE FROM team_members WHERE team_id = ? AND user_id = ?',
        [teamId, userId]
      );

      await AuditService.log({
        db: connection,
        actorId: actorUser.id,
        action: 'team.member_removed',
        entityType: 'team',
        entityId: teamId,
        details: { userId },
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
   * Assigns or changes a team leader transactionally
   */
  static async assignTeamLeader(teamId, leaderId, actorUser, req = null) {
    const team = await this.getTeamById(teamId);

    // Verify leader user exists and is active
    const [userRows] = await pool.query('SELECT id, name, status FROM users WHERE id = ?', [leaderId]);
    if (userRows.length === 0) {
      const error = new Error('User not found');
      error.status = 404;
      error.code = 'USER_NOT_FOUND';
      throw error;
    }

    if (userRows[0].status !== 'active') {
      const error = new Error('Inactive or suspended users cannot be designated as team leader');
      error.status = 400;
      error.code = 'INACTIVE_USER_CANNOT_BE_MEMBER';
      throw error;
    }

    const previousLeaderId = team.leader_id;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Update team leader in teams table
      await connection.query('UPDATE teams SET leader_id = ? WHERE id = ?', [leaderId, teamId]);

      // 2. If previous leader was designated, update their role to 'member'
      if (previousLeaderId && Number(previousLeaderId) !== Number(leaderId)) {
        await connection.query(
          `UPDATE team_members SET team_role = 'member' WHERE team_id = ? AND user_id = ?`,
          [teamId, previousLeaderId]
        );
      }

      // 3. Ensure new leader is a member and marked as 'leader'
      const [existingMember] = await connection.query(
        'SELECT user_id FROM team_members WHERE team_id = ? AND user_id = ?',
        [teamId, leaderId]
      );

      if (existingMember.length > 0) {
        await connection.query(
          `UPDATE team_members SET team_role = 'leader' WHERE team_id = ? AND user_id = ?`,
          [teamId, leaderId]
        );
      } else {
        // Automatically add leader as member
        await connection.query(
          `INSERT INTO team_members (team_id, user_id, team_role)
           VALUES (?, ?, 'leader')`,
          [teamId, leaderId]
        );
      }

      await AuditService.log({
        db: connection,
        actorId: actorUser.id,
        action: 'team.leader_assigned',
        entityType: 'team',
        entityId: teamId,
        details: { previousLeaderId, newLeaderId: leaderId, leaderName: userRows[0].name },
        req
      });

      await connection.commit();

      return {
        teamId: Number(teamId),
        leaderId,
        leaderName: userRows[0].name
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }
}
