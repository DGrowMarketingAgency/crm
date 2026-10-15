import { pool } from '../../config/db.js';

export class AuditService {
  /**
   * Records an audit log entry
   * @param {Object} params
   * @param {import('mysql2/promise').Connection | import('mysql2/promise').Pool} [params.db]
   * @param {number|null} params.actorId
   * @param {string} params.action
   * @param {string} params.entityType
   * @param {string|number} params.entityId
   * @param {Object} [params.details]
   * @param {import('express').Request} [params.req]
   */
  static async log({
    db = pool,
    actorId = null,
    actorUserId = null,
    action,
    entityType,
    targetType,
    entityId,
    targetId,
    details = null,
    req = null
  }) {
    try {
      const finalActorId = actorId || actorUserId || null;
      const finalEntityType = entityType || targetType || 'system';
      const finalEntityId = entityId !== undefined ? entityId : (targetId !== undefined ? targetId : '');
      const ip = req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null) : null;
      const userAgent = req ? (req.headers['user-agent']?.slice(0, 255) || null) : null;
      const detailsJson = details ? JSON.stringify(details) : null;

      await db.query(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [finalActorId, action, finalEntityType, String(finalEntityId), detailsJson, ip, userAgent]
      );
    } catch (error) {
      // Avoid failing transaction if audit write encounters a minor logging issue
      console.error('⚠️ Failed to write audit log:', error.message);
    }
  }

  /**
   * Retrieves audit logs with optional pagination
   */
  static async getLogs(limit = 50, offset = 0) {
    const [rows] = await pool.query(
      `SELECT a.id, a.actor_id, u.name as actor_name, u.email as actor_email,
              a.action, a.entity_type, a.entity_id, a.details, a.ip_address, a.created_at
       FROM audit_logs a
       LEFT JOIN users u ON a.actor_id = u.id
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
      [Number(limit), Number(offset)]
    );
    return rows;
  }
}
