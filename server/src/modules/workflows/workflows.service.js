import { pool } from '../../config/db.js';
import { AuditService } from '../audit/audit.service.js';

export class WorkflowsService {
  /**
   * Helper to ensure a workflow version is in Draft status before mutating
   */
  static async assertVersionIsDraft(versionId) {
    const [rows] = await pool.query(
      'SELECT id, preset_id, version_number, status FROM workflow_preset_versions WHERE id = ?',
      [versionId]
    );

    if (rows.length === 0) {
      const err = new Error(`Workflow preset version with ID ${versionId} not found`);
      err.status = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    if (rows[0].status !== 'draft') {
      const err = new Error(
        `Version ${rows[0].version_number} is ${rows[0].status} and immutable. Create a new draft version to make changes.`
      );
      err.status = 400;
      err.code = 'VERSION_IMMUTABLE';
      throw err;
    }

    return rows[0];
  }

  /**
   * Generates a clean preset code from name
   */
  static generatePresetCode(name) {
    const clean = name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 30);
    return `WP_${clean}_${Date.now().toString().slice(-4)}`;
  }

  /**
   * List workflow presets with filters and counts
   */
  static async listPresets({
    departmentId,
    serviceCategory = '',
    workflowType = '',
    status = '',
    search = '',
    limit = 20,
    offset = 0
  }) {
    const params = [];
    const whereClauses = [];

    if (departmentId) {
      whereClauses.push('wp.department_id = ?');
      params.push(Number(departmentId));
    }

    if (serviceCategory.trim()) {
      whereClauses.push('wp.service_category = ?');
      params.push(serviceCategory.trim());
    }

    if (workflowType.trim()) {
      whereClauses.push('wp.workflow_type = ?');
      params.push(workflowType.trim());
    }

    if (status.trim()) {
      whereClauses.push('wp.status = ?');
      params.push(status.trim());
    }

    if (search.trim()) {
      whereClauses.push('(wp.name LIKE ? OR wp.preset_code LIKE ? OR wp.description LIKE ?)');
      const pattern = `%${search.trim()}%`;
      params.push(pattern, pattern, pattern);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM workflow_presets wp ${whereSql}`,
      params
    );
    const total = Number(countRows[0].total);

    const [presets] = await pool.query(
      `SELECT wp.id, wp.preset_code, wp.name, wp.description, wp.department_id,
              wp.service_category, wp.workflow_type, wp.status, wp.current_version_id,
              wp.created_at, wp.updated_at,
              d.name as department_name, d.code as department_code,
              wpv.version_number as current_version_number,
              wpv.status as current_version_status,
              wpv.estimated_duration_days,
              wpv.validation_status,
              COUNT(DISTINCT ws.id) as stage_count,
              COUNT(DISTINCT tt.id) as task_count
       FROM workflow_presets wp
       LEFT JOIN departments d ON wp.department_id = d.id
       LEFT JOIN workflow_preset_versions wpv ON wp.current_version_id = wpv.id
       LEFT JOIN workflow_stages ws ON wpv.id = ws.preset_version_id
       LEFT JOIN task_templates tt ON wpv.id = tt.preset_version_id
       ${whereSql}
       GROUP BY wp.id
       ORDER BY wp.updated_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );

    return {
      presets: presets.map((p) => ({
        ...p,
        stage_count: Number(p.stage_count),
        task_count: Number(p.task_count)
      })),
      total,
      limit: Number(limit),
      offset: Number(offset)
    };
  }

