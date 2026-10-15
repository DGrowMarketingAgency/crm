-- =====================================================================
-- D-GROW OS: Client Portal Login & Authentication Sync for phpMyAdmin
-- Safe & Idempotent (Can be run multiple times safely without errors)
-- =====================================================================

-- 1. Ensure 'client' role exists in roles table
INSERT INTO roles (name, slug, description, is_system)
VALUES ('Client', 'client', 'Client portal user with access to own projects, deliverables, invoices & credentials', 1)
ON DUPLICATE KEY UPDATE 
  name = VALUES(name),
  description = VALUES(description);

-- 2. Map all client portal permissions to the 'client' role
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.slug = 'client'
  AND p.permission_key IN (
    'permissions.view',
    'projects.view',
    'milestones.view',
    'clients.view',
    'tasks.view',
    'subtasks.view',
    'task_comments.view',
    'task_comments.create',
    'task_comments.update_own',
    'task_attachments.view',
    'deliverables.view',
    'deliverables.review_client',
    'deliverables.request_revision',
    'tickets.view',
    'tickets.create',
    'tickets.reply',
    'quotations.view',
    'quotations.review_client',
    'invoices.view',
    'payments.view',
    'notifications.view',
    'notifications.manage_own',
    'notifications.manage_preferences',
    'time_reports.view',
    'reports.view_dashboard',
    'reports.view_projects',
    'reports.view_tasks',
    'reports.view_clients',
    'services.view',
    'lifecycle.view',
    'calendar.view',
    'credentials.client_access'
  );

-- 3. Verify column client_id exists on users table (safe dynamic check)
SET @dbname = DATABASE();
SET @tablename = 'users';
SET @columnname = 'client_id';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE users ADD COLUMN client_id BIGINT UNSIGNED NULL AFTER phone'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 4. Verify column user_id exists on clients table (safe dynamic check)
SET @tablename = 'clients';
SET @columnname = 'user_id';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE clients ADD COLUMN user_id BIGINT UNSIGNED NULL AFTER status'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
  