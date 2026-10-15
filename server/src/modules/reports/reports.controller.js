import { ReportsService } from './reports.service.js';

export class ReportsController {
  static async getDashboard(req, res, next) {
    try {
      const data = await ReportsService.getDashboardMetrics(req.user, req.query);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async getProjects(req, res, next) {
    try {
      const data = await ReportsService.getProjectReports(req.user, req.query);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async getProjectById(req, res, next) {
    try {
      const data = await ReportsService.getProjectReportById(req.params.id, req.user);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async getTasks(req, res, next) {
    try {
      const data = await ReportsService.getTaskReports(req.user, req.query);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async getOverdueTasks(req, res, next) {
    try {
      const data = await ReportsService.getOverdueTasks(req.user, req.query);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async getTaskCompletion(req, res, next) {
    try {
      const data = await ReportsService.getTaskCompletionTrends(req.user, req.query);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async getTeams(req, res, next) {
    try {
      const data = await ReportsService.getTeamReports(req.user, req.query);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async getTeamById(req, res, next) {
    try {
      const data = await ReportsService.getTeamReportById(req.params.id, req.user, req.query);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async getTimeSummary(req, res, next) {
    try {
      const data = await ReportsService.getTimeSummaryReport(req.user, req.query);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async getProjectHours(req, res, next) {
    try {
      const data = await ReportsService.getProjectHoursReport(req.user, req.query);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async getEmployeeHours(req, res, next) {
    try {
      const data = await ReportsService.getEmployeeHoursReport(req.user, req.query);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async getClients(req, res, next) {
    try {
      const data = await ReportsService.getClientReports(req.user, req.query);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async exportReport(req, res, next) {
    try {
      const reqInfo = {
        ip: req.ip || req.headers['x-forwarded-for'],
        userAgent: req.headers['user-agent']
      };
      const { fileBuffer, contentType, filename } = await ReportsService.exportReport(
        req.user,
        req.body,
        reqInfo
      );

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', fileBuffer.length);
      res.send(fileBuffer);
    } catch (err) {
      next(err);
    }
  }
}
