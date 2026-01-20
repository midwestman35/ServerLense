import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const API_BASE = process.env.API_BASE || 'http://localhost:3000';

async function testHealth() {
    console.log('\n📡 Testing health endpoint...');
    try {
        const response = await fetch(`${API_BASE}/api/health`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        console.log('✅ Health check passed');
        console.log(`   Status: ${data.status}`);
        console.log(`   Database connected: ${data.database?.connected}`);
        console.log(`   Log count: ${data.database?.log_count || 0}`);
        return data;
    } catch (error: any) {
        console.error('❌ Health check failed:', error.message);
        throw error;
    }
}

async function testLogs() {
    console.log('\n📡 Testing logs endpoint...');
    try {
        const response = await fetch(`${API_BASE}/api/logs?limit=5`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        console.log('✅ Logs query passed');
        console.log(`   Total logs: ${data.total}`);
        console.log(`   Returned: ${data.logs.length}`);
        if (data.logs.length > 0) {
            console.log(`   First log: ${data.logs[0]?.message?.substring(0, 50)}...`);
        }
        return data;
    } catch (error: any) {
        console.error('❌ Logs query failed:', error.message);
        throw error;
    }
}

async function testCounts() {
    console.log('\n📡 Testing counts endpoint...');
    try {
        const response = await fetch(`${API_BASE}/api/counts?type=file`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        console.log('✅ Counts query passed');
        console.log(`   Files found: ${data.counts.length}`);
        if (data.counts.length > 0) {
            console.log(`   Top file: ${data.counts[0]?.value} (${data.counts[0]?.count} logs)`);
        }
        return data;
    } catch (error: any) {
        console.error('❌ Counts query failed:', error.message);
        throw error;
    }
}

async function testTimeline() {
    console.log('\n📡 Testing timeline endpoint...');
    try {
        const now = Date.now();
        const oneHourAgo = now - (60 * 60 * 1000);
        const response = await fetch(
            `${API_BASE}/api/timeline?startTime=${oneHourAgo}&endTime=${now}`
        );
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        console.log('✅ Timeline query passed');
        console.log(`   Timeline buckets: ${data.timeline.length}`);
        if (data.timeline.length > 0) {
            const bucket = data.timeline[0];
            console.log(`   Sample bucket: ${new Date(bucket.timeBucket).toISOString()}`);
            console.log(`     Errors: ${bucket.errorCount}, SIP Requests: ${bucket.sipRequestCount}`);
        }
        return data;
    } catch (error: any) {
        console.error('❌ Timeline query failed:', error.message);
        throw error;
    }
}

async function testParseEndpoint() {
    console.log('\n📡 Testing parse endpoint...');
    console.log('⚠️  File upload testing requires curl or Postman');
    console.log('   Example: curl -X POST http://localhost:3000/api/parse -F "file=@sample.log"');
    console.log('   Or use Postman with form-data file upload');
}

async function runTests() {
    console.log('🧪 ServerLense API Test Suite');
    console.log(`   API Base: ${API_BASE}`);
    console.log('   Make sure Vercel dev server is running: vercel dev\n');

    try {
        await testHealth();
        await testLogs();
        await testCounts();
        await testTimeline();
        await testParseEndpoint();
        
        console.log('\n✅ All API tests passed!');
        console.log('\n📝 Next steps:');
        console.log('   1. Test file upload with curl or Postman');
        console.log('   2. Verify blob cleanup after parsing');
        console.log('   3. Test with various file formats');
        console.log('   4. Check database performance');
    } catch (error: any) {
        console.error('\n❌ Test suite failed:', error.message);
        console.log('\n💡 Troubleshooting:');
        console.log('   - Make sure Vercel dev server is running: vercel dev');
        console.log('   - Check .env.local has POSTGRES_URL set');
        console.log('   - Run: npm run test:db to verify database connection');
        process.exit(1);
    }
}

runTests();
