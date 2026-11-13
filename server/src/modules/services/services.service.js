import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';
import { SERVICES_CATALOG } from './workflows.data.js';

export class ServicesService {
  /**
   * List paginated services with filter and search
   */
  static async listServices({
    search = '',
    category = '',
    departmentId = '',
    status = '',
    sortBy = 'name',
    sortOrder = 'asc',
    limit = 50,
    offset = 0
  }) {
    const whereClauses = [];
    const params = [];

    if (search && search.trim()) {
      whereClauses.push('(s.name LIKE ? OR s.service_code LIKE ? OR s.description LIKE ?)');
      params.push(`%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`);
    }

    if (category && category.trim()) {
      whereClauses.push('s.category = ?');
      params.push(category.trim());
    }

    if (departmentId) {
      whereClauses.push('s.department_id = ?');
      params.push(Number(departmentId));
    }

    if (status && status.trim()) {
      whereClauses.push('s.status = ?');
      params.push(status.trim());
    } else {
      // By default exclude archived unless explicitly requested
      whereClauses.push("s.status != 'archived'");
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM services s ${whereSql}`,
      params
    );
    const total = Number(countRows[0].total);

    const sortMap = {
      name: 's.name',
      service_code: 's.service_code',
      category: 's.category',
      status: 's.status',
      created_at: 's.created_at'
    };
    const orderCol = sortMap[sortBy] || 's.name';
    const direction = String(sortOrder).toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    const [services] = await pool.query(
      `SELECT s.*, 
              d.name as department_name, d.code as department_code,
              wp.name as workflow_preset_name, wp.preset_code as workflow_preset_code,
              wp.status as workflow_preset_status,
              COUNT(DISTINCT si.id) as active_instances_count
       FROM services s
       LEFT JOIN departments d ON s.department_id = d.id
       LEFT JOIN workflow_presets wp ON s.workflow_preset_id = wp.id
       LEFT JOIN service_instances si ON (si.service_id = s.id OR si.service_type = s.service_code) AND si.status = 'active'
       ${whereSql}
       GROUP BY s.id
       ORDER BY ${orderCol} ${direction}
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );

    return {
      total,
      services: services.map((s) => ({
        ...s,
        active_instances_count: Number(s.active_instances_count || 0)
      }))
    };
  }

  /**
   * Get single service details with workflow preset preview
   */
  static async getServiceById(id) {
    const [rows] = await pool.query(
      `SELECT s.*, 
              d.name as department_name, d.code as department_code,
              wp.name as workflow_preset_name, wp.preset_code as workflow_preset_code,
              wp.status as workflow_preset_status, wp.current_version_id
       FROM services s
       LEFT JOIN departments d ON s.department_id = d.id
       LEFT JOIN workflow_presets wp ON s.workflow_preset_id = wp.id
       WHERE s.id = ? OR s.service_code = ?`,
      [id, id]
    );

    if (rows.length === 0) {
      const err = new Error('Service not found');
      err.status = 404;
      err.code = 'SERVICE_NOT_FOUND';
      throw err;
    }

    const service = rows[0];

    // Check if workflow stages & tasks can be previewed from workflow_presets
    let workflowPreview = null;
    if (service.workflow_preset_id) {
      const [versions] = await pool.query(
        `SELECT id, version_number, status, estimated_duration_days
         FROM workflow_preset_versions 
         WHERE preset_id = ? AND status = 'published'
         ORDER BY version_number DESC LIMIT 1`,
        [service.workflow_preset_id]
      );

      const activeVersion = versions.length > 0 ? versions[0] : null;
      if (activeVersion) {
        const [stages] = await pool.query(
          `SELECT id, stage_key, name, description, display_order, stage_category,
                  is_client_facing, is_review_required, requires_client_approval
           FROM workflow_stages 
           WHERE preset_version_id = ? 
           ORDER BY display_order ASC`,
          [activeVersion.id]
        );

        const stageIds = stages.map((st) => st.id);
        let tasksByStage = {};
        if (stageIds.length > 0) {
          const [tasks] = await pool.query(
            `SELECT id, stage_id, task_key, title, description, default_assignee_role,
                    estimated_duration_hours, relative_deadline_days, priority,
                    requires_internal_review, requires_client_approval, display_order
             FROM task_templates
             WHERE stage_id IN (?)
             ORDER BY display_order ASC`,
            [stageIds]
          );
          for (const t of tasks) {
            if (!tasksByStage[t.stage_id]) tasksByStage[t.stage_id] = [];
            tasksByStage[t.stage_id].push(t);
          }
        }

        workflowPreview = {
          version: activeVersion,
          stages: stages.map((st) => ({
            ...st,
            tasks: tasksByStage[st.id] || []
          }))
        };
      }
    }

    // Fallback preview from SERVICES_CATALOG if no DB workflow preset is linked yet
    if (!workflowPreview && SERVICES_CATALOG[service.service_code]) {
      const cat = SERVICES_CATALOG[service.service_code];
      workflowPreview = {
        version: { version_number: 1, status: 'published', source: 'code_catalog' },
        stages: cat.stages.map((st, sIdx) => ({
          id: sIdx + 1,
          name: st.name,
          days: st.days,
          tasks: st.tasks.map((t, tIdx) => ({
            id: tIdx + 1,
            title: typeof t === 'string' ? t : t.title,
            requires_client_approval: typeof t === 'object' && Boolean(t.cr),
            default_assignee_role: typeof t === 'object' && t.role ? t.role : cat.ownerRole
          }))
        }))
      };
    }

    return {
      service,
      workflowPreview
    };
  }

