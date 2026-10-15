import { ProjectsService } from './projects.service.js';

export class ProjectsController {
  static async listProjects(req, res, next) {
    try {
      const {
        search = '',
        status = '',
        priority = '',
        clientId = '',
        managerId = '',
        teamId = '',
        isArchived = false,
        sortBy = 'created_at',
        sortOrder = 'desc',
        limit = 20,
        offset = 0
      } = req.query;

      const result = await ProjectsService.listProjects(
        {
          search,
          status,
          priority,
          clientId,
          managerId,
          teamId,
          isArchived,
          sortBy,
          sortOrder,
          limit: Number(limit) || 20,
          offset: Number(offset) || 0
        },
        req.user
      );

      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async getProject(req, res, next) {
    try {
      const project = await ProjectsService.getProjectById(req.params.id, req.user);
      res.json({ project });
    } catch (err) {
      next(err);
    }
  }

  static async createProject(req, res, next) {
    try {
      const project = await ProjectsService.createProject(req.body, req.user, req);
      res.status(201).json({ message: 'Project created successfully', project });
    } catch (err) {
      next(err);
    }
  }

  static async updateProject(req, res, next) {
    try {
      const project = await ProjectsService.updateProject(req.params.id, req.body, req.user, req);
      res.json({ message: 'Project updated successfully', project });
    } catch (err) {
      next(err);
    }
  }

  static async changeStatus(req, res, next) {
    try {
      const project = await ProjectsService.changeProjectStatus(
        req.params.id,
        req.body.status,
        req.user,
        req
      );
      res.json({ message: 'Project status updated successfully', project });
    } catch (err) {
      next(err);
    }
  }

  static async archiveProject(req, res, next) {
    try {
      await ProjectsService.archiveProject(req.params.id, req.user, req);
      res.json({ message: 'Project archived successfully' });
    } catch (err) {
      next(err);
    }
  }

  static async getMembers(req, res, next) {
    try {
      const members = await ProjectsService.getProjectMembers(req.params.id, req.user);
      res.json({ members });
    } catch (err) {
      next(err);
    }
  }

  static async updateMembers(req, res, next) {
    try {
      const members = await ProjectsService.updateProjectMembers(
        req.params.id,
        req.body.members,
        req.user,
        req
      );
      res.json({ message: 'Project members updated successfully', members });
    } catch (err) {
      next(err);
    }
  }

  static async getTeams(req, res, next) {
    try {
      const teams = await ProjectsService.getProjectTeams(req.params.id, req.user);
      res.json({ teams });
    } catch (err) {
      next(err);
    }
  }

  static async updateTeams(req, res, next) {
    try {
      const teams = await ProjectsService.updateProjectTeams(
        req.params.id,
        req.body.teamIds,
        req.user,
        req
      );
      res.json({ message: 'Project teams updated successfully', teams });
    } catch (err) {
      next(err);
    }
  }

  static async getActivity(req, res, next) {
    try {
      const activity = await ProjectsService.getProjectActivity(req.params.id, req.user);
      res.json({ activity });
    } catch (err) {
      next(err);
    }
  }

  static async getMetrics(req, res, next) {
    try {
      const metrics = await ProjectsService.getDashboardMetrics(req.user);
      res.json({ metrics });
    } catch (err) {
      next(err);
    }
  }
}
