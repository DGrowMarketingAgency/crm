import { AutoTriggerEngine } from './engine.service.js';

export class ServicesController {
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
      const rawTypes = req.body.serviceTypes || req.body.serviceCodes || (req.body.serviceCode ? [req.body.serviceCode] : (req.body.serviceType ? [req.body.serviceType] : []));
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