  /**
   * Create a new master service
   */
  static async createService(data, actorUser, req = null) {
    const {
      service_code,
      name,
      description = '',
      category = 'Digital Marketing',
      department_id = null,
      default_owner_role = 'AccountManager',
      execution_cycle = 'Monthly',
      workflow_preset_id = null,
      status = 'active'
    } = data;

    if (!service_code || !name) {
      const err = new Error('service_code and name are required');
      err.status = 400;
      err.code = 'INVALID_SERVICE_DATA';
      throw err;
    }

    // Verify uniqueness of service_code
    const [existing] = await pool.query(
      'SELECT id FROM services WHERE service_code = ?',
      [service_code.trim()]
    );
    if (existing.length > 0) {
      const err = new Error(`Service code "${service_code}" already exists`);
      err.status = 409;
      err.code = 'SERVICE_CODE_EXISTS';
      throw err;
    }

    const [res] = await pool.query(
      `INSERT INTO services (
        service_code, name, description, category, department_id,
        default_owner_role, execution_cycle, workflow_preset_id, status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        service_code.trim(),
        name.trim(),
        description,
        category,
        department_id || null,
        default_owner_role,
        execution_cycle,
        workflow_preset_id || null,
        status,
        actorUser.id
      ]
    );

    const newId = res.insertId;

    await AuditService.log({
      actorUserId: actorUser.id,
      action: 'services.created',
      targetType: 'service',
      targetId: newId,
      details: { service_code, name, category },
      req
    });

    return this.getServiceById(newId);
  }

  /**
   * Update existing service
   */
  static async updateService(id, data, actorUser, req = null) {
    const { service } = await this.getServiceById(id);

    const {
      name = service.name,
      description = service.description,
      category = service.category,
      department_id = service.department_id,
      default_owner_role = service.default_owner_role,
      execution_cycle = service.execution_cycle,
      workflow_preset_id = service.workflow_preset_id,
      status = service.status
    } = data;

    await pool.query(
      `UPDATE services SET 
        name = ?, description = ?, category = ?, department_id = ?,
        default_owner_role = ?, execution_cycle = ?, workflow_preset_id = ?,
        status = ?, updated_by = ?
       WHERE id = ?`,
      [
        name,
        description,
        category,
        department_id || null,
        default_owner_role,
        execution_cycle,
        workflow_preset_id || null,
        status,
        actorUser.id,
        service.id
      ]
    );

    await AuditService.log({
      actorUserId: actorUser.id,
      action: 'services.updated',
      targetType: 'service',
      targetId: service.id,
      details: { updatedFields: Object.keys(data) },
      req
    });

    return this.getServiceById(service.id);
  }

  /**
   * Change status (active/inactive)
   */
  static async changeStatus(id, status, actorUser, req = null) {
    if (!['active', 'inactive', 'archived'].includes(status)) {
      const err = new Error('Invalid status value');
      err.status = 400;
      err.code = 'INVALID_STATUS';
      throw err;
    }

    const { service } = await this.getServiceById(id);
    await pool.query('UPDATE services SET status = ?, updated_by = ? WHERE id = ?', [
      status,
      actorUser.id,
      service.id
    ]);

    await AuditService.log({
      actorUserId: actorUser.id,
      action: 'services.status_changed',
      targetType: 'service',
      targetId: service.id,
      details: { oldStatus: service.status, newStatus: status },
      req
    });

    return this.getServiceById(service.id);
  }

  /**
   * Archive service
   */
  static async archiveService(id, actorUser, req = null) {
    return this.changeStatus(id, 'archived', actorUser, req);
  }

  /**
   * Get distinct categories
   */
  static async getCategories() {
    const [rows] = await pool.query(
      `SELECT DISTINCT category FROM services WHERE category IS NOT NULL AND category != '' ORDER BY category ASC`
    );
    const set = new Set(['Digital Marketing', 'Creative', 'Development', 'Consulting']);
    rows.forEach((r) => set.add(r.category));
    return Array.from(set);
  }
}
