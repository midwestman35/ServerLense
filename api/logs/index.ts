import { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../../lib/db';

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

        // Build WHERE clause
        const conditions: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        if (component) {
            conditions.push(`component = $${paramIndex++}`);
            params.push(component);
        }

        if (callId) {
            conditions.push(`call_id = $${paramIndex++}`);
            params.push(callId);
        }

        if (fileName) {
            conditions.push(`file_name = $${paramIndex++}`);
            params.push(fileName);
        }

        if (level) {
            conditions.push(`level = $${paramIndex++}`);
            params.push(level.toUpperCase());
        }

        if (isSip !== undefined) {
            conditions.push(`is_sip = $${paramIndex++}`);
            params.push(isSip === 'true' || isSip === true);
        }

        if (startTime) {
            conditions.push(`timestamp >= $${paramIndex++}`);
            params.push(parseInt(startTime as string, 10));
        }

        if (endTime) {
            conditions.push(`timestamp <= $${paramIndex++}`);
            params.push(parseInt(endTime as string, 10));
        }

        if (search) {
            // Full-text search using PostgreSQL tsvector
            conditions.push(`to_tsvector('english', message || ' ' || COALESCE(payload, '')) @@ plainto_tsquery('english', $${paramIndex++})`);
            params.push(search);
        }

        const whereClause = conditions.length > 0 
            ? `WHERE ${conditions.join(' AND ')}`
            : '';

        // Get total count
        const countResult = await sql`
            SELECT COUNT(*) as total FROM logs ${sql.unsafe(whereClause)}
        `;
        const total = parseInt(countResult[0]?.total || '0', 10);

        // Get logs with pagination
        params.push(limitNum, offsetNum);
        const logsResult = await sql`
            SELECT * FROM logs 
            ${sql.unsafe(whereClause)}
            ORDER BY timestamp ASC 
            LIMIT $${paramIndex++} OFFSET $${paramIndex++}
        `;

        // Map database columns to LogEntry format
        const logs = logsResult.map((row: any) => ({
            id: row.id,
            timestamp: row.timestamp,
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
