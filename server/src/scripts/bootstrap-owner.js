import readline from 'readline';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { pool } from '../config/db.js';

// Schema for input validation
const bootstrapSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

/**
 * Parses command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        parsed[key] = next;
        i++;
      } else {
        parsed[key] = true;
      }
    }
  }
  return parsed;
}

/**
 * Prompts user for console input
 */
function askQuestion(query, hidden = false) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    if (hidden && process.stdin.isTTY) {
      // In interactive TTY, we can mask input
      process.stdout.write(query);
      let input = '';
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      const onData = (char) => {
        if (char === '\n' || char === '\r' || char === '\u0004') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          rl.close();
          resolve(input);
        } else if (char === '\u0003') {
          process.exit(1);
        } else if (char === '\u007f' || char === '\b') {
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else {
          input += char;
          process.stdout.write('*');
        }
      };

      process.stdin.on('data', onData);
    } else {
      rl.question(query, (ans) => {
        rl.close();
        resolve(ans);
      });
    }
  });
}

async function runBootstrap() {
  console.log('==============================================');
  console.log(' Agency Manager — Initial Owner Setup Wizard ');
  console.log('==============================================\n');

  const connection = await pool.getConnection();

  try {
    // 1. Verify if an Owner account already exists
    const [existingOwners] = await connection.query(
      "SELECT id, email FROM users WHERE role = 'owner' LIMIT 1"
    );

    if (existingOwners.length > 0) {
      console.error('❌ Aborted: An Owner account already exists in this system.');
      console.error(`   Existing Owner: ${existingOwners[0].email}`);
      console.error('   Initial Owner bootstrap cannot be run more than once.');
      process.exit(1);
    }

    // 2. Read arguments or prompt interactively
    const cliArgs = parseArgs();
    let name = cliArgs.name;
    let email = cliArgs.email;
    let password = cliArgs.password;

    if (!name) {
      name = await askQuestion('Enter Owner Full Name: ');
    }
    if (!email) {
      email = await askQuestion('Enter Owner Email Address: ');
    }
    if (!password) {
      password = await askQuestion('Enter Secure Password (min 8 chars): ', true);
    }

    // 3. Validate input
    const validation = bootstrapSchema.safeParse({ name, email, password });
    if (!validation.success) {
      console.error('\n❌ Validation Error:');
      validation.error.errors.forEach((err) => {
        console.error(`  - ${err.message}`);
      });
      process.exit(1);
    }

    const validData = validation.data;

    // Check if email is already taken by any user
    const [existingUsers] = await connection.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [validData.email]
    );

    if (existingUsers.length > 0) {
      console.error(`\n❌ Error: A user with email ${validData.email} already exists.`);
      process.exit(1);
    }

    // 4. Hash password with bcrypt (salt rounds = 12)
    console.log('\nHashing credentials with bcrypt (12 rounds)...');
    const passwordHash = await bcrypt.hash(validData.password, 12);

    // 5. Insert Owner within database transaction
    await connection.beginTransaction();

    const [insertResult] = await connection.query(
      `INSERT INTO users (name, email, password_hash, role, status, must_change_password)
       VALUES (?, ?, ?, 'owner', 'active', FALSE)`,
      [validData.name, validData.email, passwordHash]
    );

    // Link Owner role in user_roles pivot table
    await connection.query(
      `INSERT IGNORE INTO user_roles (user_id, role_id)
       SELECT ?, id FROM roles WHERE slug = 'owner'`,
      [insertResult.insertId]
    );

    await connection.commit();

    console.log('\n✅ Initial Owner account created successfully!');
    console.log(`   User ID : ${insertResult.insertId}`);
    console.log(`   Name    : ${validData.name}`);
    console.log(`   Email   : ${validData.email}`);
    console.log(`   Role    : owner`);
    console.log(`   Status  : active`);
    console.log('\nYou can now start the server and sign in with these credentials.');
  } catch (error) {
    await connection.rollback();
    console.error('\n❌ Bootstrap failed with error:', error.message);
    process.exit(1);
  } finally {
    connection.release();
    await pool.end();
  }
}

runBootstrap();
