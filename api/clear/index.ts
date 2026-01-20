import { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../../lib/db';
import { list, del } from '@vercel/blob';

/**
 * POST /api/clear
 * Clear all logs and temporary blob files
 * 
 * Response: { success: true, deletedLogs: number, deletedBlobs: number }
 * 
 * Behavior:
 * 1. Delete all logs from Postgres
 * 2. Delete all temporary blob files (cleanup temp storage)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Delete all logs from Postgres
        const deleteResult = await sql`DELETE FROM logs`;
        const deletedLogs = deleteResult.rowCount || 0;

        // Delete all temporary blob files
        let deletedBlobs = 0;
        try {
            const blobs = await list({ prefix: 'temp/' });
            await Promise.all(
                blobs.blobs.map(async (blob) => {
                    try {
                        await del(blob.url);
                        deletedBlobs++;
                    } catch (err) {
                        console.error(`Failed to delete blob ${blob.url}:`, err);
                    }
                })
            );
        } catch (blobError: any) {
            console.error('Error listing/deleting blobs:', blobError);
            // Don't fail the request if blob cleanup fails
        }

        res.json({
            success: true,
            deletedLogs,
            deletedBlobs,
        });
    } catch (error: any) {
        console.error('Clear error:', error);
        res.status(500).json({
            error: error.message || 'Failed to clear logs',
        });
    }
}
