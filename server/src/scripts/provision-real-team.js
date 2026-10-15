import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { hashToken } from '../utils/tokens.js';

export async function provisionRealTeam() {
  console.log('--- D-GROW OS PHASE 0: CLEANUP DUMMY DATA & PROVISION REAL TEAM ---');

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Clean up dummy tasks and related records
    console.log('Cleaning up verified dummy tasks & time records...');
    await connection.query('DELETE FROM task_approvals WHERE 1=1');
    await connection.query('DELETE FROM task_attachments WHERE 1=1');
    await connection.query('DELETE FROM task_comments WHERE 1=1');
    await connection.query('DELETE FROM task_status_history WHERE 1=1');
    await connection.query('DELETE FROM task_assignees WHERE 1=1');
    await connection.query('DELETE FROM active_timers WHERE 1=1');
    await connection.query('DELETE FROM time_entries WHERE 1=1');
    await connection.query('DELETE FROM timesheets WHERE 1=1');
    await connection.query('DELETE FROM tasks WHERE 1=1');

    // 2. Clean up dummy projects and milestones
    console.log('Cleaning up dummy projects & milestones...');
    await connection.query('DELETE FROM project_members WHERE 1=1');
    await connection.query('DELETE FROM project_milestones WHERE 1=1');
    await connection.query('DELETE FROM project_teams WHERE 1=1');
    await connection.query('DELETE FROM service_instances WHERE 1=1');
    await connection.query('DELETE FROM projects WHERE 1=1');

    // 3. Clean up dummy clients
    console.log('Cleaning up dummy clients...');
    await connection.query('DELETE FROM clients WHERE 1=1');

    // 4. Clean up dummy leads and notifications
    console.log('Cleaning up dummy notifications & report exports...');
    await connection.query('DELETE FROM notifications WHERE 1=1');
    await connection.query('DELETE FROM report_exports WHERE 1=1');
    await connection.query('DELETE FROM deadline_reminder_logs WHERE 1=1');

    // 5. Clean up old demo users (preserving only real team emails if any exist)
    const realEmails = [
      'info@dgrowmarketing.com',
      'naveen@dgrowmarketing.com',
      'sarun@dgrowmarketing.com',
      'sivamani@dgrowmarketing.com',
      'jaleesh@dgrowmarketing.com',
      'aanand@dgrowmarketing.com',
      'subu@dgrowmarketing.com'
    ];

    console.log('Cleaning up old demo/residual users...');
    const [oldUsers] = await connection.query(
      `SELECT id, email FROM users WHERE email NOT IN (?)`,
      [realEmails]
    );

    if (oldUsers.length > 0) {
      const oldIds = oldUsers.map((u) => u.id);
      await connection.query(`DELETE FROM user_roles WHERE user_id IN (?)`, [oldIds]);
      await connection.query(`DELETE FROM team_members WHERE user_id IN (?)`, [oldIds]);
      await connection.query(`DELETE FROM user_designations WHERE user_id IN (?)`, [oldIds]);
      await connection.query(`DELETE FROM invitations WHERE user_id IN (?)`, [oldIds]);
      await connection.query(`DELETE FROM refresh_tokens WHERE user_id IN (?)`, [oldIds]);
      await connection.query(`DELETE FROM user_notification_preferences WHERE user_id IN (?)`, [oldIds]);
      await connection.query(`DELETE FROM audit_logs WHERE actor_id IN (?)`, [oldIds]);
      await connection.query(`DELETE FROM users WHERE id IN (?)`, [oldIds]);
      console.log(`Removed ${oldUsers.length} old demo user accounts.`);
    }

    // 6. Fetch System Roles for mapping
    const [roles] = await connection.query('SELECT id, slug FROM roles');
    const roleMap = new Map();
    roles.forEach((r) => roleMap.set(r.slug, r.id));

    // 7. Define the 7 real agency team accounts
    const teamMembers = [
      {
        name: 'Srija',
        email: 'info@dgrowmarketing.com',
        primaryRole: 'admin',
        roles: ['admin', 'owner'],
        department: 'Leadership',
        designations: ['Admin']
      },
      {
        name: 'Naveen Pradeep',
        email: 'naveen@dgrowmarketing.com',
        primaryRole: 'member',
        roles: ['dev-exec', 'employee'],
        department: 'Dev',
        designations: ['Developer']
      },
      {
        name: 'Sarun',
        email: 'sarun@dgrowmarketing.com',
        primaryRole: 'member',
        roles: ['account-manager', 'employee'],
        department: 'SEO',
        designations: ['Manager', 'Senior SEO', 'Content Writer']
      },
      {
        name: 'Sivamani',
        email: 'sivamani@dgrowmarketing.com',
        primaryRole: 'member',
        roles: ['dev-exec', 'employee'],
        department: 'Dev',
        designations: ['Developer']
      },
      {
        name: 'Jaleesh',
        email: 'jaleesh@dgrowmarketing.com',
        primaryRole: 'member',
        roles: ['design-exec', 'employee'],
        department: 'Design',
        designations: ['Graphic Designer', 'UI/UX Designer']
      },
      {
        name: 'Aanand',
        email: 'aanand@dgrowmarketing.com',
        primaryRole: 'member',
        roles: ['video-exec', 'employee'],
        department: 'Video',
        designations: ['Video Editor']
      },
      {
        name: 'Subu',
        email: 'subu@dgrowmarketing.com',
        primaryRole: 'member',
        roles: ['seo-exec', 'employee'],
        department: 'SEO',
        designations: ['SEO — On-Page and Off-Page', 'On-Page SEO', 'Off-Page SEO']
      }
    ];

    console.log('Reconciling and provisioning real team members...');
    const provisionedResults = [];

    for (const member of teamMembers) {
      const normalizedEmail = member.email.trim().toLowerCase();
      const [existing] = await connection.query(
        'SELECT id, status FROM users WHERE email = ?',
        [normalizedEmail]
      );

      let userId;
      const designationsJson = JSON.stringify(member.designations);

      const defaultPasswordHash = await bcrypt.hash('Password123!', 10);

      if (existing.length > 0) {
        userId = existing[0].id;
        console.log(`Reconciling existing account: ${member.name} (${normalizedEmail})`);
        await connection.query(
          `UPDATE users 
           SET name = ?, role = ?, department = ?, designations = ?, status = 'active', password_hash = COALESCE(password_hash, ?), must_change_password = FALSE 
           WHERE id = ?`,
          [member.name, member.primaryRole, member.department, designationsJson, defaultPasswordHash, userId]
        );
      } else {
        console.log(`Creating account: ${member.name} (${normalizedEmail})`);
        const [insertRes] = await connection.query(
          `INSERT INTO users (name, email, password_hash, role, department, phone, designations, status, must_change_password)
           VALUES (?, ?, ?, ?, ?, '', ?, 'active', FALSE)`,
          [member.name, normalizedEmail, defaultPasswordHash, member.primaryRole, member.department, designationsJson]
        );
        userId = insertRes.insertId;
      }

      // Sync designations in normalized user_designations table
      await connection.query('DELETE FROM user_designations WHERE user_id = ?', [userId]);
      const desRows = member.designations.map((d) => [userId, d]);
      await connection.query(
        'INSERT IGNORE INTO user_designations (user_id, designation) VALUES ?',
        [desRows]
      );

      // Assign system RBAC roles
      await connection.query('DELETE FROM user_roles WHERE user_id = ?', [userId]);
      const roleIdsToAssign = member.roles
        .map((slug) => roleMap.get(slug))
        .filter(Boolean);

      if (roleIdsToAssign.length > 0) {
        const urRows = roleIdsToAssign.map((rId) => [userId, rId, userId]);
        await connection.query(
          'INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ?',
          [urRows]
        );
      }

      // Generate cryptographically secure invitation token
      // Revoke any previous pending invitations
      await connection.query(
        'UPDATE invitations SET revoked_at = NOW() WHERE user_id = ? AND accepted_at IS NULL AND revoked_at IS NULL',
        [userId]
      );

      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const [invRes] = await connection.query(
        `INSERT INTO invitations (user_id, token_hash, expires_at, created_by)
         VALUES (?, ?, ?, ?)`,
        [userId, tokenHash, expiresAt, userId]
      );

      const clientUrl = env.CLIENT_URL || 'http://localhost:5173';
      const inviteUrl = `${clientUrl}/accept-invitation?token=${rawToken}`;

      provisionedResults.push({
        id: userId,
        name: member.name,
        email: normalizedEmail,
        designations: member.designations,
        primaryRole: member.primaryRole,
        assignedRoles: member.roles,
        department: member.department,
        status: 'active',
        invitationId: invRes.insertId,
        expiresAt: expiresAt.toISOString(),
        inviteUrl
      });
    }

    await connection.commit();

    console.log('\n--- REAL TEAM PROVISIONING COMPLETE ---');
    console.table(
      provisionedResults.map((r) => ({
        Name: r.name,
        Email: r.email,
        Designations: r.designations.join(', '),
        Roles: r.assignedRoles.join(', '),
        Department: r.department,
        Status: r.status
      }))
    );

    return provisionedResults;
  } catch (err) {
    await connection.rollback();
    console.error('Error during team provisioning:', err);
    throw err;
  } finally {
    connection.release();
  }
}

if (process.argv[1]?.endsWith('provision-real-team.js')) {
  provisionRealTeam()
    .then(() => {
      console.log('Team provisioning script completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Failed:', err);
      process.exit(1);
    });
}
