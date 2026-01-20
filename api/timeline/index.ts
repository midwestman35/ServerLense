import { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../../lib/db';

/**
 * GET /api/timeline
 * Get aggregated timeline data
 * 
 * Query Parameters:
 * - startTime: number (timestamp, required)
 * - endTime: number (timestamp, required)
 * - fileName: string (optional)
 * - bucketSize: number (seconds, default: 60)
 * 
 * Response: {
 *   timeline: Array<{
 *     timeBucket: number,
 *     errorCount: number,
 *     sipRequestCount: number,
 *     sipSuccessCount: number,
 *     sipErrorCount: number
 *   }>
 * }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { startTime, endTime, fileName, bucketSize = '60' } = req.query;

        if (!startTime || !endTime) {
            return res.status(400).json({ error: 'startTime and endTime are required' });
        }

        const startTimeNum = parseInt(startTime as string, 10);
        const endTimeNum = parseInt(endTime as string, 10);
        const bucketSizeNum = parseInt(bucketSize as string, 10);

        // Build WHERE clause
        const conditions: string[] = [
            `timestamp >= ${startTimeNum}`,
            `timestamp <= ${endTimeNum}`,
        ];

        if (fileName) {
            conditions.push(`file_name = '${fileName}'`);
        }

        const whereClause = conditions.join(' AND ');

        // Aggregate logs by time bucket
        const result = await sql`
            SELECT 
                FLOOR(timestamp / ${bucketSizeNum * 1000}) * ${bucketSizeNum * 1000} as time_bucket,
                COUNT(*) FILTER (WHERE level = 'ERROR') as error_count,
                COUNT(*) FILTER (WHERE is_sip = true AND sip_method NOT LIKE '2%' AND sip_method NOT LIKE '3%') as sip_request_count,
                COUNT(*) FILTER (WHERE is_sip = true AND sip_method LIKE '2%') as sip_success_count,
                COUNT(*) FILTER (WHERE is_sip = true AND (sip_method LIKE '4%' OR sip_method LIKE '5%' OR sip_method LIKE '6%')) as sip_error_count
            FROM logs
            WHERE ${sql.unsafe(whereClause)}
            GROUP BY time_bucket
            ORDER BY time_bucket ASC
        `;

        const timeline = result.map((row: any) => ({
            timeBucket: parseInt(row.time_bucket, 10),
            errorCount: parseInt(row.error_count, 10),
            sipRequestCount: parseInt(row.sip_request_count, 10),
            sipSuccessCount: parseInt(row.sip_success_count, 10),
            sipErrorCount: parseInt(row.sip_error_count, 10),
        }));

        res.json({ timeline });
    } catch (error: any) {
        console.error('Timeline error:', error);
        res.status(500).json({
            error: error.message || 'Failed to get timeline',
        });
    }
}
