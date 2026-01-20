import { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../../lib/db.js';

/**
 * GET /api/counts
 * Get correlation counts by type
 * 
 * Query Parameters:
 * - type: 'file' | 'callId' | 'report' | 'operator' | 'extension' | 'station'
 * 
 * Response: { counts: Array<{ value: string, count: number }> }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { type } = req.query;

        if (!type || typeof type !== 'string') {
            return res.status(400).json({ error: 'Type parameter required' });
        }

        let columnName: string;
        switch (type) {
            case 'file':
                columnName = 'file_name';
                break;
            case 'callId':
                columnName = 'call_id';
                break;
            case 'report':
                columnName = 'report_id';
                break;
            case 'operator':
                columnName = 'operator_id';
                break;
            case 'extension':
                columnName = 'extension_id';
                break;
            case 'station':
                columnName = 'station_id';
                break;
            default:
                return res.status(400).json({ error: 'Invalid type. Must be: file, callId, report, operator, extension, or station' });
        }

        // Get counts grouped by column value
        // Note: columnName is already validated via switch statement above
        // We need to use template string interpolation for column names (safe because we validate)
        let result: any[];
        switch (columnName) {
            case 'call_id':
                result = await sql`SELECT call_id as value, COUNT(*) as count FROM logs WHERE call_id IS NOT NULL GROUP BY call_id ORDER BY count DESC, value ASC`;
                break;
            case 'report_id':
                result = await sql`SELECT report_id as value, COUNT(*) as count FROM logs WHERE report_id IS NOT NULL GROUP BY report_id ORDER BY count DESC, value ASC`;
                break;
            case 'operator_id':
                result = await sql`SELECT operator_id as value, COUNT(*) as count FROM logs WHERE operator_id IS NOT NULL GROUP BY operator_id ORDER BY count DESC, value ASC`;
                break;
            case 'extension_id':
                result = await sql`SELECT extension_id as value, COUNT(*) as count FROM logs WHERE extension_id IS NOT NULL GROUP BY extension_id ORDER BY count DESC, value ASC`;
                break;
            case 'station_id':
                result = await sql`SELECT station_id as value, COUNT(*) as count FROM logs WHERE station_id IS NOT NULL GROUP BY station_id ORDER BY count DESC, value ASC`;
                break;
            case 'file_name':
                result = await sql`SELECT file_name as value, COUNT(*) as count FROM logs WHERE file_name IS NOT NULL GROUP BY file_name ORDER BY count DESC, value ASC`;
                break;
            default:
                return res.status(400).json({ error: 'Invalid column name' });
        }

        const counts = result.map((row: any) => ({
            value: row.value,
            count: parseInt(row.count, 10),
        }));

        res.json({ counts });
    } catch (error: any) {
        console.error('Counts error:', error);
        res.status(500).json({
            error: error.message || 'Failed to get counts',
        });
    }
}
