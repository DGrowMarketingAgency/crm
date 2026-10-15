import { WorkflowsService } from './workflows.service.js';

export class WorkflowsController {
  static async listPresets(req, res, next) {
    try {
      const { departmentId, serviceCategory, workflowType, status, search, limit, offset } = req.query;
      const result = await WorkflowsService.listPresets({
        departmentId: departmentId ? Number(departmentId) : undefined,
        serviceCategory: serviceCategory || '',
        workflowType: workflowType || '',
        status: status || '',
        search: search || '',
        limit: limit ? Number(limit) : 20,
        offset: offset ? Number(offset) : 0
      });
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async getPreset(req, res, next) {
    try {
      const { id } = req.params;
      const { versionId } = req.query;
      const result = await WorkflowsService.getPreset(Number(id), versionId ? Number(versionId) : null);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async createPreset(req, res, next) {
    try {
      const result = await WorkflowsService.createPreset(req.body, req.user.id, req);
      res.status(201).json({
        success: true,
        message: 'Workflow preset created in draft status.',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  static async updatePreset(req, res, next) {
    try {
      const { id } = req.params;
      const result = await WorkflowsService.updatePreset(Number(id), req.body, req.user.id, req);
      res.status(200).json({
        success: true,
        message: 'Workflow preset updated.',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  static async archivePreset(req, res, next) {
    try {
      const { id } = req.params;
      const result = await WorkflowsService.archivePreset(Number(id), req.user.id, req);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async listVersions(req, res, next) {
    try {
      const { id } = req.params;
      const versions = await WorkflowsService.listPresetVersions(Number(id));
      res.status(200).json({ success: true, data: versions });
    } catch (err) {
      next(err);
    }
  }

  static async createDraftVersion(req, res, next) {
    try {
      const { id } = req.params;
      const result = await WorkflowsService.createDraftVersion(Number(id), req.user.id, req);
      res.status(201).json({
        success: true,
        message: 'New draft version created from existing preset.',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateVersionSettings(req, res, next) {
    try {
      const { versionId } = req.params;
      await WorkflowsService.updateVersionSettings(Number(versionId), req.body, req.user.id, req);
      res.status(200).json({ success: true, message: 'Version settings updated.' });
    } catch (err) {
      next(err);
    }
  }

  // --- STAGES ---

  static async addStage(req, res, next) {
    try {
      const { versionId } = req.params;
      const result = await WorkflowsService.addStage(Number(versionId), req.body, req.user.id, req);
      res.status(201).json({ success: true, message: 'Stage added to draft version.', data: result });
    } catch (err) {
      next(err);
    }
  }

  static async updateStage(req, res, next) {
    try {
      const { versionId, stageId } = req.params;
      const result = await WorkflowsService.updateStage(Number(versionId), Number(stageId), req.body, req.user.id, req);
      res.status(200).json({ success: true, message: 'Stage updated.', data: result });
    } catch (err) {
      next(err);
    }
  }

  static async deleteStage(req, res, next) {
    try {
      const { versionId, stageId } = req.params;
      const result = await WorkflowsService.deleteStage(Number(versionId), Number(stageId), req.user.id, req);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async reorderStages(req, res, next) {
    try {
      const { versionId } = req.params;
      const result = await WorkflowsService.reorderStages(Number(versionId), req.body.orders, req.user.id, req);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  // --- TASK TEMPLATES ---

  static async addTaskTemplate(req, res, next) {
    try {
      const { versionId } = req.params;
      const result = await WorkflowsService.addTaskTemplate(Number(versionId), req.body, req.user.id, req);
      res.status(201).json({ success: true, message: 'Task template added.', data: result });
    } catch (err) {
      next(err);
    }
  }

  static async updateTaskTemplate(req, res, next) {
    try {
      const { versionId, taskId } = req.params;
      const result = await WorkflowsService.updateTaskTemplate(Number(versionId), Number(taskId), req.body, req.user.id, req);
      res.status(200).json({ success: true, message: 'Task template updated.', data: result });
    } catch (err) {
      next(err);
    }
  }

  static async deleteTaskTemplate(req, res, next) {
    try {
      const { versionId, taskId } = req.params;
      const result = await WorkflowsService.deleteTaskTemplate(Number(versionId), Number(taskId), req.user.id, req);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async reorderTasks(req, res, next) {
    try {
      const { versionId } = req.params;
      const result = await WorkflowsService.reorderTasks(Number(versionId), req.body.orders, req.user.id, req);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  // --- DEPENDENCIES ---

  static async addDependency(req, res, next) {
    try {
      const { versionId, taskId } = req.params;
      const { dependsOnTaskId, dependencyType } = req.body;
      const result = await WorkflowsService.addDependency(
        Number(versionId),
        Number(taskId),
        Number(dependsOnTaskId),
        dependencyType,
        req.user.id,
        req
      );
      res.status(201).json({ success: true, message: 'Dependency established.', data: result });
    } catch (err) {
      next(err);
    }
  }

  static async removeDependency(req, res, next) {
    try {
      const { versionId, taskId, depTaskId } = req.params;
      const result = await WorkflowsService.removeDependency(
        Number(versionId),
        Number(taskId),
        Number(depTaskId),
        req.user.id,
        req
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  // --- VALIDATION & PUBLISH ---

  static async validateVersion(req, res, next) {
    try {
      const { versionId } = req.params;
      const result = await WorkflowsService.validatePresetVersion(Number(versionId));
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async publishVersion(req, res, next) {
    try {
      const { id, versionId } = req.params;
      const result = await WorkflowsService.publishPresetVersion(
        Number(id),
        Number(versionId),
        req.user.id,
        req
      );
      res.status(200).json({
        success: true,
        message: 'Workflow preset version published successfully and is now immutable.',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }
}
