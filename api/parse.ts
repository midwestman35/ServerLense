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
        bodyParser: false, // We handle both JSON and multipart/form-data manually
    },
};

/**
 * POST /api/parse
 * Parse log file from blob URL
 * 
 * Request: JSON body with 'blobUrl' and 'fileName' fields
 * OR FormData with 'file' field (legacy, limited to 4.5MB)
 * 
 * Response: { success: true, count: number }
 * 
 * Behavior:
 * 1. Accept blob URL (preferred) OR parse multipart/form-data (legacy)
 * 2. Parse file from blob URL
 * 3. Insert logs to Postgres (batch)
 * 4. Delete blob file immediately after parsing
 * 
 * Note: For files > 4.5MB, use client-side blob upload + this endpoint with blobUrl
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Log immediately - even before method check
    // Use console.error for immediate flushing in Vercel
    console.error(`[Parse] ===== FUNCTION INVOKED =====`);
    console.error(`[Parse] Request received: ${req.method} ${req.url}`);
    console.error(`[Parse] Timestamp: ${new Date().toISOString()}`);
    console.error(`[Parse] Headers:`, JSON.stringify(req.headers, null, 2));
    console.error(`[Parse] Query:`, JSON.stringify(req.query, null, 2));
    
    // Add CORS headers immediately
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        console.error(`[Parse] OPTIONS preflight request`);
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        console.error(`[Parse] Method not allowed: ${req.method}`);
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

        let blobUrlToParse: string;
        let fileName: string;
        let fileSize = 0;

        // Check content type to determine request format
        const contentType = req.headers['content-type'] || '';
        console.error(`[Parse] Content-Type: ${contentType}`);

        if (contentType.includes('application/json')) {
            // New method: blobUrl provided (bypasses 4.5MB limit)
            console.error('[Parse] Using blobUrl method (client-side upload)');
            
            // Parse JSON body manually (bodyParser is disabled)
            let body: any;
            try {
                const chunks: Buffer[] = [];
                for await (const chunk of req) {
                    chunks.push(chunk);
                }
                const bodyString = Buffer.concat(chunks).toString('utf-8');
                body = JSON.parse(bodyString);
            } catch (parseError) {
                console.error('[Parse] ERROR parsing JSON body:', parseError);
                return res.status(400).json({ error: 'Invalid JSON body' });
            }
            
            if (!body?.blobUrl) {
                console.error('[Parse] ERROR: No blobUrl provided');
                return res.status(400).json({ error: 'No blobUrl provided' });
            }
            
            blobUrlToParse = body.blobUrl;
            fileName = body.fileName || 'unknown.log';
            console.error(`[Parse] Processing from blob URL: ${blobUrlToParse}`);
            
            // Validate blob URL format
            if (!blobUrlToParse.startsWith('http://') && !blobUrlToParse.startsWith('https://')) {
                console.error(`[Parse] ERROR: Invalid blob URL format: ${blobUrlToParse}`);
                return res.status(400).json({ error: 'Invalid blob URL format' });
            }
            
            // Delay to ensure blob is available (Vercel Blob propagation delay)
            // For large files, this delay helps but retry logic handles the rest
            const delay = 1000; // 1 second initial delay
            console.error(`[Parse] Waiting ${delay}ms before fetching blob...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            
        } else {
            // Legacy method: multipart/form-data (limited to 4.5MB)
            console.error('[Parse] Using legacy multipart/form-data method');
            console.error('[Parse] WARNING: This method is limited to 4.5MB by Vercel');
            
            const form = formidable({
                maxFileSize: 100 * 1024 * 1024, // 100MB (but Vercel will reject > 4.5MB)
                keepExtensions: true,
            });

            console.error('[Parse] Parsing multipart form data...');
            const [fields, files] = await form.parse(req as any as IncomingMessage);
            console.error('[Parse] Form data parsed successfully');
            
            const fileArray = files.file;
            console.error(`[Parse] Files array length: ${fileArray?.length || 0}`);
            if (!fileArray || fileArray.length === 0) {
                console.error('[Parse] ERROR: No file provided in request');
                return res.status(400).json({ error: 'No file provided' });
            }

            const file = fileArray[0];
            fileName = file.originalFilename || file.newFilename || 'unknown.log';
            const filePath = file.filepath;
            fileSize = file.size || 0;
            const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

            console.error(`[Parse] Processing file: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);

            if (fileSize > MAX_FILE_SIZE) {
                console.error(`[Parse] ERROR: File too large: ${(fileSize / 1024 / 1024).toFixed(2)}MB (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
                return res.status(413).json({ 
                    error: `File too large: ${(fileSize / 1024 / 1024).toFixed(2)}MB. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.` 
                });
            }

            // Check Vercel's 4.5MB limit
            const VERCEL_LIMIT = 4.5 * 1024 * 1024; // 4.5MB
            if (fileSize > VERCEL_LIMIT) {
                console.error(`[Parse] ERROR: File exceeds Vercel 4.5MB limit: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);
                return res.status(413).json({ 
                    error: `File too large for direct upload: ${(fileSize / 1024 / 1024).toFixed(2)}MB. Vercel has a 4.5MB limit. Please use client-side blob upload for larger files.`,
                    details: 'Files larger than 4.5MB must be uploaded directly to Blob Storage from the client, then parsed via blobUrl.'
                });
            }

            // Read file and upload to Blob Storage
            const fs = await import('fs/promises');
            console.error('[Parse] Reading file from disk...');
            const fileBuffer = await fs.readFile(filePath);
            console.error(`[Parse] File read: ${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB`);
            
            console.error('[Parse] Uploading to Vercel Blob Storage...');
            try {
                const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
                blob = await put(`temp/${Date.now()}-${fileName}`, arrayBuffer, {
                    access: 'public',
                    addRandomSuffix: true,
                    contentType: file.mimetype || 'text/plain',
                });
                blobUrlToParse = blob.url;
                blobUrl = blob.url;
                console.error(`[Parse] Blob uploaded successfully: ${blobUrlToParse}`);
            } catch (blobError: any) {
                console.error('[Parse] ERROR uploading to Blob Storage:', blobError);
                console.error('[Parse] Blob error details:', JSON.stringify(blobError, Object.getOwnPropertyNames(blobError), 2));
                if (blobError.statusCode === 403 || blobError.message?.includes('403')) {
                    return res.status(403).json({ 
                        error: 'Permission denied',
                        details: 'Failed to upload file to storage. Check BLOB_READ_WRITE_TOKEN environment variable.'
                    });
                }
                throw blobError;
            }
        }

        // Generate unique file color
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
        const fileColor = colors[Math.floor(Math.random() * colors.length)];

        // Parse file from blob URL with TRUE STREAMING processing
        // Processes line-by-line without loading entire file into memory
        console.error(`[Parse] Starting TRUE streaming parse for file: ${fileName}${fileSize > 0 ? ` (${(fileSize / 1024 / 1024).toFixed(2)}MB)` : ''}`);
        
        const BATCH_SIZE = 50; // Smaller batches = less memory per batch
        let insertedCount = 0;
        let totalParsed = 0;
        
        // Insert batch to database immediately (no accumulation to prevent memory buildup)
        const insertBatch = async (batch: LogEntry[]) => {
            if (batch.length === 0) return;
            
            // Insert this batch immediately - don't accumulate batches
            // This prevents memory from growing if parser is faster than DB inserts
            try {
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
                if (insertedCount % 500 === 0) {
                    console.error(`[Parse] Inserted ${insertedCount} logs... (memory efficient, immediate inserts)`);
                }
            } catch (error) {
                console.error(`[Parse] Error inserting batch of ${batch.length} logs:`, error);
                throw error;
            }
        };
        
        // Parse with TRUE streaming (line-by-line, no full file load)
        const { parseLogFileIncremental } = await import('../lib/parser.js');
        totalParsed = await parseLogFileIncremental(
            blobUrlToParse,
            fileName,
            fileColor,
            insertBatch,
            BATCH_SIZE, // Batch size for streaming parser
            (progress) => {
                console.error(`[Parse] Streaming progress: ${(progress * 100).toFixed(1)}%`);
            }
        );
        
        // No pending batches - batches are inserted immediately as they're created
        
        console.error(`[Parse] Streaming parse complete: ${totalParsed} entries parsed, ${insertedCount} inserted to database`);

        if (insertedCount === 0) {
            // Cleanup blob if no logs parsed
            if (blobUrlToParse) {
                await del(blobUrlToParse).catch(() => {});
            }
            return res.status(400).json({ error: 'No logs found in file' });
        }

        // IMPORTANT: Delete blob file immediately after parsing
        // Files are NOT stored long-term - only parsed logs in Postgres
        if (blobUrlToParse) {
            try {
                await del(blobUrlToParse);
                console.error(`[Parse] Blob deleted successfully: ${blobUrlToParse}`);
            } catch (err) {
                console.error('[Parse] Failed to delete blob:', err);
                // Don't fail the request if blob deletion fails
            }
        }

        console.error(`[Parse] Successfully inserted ${insertedCount} logs for file: ${fileName}`);
        res.json({
            success: true,
            count: insertedCount,
            fileName: fileName,
        });
    } catch (error: any) {
        // Cleanup blob on error
        const blobToCleanup = blobUrl || (req.body as any)?.blobUrl || blobUrlToParse;
        if (blobToCleanup) {
            console.error(`[Parse] Cleaning up blob on error: ${blobToCleanup}`);
            await del(blobToCleanup).catch((err) => {
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

        if (error.message?.includes('404') || error.message?.includes('Not Found') || error.message?.includes('Blob not found')) {
            return res.status(404).json({
                error: 'Blob not found',
                details: 'The uploaded file could not be accessed. This may be due to a propagation delay. Please try again.',
            });
        }

        if (error.message?.includes('out of memory') || error.message?.includes('memory')) {
            return res.status(500).json({
                error: 'Out of memory',
                details: 'The file is too large to process. The streaming parser should handle this - please report this error.',
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