  /**
   * Retrieves full details of a workflow preset and its active/specified version
   */
  static async getPreset(id, versionId = null) {
    const [presetRows] = await pool.query(
      `SELECT wp.id, wp.preset_code, wp.name, wp.description, wp.department_id,
              wp.service_category, wp.workflow_type, wp.status, wp.current_version_id,
              wp.created_at, wp.updated_at,
              d.name as department_name, d.code as department_code
       FROM workflow_presets wp
       LEFT JOIN departments d ON wp.department_id = d.id
       WHERE wp.id = ?`,
      [id]
    );

    if (presetRows.length === 0) {
      const err = new Error(`Workflow preset with ID ${id} not found`);
      err.status = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    const preset = presetRows[0];
    const targetVersionId = versionId || preset.current_version_id;

    let version = null;
    let stages = [];
    let dependencies = [];

    if (targetVersionId) {
      const [vRows] = await pool.query(
        `SELECT v.id, v.preset_id, v.version_number, v.status, v.estimated_duration_days,
                v.deadline_calculation_rules, v.default_assignee_rules, v.revision_rules,
                v.notification_config, v.validation_status, v.validation_errors, v.changelog,
                v.published_at, v.published_by, v.created_at, v.updated_at,
                u.name as publisher_name
         FROM workflow_preset_versions v
         LEFT JOIN users u ON v.published_by = u.id
         WHERE v.id = ? AND v.preset_id = ?`,
        [targetVersionId, id]
      );

      if (vRows.length > 0) {
        version = vRows[0];

        // Fetch stages
        const [stageRows] = await pool.query(
          `SELECT id, preset_version_id, stage_key, name, description, display_order,
                  stage_category, allowed_next_stages, is_client_facing, is_review_required,
                  requires_deliverable, requires_client_approval, reviewer_policy,
                  completion_conditions, created_at, updated_at
           FROM workflow_stages
           WHERE preset_version_id = ?
           ORDER BY display_order ASC`,
          [version.id]
        );

        // Fetch task templates
        const [taskRows] = await pool.query(
          `SELECT tt.id, tt.preset_version_id, tt.stage_id, tt.task_key, tt.title,
                  tt.description, tt.instructions, tt.department_id, tt.default_assignee_role,
                  tt.estimated_duration_hours, tt.relative_deadline_days, tt.priority,
                  tt.required_inputs, tt.completion_checklist, tt.expected_output,
                  tt.requires_internal_review, tt.requires_client_approval, tt.display_order,
                  tt.created_at, tt.updated_at,
                  d.name as department_name
           FROM task_templates tt
           LEFT JOIN departments d ON tt.department_id = d.id
           WHERE tt.preset_version_id = ?
           ORDER BY tt.stage_id ASC, tt.display_order ASC`,
          [version.id]
        );

        // Fetch dependencies
        const taskIds = taskRows.map((t) => t.id);
        if (taskIds.length > 0) {
          const [depRows] = await pool.query(
            `SELECT ttd.task_template_id, ttd.depends_on_task_template_id, ttd.dependency_type
             FROM task_template_dependencies ttd
             WHERE ttd.task_template_id IN (?)`,
            [taskIds]
          );
          dependencies = depRows;
        }

        // Nest tasks into stages
        stages = stageRows.map((s) => ({
          ...s,
          is_client_facing: Boolean(s.is_client_facing),
          is_review_required: Boolean(s.is_review_required),
          requires_deliverable: Boolean(s.requires_deliverable),
          requires_client_approval: Boolean(s.requires_client_approval),
          tasks: taskRows
            .filter((t) => t.stage_id === s.id)
            .map((t) => ({
              ...t,
              requires_internal_review: Boolean(t.requires_internal_review),
              requires_client_approval: Boolean(t.requires_client_approval),
              dependencies: dependencies
                .filter((d) => d.task_template_id === t.id)
                .map((d) => ({
                  dependsOnTaskId: d.depends_on_task_template_id,
                  type: d.dependency_type
                }))
            }))
        }));
      }
    }

    return {
      ...preset,
      version,
      stages,
      dependencies
    };
  }

  /**
   * Creates a new workflow preset with initial Draft Version v1
   */
  static async createPreset({
    name,
    preset_code,
    description,
    department_id,
    service_category = 'General',
    workflow_type = 'standard'
  }, actorId, req = null) {
    const trimmedName = name.trim();
    const finalCode = (preset_code && preset_code.trim())
      ? preset_code.trim().toUpperCase()
      : this.generatePresetCode(trimmedName);

    // Verify department exists
    const [deptRows] = await pool.query('SELECT id, name FROM departments WHERE id = ?', [department_id]);
    if (deptRows.length === 0) {
      const err = new Error(`Department with ID ${department_id} not found`);
      err.status = 404;
      err.code = 'DEPARTMENT_NOT_FOUND';
      throw err;
    }

    // Verify unique preset code
    const [codeDupes] = await pool.query('SELECT id FROM workflow_presets WHERE preset_code = ?', [finalCode]);
    if (codeDupes.length > 0) {
      const err = new Error(`A workflow preset with code "${finalCode}" already exists`);
      err.status = 409;
      err.code = 'DUPLICATE_CODE';
      throw err;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Create preset record
      const [insertRes] = await connection.query(
        `INSERT INTO workflow_presets 
         (preset_code, name, description, department_id, service_category, workflow_type, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)`,
        [finalCode, trimmedName, description ? description.trim() : null, department_id, service_category, workflow_type, actorId]
      );
      const presetId = insertRes.insertId;

      // 2. Create initial draft version 1
      const [vRes] = await connection.query(
        `INSERT INTO workflow_preset_versions 
         (preset_id, version_number, status, estimated_duration_days, validation_status, created_by)
         VALUES (?, 1, 'draft', 0, 'unvalidated', ?)`,
        [presetId, actorId]
      );
      const versionId = vRes.insertId;

      // 3. Link current version
      await connection.query(
        'UPDATE workflow_presets SET current_version_id = ? WHERE id = ?',
        [versionId, presetId]
      );

      await AuditService.log({
        actorId,
        action: 'workflow_preset.create',
        entityType: 'workflow_preset',
        entityId: presetId,
        details: { name: trimmedName, code: finalCode, department_id, version: 1 },
        req
      });

      await connection.commit();
      return this.getPreset(presetId, versionId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Updates preset top-level metadata
   */
  static async updatePreset(presetId, updates, actorId, req = null) {
    const existing = await this.getPreset(presetId);

    const fields = {};
    if (updates.name !== undefined) fields.name = updates.name.trim();
    if (updates.description !== undefined) fields.description = updates.description ? updates.description.trim() : null;
    if (updates.service_category !== undefined) fields.service_category = updates.service_category.trim();
    if (updates.workflow_type !== undefined) fields.workflow_type = updates.workflow_type;
    if (updates.department_id !== undefined) {
      const [d] = await pool.query('SELECT id FROM departments WHERE id = ?', [updates.department_id]);
      if (d.length === 0) {
        const err = new Error(`Department with ID ${updates.department_id} not found`);
        err.status = 404;
        err.code = 'DEPARTMENT_NOT_FOUND';
        throw err;
      }
      fields.department_id = updates.department_id;
    }

    if (Object.keys(fields).length === 0) return existing;

    const setClauses = [];
    const params = [];
    for (const [k, v] of Object.entries(fields)) {
      setClauses.push(`\`${k}\` = ?`);
      params.push(v);
    }
    params.push(actorId, presetId);

    await pool.query(
      `UPDATE workflow_presets SET ${setClauses.join(', ')}, updated_by = ? WHERE id = ?`,
      params
    );

    await AuditService.log({
      actorId,
      action: 'workflow_preset.update',
      entityType: 'workflow_preset',
      entityId: presetId,
      details: { previous: existing, updated: fields },
      req
    });

    return this.getPreset(presetId);
  }

  /**
   * Archives a workflow preset
   */
  static async archivePreset(presetId, actorId, req = null) {
    const preset = await this.getPreset(presetId);

    await pool.query(
      "UPDATE workflow_presets SET status = 'archived', updated_by = ? WHERE id = ?",
      [actorId, presetId]
    );

    await AuditService.log({
      actorId,
      action: 'workflow_preset.archive',
      entityType: 'workflow_preset',
      entityId: presetId,
      details: { name: preset.name, code: preset.preset_code },
      req
    });

    return { success: true, message: `Workflow preset "${preset.name}" archived successfully.` };
  }

  /**
   * Lists all versions of a preset
   */
  static async listPresetVersions(presetId) {
    const [versions] = await pool.query(
      `SELECT v.id, v.preset_id, v.version_number, v.status, v.estimated_duration_days,
              v.validation_status, v.changelog, v.published_at, v.created_at, v.updated_at,
              u.name as publisher_name,
              COUNT(DISTINCT ws.id) as stage_count,
              COUNT(DISTINCT tt.id) as task_count
       FROM workflow_preset_versions v
       LEFT JOIN users u ON v.published_by = u.id
       LEFT JOIN workflow_stages ws ON v.id = ws.preset_version_id
       LEFT JOIN task_templates tt ON v.id = tt.preset_version_id
       WHERE v.preset_id = ?
       GROUP BY v.id
       ORDER BY v.version_number DESC`,
      [presetId]
    );

    return versions.map((v) => ({
      ...v,
      stage_count: Number(v.stage_count),
      task_count: Number(v.task_count)
    }));
  }

  /**
   * Creates a new Draft Version by deep-cloning an existing published version
   */
  static async createDraftVersion(presetId, actorId, req = null) {
    const preset = await this.getPreset(presetId);

    // 1. Get latest version to branch from
    const [versions] = await pool.query(
      'SELECT * FROM workflow_preset_versions WHERE preset_id = ? ORDER BY version_number DESC LIMIT 1',
      [presetId]
    );

    if (versions.length === 0) {
      const err = new Error('No base version found to create draft from');
      err.status = 404;
      throw err;
    }

    const sourceVersion = versions[0];
    const newVersionNumber = sourceVersion.version_number + 1;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 2. Insert new version
      const [vRes] = await connection.query(
        `INSERT INTO workflow_preset_versions 
         (preset_id, version_number, status, estimated_duration_days, deadline_calculation_rules, default_assignee_rules, revision_rules, notification_config, validation_status, changelog, created_by)
         VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, 'unvalidated', ?, ?)`,
        [
          presetId,
          newVersionNumber,
          sourceVersion.estimated_duration_days,
          JSON.stringify(sourceVersion.deadline_calculation_rules || null),
          JSON.stringify(sourceVersion.default_assignee_rules || null),
          JSON.stringify(sourceVersion.revision_rules || null),
          JSON.stringify(sourceVersion.notification_config || null),
          `Branched from version ${sourceVersion.version_number}`,
          actorId
        ]
      );
      const newVersionId = vRes.insertId;

      // 3. Deep-clone stages
      const [srcStages] = await connection.query(
        'SELECT * FROM workflow_stages WHERE preset_version_id = ? ORDER BY display_order ASC',
        [sourceVersion.id]
      );

      const stageIdMap = new Map(); // oldStageId -> newStageId

      for (const stg of srcStages) {
        const [sRes] = await connection.query(
          `INSERT INTO workflow_stages 
           (preset_version_id, stage_key, name, description, display_order, stage_category, allowed_next_stages, is_client_facing, is_review_required, requires_deliverable, requires_client_approval, reviewer_policy, completion_conditions)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newVersionId,
            stg.stage_key,
            stg.name,
            stg.description,
            stg.display_order,
            stg.stage_category,
            JSON.stringify(stg.allowed_next_stages || []),
            stg.is_client_facing,
            stg.is_review_required,
            stg.requires_deliverable,
            stg.requires_client_approval,
            JSON.stringify(stg.reviewer_policy || null),
            JSON.stringify(stg.completion_conditions || null)
          ]
        );
        stageIdMap.set(stg.id, sRes.insertId);
      }

      // 4. Deep-clone task templates
      const [srcTasks] = await connection.query(
        'SELECT * FROM task_templates WHERE preset_version_id = ? ORDER BY stage_id ASC, display_order ASC',
        [sourceVersion.id]
      );

      const taskIdMap = new Map(); // oldTaskId -> newTaskId

      for (const tsk of srcTasks) {
        const newStageId = stageIdMap.get(tsk.stage_id);
        if (!newStageId) continue;

        const [tRes] = await connection.query(
          `INSERT INTO task_templates 
           (preset_version_id, stage_id, task_key, title, description, instructions, department_id, default_assignee_role, estimated_duration_hours, relative_deadline_days, priority, required_inputs, completion_checklist, expected_output, requires_internal_review, requires_client_approval, display_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newVersionId,
            newStageId,
            tsk.task_key,
            tsk.title,
            tsk.description,
            tsk.instructions,
            tsk.department_id,
            tsk.default_assignee_role,
            tsk.estimated_duration_hours,
            tsk.relative_deadline_days,
            tsk.priority,
            JSON.stringify(tsk.required_inputs || null),
            JSON.stringify(tsk.completion_checklist || null),
            tsk.expected_output,
            tsk.requires_internal_review,
            tsk.requires_client_approval,
            tsk.display_order
          ]
        );
        taskIdMap.set(tsk.id, tRes.insertId);
      }

      // 5. Deep-clone task dependencies with mapped IDs
      if (srcTasks.length > 0) {
        const srcTaskIds = srcTasks.map((t) => t.id);
        const [srcDeps] = await connection.query(
          'SELECT * FROM task_template_dependencies WHERE task_template_id IN (?)',
          [srcTaskIds]
        );

        for (const dep of srcDeps) {
          const newTargetId = taskIdMap.get(dep.task_template_id);
          const newDependsId = taskIdMap.get(dep.depends_on_task_template_id);

          if (newTargetId && newDependsId) {
            await connection.query(
              `INSERT INTO task_template_dependencies (task_template_id, depends_on_task_template_id, dependency_type)
               VALUES (?, ?, ?)`,
              [newTargetId, newDependsId, dep.dependency_type]
            );
          }
        }
      }

      // 6. Update preset current_version pointer to new draft
      await connection.query(
        'UPDATE workflow_presets SET current_version_id = ?, updated_by = ? WHERE id = ?',
        [newVersionId, actorId, presetId]
      );

      await AuditService.log({
        actorId,
        action: 'workflow_preset.create_draft_version',
        entityType: 'workflow_preset',
        entityId: presetId,
        details: { fromVersion: sourceVersion.version_number, newVersion: newVersionNumber, newVersionId },
        req
      });

      await connection.commit();
      return this.getPreset(presetId, newVersionId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Updates version top-level configurations (duration, rules)
   */
  static async updateVersionSettings(versionId, updates, actorId, req = null) {
    await this.assertVersionIsDraft(versionId);

    const fields = {};
    if (updates.estimated_duration_days !== undefined) fields.estimated_duration_days = updates.estimated_duration_days;
    if (updates.deadline_calculation_rules !== undefined) fields.deadline_calculation_rules = JSON.stringify(updates.deadline_calculation_rules);
    if (updates.default_assignee_rules !== undefined) fields.default_assignee_rules = JSON.stringify(updates.default_assignee_rules);
    if (updates.revision_rules !== undefined) fields.revision_rules = JSON.stringify(updates.revision_rules);
    if (updates.notification_config !== undefined) fields.notification_config = JSON.stringify(updates.notification_config);
    if (updates.changelog !== undefined) fields.changelog = updates.changelog;

    if (Object.keys(fields).length === 0) return;

    const setClauses = [];
    const params = [];
    for (const [k, v] of Object.entries(fields)) {
      setClauses.push(`\`${k}\` = ?`);
      params.push(v);
    }
    params.push(actorId, versionId);

    await pool.query(
      `UPDATE workflow_preset_versions SET ${setClauses.join(', ')}, updated_by = ? WHERE id = ?`,
      params
    );
  }

  // ==========================================
  // STAGE BUILDER METHODS
  // ==========================================

  static async addStage(versionId, stageData, actorId, req = null) {
    await this.assertVersionIsDraft(versionId);

    const trimmedName = stageData.name.trim();
    const finalKey = (stageData.stage_key && stageData.stage_key.trim())
      ? stageData.stage_key.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
      : trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    // Check duplicate key in version
    const [dupes] = await pool.query(
      'SELECT id FROM workflow_stages WHERE preset_version_id = ? AND stage_key = ?',
      [versionId, finalKey]
    );
    if (dupes.length > 0) {
      const err = new Error(`Stage with identifier "${finalKey}" already exists in this workflow version`);
      err.status = 409;
      err.code = 'DUPLICATE_STAGE_KEY';
      throw err;
    }

    // Determine display order
    let displayOrder = stageData.display_order;
    if (!displayOrder) {
      const [maxRows] = await pool.query(
        'SELECT COALESCE(MAX(display_order), 0) as maxOrder FROM workflow_stages WHERE preset_version_id = ?',
        [versionId]
      );
      displayOrder = Number(maxRows[0].maxOrder) + 1;
    }

    const [insertRes] = await pool.query(
      `INSERT INTO workflow_stages 
       (preset_version_id, stage_key, name, description, display_order, stage_category, allowed_next_stages, is_client_facing, is_review_required, requires_deliverable, requires_client_approval, reviewer_policy, completion_conditions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        versionId,
        finalKey,
        trimmedName,
        stageData.description ? stageData.description.trim() : null,
        displayOrder,
        stageData.stage_category || 'execution',
        JSON.stringify(stageData.allowed_next_stages || []),
        Boolean(stageData.is_client_facing),
        Boolean(stageData.is_review_required),
        Boolean(stageData.requires_deliverable),
        Boolean(stageData.requires_client_approval),
        JSON.stringify(stageData.reviewer_policy || null),
        JSON.stringify(stageData.completion_conditions || null)
      ]
    );

    // Invalidate version validation
    await pool.query(
      "UPDATE workflow_preset_versions SET validation_status = 'unvalidated', updated_by = ? WHERE id = ?",
      [actorId, versionId]
    );

    return { id: insertRes.insertId, ...stageData, stage_key: finalKey, display_order: displayOrder };
  }

  static async updateStage(versionId, stageId, stageData, actorId, req = null) {
    await this.assertVersionIsDraft(versionId);

    const [stageRows] = await pool.query(
      'SELECT id, stage_key FROM workflow_stages WHERE id = ? AND preset_version_id = ?',
      [stageId, versionId]
    );
    if (stageRows.length === 0) {
      const err = new Error(`Stage with ID ${stageId} not found in version ${versionId}`);
      err.status = 404;
      throw err;
    }

    const fields = {};
    if (stageData.name !== undefined) fields.name = stageData.name.trim();
    if (stageData.stage_key !== undefined) {
      const finalKey = stageData.stage_key.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
      if (finalKey !== stageRows[0].stage_key) {
        const [dupes] = await pool.query(
          'SELECT id FROM workflow_stages WHERE preset_version_id = ? AND stage_key = ? AND id != ?',
          [versionId, finalKey, stageId]
        );
        if (dupes.length > 0) {
          const err = new Error(`Stage key "${finalKey}" already exists in this version`);
          err.status = 409;
          err.code = 'DUPLICATE_STAGE_KEY';
          throw err;
        }
      }
      fields.stage_key = finalKey;
    }
    if (stageData.description !== undefined) fields.description = stageData.description ? stageData.description.trim() : null;
    if (stageData.display_order !== undefined) fields.display_order = stageData.display_order;
    if (stageData.stage_category !== undefined) fields.stage_category = stageData.stage_category;
    if (stageData.allowed_next_stages !== undefined) fields.allowed_next_stages = JSON.stringify(stageData.allowed_next_stages);
    if (stageData.is_client_facing !== undefined) fields.is_client_facing = Boolean(stageData.is_client_facing);
    if (stageData.is_review_required !== undefined) fields.is_review_required = Boolean(stageData.is_review_required);
    if (stageData.requires_deliverable !== undefined) fields.requires_deliverable = Boolean(stageData.requires_deliverable);
    if (stageData.requires_client_approval !== undefined) fields.requires_client_approval = Boolean(stageData.requires_client_approval);
    if (stageData.reviewer_policy !== undefined) fields.reviewer_policy = JSON.stringify(stageData.reviewer_policy);
    if (stageData.completion_conditions !== undefined) fields.completion_conditions = JSON.stringify(stageData.completion_conditions);

    if (Object.keys(fields).length > 0) {
      const setClauses = [];
      const params = [];
      for (const [k, v] of Object.entries(fields)) {
        setClauses.push(`\`${k}\` = ?`);
        params.push(v);
      }
      params.push(stageId);

      await pool.query(`UPDATE workflow_stages SET ${setClauses.join(', ')} WHERE id = ?`, params);
      await pool.query("UPDATE workflow_preset_versions SET validation_status = 'unvalidated', updated_by = ? WHERE id = ?", [actorId, versionId]);
    }

    return { id: stageId, ...fields };
  }

  static async deleteStage(versionId, stageId, actorId, req = null) {
    await this.assertVersionIsDraft(versionId);

    const [rows] = await pool.query(
      'SELECT id, name FROM workflow_stages WHERE id = ? AND preset_version_id = ?',
      [stageId, versionId]
    );
    if (rows.length === 0) {
      const err = new Error(`Stage with ID ${stageId} not found`);
      err.status = 404;
      throw err;
    }

    await pool.query('DELETE FROM workflow_stages WHERE id = ?', [stageId]);
    await pool.query("UPDATE workflow_preset_versions SET validation_status = 'unvalidated', updated_by = ? WHERE id = ?", [actorId, versionId]);

    return { success: true, message: `Stage "${rows[0].name}" removed.` };
  }

  static async reorderStages(versionId, orders, actorId, req = null) {
    await this.assertVersionIsDraft(versionId);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      for (const item of orders) {
        await connection.query(
          'UPDATE workflow_stages SET display_order = ? WHERE id = ? AND preset_version_id = ?',
          [Number(item.displayOrder), Number(item.stageId), versionId]
        );
      }

      await connection.query(
        "UPDATE workflow_preset_versions SET validation_status = 'unvalidated', updated_by = ? WHERE id = ?",
        [actorId, versionId]
      );

      await connection.commit();
      return { success: true, message: 'Stages reordered successfully.' };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  // ==========================================
  // TASK TEMPLATE BUILDER METHODS
  // ==========================================

  static async addTaskTemplate(versionId, taskData, actorId, req = null) {
    await this.assertVersionIsDraft(versionId);

    // Verify stage belongs to this version
    const [stageRows] = await pool.query(
      'SELECT id, stage_key FROM workflow_stages WHERE id = ? AND preset_version_id = ?',
      [taskData.stage_id, versionId]
    );
    if (stageRows.length === 0) {
      const err = new Error(`Stage ID ${taskData.stage_id} does not belong to version ${versionId}`);
      err.status = 400;
      throw err;
    }

    const trimmedTitle = taskData.title.trim();
    const finalKey = (taskData.task_key && taskData.task_key.trim())
      ? taskData.task_key.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
      : `${stageRows[0].stage_key}-t${Date.now().toString().slice(-4)}`;

    // Check duplicate task_key in version
    const [dupes] = await pool.query(
      'SELECT id FROM task_templates WHERE preset_version_id = ? AND task_key = ?',
      [versionId, finalKey]
    );
    if (dupes.length > 0) {
      const err = new Error(`Task template key "${finalKey}" already exists in this workflow version`);
      err.status = 409;
      err.code = 'DUPLICATE_TASK_KEY';
      throw err;
    }

    let displayOrder = taskData.display_order;
    if (!displayOrder) {
      const [maxRows] = await pool.query(
        'SELECT COALESCE(MAX(display_order), 0) as maxOrder FROM task_templates WHERE stage_id = ?',
        [taskData.stage_id]
      );
      displayOrder = Number(maxRows[0].maxOrder) + 1;
    }

    const [insertRes] = await pool.query(
      `INSERT INTO task_templates 
       (preset_version_id, stage_id, task_key, title, description, instructions, department_id, default_assignee_role, estimated_duration_hours, relative_deadline_days, priority, required_inputs, completion_checklist, expected_output, requires_internal_review, requires_client_approval, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        versionId,
        taskData.stage_id,
        finalKey,
        trimmedTitle,
        taskData.description ? taskData.description.trim() : null,
        taskData.instructions ? taskData.instructions.trim() : null,
        taskData.department_id || null,
        taskData.default_assignee_role || null,
        Number(taskData.estimated_duration_hours || 0),
        Number(taskData.relative_deadline_days || 1),
        taskData.priority || 'medium',
        JSON.stringify(taskData.required_inputs || null),
        JSON.stringify(taskData.completion_checklist || null),
        taskData.expected_output ? taskData.expected_output.trim() : null,
        Boolean(taskData.requires_internal_review),
        Boolean(taskData.requires_client_approval),
        displayOrder
      ]
    );

    await pool.query("UPDATE workflow_preset_versions SET validation_status = 'unvalidated', updated_by = ? WHERE id = ?", [actorId, versionId]);

    return { id: insertRes.insertId, ...taskData, task_key: finalKey, display_order: displayOrder };
  }

  static async updateTaskTemplate(versionId, taskId, taskData, actorId, req = null) {
    await this.assertVersionIsDraft(versionId);

    const [tRows] = await pool.query(
      'SELECT id, task_key FROM task_templates WHERE id = ? AND preset_version_id = ?',
      [taskId, versionId]
    );
    if (tRows.length === 0) {
      const err = new Error(`Task template ID ${taskId} not found in version ${versionId}`);
      err.status = 404;
      throw err;
    }

    const fields = {};
    if (taskData.title !== undefined) fields.title = taskData.title.trim();
    if (taskData.task_key !== undefined) {
      const finalKey = taskData.task_key.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
      if (finalKey !== tRows[0].task_key) {
        const [dupes] = await pool.query(
          'SELECT id FROM task_templates WHERE preset_version_id = ? AND task_key = ? AND id != ?',
          [versionId, finalKey, taskId]
        );
        if (dupes.length > 0) {
          const err = new Error(`Task key "${finalKey}" already exists in this version`);
          err.status = 409;
          err.code = 'DUPLICATE_TASK_KEY';
          throw err;
        }
      }
      fields.task_key = finalKey;
    }
    if (taskData.stage_id !== undefined) fields.stage_id = taskData.stage_id;
    if (taskData.description !== undefined) fields.description = taskData.description ? taskData.description.trim() : null;
    if (taskData.instructions !== undefined) fields.instructions = taskData.instructions ? taskData.instructions.trim() : null;
    if (taskData.department_id !== undefined) fields.department_id = taskData.department_id;
    if (taskData.default_assignee_role !== undefined) fields.default_assignee_role = taskData.default_assignee_role;
    if (taskData.estimated_duration_hours !== undefined) fields.estimated_duration_hours = Number(taskData.estimated_duration_hours);
    if (taskData.relative_deadline_days !== undefined) fields.relative_deadline_days = Number(taskData.relative_deadline_days);
    if (taskData.priority !== undefined) fields.priority = taskData.priority;
    if (taskData.required_inputs !== undefined) fields.required_inputs = JSON.stringify(taskData.required_inputs);
    if (taskData.completion_checklist !== undefined) fields.completion_checklist = JSON.stringify(taskData.completion_checklist);
    if (taskData.expected_output !== undefined) fields.expected_output = taskData.expected_output ? taskData.expected_output.trim() : null;
    if (taskData.requires_internal_review !== undefined) fields.requires_internal_review = Boolean(taskData.requires_internal_review);
    if (taskData.requires_client_approval !== undefined) fields.requires_client_approval = Boolean(taskData.requires_client_approval);
    if (taskData.display_order !== undefined) fields.display_order = taskData.display_order;

    if (Object.keys(fields).length > 0) {
      const setClauses = [];
      const params = [];
      for (const [k, v] of Object.entries(fields)) {
        setClauses.push(`\`${k}\` = ?`);
        params.push(v);
      }
      params.push(taskId);

      await pool.query(`UPDATE task_templates SET ${setClauses.join(', ')} WHERE id = ?`, params);
      await pool.query("UPDATE workflow_preset_versions SET validation_status = 'unvalidated', updated_by = ? WHERE id = ?", [actorId, versionId]);
    }

    return { id: taskId, ...fields };
  }

  static async deleteTaskTemplate(versionId, taskId, actorId, req = null) {
    await this.assertVersionIsDraft(versionId);

    const [rows] = await pool.query(
      'SELECT id, title FROM task_templates WHERE id = ? AND preset_version_id = ?',
      [taskId, versionId]
    );
    if (rows.length === 0) {
      const err = new Error(`Task template ID ${taskId} not found`);
      err.status = 404;
      throw err;
    }

    await pool.query('DELETE FROM task_templates WHERE id = ?', [taskId]);
    await pool.query("UPDATE workflow_preset_versions SET validation_status = 'unvalidated', updated_by = ? WHERE id = ?", [actorId, versionId]);

    return { success: true, message: `Task template "${rows[0].title}" removed.` };
  }

  static async reorderTasks(versionId, orders, actorId, req = null) {
    await this.assertVersionIsDraft(versionId);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      for (const item of orders) {
        await connection.query(
          'UPDATE task_templates SET display_order = ? WHERE id = ? AND preset_version_id = ?',
          [Number(item.displayOrder), Number(item.taskId), versionId]
        );
      }

      await connection.commit();
      return { success: true, message: 'Tasks reordered successfully.' };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  // ==========================================
  // DEPENDENCY BUILDER & CYCLE DETECTION
  // ==========================================

  static async addDependency(versionId, taskId, dependsOnTaskId, dependencyType = 'finish_to_start', actorId, req = null) {
    await this.assertVersionIsDraft(versionId);

    if (Number(taskId) === Number(dependsOnTaskId)) {
      const err = new Error('A task template cannot depend on itself');
      err.status = 400;
      err.code = 'INVALID_DEPENDENCY';
      throw err;
    }

    // Verify both tasks belong to this version
    const [tasks] = await pool.query(
      'SELECT id, title FROM task_templates WHERE id IN (?, ?) AND preset_version_id = ?',
      [taskId, dependsOnTaskId, versionId]
    );
    if (tasks.length < 2) {
      const err = new Error('Both tasks must exist within this workflow version');
      err.status = 404;
      throw err;
    }

    // Check existing dependencies to build candidate graph and check for cycle
    const [allTasks] = await pool.query(
      'SELECT id FROM task_templates WHERE preset_version_id = ?',
      [versionId]
    );
    const allTaskIds = allTasks.map((t) => t.id);

    const [currentDeps] = await pool.query(
      'SELECT task_template_id, depends_on_task_template_id FROM task_template_dependencies WHERE task_template_id IN (?)',
      [allTaskIds]
    );

    // Build adjacency list: node -> array of nodes it depends on
    // Or for cycle detection: dependency edge from A -> B (A depends on B means B must finish before A, so directed edge dependsOnTaskId -> taskId)
    const adj = new Map();
    allTaskIds.forEach((id) => adj.set(id, []));

    currentDeps.forEach((d) => {
      if (adj.has(d.depends_on_task_template_id)) {
        adj.get(d.depends_on_task_template_id).push(d.task_template_id);
      }
    });

    // Add candidate edge: dependsOnTaskId -> taskId
    adj.get(Number(dependsOnTaskId)).push(Number(taskId));

    // Run DFS cycle detection
    const visited = new Set();
    const recStack = new Set();
    let hasCycle = false;

    function dfs(node) {
      visited.add(node);
      recStack.add(node);

      for (const neighbor of adj.get(node) || []) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) return true;
        } else if (recStack.has(neighbor)) {
          return true;
        }
      }

      recStack.delete(node);
      return false;
    }

    for (const id of allTaskIds) {
      if (!visited.has(id)) {
        if (dfs(id)) {
          hasCycle = true;
          break;
        }
      }
    }

    if (hasCycle) {
      const err = new Error(
        `Circular dependency detected: Task ${taskId} cannot depend on task ${dependsOnTaskId} because it would create a cyclic loop.`
      );
      err.status = 400;
      err.code = 'CIRCULAR_DEPENDENCY';
      throw err;
    }

    // Safe to insert
    await pool.query(
      `INSERT INTO task_template_dependencies (task_template_id, depends_on_task_template_id, dependency_type)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE dependency_type = VALUES(dependency_type)`,
      [taskId, dependsOnTaskId, dependencyType]
    );

    await pool.query("UPDATE workflow_preset_versions SET validation_status = 'unvalidated', updated_by = ? WHERE id = ?", [actorId, versionId]);

    return { success: true, taskId, dependsOnTaskId, dependencyType };
  }

  static async removeDependency(versionId, taskId, dependsOnTaskId, actorId, req = null) {
    await this.assertVersionIsDraft(versionId);

    await pool.query(
      'DELETE FROM task_template_dependencies WHERE task_template_id = ? AND depends_on_task_template_id = ?',
      [taskId, dependsOnTaskId]
    );

    await pool.query("UPDATE workflow_preset_versions SET validation_status = 'unvalidated', updated_by = ? WHERE id = ?", [actorId, versionId]);

    return { success: true, message: 'Dependency removed successfully.' };
  }

  // ==========================================
  // VALIDATION & LIFECYCLE ENGINE
  // ==========================================

  /**
   * Runs the complete workflow validation rules
   */
  static async validatePresetVersion(versionId) {
    const [vRows] = await pool.query(
      'SELECT id, preset_id, version_number, status FROM workflow_preset_versions WHERE id = ?',
      [versionId]
    );
    if (vRows.length === 0) {
      const err = new Error(`Workflow version ${versionId} not found`);
      err.status = 404;
      throw err;
    }

    const errors = [];
    const warnings = [];

    // 1. Fetch stages
    const [stages] = await pool.query(
      'SELECT * FROM workflow_stages WHERE preset_version_id = ? ORDER BY display_order ASC',
      [versionId]
    );

    if (stages.length === 0) {
      errors.push({
        code: 'NO_STAGES',
        message: 'The workflow preset must have at least one stage.'
      });
    }

    // 2. Check starting stage (display_order = 1)
    const hasStartingStage = stages.some((s) => s.display_order === 1);
    if (stages.length > 0 && !hasStartingStage) {
      errors.push({
        code: 'MISSING_STARTING_STAGE',
        message: 'Workflow must have a starting stage with display order 1.'
      });
    }

    // 3. Check duplicate stage identifiers or names
    const stageKeySet = new Set();
    const stageNameSet = new Set();
    for (const s of stages) {
      const lowerKey = s.stage_key.toLowerCase();
      const lowerName = s.name.trim().toLowerCase();
      if (stageKeySet.has(lowerKey)) {
        errors.push({
          code: 'DUPLICATE_STAGE_KEY',
          stageId: s.id,
          message: `Duplicate stage identifier found: "${s.stage_key}".`
        });
      }
      stageKeySet.add(lowerKey);

      if (stageNameSet.has(lowerName)) {
        errors.push({
          code: 'DUPLICATE_STAGE_NAME',
          stageId: s.id,
          message: `Duplicate stage name found: "${s.name}".`
        });
      }
      stageNameSet.add(lowerName);
    }

    // 4. Check stage transitions (allowed_next_stages)
    for (const s of stages) {
      const nextStages = Array.isArray(s.allowed_next_stages) ? s.allowed_next_stages : [];
      for (const nextKey of nextStages) {
        if (!stageKeySet.has(nextKey.toLowerCase())) {
          errors.push({
            code: 'INVALID_STAGE_TRANSITION',
            stageId: s.id,
            message: `Stage "${s.name}" references non-existent next stage "${nextKey}".`
          });
        }
        if (nextKey.toLowerCase() === s.stage_key.toLowerCase()) {
          errors.push({
            code: 'SELF_STAGE_TRANSITION',
            stageId: s.id,
            message: `Stage "${s.name}" cannot transition to itself.`
          });
        }
      }
    }

    // 5. Check reviewer policy and deliverable completion rules on stages
    for (const s of stages) {
      if (s.is_review_required || s.requires_client_approval) {
        const policy = s.reviewer_policy;
        if (!policy || (!policy.role && !policy.user_id)) {
          errors.push({
            code: 'MISSING_REVIEWER_POLICY',
            stageId: s.id,
            message: `Stage "${s.name}" requires review/approval but no reviewer policy or designated role is defined.`
          });
        }
      }

      if (s.requires_deliverable) {
        const cond = s.completion_conditions;
        const hasDeliverableRule = cond && (cond.deliverable_submitted || cond.deliverable_required || cond.require_deliverable);
        if (!hasDeliverableRule && !s.description?.toLowerCase().includes('deliverable')) {
          warnings.push({
            code: 'DELIVERABLE_COMPLETION_RULE_RECOMMENDED',
            stageId: s.id,
            message: `Stage "${s.name}" is marked as requiring a deliverable. Ensure deliverable submission is required in completion rules.`
          });
        }
      }
    }

    // 6. Fetch task templates
    const [tasks] = await pool.query(
      'SELECT id, stage_id, task_key, title FROM task_templates WHERE preset_version_id = ?',
      [versionId]
    );

    const taskIds = tasks.map((t) => t.id);

    // Check each stage has at least 1 task
    for (const s of stages) {
      const stageTasks = tasks.filter((t) => t.stage_id === s.id);
      if (stageTasks.length === 0) {
        warnings.push({
          code: 'EMPTY_STAGE',
          stageId: s.id,
          message: `Stage "${s.name}" has no task templates configured.`
        });
      }
    }

    // 7. Check circular task dependencies
    if (taskIds.length > 0) {
      const [deps] = await pool.query(
        'SELECT task_template_id, depends_on_task_template_id FROM task_template_dependencies WHERE task_template_id IN (?)',
        [taskIds]
      );

      const adj = new Map();
      taskIds.forEach((id) => adj.set(id, []));
      deps.forEach((d) => {
        if (adj.has(d.depends_on_task_template_id)) {
          adj.get(d.depends_on_task_template_id).push(d.task_template_id);
        }
      });

      const visited = new Set();
      const recStack = new Set();
      const cyclePath = [];

      function checkCycle(node, path) {
        visited.add(node);
        recStack.add(node);
        path.push(node);

        for (const neighbor of adj.get(node) || []) {
          if (!visited.has(neighbor)) {
            if (checkCycle(neighbor, path)) return true;
          } else if (recStack.has(neighbor)) {
            path.push(neighbor);
            return true;
          }
        }

        recStack.delete(node);
        path.pop();
        return false;
      }

      for (const id of taskIds) {
        if (!visited.has(id)) {
          const path = [];
          if (checkCycle(id, path)) {
            const taskMap = new Map();
            tasks.forEach((t) => taskMap.set(t.id, t.title));
            const pathNames = path.map((tid) => `"${taskMap.get(tid) || tid}"`).join(' -> ');
            errors.push({
              code: 'CIRCULAR_DEPENDENCY',
              message: `Circular task dependency detected: ${pathNames}`
            });
            break;
          }
        }
      }
    }

    const isValid = errors.length === 0;
    const validationStatus = isValid ? 'valid' : 'invalid';

    // Persist validation outcome
    await pool.query(
      'UPDATE workflow_preset_versions SET validation_status = ?, validation_errors = ? WHERE id = ?',
      [validationStatus, JSON.stringify(errors), versionId]
    );

    return {
      valid: isValid,
      errors,
      warnings,
      checkedAt: new Date().toISOString()
    };
  }

  /**
   * Publishes a draft workflow preset version making it immutable.
   * DOES NOT create tasks or service instances!
   */
  static async publishPresetVersion(presetId, versionId, actorId, req = null) {
    const version = await this.assertVersionIsDraft(versionId);

    // 1. Run complete validation
    const validation = await this.validatePresetVersion(versionId);
    if (!validation.valid) {
      const err = new Error('Cannot publish workflow version with validation errors.');
      err.status = 400;
      err.code = 'VALIDATION_FAILED';
      err.validationErrors = validation.errors;
      throw err;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 2. Archive any previous published versions of this preset if desired, or keep as historical
      await connection.query(
        "UPDATE workflow_preset_versions SET status = 'archived' WHERE preset_id = ? AND status = 'published' AND id != ?",
        [presetId, versionId]
      );

      // 3. Mark version as published
      await connection.query(
        `UPDATE workflow_preset_versions 
         SET status = 'published', published_at = NOW(), published_by = ?, updated_by = ?
         WHERE id = ?`,
        [actorId, actorId, versionId]
      );

      // 4. Update preset to published with pointer to this version
      await connection.query(
        `UPDATE workflow_presets 
         SET status = 'published', current_version_id = ?, updated_by = ?
         WHERE id = ?`,
        [versionId, actorId, presetId]
      );

      await AuditService.log({
        actorId,
        action: 'workflow_preset.publish',
        entityType: 'workflow_preset',
        entityId: presetId,
        details: { versionId, versionNumber: version.version_number },
        req
      });

      await connection.commit();
      return this.getPreset(presetId, versionId);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }
}
