import { WorkflowEngineService } from './workflow-engine.service.js';

export class AutomationController {
  static async preview(req, res, next) {
    try {
      const result = await WorkflowEngineService.previewWorkflow(req.body);
      res.json({
        success: true,
        preview: result
      });
    } catch (err) {
      next(err);
    }
  }

  static async initialize(req, res, next) {
    try {
      const result = await WorkflowEngineService.executeWorkflow({
        ...req.body,
        actorUser: req.user,
        req
      });
      res.status(result.isDuplicate ? 200 : 201).json({
        success: true,
        ...result
      });
    } catch (err) {
      next(err);
    }
  }

  static async listExecutions(req, res, next) {
    try {
      const result = await WorkflowEngineService.listExecutions(req.query, req.user);
      res.json({
        success: true,
        ...result
      });
    } catch (err) {
      next(err);
    }
  }

  static async getExecution(req, res, next) {
    try {
      const execution = await WorkflowEngineService.getExecutionById(req.params.id, req.user);
      res.json({
        success: true,
        execution
      });
    } catch (err) {
      next(err);
    }
  }

  static async getExecutionTasks(req, res, next) {
    try {
      const tasks = await WorkflowEngineService.getExecutionTasks(req.params.id, req.user);
      res.json({
        success: true,
        tasks
      });
    } catch (err) {
      next(err);
    }
  }

  static async getExecutionErrors(req, res, next) {
    try {
      const execution = await WorkflowEngineService.getExecutionById(req.params.id, req.user);
      res.json({
        success: true,
        executionId: execution.id,
        status: execution.status,
        errorDetails: execution.error_details ? (typeof execution.error_details === 'string' ? JSON.parse(execution.error_details) : execution.error_details) : null
      });
    } catch (err) {
      next(err);
    }
  }

  static async retryExecution(req, res, next) {
    try {
      const result = await WorkflowEngineService.retryExecution(req.params.id, req.user, req);
      res.json({
        success: true,
        ...result
      });
    } catch (err) {
      next(err);
    }
  }

  static async evaluateDependencies(req, res, next) {
    try {
      const result = await WorkflowEngineService.evaluateDependencies(req.body, req.user, req);
      res.json({
        success: true,
        ...result
      });
    } catch (err) {
      next(err);
    }
  }
}
