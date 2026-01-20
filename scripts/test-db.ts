import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const sql = neon(process.env.POSTGRES_URL!);

async function testConnection() {
  try {
    console.log('Testing database connection...');
    console.log('Connection string:', process.env.POSTGRES_URL?.replace(/:[^:@]+@/, ':****@'));
    
    const result = await sql`SELECT NOW() as current_time, version() as pg_version`;
    console.log('✅ Database connected successfully!');
    console.log('Current time:', result[0]?.current_time);
    console.log('PostgreSQL version:', result[0]?.pg_version?.split(' ')[0] + ' ' + result[0]?.pg_version?.split(' ')[1]);
    
    // Test table existence
    const tableCheck = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'logs'
      ) as table_exists
    `;
    
    if (tableCheck[0]?.table_exists) {
      console.log('✅ Logs table exists');
      
      // Get row count
      const countResult = await sql`SELECT COUNT(*) as count FROM logs`;
      console.log('Current log entries:', countResult[0]?.count || 0);
    } else {
      console.log('⚠️  Logs table does not exist yet. Run database initialization.');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
}

testConnection();
