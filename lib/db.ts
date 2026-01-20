import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

// Get connection string - Vercel automatically loads .env.local in dev mode
function getConnectionString(): string {
  // Try multiple possible environment variable names (Vercel provides several)
  const connStr = process.env.POSTGRES_URL || 
                  process.env.DATABASE_URL ||
                  process.env.POSTGRES_PRISMA_URL;
  
  if (!connStr) {
    const available = Object.keys(process.env).filter(k => 
      k.includes('POSTGRES') || k.includes('DATABASE')
    ).join(', ');
    throw new Error(`POSTGRES_URL environment variable is not set. Available env vars: ${available || 'none'}`);
  }
  return connStr;
}

// Lazy initialization - don't create connection until first use
// This prevents errors when module loads before env vars are available
let sqlInstance: NeonQueryFunction<false, false> | null = null;

function getSql(): NeonQueryFunction<false, false> {
  if (!sqlInstance) {
    try {
      sqlInstance = neon(getConnectionString());
    } catch (error: any) {
      console.error('Failed to initialize database:', error.message);
      throw error;
    }
  }
  return sqlInstance;
}

// Export getSql function for lazy initialization  
export { getSql };

// Export sql - simple lazy getter (will be initialized on first use)
export const sql = getSql();

export interface LogEntry {
  id?: number;
  timestamp: number;
  raw_timestamp?: string;
  level: string;
  component?: string;
  display_component?: string;
  message: string;
  display_message?: string;
  payload?: string;
  type?: string;
  is_sip?: boolean;
  sip_method?: string;
  file_name?: string;
  file_color?: string;
  call_id?: string;
  report_id?: string;
  operator_id?: string;
  extension_id?: string;
  station_id?: string;
  created_at?: Date;
}

export async function initDatabase() {
  try {
    // Create logs table
    await sql`
      CREATE TABLE IF NOT EXISTS logs (
        id SERIAL PRIMARY KEY,
        timestamp BIGINT NOT NULL,
        raw_timestamp VARCHAR(255),
        level VARCHAR(10) NOT NULL,
        component VARCHAR(255),
        display_component VARCHAR(255),
        message TEXT,
        display_message TEXT,
        payload TEXT,
        type VARCHAR(50),
        is_sip BOOLEAN DEFAULT FALSE,
        sip_method VARCHAR(255),
        file_name VARCHAR(255),
        file_color VARCHAR(7),
        call_id VARCHAR(255),
        report_id VARCHAR(255),
        operator_id VARCHAR(255),
        extension_id VARCHAR(255),
        station_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    
    // Create indexes for performance
    await sql`CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_logs_file_name ON logs(file_name)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_logs_call_id ON logs(call_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_logs_component ON logs(component)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_logs_is_sip ON logs(is_sip)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_logs_report_id ON logs(report_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_logs_operator_id ON logs(operator_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_logs_extension_id ON logs(extension_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_logs_station_id ON logs(station_id)`;
    
    // Full-text search index
    await sql`
      CREATE INDEX IF NOT EXISTS idx_logs_message_fts ON logs 
      USING GIN(to_tsvector('english', message || ' ' || COALESCE(payload, '')))
    `;
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}
