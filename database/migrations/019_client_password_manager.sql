-- D-Grow OS — Secure Client Password Manager & Credential Access Control
-- Migration 019: Client Credentials, Access Grants, and Audit Logs

USE agency_manager;

-- 1. Client Credentials Table
CREATE TABLE IF NOT EXISTS client_credentials (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NULL,
  platform_name VARCHAR(255) NOT NULL,
  category ENUM(
    'Social Media',
    'Website Administration',
    'Hosting and Domain',
    'Email Services',
    'SEO Tools',
    'Advertising Accounts',
    'Analytics',
    'Business Listings',
    'Other'
  ) NOT NULL DEFAULT 'Other',
  login_url VARCHAR(1000) NULL,
  username VARCHAR(255) NULL,
  encrypted_username TEXT NULL,
  encrypted_password TEXT NOT NULL,
  encrypted_recovery_email TEXT NULL,
  encrypted_recovery_phone TEXT NULL,
  account_id VARCHAR(255) NULL,
  notes TEXT NULL,
  internal_notes TEXT NULL,
  key_version VARCHAR(32) NOT NULL DEFAULT 'v1',
  status ENUM('active', 'archived', 'revoked') NOT NULL DEFAULT 'active',
  additional_fields JSON NULL,
  created_by BIGINT UNSIGNED NULL,
  last_updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cred_client_id (client_id),
  INDEX idx_cred_project_id (project_id),
  INDEX idx_cred_category (category),
  INDEX idx_cred_status (status),
  INDEX idx_cred_key_version (key_version),
  CONSTRAINT fk_client_credentials_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_client_credentials_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  CONSTRAINT fk_client_credentials_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_client_credentials_updater FOREIGN KEY (last_updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Credential Access Grants Table (Explicit employee access control)
CREATE TABLE IF NOT EXISTS credential_access_grants (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  credential_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  access_level ENUM('metadata_only', 'view_credentials', 'edit_credentials', 'manage_access') NOT NULL DEFAULT 'view_credentials',
  access_reason TEXT NULL,
  granted_by BIGINT UNSIGNED NULL,
  expires_at DATETIME NULL,
  revoked_at DATETIME NULL,
  revoked_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_grant_cred_emp (credential_id, employee_id),
  INDEX idx_grant_employee (employee_id),
  INDEX idx_grant_expires (expires_at),
  INDEX idx_grant_revoked (revoked_at),
  INDEX idx_grant_access_level (access_level),
  CONSTRAINT fk_grant_credential FOREIGN KEY (credential_id) REFERENCES client_credentials(id) ON DELETE CASCADE,
  CONSTRAINT fk_grant_employee FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_grant_granter FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_grant_revoker FOREIGN KEY (revoked_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Dedicated Credential Access Logs (Immutable security audit trail)
CREATE TABLE IF NOT EXISTS credential_access_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  credential_id BIGINT UNSIGNED NOT NULL,
  client_id BIGINT UNSIGNED NOT NULL,
  actor_id BIGINT UNSIGNED NOT NULL,
  grant_id BIGINT UNSIGNED NULL,
  action VARCHAR(64) NOT NULL,
  access_level VARCHAR(32) NULL,
  access_reason VARCHAR(500) NULL,
  outcome ENUM('success', 'denied') NOT NULL DEFAULT 'success',
  failure_reason VARCHAR(255) NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cred_log_cred (credential_id),
  INDEX idx_cred_log_client (client_id),
  INDEX idx_cred_log_actor (actor_id),
  INDEX idx_cred_log_action (action),
  INDEX idx_cred_log_created (created_at),
  CONSTRAINT fk_cred_log_credential FOREIGN KEY (credential_id) REFERENCES client_credentials(id) ON DELETE CASCADE,
  CONSTRAINT fk_cred_log_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_cred_log_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cred_log_grant FOREIGN KEY (grant_id) REFERENCES credential_access_grants(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. RBAC Permissions Registration
INSERT IGNORE INTO permissions (permission_key, module, action, description) VALUES
('credentials.view_all', 'Credentials', 'view_all', 'Admin access to view all client credentials across organizations'),
('credentials.manage', 'Credentials', 'manage', 'Admin access to create, update, delete credentials and grant employee access'),
('credentials.client_access', 'Credentials', 'client_access', 'Client portal access to submit and manage own platform credentials'),
('credentials.employee_view', 'Credentials', 'employee_view', 'Employee access to view explicitly authorized client credentials');

-- Assign Permissions to Admin Role (ID 2)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 2, id FROM permissions WHERE permission_key IN ('credentials.view_all', 'credentials.manage');

-- Assign Permissions to Client Role (ID 6)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 6, id FROM permissions WHERE permission_key IN ('credentials.client_access');

-- Assign Permissions to Employee Roles
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.slug IN (
  'employee', 'project-manager', 'team-leader', 'account-manager',
  'seo-exec', 'perf-marketing-exec', 'content-exec', 'design-exec',
  'video-exec', 'dev-exec', 'hr-admin'
)
AND p.permission_key = 'credentials.employee_view';
