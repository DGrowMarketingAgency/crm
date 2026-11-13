import { AutoTriggerEngine } from './engine.service.js';
import { ServicesService } from './services.service.js';

export class ServicesController {
  static async listServices(req, res, next) {
    try {
      const {
        search = '',
        category = '',
        departmentId = '',
        status = '',
        sortBy = 'name',
        sortOrder = 'asc',
        limit = 50,
        offset = 0
      } = req.query;

      const result = await ServicesService.listServices({
        search,
        category,
        departmentId,
        status,
        sortBy,
        sortOrder,
        limit: Number(limit) || 50,
        offset: Number(offset) || 0
      });

      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getService(req, res, next) {
    try {
      const id = req.params.id;
      const result = await ServicesService.getServiceById(id);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async createService(req, res, next) {
    try {
      const result = await ServicesService.createService(req.body, req.user, req);
      res.status(201).json({
        success: true,
        message: 'Service created successfully',
        ...result
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateService(req, res, next) {
    try {
      const id = Number(req.params.id);
      const result = await ServicesService.updateService(id, req.body, req.user, req);
      res.json({
        success: true,
        message: 'Service updated successfully',
        ...result
      });
    } catch (err) {
      next(err);
    }
  }

  static async changeStatus(req, res, next) {
    try {
      const id = Number(req.params.id);
      const { status } = req.body;
      const result = await ServicesService.changeStatus(id, status, req.user, req);
      res.json({
        success: true,
        message: `Service status updated to ${status}`,
        ...result
      });
    } catch (err) {
      next(err);
    }
  }

  static async archiveService(req, res, next) {
    try {
      const id = Number(req.params.id);
      const result = await ServicesService.archiveService(id, req.user, req);
      res.json({
        success: true,
        message: 'Service archived successfully',
        ...result
      });
    } catch (err) {
      next(err);
    }
  }

  static async getCategories(req, res, next) {
    try {
      const categories = await ServicesService.getCategories();
      res.json({ success: true, categories });
    } catch (err) {
      next(err);
    }
  }

  static async getCatalog(req, res, next) {
    try {
      const catalog = AutoTriggerEngine.getAvailableCatalog();
      res.json({ success: true, catalog, services: catalog });
    } catch (err) {
      next(err);
    }
  }

  static async bundleServices(req, res, next) {
    try {
      const clientId = Number(req.params.id);
      const rawTypes =
        req.body.serviceTypes ||
        req.body.serviceCodes ||
        (req.body.serviceCode ? [req.body.serviceCode] : req.body.serviceType ? [req.body.serviceType] : []);
      const serviceTypes = Array.isArray(rawTypes) ? rawTypes : [rawTypes];

      const result = await AutoTriggerEngine.bundleServices(
        clientId,
        serviceTypes,
        req.user,
        req
      );
      res.status(201).json({
        success: true,
        message: 'Services successfully bundled and initial workflow tasks triggered',
        serviceInstance: result.bundled_services ? result.bundled_services[0] : null,
        tasksCreated: result.generated_tasks ? result.generated_tasks.length : 0,
        ...result
      });
    } catch (err) {
      next(err);
    }
  }

  static async listClientServices(req, res, next) {
    try {
      const clientId = Number(req.params.id);
      const result = await AutoTriggerEngine.listClientServices(clientId, req.user);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}
