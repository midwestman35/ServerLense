import { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../../lib/db';

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
        const result = await sql`
            SELECT ${sql.unsafe(columnName)} as value, COUNT(*) as count
            FROM logs
            WHERE ${sql.unsafe(columnName)} IS NOT NULL
            GROUP BY ${sql.unsafe(columnName)}
            ORDER BY count DESC, value ASC
        `;

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
