import { ClientsService } from './clients.service.js';
import { ServicesController } from '../services/services.controller.js';

export class ClientsController {
  static async listClients(req, res, next) {
    try {
      const {
        search = '',
        status = '',
        entity = '',
        vertical = '',
        lifecycleStage = '',
        accountManagerId = '',
        industry = '',
        service = '',
        sortBy = 'name',
        sortOrder = 'ASC',
        limit = 50,
        offset = 0
      } = req.query;

      const result = await ClientsService.listClients(
        {
          search,
          status,
          entity,
          vertical,
          lifecycleStage,
          accountManagerId,
          industry,
          service,
          sortBy,
          sortOrder,
          limit: Number(limit) || 50,
          offset: Number(offset) || 0
        },
        req.user
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async getDashboardStats(req, res, next) {
    try {
      const stats = await ClientsService.getDashboardStats(req.user);
      res.json({ stats });
    } catch (err) {
      next(err);
    }
  }

  static async getClient(req, res, next) {
    try {
      const client = await ClientsService.getClientById(Number(req.params.id), req.user);
      res.json({ client });
    } catch (err) {
      next(err);
    }
  }

  static async createClient(req, res, next) {
    try {
      const client = await ClientsService.createClient(req.body, req.user, req);
      res.status(201).json({ message: 'Client created successfully', client });
    } catch (err) {
      next(err);
    }
  }

  static async updateClient(req, res, next) {
    try {
      const client = await ClientsService.updateClient(Number(req.params.id), req.body, req.user, req);
      res.json({ message: 'Client updated successfully', client });
    } catch (err) {
      next(err);
    }
  }

  static async deleteClient(req, res, next) {
    try {
      await ClientsService.deleteClient(Number(req.params.id), req.user, req);
      res.json({ message: 'Client deleted successfully' });
    } catch (err) {
      next(err);
    }
  }

  static async getClientProjects(req, res, next) {
    try {
      const projects = await ClientsService.getClientProjects(Number(req.params.id), req.user);
      res.json({ projects });
    } catch (err) {
      next(err);
    }
  }

  static async getLifecycle(req, res, next) {
    try {
      const lifecycle = await ClientsService.getLifecycle(Number(req.params.id), req.user);
      res.json({ lifecycle });
    } catch (err) {
      next(err);
    }
  }

  static async updateLifecycle(req, res, next) {
    try {
      const payload = req.body;
      const lifecycle = await ClientsService.updateLifecycle(
        Number(req.params.id),
        payload,
        req.user,
        req
      );
      res.json({ message: 'Client lifecycle updated successfully', lifecycle });
    } catch (err) {
      next(err);
    }
  }

  static async getEligibleAccountManagers(req, res, next) {
    try {
      const managers = await ClientsService.getEligibleAccountManagers();
      res.json({ managers });
    } catch (err) {
      next(err);
    }
  }

  static async assignAccountManager(req, res, next) {
    try {
      const client = await ClientsService.assignAccountManager(
        Number(req.params.id),
        req.body,
        req.user,
        req
      );
      res.json({ message: 'Account Manager assigned successfully', client });
    } catch (err) {
      next(err);
    }
  }

  static async getAccountManagerHistory(req, res, next) {
    try {
      const history = await ClientsService.getAccountManagerHistory(Number(req.params.id), req.user);
      res.json({ history });
    } catch (err) {
      next(err);
    }
  }

  static async getContacts(req, res, next) {
    try {
      const contacts = await ClientsService.getContacts(Number(req.params.id), req.user);
      res.json({ contacts });
    } catch (err) {
      next(err);
    }
  }

  static async addContact(req, res, next) {
    try {
      const contact = await ClientsService.addContact(
        Number(req.params.id),
        req.body,
        req.user,
        req
      );
      res.status(201).json({ message: 'Contact added successfully', contact });
    } catch (err) {
      next(err);
    }
  }

  static async updateContact(req, res, next) {
    try {
      const contact = await ClientsService.updateContact(
        Number(req.params.id),
        Number(req.params.contactId),
        req.body,
        req.user,
        req
      );
      res.json({ message: 'Contact updated successfully', contact });
    } catch (err) {
      next(err);
    }
  }

  static async deleteContact(req, res, next) {
    try {
      const result = await ClientsService.deleteContact(
        Number(req.params.id),
        Number(req.params.contactId),
        req.user,
        req
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async setPrimaryContact(req, res, next) {
    try {
      const contact = await ClientsService.setPrimaryContact(
        Number(req.params.id),
        Number(req.params.contactId),
        req.user,
        req
      );
      res.json({ message: 'Primary contact updated', contact });
    } catch (err) {
      next(err);
    }
  }

  static async getOnboardingChecklist(req, res, next) {
    try {
      const onboarding = await ClientsService.getOnboardingChecklist(Number(req.params.id), req.user);
      res.json({ onboarding });
    } catch (err) {
      next(err);
    }
  }

  static async addOnboardingItem(req, res, next) {
    try {
      const onboarding = await ClientsService.addOnboardingItem(
        Number(req.params.id),
        req.body,
        req.user,
        req
      );
      res.status(201).json({ message: 'Onboarding checklist item added', onboarding });
    } catch (err) {
      next(err);
    }
  }

  static async updateOnboardingItem(req, res, next) {
    try {
      const onboarding = await ClientsService.updateOnboardingItem(
        Number(req.params.id),
        Number(req.params.itemId),
        req.body,
        req.user,
        req
      );
      res.json({ message: 'Onboarding item updated', onboarding });
    } catch (err) {
      next(err);
    }
  }

  static async deleteOnboardingItem(req, res, next) {
    try {
      const onboarding = await ClientsService.deleteOnboardingItem(
        Number(req.params.id),
        Number(req.params.itemId),
        req.user,
        req
      );
      res.json({ message: 'Onboarding item deleted', onboarding });
    } catch (err) {
      next(err);
    }
  }

  static async getClientServices(req, res, next) {
    try {
      const services = await ClientsService.getClientServices(Number(req.params.id), req.user);
      const client = await ClientsService.getClientById(Number(req.params.id), req.user);
      res.json({ success: true, client, services });
    } catch (err) {
      next(err);
    }
  }

  static async createClientService(req, res, next) {
    try {
      // If payload is a Phase 1 service catalog bundling request, delegate to ServicesController.bundleServices
      if (req.body.serviceCode || req.body.serviceCodes || req.body.serviceTypes) {
        return ServicesController.bundleServices(req, res, next);
      }

      const service = await ClientsService.createClientService(
        Number(req.params.id),
        req.body,
        req.user,
        req
      );
      res.status(201).json({ success: true, message: 'Client service configured successfully', service });
    } catch (err) {
      next(err);
    }
  }

  static async updateClientService(req, res, next) {
    try {
      const service = await ClientsService.updateClientService(
        Number(req.params.id),
        Number(req.params.serviceId),
        req.body,
        req.user,
        req
      );
      res.json({ message: 'Client service updated successfully', service });
    } catch (err) {
      next(err);
    }
  }

  static async getClientWorkspace(req, res, next) {
    try {
      const workspace = await ClientsService.getClientWorkspace(Number(req.params.id), req.user);
      res.json({ workspace });
    } catch (err) {
      next(err);
    }
  }

  static async getClientActivity(req, res, next) {
    try {
      const activity = await ClientsService.getClientActivity(Number(req.params.id), req.user);
      res.json({ activity });
    } catch (err) {
      next(err);
    }
  }

  static async exportClients(req, res, next) {
    try {
      const result = await ClientsService.listClients({ limit: 1000, offset: 0 }, req.user);
      const csvRows = [
        ['ID', 'Client Code', 'Name', 'Email', 'Company', 'Industry', 'Lifecycle Stage', 'Status', 'Account Manager'].join(',')
      ];
      for (const c of result.clients) {
        csvRows.push([
          c.id,
          `"${(c.client_code || '').replace(/"/g, '""')}"`,
          `"${(c.name || '').replace(/"/g, '""')}"`,
          `"${(c.email || '').replace(/"/g, '""')}"`,
          `"${(c.company_name || '').replace(/"/g, '""')}"`,
          `"${(c.industry || '').replace(/"/g, '""')}"`,
          `"${(c.lifecycle_stage || '').replace(/"/g, '""')}"`,
          `"${(c.status || '').replace(/"/g, '""')}"`,
          `"${(c.account_manager_name || '').replace(/"/g, '""')}"`
        ].join(','));
      }
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="clients-export.csv"');
      res.send(csvRows.join('\n'));
    } catch (err) {
      next(err);
    }
  }
}
