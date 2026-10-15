import { CredentialsService } from './credentials.service.js';

export class CredentialsController {
  static async listCredentials(req, res, next) {
    try {
      const credentials = await CredentialsService.listCredentials(req.user, req.query);
      return res.status(200).json({ success: true, credentials });
    } catch (err) {
      next(err);
    }
  }

  static async getCredentialDetails(req, res, next) {
    try {
      const data = await CredentialsService.getCredentialDetails(req.user, req.params.id);
      return res.status(200).json({ success: true, ...data });
    } catch (err) {
      next(err);
    }
  }

  static async createCredential(req, res, next) {
    try {
      const credential = await CredentialsService.createCredential(req.user, req.body, req);
      return res.status(201).json({
        success: true,
        message: 'Platform credential created and encrypted successfully.',
        credential
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateCredential(req, res, next) {
    try {
      const result = await CredentialsService.updateCredential(req.user, req.params.id, req.body, req);
      return res.status(200).json({
        success: true,
        message: 'Credential updated successfully.',
        ...result
      });
    } catch (err) {
      next(err);
    }
  }

  static async revealCredential(req, res, next) {
    try {
      // Set Cache-Control to prevent intermediate/browser caching of decrypted secret
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      const revealed = await CredentialsService.revealCredential(req.user, req.params.id, req);
      return res.status(200).json({
        success: true,
        revealed
      });
    } catch (err) {
      next(err);
    }
  }

  static async grantEmployeeAccess(req, res, next) {
    try {
      const grant = await CredentialsService.grantEmployeeAccess(req.user, req.params.id, req.body, req);
      return res.status(201).json({
        success: true,
        message: 'Credential access granted successfully.',
        grant
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateEmployeeGrant(req, res, next) {
    try {
      const result = await CredentialsService.updateEmployeeGrant(
        req.user,
        req.params.id,
        req.params.grantId,
        req.body,
        req
      );
      return res.status(200).json({
        success: true,
        message: 'Employee access grant updated.',
        ...result
      });
    } catch (err) {
      next(err);
    }
  }

  static async revokeEmployeeAccess(req, res, next) {
    try {
      const result = await CredentialsService.revokeEmployeeAccess(
        req.user,
        req.params.id,
        req.params.grantId,
        req
      );
      return res.status(200).json({
        success: true,
        message: 'Employee access revoked successfully.',
        ...result
      });
    } catch (err) {
      next(err);
    }
  }

  static async clientRevokeAllAccess(req, res, next) {
    try {
      const result = await CredentialsService.clientRevokeAllAccess(req.user, req.params.id, req);
      return res.status(200).json({
        success: true,
        ...result
      });
    } catch (err) {
      next(err);
    }
  }

  static async getAuditHistory(req, res, next) {
    try {
      const logs = await CredentialsService.getAuditHistory(req.user, req.params.id);
      return res.status(200).json({ success: true, logs });
    } catch (err) {
      next(err);
    }
  }

  static async archiveCredential(req, res, next) {
    try {
      const result = await CredentialsService.archiveCredential(req.user, req.params.id, req);
      return res.status(200).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getEligibleEmployees(req, res, next) {
    try {
      const employees = await CredentialsService.getEligibleEmployees();
      return res.status(200).json({ success: true, employees });
    } catch (err) {
      next(err);
    }
  }

  static async rotateKeys(req, res, next) {
    try {
      const { targetKeyVersion } = req.body;
      if (!targetKeyVersion) {
        return res.status(400).json({ success: false, error: { message: 'targetKeyVersion is required' } });
      }
      const result = await CredentialsService.rotateAllCredentials(targetKeyVersion);
      return res.status(200).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }
}
