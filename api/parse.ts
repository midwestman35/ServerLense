import { VercelRequest, VercelResponse } from '@vercel/node';
import { put, del } from '@vercel/blob';
import { parseLogFile } from '../lib/parser.js';
import { sql } from '../lib/db.js';
import type { LogEntry } from '../lib/types';
import formidable from 'formidable';
import { IncomingMessage } from 'http';

export const config = {
    maxDuration: 60, // 60 seconds (Pro plan)
    api: {
        bodyParser: false, // Disable default body parser to handle multipart/form-data
    },
};

/**
 * POST /api/parse
 * Upload and parse log file
 * 
 * Request: FormData with 'file' field
 * Response: { success: true, count: number }
 * 
 * Behavior:
 * 1. Parse multipart/form-data to get file
 * 2. Upload file to Blob Storage (temporary)
 * 3. Parse file from blob URL
 * 4. Insert logs to Postgres (batch)
 * 5. Delete blob file immediately after parsing
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    let blobUrl: string | undefined;

    try {
        // Parse multipart/form-data using formidable
        const form = formidable({
            maxFileSize: 100 * 1024 * 1024, // 100MB
            keepExtensions: true,
        });

        const [fields, files] = await form.parse(req as any as IncomingMessage);
        
        // Get the file from parsed form data
        const fileArray = files.file;
        if (!fileArray || fileArray.length === 0) {
            return res.status(400).json({ error: 'No file provided' });
        }

        const file = fileArray[0];

        // Validate file type
        const fileName = file.originalFilename || file.newFilename || 'unknown.log';
        const filePath = file.filepath;
        const fileSize = file.size || 0;
        const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

        if (fileSize > MAX_FILE_SIZE) {
            return res.status(400).json({ 
                error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` 
            });
        }

        // Generate unique file color
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
        const fileColor = colors[Math.floor(Math.random() * colors.length)];

        // Read file from temporary path and upload to Vercel Blob Storage
        const fs = await import('fs/promises');
        const fileBuffer = await fs.readFile(filePath);
        
        // Upload to Vercel Blob Storage (temporary - for parsing only)
        // Convert Buffer to ArrayBuffer for Vercel Blob API
        const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
        const blob = await put(`temp/${Date.now()}-${fileName}`, arrayBuffer, {
            access: 'public',
            addRandomSuffix: true,
            contentType: file.mimetype || 'text/plain',
        });
        blobUrl = blob.url;

        // Parse file from blob URL
        console.log(`[Parse] Starting to parse file: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);
        const logs = await parseLogFile(blob.url, fileName, fileColor);
        console.log(`[Parse] Parsed ${logs.length} log entries, starting database insert...`);

        if (logs.length === 0) {
            // Cleanup blob if no logs parsed
            await del(blob.url).catch(() => {});
            return res.status(400).json({ error: 'No logs found in file' });
        }

        // Batch insert logs to Postgres
        // Insert in parallel batches for much better performance (10-50x faster than sequential)
        const BATCH_SIZE = 100; // Insert 100 rows in parallel at a time
        let insertedCount = 0;

        for (let i = 0; i < logs.length; i += BATCH_SIZE) {
            const batch = logs.slice(i, i + BATCH_SIZE);
            
            // Insert all rows in batch in parallel using Promise.all
            // This is much faster than sequential inserts (10-50x speedup)
            await Promise.all(
                batch.map(log => 
                    sql`
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
                    `
                )
            );
            insertedCount += batch.length;
            
            // Log progress for debugging
            if (insertedCount % 1000 === 0) {
                console.log(`[Parse] Inserted ${insertedCount}/${logs.length} logs...`);
            }
        }

        // IMPORTANT: Delete blob file immediately after parsing
        // Files are NOT stored long-term - only parsed logs in Postgres
        await del(blob.url).catch((err) => {
            console.error('Failed to delete blob:', err);
            // Don't fail the request if blob deletion fails
        });

        console.log(`[Parse] Successfully inserted ${insertedCount} logs for file: ${fileName}`);
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
