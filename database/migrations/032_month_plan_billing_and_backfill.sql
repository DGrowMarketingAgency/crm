-- Migration 032: Month plan billing + link existing retainer cycles to month plans
-- New client_month_plans columns (invoice_type, auto_invoice, invoice_id, auto_drafted) are added idempotently
-- by server/src/scripts/run-migration-032.js, which then runs the backfill below.

-- 1. Every client/month that has retainer cycles gets a month plan (past months closed, current/future active).
INSERT IGNORE INTO client_month_plans (client_id, plan_month, status, created_by, closed_at)
SELECT p.client_id, p.cycle_month,
       IF(p.cycle_month < DATE_FORMAT(CURDATE(), '%Y-%m'), 'closed', 'active'),
       MIN(p.created_by),
       IF(p.cycle_month < DATE_FORMAT(CURDATE(), '%Y-%m'), NOW(), NULL)
FROM projects p
WHERE p.parent_project_id IS NOT NULL AND p.month_plan_id IS NULL AND p.cycle_month IS NOT NULL AND p.client_id IS NOT NULL
GROUP BY p.client_id, p.cycle_month;

-- 2. Link those cycles to their month plan.
UPDATE projects p
JOIN client_month_plans mp ON mp.client_id = p.client_id AND mp.plan_month = p.cycle_month
SET p.month_plan_id = mp.id
WHERE p.parent_project_id IS NOT NULL AND p.month_plan_id IS NULL AND p.cycle_month IS NOT NULL;
