import { pool } from '../config/db.js';
import { ClientsService } from '../modules/clients/clients.service.js';

export async function resetClients() {
  console.log('🔄 Resetting clients to only: Agam, Marks Biotech, Sunshine...');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Unlink users referencing clients
    await connection.query('UPDATE users SET client_id = NULL WHERE client_id IS NOT NULL');

    // 2. Clear related child tables
    const tablesToClean = [
      'calendar_events',
      'calendar_recurrence_rules',
      'tasks',
      'projects',
      'service_instances',
      'invoices',
      'payments',
      'quotations',
      'support_tickets',
      'deliverable_submissions',
      'deliverables',
      'client_contacts',
      'client_onboarding_items',
      'client_activity_logs',
      'client_lifecycle_histories',
      'client_notes',
      'account_manager_history',
      'workflow_executions',
      'leads'
    ];

    for (const tbl of tablesToClean) {
      try {
        await connection.query(`DELETE FROM ${tbl}`);
      } catch (err) {
        // Table might not exist or already clean
      }
    }

    // 3. Clear all existing clients
    await connection.query('DELETE FROM clients');
    console.log('🧹 All previous clients successfully removed.');

    // 4. Find Srija (admin) or fallback to first active user as Account Manager
    const [adminRows] = await connection.query(
      'SELECT id FROM users WHERE email = "info@dgrowmarketing.com" OR role = "admin" OR role = "owner" ORDER BY id ASC LIMIT 1'
    );
    const defaultAmId = adminRows.length > 0 ? adminRows[0].id : null;

    // 5. Define the 3 requested clients
    const targetClients = [
      {
        name: 'Agam',
        companyName: 'Agam',
        email: 'contact@agam.in',
        clientCode: 'CLT-AGAM',
        entity: 'D-Grow',
        vertical: 'General',
        lifecycleStage: 'active',
        status: 'active',
        phone: '+91 98765 43210',
        city: 'Chennai',
        country: 'India',
        industry: 'E-commerce & Retail',
        contactName: 'Agam Management',
        contactEmail: 'contact@agam.in'
      },
      {
        name: 'Marks Biotech',
        companyName: 'Marks Biotech',
        email: 'contact@marksbiotech.com',
        clientCode: 'CLT-MARKSBIOTECH',
        entity: 'MedGrowDigi',
        vertical: 'Healthcare',
        lifecycleStage: 'active',
        status: 'active',
        phone: '+91 98765 43211',
        city: 'Mumbai',
        country: 'India',
        industry: 'Biotechnology & Healthcare',
        contactName: 'Marks Biotech Operations',
        contactEmail: 'contact@marksbiotech.com'
      },
      {
        name: 'Sunshine',
        companyName: 'Sunshine',
        email: 'contact@sunshine.in',
        clientCode: 'CLT-SUNSHINE',
        entity: 'D-Grow',
        vertical: 'General',
        lifecycleStage: 'active',
        status: 'active',
        phone: '+91 98765 43212',
        city: 'Bangalore',
        country: 'India',
        industry: 'Solar & Renewable Energy',
        contactName: 'Sunshine Director',
        contactEmail: 'contact@sunshine.in'
      }
    ];

    const createdClients = [];

    for (const c of targetClients) {
      const [insertRes] = await connection.query(
        `INSERT INTO clients (
           name, company_name, email, client_code, entity, vertical,
           lifecycle_stage, account_manager_id, onboarding_owner_id,
           phone, city, country, industry, status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          c.name,
          c.companyName,
          c.email,
          c.clientCode,
          c.entity,
          c.vertical,
          c.lifecycleStage,
          defaultAmId,
          defaultAmId,
          c.phone,
          c.city,
          c.country,
          c.industry,
          c.status
        ]
      );

      const clientId = insertRes.insertId;

      // Primary contact
      await connection.query(
        `INSERT INTO client_contacts (
           client_id, name, designation, email, phone, is_primary, status
         ) VALUES (?, ?, 'Primary Stakeholder', ?, ?, TRUE, 'active')`,
        [clientId, c.contactName, c.contactEmail, c.phone]
      );

      createdClients.push({ id: clientId, name: c.name, code: c.clientCode });
    }

    await connection.commit();

    // 6. Initialize onboarding checklist for each created client
    for (const c of createdClients) {
      await ClientsService.initializeOnboardingChecklist(c.id, defaultAmId);
      await ClientsService.logActivity(
        c.id,
        defaultAmId,
        'client_created',
        `Client profile created for ${c.name}`,
        `Client ${c.name} (${c.code}) established with active status.`
      );
    }

    console.log('✅ Successfully created exactly 3 clients:');
    createdClients.forEach((c) => console.log(`   - ID: ${c.id} | ${c.name} (${c.code})`));

    return createdClients;
  } catch (err) {
    await connection.rollback();
    console.error('❌ Failed to reset clients:', err);
    throw err;
  } finally {
    connection.release();
  }
}

if (process.argv[1] && process.argv[1].includes('reset-clients.js')) {
  resetClients()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
