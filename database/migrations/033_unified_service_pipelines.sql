-- Migration 033: One engine for service work
-- Pipelines are the single template for every service. Each pipeline step can carry default task templates
-- (JSON: [{ "title", "clientReview", "role" }]) that are spawned as real tasks whenever a project is created from it
-- (month plans, monthly copies, retainer cycles, draft activation). Project steps keep their own snapshot.
-- Column additions are applied idempotently by server/src/scripts/run-migration-033.js, which also seeds one
-- standard pipeline per service from server/src/modules/services/workflows.data.js (never overwriting a service
-- that already has an active pipeline of its own).
SELECT 1;
