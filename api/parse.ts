import { VercelRequest, VercelResponse } from '@vercel/node';
import { put, del } from '@vercel/blob';
import { parseLogFile } from '../lib/parser.js';
import { sql } from '../lib/db.js';
import type { LogEntry } from '../lib/types.js';
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
    // Log immediately - even before method check
    console.log(`[Parse] ===== FUNCTION INVOKED =====`);
    console.log(`[Parse] Request received: ${req.method} ${req.url}`);
    console.log(`[Parse] Headers:`, JSON.stringify(req.headers, null, 2));
    console.log(`[Parse] Query:`, JSON.stringify(req.query, null, 2));
    
    // Add CORS headers immediately
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        console.log(`[Parse] OPTIONS preflight request`);
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        console.log(`[Parse] Method not allowed: ${req.method}`);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    let blobUrl: string | undefined;
    let blob: { url: string } | undefined;

    try {
        // Check environment variables
        const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
        if (!blobToken) {
            console.error('[Parse] ERROR: BLOB_READ_WRITE_TOKEN not set');
            return res.status(500).json({ error: 'Server configuration error: Blob storage token missing' });
        }

        // Parse multipart/form-data using formidable
        const form = formidable({
            maxFileSize: 100 * 1024 * 1024, // 100MB
            keepExtensions: true,
        });

        console.log('[Parse] Parsing multipart form data...');
        const [fields, files] = await form.parse(req as any as IncomingMessage);
        console.log('[Parse] Form data parsed successfully');
        
        // Get the file from parsed form data
        const fileArray = files.file;
        if (!fileArray || fileArray.length === 0) {
            console.log('[Parse] ERROR: No file provided in request');
            return res.status(400).json({ error: 'No file provided' });
        }

        const file = fileArray[0];

        // Validate file type
        const fileName = file.originalFilename || file.newFilename || 'unknown.log';
        const filePath = file.filepath;
        const fileSize = file.size || 0;
        const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

        console.log(`[Parse] Processing file: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);

        if (fileSize > MAX_FILE_SIZE) {
            console.error(`[Parse] ERROR: File too large: ${(fileSize / 1024 / 1024).toFixed(2)}MB (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
            return res.status(413).json({ 
                error: `File too large: ${(fileSize / 1024 / 1024).toFixed(2)}MB. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.` 
            });
        }

        // Generate unique file color
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
        const fileColor = colors[Math.floor(Math.random() * colors.length)];

        // Read file from temporary path and upload to Vercel Blob Storage
        const fs = await import('fs/promises');
        const fileBuffer = await fs.readFile(filePath);
        console.log(`[Parse] File read: ${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB`);
        
        // Upload to Vercel Blob Storage (temporary - for parsing only)
        console.log(`[Parse] Uploading to Vercel Blob Storage...`);
        try {
            // Convert Buffer to ArrayBuffer for Vercel Blob API
            const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
            blob = await put(`temp/${Date.now()}-${fileName}`, arrayBuffer, {
                access: 'public',
                addRandomSuffix: true,
                contentType: file.mimetype || 'text/plain',
            });
            blobUrl = blob.url;
            console.log(`[Parse] Blob uploaded successfully: ${blobUrl}`);
        } catch (blobError: any) {
            console.error('[Parse] ERROR uploading to Blob Storage:', blobError);
            console.error('[Parse] Blob error details:', JSON.stringify(blobError, null, 2));
            if (blobError.statusCode === 403 || blobError.message?.includes('403')) {
                return res.status(403).json({ 
                    error: 'Permission denied',
                    details: 'Failed to upload file to storage. Check BLOB_READ_WRITE_TOKEN environment variable.'
                });
            }
            throw blobError; // Re-throw to be caught by outer catch
        }

        // Parse file from blob URL
        if (!blob || !blobUrl) {
            throw new Error('Blob upload failed');
        }
        console.log(`[Parse] Starting to parse file: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);
        const logs = await parseLogFile(blob.url, fileName, fileColor);
        console.log(`[Parse] Parsed ${logs.length} log entries, starting database insert...`);

        if (logs.length === 0) {
            // Cleanup blob if no logs parsed
            if (blobUrl) {
                await del(blobUrl).catch(() => {});
            }
            return res.status(400).json({ error: 'No logs found in file' });
        }

        // Batch insert logs to Postgres
        // Insert in parallel batches for much better performance (10-50x faster than sequential)
        // Optimized for 1 vCPU + 2GB memory: Larger batches + parallel batch processing
        const BATCH_SIZE = 250; // Increased from 100 - better CPU/memory utilization
        const PARALLEL_BATCHES = 2; // Process 2 batches in parallel (I/O bound operations)
        let insertedCount = 0;

        // Process batches with parallel execution for better hardware utilization
        for (let i = 0; i < logs.length; i += BATCH_SIZE * PARALLEL_BATCHES) {
            // Create parallel batch promises
            const parallelBatchPromises: Promise<void>[] = [];
            
            for (let j = 0; j < PARALLEL_BATCHES && (i + j * BATCH_SIZE) < logs.length; j++) {
                const batchStart = i + j * BATCH_SIZE;
                const batch = logs.slice(batchStart, batchStart + BATCH_SIZE);
                
                // Insert all rows in this batch in parallel
                parallelBatchPromises.push(
                    Promise.all(
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
                    ).then(() => {}) // Convert to Promise<void>
                );
            }
            
            // Wait for all parallel batches to complete
            await Promise.all(parallelBatchPromises);
            insertedCount += Math.min(BATCH_SIZE * PARALLEL_BATCHES, logs.length - i);
            
            // Log progress for debugging
            if (insertedCount % 1000 === 0) {
                console.log(`[Parse] Inserted ${insertedCount}/${logs.length} logs...`);
            }
        }

        // IMPORTANT: Delete blob file immediately after parsing
        // Files are NOT stored long-term - only parsed logs in Postgres
        if (blobUrl) {
            await del(blobUrl).catch((err) => {
                console.error('Failed to delete blob:', err);
                // Don't fail the request if blob deletion fails
            });
        }

        console.log(`[Parse] Successfully inserted ${insertedCount} logs for file: ${fileName}`);
        res.json({
            success: true,
            count: insertedCount,
            fileName: fileName,
        });
    } catch (error: any) {
        // Cleanup blob on error
        if (blobUrl) {
            console.log(`[Parse] Cleaning up blob: ${blobUrl}`);
            await del(blobUrl).catch((err) => {
                console.error('[Parse] Failed to delete blob:', err);
            });
        }

        console.error('[Parse] ERROR:', error);
        console.error('[Parse] Error stack:', error.stack);
        console.error('[Parse] Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        
        // Check for specific error types
        if (error.statusCode === 403 || error.message?.includes('403') || error.message?.includes('Forbidden')) {
            return res.status(403).json({
                error: 'Permission denied',
                details: error.message || 'Access to blob storage was denied. Check BLOB_READ_WRITE_TOKEN environment variable.',
            });
        }

        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                error: 'File too large',
                details: 'File exceeds maximum size limit of 100MB',
            });
        }

        return res.status(500).json({
            error: error.message || 'Failed to parse log file',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        });
    }
}
