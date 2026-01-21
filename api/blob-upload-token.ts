import { VercelRequest, VercelResponse } from '@vercel/node';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

/**
 * POST /api/blob-upload-token
 * Handle client-side blob uploads using Vercel Blob v2.0.0 API
 * 
 * This allows clients to upload files directly to Vercel Blob,
 * bypassing the 4.5MB serverless function request limit.
 * 
 * Uses handleUpload from @vercel/blob v2.0.0
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    console.error(`[BlobToken] Request received: ${req.method} ${req.url}`);
    
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        console.error(`[BlobToken] Method not allowed: ${req.method}`);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Check environment variable
        const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
        if (!blobToken) {
            console.error('[BlobToken] ERROR: BLOB_READ_WRITE_TOKEN not set');
            return res.status(500).json({ error: 'Server configuration error: Blob storage token missing' });
        }

        // Parse request body for handleUpload
        const body = req.body as HandleUploadBody;
        
        // Use handleUpload from @vercel/blob/client v2.0.0
        // This handles the token exchange for client-side uploads
        const jsonResponse = await handleUpload({
            body,
            request: req as any,
            onBeforeGenerateToken: async (pathname, clientPayload) => {
                console.error(`[BlobToken] Generating token for: ${pathname}`);
                return {
                    tokenPayload: JSON.stringify({
                        fileName: pathname,
                        uploadedAt: new Date().toISOString(),
                    }),
                };
            },
            onUploadCompleted: async ({ blob, tokenPayload }) => {
                console.error(`[BlobToken] Upload completed: ${blob.url}`);
                // The blob URL is automatically included in the response from handleUpload
                // No need to return anything - this is just for logging/side effects
            },
        });

        console.error('[BlobToken] Upload handled successfully');
        
        // Return the response from handleUpload
        return res.json(jsonResponse);
    } catch (error: any) {
        console.error('[BlobToken] ERROR:', error);
        console.error('[BlobToken] Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        
        return res.status(500).json({
            error: 'Failed to handle upload',
            details: error.message || 'Unknown error',
        });
    }
}
