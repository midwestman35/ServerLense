import { VercelRequest, VercelResponse } from '@vercel/node';
import { put, del } from '@vercel/blob';
import { parseLogFile } from '../lib/parser';
import { sql } from '../lib/db';
import type { LogEntry } from '../lib/types';

export const config = {
    maxDuration: 60, // 60 seconds (Pro plan)
};

/**
 * POST /api/parse
 * Upload and parse log file
 * 
 * Request: FormData with 'file' field
 * Response: { success: true, count: number }
 * 
 * Behavior:
 * 1. Upload file to Blob Storage (temporary)
 * 2. Parse file from blob URL
 * 3. Insert logs to Postgres (batch)
 * 4. Delete blob file immediately after parsing
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    let blobUrl: string | undefined;

    try {
        // Get file from FormData (Vercel automatically parses multipart/form-data)
        const file = (req as any).body?.file;
        if (!file) {
            return res.status(400).json({ error: 'No file provided' });
        }

        // Validate file type
        const fileName = file.name || 'unknown.log';
        const fileSize = file.size || 0;
        const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB (Vercel Pro limit is 50MB body, but we can handle larger via blob)

        if (fileSize > MAX_FILE_SIZE) {
            return res.status(400).json({ 
                error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` 
            });
        }

        // Generate unique file color
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
        const fileColor = colors[Math.floor(Math.random() * colors.length)];

        // Upload to Vercel Blob Storage (temporary - for parsing only)
        const blob = await put(`temp/${Date.now()}-${fileName}`, file, {
            access: 'public',
            addRandomSuffix: true,
        });
        blobUrl = blob.url;

        // Parse file from blob URL
        const logs = await parseLogFile(blob.url, fileName, fileColor);

        if (logs.length === 0) {
            // Cleanup blob if no logs parsed
            await del(blob.url).catch(() => {});
            return res.status(400).json({ error: 'No logs found in file' });
        }

        // Batch insert logs to Postgres (1000 at a time)
        const BATCH_SIZE = 1000;
        let insertedCount = 0;

        for (let i = 0; i < logs.length; i += BATCH_SIZE) {
            const batch = logs.slice(i, i + BATCH_SIZE);
            
            // Insert logs one by one in batch (Neon doesn't support array VALUES easily)
            // For better performance, we could use a prepared statement or COPY command
            for (const log of batch) {
                await sql`
                    INSERT INTO logs (
                        timestamp, raw_timestamp, level, component, display_component,
                        message, display_message, payload, type, is_sip, sip_method,
                        file_name, file_color, call_id, report_id, operator_id,
                        extension_id, station_id
                    ) VALUES (
                        ${log.timestamp},
                        ${log.rawTimestamp || null},
                        ${log.level},
                        ${log.component || null},
                        ${log.displayComponent || null},
                        ${log.message},
                        ${log.displayMessage || null},
                        ${log.payload || null},
                        ${log.type || 'LOG'},
                        ${log.isSip || false},
                        ${log.sipMethod || null},
                        ${log.fileName || null},
                        ${log.fileColor || null},
                        ${log.callId || null},
                        ${log.reportId || null},
                        ${log.operatorId || null},
                        ${log.extensionId || null},
                        ${log.stationId || null}
                    )
                `;
            }

            insertedCount += batch.length;
        }

        // IMPORTANT: Delete blob file immediately after parsing
        // Files are NOT stored long-term - only parsed logs in Postgres
        await del(blob.url).catch((err) => {
            console.error('Failed to delete blob:', err);
            // Don't fail the request if blob deletion fails
        });

        res.json({
            success: true,
            count: insertedCount,
            fileName: fileName,
        });
    } catch (error: any) {
        // Cleanup blob on error
        if (blobUrl) {
            await del(blobUrl).catch(() => {
                // Ignore cleanup errors
            });
        }

        console.error('Parse error:', error);
        res.status(500).json({
            error: error.message || 'Failed to parse file',
        });
    }
}
