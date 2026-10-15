import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';

export const BD_PIPELINE_STAGES = {
  'D-Grow': ['New', 'Contacted', 'DiscoveryCallDone', 'ProposalSent', 'Negotiation', 'Won', 'Lost'],
  'MedGrowDigi': ['New', 'Contacted', 'DiscoveryCallDone', 'ProposalSent', 'Negotiation', 'Won', 'Lost'],
  'Mediqora': ['New', 'DemoScheduled', 'DemoDone', 'Trial', 'PlanSelected', 'Won', 'Lost']
};

export class LeadsService {
  static async listLeads(
    { pipelineEntity = '', stage = '', ownerUserId = '', search = '', limit = 50, offset = 0 },
    actorUser
  ) {
    const params = [];
    const whereClauses = [];

    // Isolation: Field Exec only sees their own leads, AM sees assigned, Owner/Admin sees all
    const userSlugs = actorUser.roles?.map((r) => r.slug) || [];
    const isGlobal = actorUser.is_owner || userSlugs.includes('owner') || userSlugs.includes('admin');
    if (!isGlobal) {
      if (userSlugs.includes('field-executive') || userSlugs.includes('account-manager')) {
        whereClauses.push('(l.owner_user_id = ? OR l.created_by = ?)');
        params.push(actorUser.id, actorUser.id);
      }
    }

    if (pipelineEntity.trim()) {
      whereClauses.push('l.pipeline_entity = ?');
      params.push(pipelineEntity.trim());
    }

    if (stage.trim()) {
      whereClauses.push('l.stage = ?');
      params.push(stage.trim());
    }

    if (ownerUserId) {
      whereClauses.push('l.owner_user_id = ?');
      params.push(Number(ownerUserId));
    }

    if (search.trim()) {
      whereClauses.push('(l.title LIKE ? OR l.company_name LIKE ? OR l.contact_name LIKE ? OR l.email LIKE ?)');
      params.push(`%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM leads l ${whereSql}`,
      params
    );
    const total = Number(countRows[0].total);

    const [leads] = await pool.query(
      `SELECT l.*,
              u.name as owner_name, u.email as owner_email,
              c.name as converted_client_name
       FROM leads l
       LEFT JOIN users u ON l.owner_user_id = u.id
       LEFT JOIN clients c ON l.converted_client_id = c.id
       ${whereSql}
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );

    return {
      leads,
      total,
      limit: Number(limit),
      offset: Number(offset)
    };
  }

  static async getLeadById(leadId, actorUser) {
    const [rows] = await pool.query(
      `SELECT l.*,
              u.name as owner_name, u.email as owner_email,
              c.name as converted_client_name
       FROM leads l
       LEFT JOIN users u ON l.owner_user_id = u.id
       LEFT JOIN clients c ON l.converted_client_id = c.id
       WHERE l.id = ?`,
      [leadId]
    );

    if (rows.length === 0) {
      const err = new Error('Lead not found');
      err.status = 404;
      err.code = 'LEAD_NOT_FOUND';
      throw err;
    }

    return rows[0];
  }

  static async createLead(data, actorUser, req = null) {
    const pipelineEntity = data.pipelineEntity || 'D-Grow';
    const validStages = BD_PIPELINE_STAGES[pipelineEntity] || BD_PIPELINE_STAGES['D-Grow'];
    const stage = data.stage && validStages.includes(data.stage) ? data.stage : 'New';

    const [result] = await pool.query(
      `INSERT INTO leads (
        pipeline_entity, stage, title, company_name, contact_name,
        email, phone, source, estimated_value, owner_user_id, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pipelineEntity,
        stage,
        data.title.trim(),
        data.companyName || null,
        data.contactName || null,
        data.email ? data.email.trim().toLowerCase() : null,
        data.phone || null,
        data.source || null,
        data.estimatedValue || null,
        data.ownerUserId || actorUser.id,
        data.notes || null,
        actorUser.id
      ]
    );

    const leadId = result.insertId;

    await AuditService.log({
      actorUserId: actorUser.id,
      action: 'lead.created',
      targetType: 'lead',
      targetId: leadId,
      details: { title: data.title, pipelineEntity, stage },
      req
    });

    return this.getLeadById(leadId, actorUser);
  }

  static async updateLead(leadId, data, actorUser, req = null) {
    const lead = await this.getLeadById(leadId, actorUser);

    const pipelineEntity = data.pipelineEntity || lead.pipeline_entity;
    const stage = data.stage || lead.stage;
    const title = data.title ? data.title.trim() : lead.title;
    const companyName = data.companyName !== undefined ? data.companyName : lead.company_name;
    const contactName = data.contactName !== undefined ? data.contactName : lead.contact_name;
    const email = data.email !== undefined ? (data.email ? data.email.trim().toLowerCase() : null) : lead.email;
    const phone = data.phone !== undefined ? data.phone : lead.phone;
    const source = data.source !== undefined ? data.source : lead.source;
    const estimatedValue = data.estimatedValue !== undefined ? data.estimatedValue : lead.estimated_value;
    const ownerUserId = data.ownerUserId !== undefined ? data.ownerUserId : lead.owner_user_id;
    const notes = data.notes !== undefined ? data.notes : lead.notes;

    await pool.query(
      `UPDATE leads
       SET pipeline_entity = ?, stage = ?, title = ?, company_name = ?,
           contact_name = ?, email = ?, phone = ?, source = ?, estimated_value = ?,
           owner_user_id = ?, notes = ?
       WHERE id = ?`,
      [
        pipelineEntity, stage, title, companyName,
        contactName, email, phone, source, estimatedValue,
        ownerUserId, notes, leadId
      ]
    );

    await AuditService.log({
      actorUserId: actorUser.id,
      action: 'lead.updated',
      targetType: 'lead',
      targetId: leadId,
      details: { previousStage: lead.stage, newStage: stage },
      req
    });

    return this.getLeadById(leadId, actorUser);
  }

  static async convertLead(leadId, { accountManagerId = null }, actorUser, req = null) {
    const lead = await this.getLeadById(leadId, actorUser);

    if (lead.converted_client_id) {
      const err = new Error('Lead has already been converted to a client');
      err.status = 409;
      err.code = 'LEAD_ALREADY_CONVERTED';
      throw err;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Create client record
      const clientName = lead.company_name || lead.contact_name || lead.title;
      const clientEmail = lead.email || `client-${leadId}@dgrow.internal`;
      const clientEntity = lead.pipeline_entity === 'MedGrowDigi' ? 'MedGrowDigi' : 'D-Grow';
      const vertical = lead.pipeline_entity === 'MedGrowDigi' ? 'Healthcare' : 'General';

      const [cRes] = await connection.query(
        `INSERT INTO clients (
          name, email, entity, vertical, lifecycle_stage, account_manager_id,
          company_name, phone, status, created_by
        ) VALUES (?, ?, ?, ?, 'L1', ?, ?, ?, 'active', ?)`,
        [
          clientName,
          clientEmail,
          clientEntity,
          vertical,
          accountManagerId || actorUser.id,
          lead.company_name,
          lead.phone,
          actorUser.id
        ]
      );

      const clientId = cRes.insertId;

      // 2. Mark lead as Won and link client
      await connection.query(
        `UPDATE leads SET stage = 'Won', converted_client_id = ? WHERE id = ?`,
        [clientId, leadId]
      );

      await connection.commit();

      await AuditService.log({
        actorUserId: actorUser.id,
        action: 'lead.converted_to_client',
        targetType: 'lead',
        targetId: leadId,
        details: { clientId, clientName, pipelineEntity: lead.pipeline_entity },
        req
      });

      return {
        success: true,
        message: 'Lead successfully converted to Client',
        client_id: clientId,
        client_name: clientName,
        lifecycle_stage: 'L1',
        client: {
          id: clientId,
          name: clientName,
          entity: clientEntity,
          lifecycle_stage: 'L1'
        }
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }
}

