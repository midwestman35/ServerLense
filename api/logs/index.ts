import { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../../lib/db.js';

/**
 * GET /api/logs
 * Query logs with filters and pagination
 * 
 * Query Parameters:
 * - offset: number (default: 0)
 * - limit: number (default: 1000, max: 5000)
 * - component: string
 * - callId: string
 * - fileName: string
 * - level: string (INFO|DEBUG|ERROR|WARN)
 * - isSip: boolean
 * - search: string (full-text search)
 * - startTime: number (timestamp)
 * - endTime: number (timestamp)
 * 
 * Response: { logs: LogEntry[], total: number, offset: number, limit: number }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const {
            offset = '0',
            limit = '1000',
            component,
            callId,
            fileName,
            level,
            isSip,
            search,
            startTime,
            endTime,
        } = req.query;

        const offsetNum = parseInt(offset as string, 10);
        const limitNum = Math.min(parseInt(limit as string, 10), 5000); // Max 5000 per request

        // Build WHERE conditions using template literals (Neon doesn't support sql.unsafe)
        const whereParts: any[] = [];
        
        if (component) {
            whereParts.push(sql`component = ${component as string}`);
        }
        if (callId) {
            whereParts.push(sql`call_id = ${callId as string}`);
        }
        if (fileName) {
            whereParts.push(sql`file_name = ${fileName as string}`);
        }
        if (level) {
            whereParts.push(sql`level = ${(level as string).toUpperCase()}`);
        }
        if (isSip !== undefined) {
            const isSipBool = typeof isSip === 'string' ? isSip === 'true' : Boolean(isSip);
            whereParts.push(sql`is_sip = ${isSipBool}`);
        }
        if (startTime) {
            whereParts.push(sql`timestamp >= ${parseInt(startTime as string, 10)}`);
        }
        if (endTime) {
            whereParts.push(sql`timestamp <= ${parseInt(endTime as string, 10)}`);
        }
        if (search) {
            whereParts.push(sql`to_tsvector('english', message || ' ' || COALESCE(payload, '')) @@ plainto_tsquery('english', ${search as string})`);
        }
        
        // Build queries
        let countResult: any[];
        let logsResult: any[];
        
        if (whereParts.length === 0) {
            // No filters
            countResult = await sql`SELECT COUNT(*) as total FROM logs`;
            logsResult = await sql`SELECT * FROM logs ORDER BY timestamp ASC LIMIT ${limitNum} OFFSET ${offsetNum}`;
        } else {
            // Combine WHERE conditions
            let whereClause = whereParts[0];
            for (let i = 1; i < whereParts.length; i++) {
                whereClause = sql`${whereClause} AND ${whereParts[i]}`;
            }
            
            countResult = await sql`SELECT COUNT(*) as total FROM logs WHERE ${whereClause}`;
            logsResult = await sql`SELECT * FROM logs WHERE ${whereClause} ORDER BY timestamp ASC LIMIT ${limitNum} OFFSET ${offsetNum}`;
        }
        
        const total = parseInt(countResult[0]?.total || '0', 10);

        // Map database columns to LogEntry format
        const logs = logsResult.map((row: any) => ({
            id: row.id,
            // Ensure timestamp is a number (database returns BIGINT which might be string in JSON)
            timestamp: typeof row.timestamp === 'string' ? parseInt(row.timestamp, 10) : Number(row.timestamp),
            rawTimestamp: row.raw_timestamp,
            level: row.level,
            component: row.component,
            displayComponent: row.display_component,
            message: row.message,
            displayMessage: row.display_message,
            payload: row.payload,
            type: row.type,
            isSip: row.is_sip,
            sipMethod: row.sip_method,
            fileName: row.file_name,
            fileColor: row.file_color,
            callId: row.call_id,
            reportId: row.report_id,
            operatorId: row.operator_id,
            extensionId: row.extension_id,
            stationId: row.station_id,
        }));

        res.json({
            logs,
            total,
            offset: offsetNum,
            limit: limitNum,
        });
    } catch (error: any) {
        console.error('Query error:', error);
        res.status(500).json({
            error: error.message || 'Failed to query logs',
        });
    }
}
