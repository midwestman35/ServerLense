import type { LogEntry } from '../types';

const API_BASE = '/api';
const VERCEL_REQUEST_LIMIT = 4.5 * 1024 * 1024; // 4.5MB - Vercel's hard limit

export interface LogsQueryParams {
    offset?: number;
    limit?: number;
    component?: string;
    callId?: string;
    fileName?: string;
    level?: string;
    isSip?: boolean;
    search?: string;
    startTime?: number;
    endTime?: number;
}

export interface LogsResponse {
    logs: LogEntry[];
    total: number;
    offset: number;
    limit: number;
}

export interface CorrelationCount {
    value: string;
    count: number;
}

export interface TimelineQueryParams {
    startTime: number;
    endTime: number;
    fileName?: string;
    bucketSize?: number;
}

export interface TimelineBucket {
    timeBucket: number;
    errorCount: number;
    sipRequestCount: number;
    sipSuccessCount: number;
    sipErrorCount: number;
}

export interface TimelineResponse {
    timeline: TimelineBucket[];
}

export interface ParseResponse {
    success: boolean;
    count: number;
    fileName: string;
}

export interface ClearResponse {
    success: boolean;
    deletedLogs: number;
    deletedBlobs: number;
}

/**
 * Upload and parse a log file
 * Automatically uses client-side blob upload for files > 4.5MB to bypass Vercel's limit
 * @param file - The log file to upload
 * @param onProgress - Optional progress callback (0-1)
 * @returns Parse response with count and fileName
 */
export async function uploadLogFile(
    file: File,
    onProgress?: (progress: number) => void
): Promise<ParseResponse> {
    // Check file size - use client-side blob upload for files > 4.5MB
    if (file.size > VERCEL_REQUEST_LIMIT) {
        console.log(`[Client] File ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds 4.5MB limit, using client-side blob upload`);
        
        try {
            // Step 1: Upload file directly to Blob Storage using handleUpload endpoint
            // This bypasses the 4.5MB limit entirely
            if (onProgress) onProgress(0.1);
            console.log(`[Client] Uploading directly to Blob Storage via handleUpload...`);
            
            // Dynamic import for @vercel/blob/client (only when needed for large files)
            const { upload } = await import('@vercel/blob/client');
            
            // Upload using handleUpload endpoint (v2.0.0 API)
            const blob = await upload(file.name, file, {
                access: 'public',
                handleUploadUrl: `${API_BASE}/blob-upload-token`,
                onUploadProgress: onProgress ? (progress) => {
                    // Upload progress: 0.1 to 0.7 (60% of total)
                    // progress.percentage is 0-100, convert to 0-1
                    const uploadProgress = 0.1 + ((progress.percentage / 100) * 0.6);
                    onProgress(uploadProgress);
                } : undefined,
            });
            
            console.log(`[Client] Blob uploaded: ${blob.url}`);
            
            // The blob URL is in the response from handleUpload
            const blobUrl = blob.url;
            if (!blobUrl) {
                throw new Error('Failed to get blob URL from upload response');
            }
            
            // Verify blob URL format
            if (!blobUrl.startsWith('http://') && !blobUrl.startsWith('https://')) {
                throw new Error(`Invalid blob URL format: ${blobUrl}`);
            }
            
            console.log(`[Client] Sending blob URL to parse endpoint: ${blobUrl.substring(0, 80)}...`);
            
            // Delay to ensure blob is fully available (Vercel Blob propagation)
            // For large files (700MB+), use longer delay
            const fileSizeMB = file.size / (1024 * 1024);
            const delay = fileSizeMB > 100 ? 3000 : fileSizeMB > 50 ? 2000 : 1000; // 3s for >100MB, 2s for >50MB, 1s otherwise
            console.log(`[Client] Waiting ${delay}ms for blob propagation (file size: ${fileSizeMB.toFixed(2)}MB)...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // Step 2: Send blob URL to parse endpoint
            if (onProgress) onProgress(0.7);
            const parseResponse = await fetch(`${API_BASE}/parse`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    blobUrl: blobUrl,
                    fileName: file.name,
                }),
            });
            
            if (!parseResponse.ok) {
                let errorMessage = `HTTP ${parseResponse.status}`;
                try {
                    const errorData = await parseResponse.json();
                    errorMessage = errorData.error || errorData.details || errorMessage;
                    console.error('[Client] Parse endpoint error:', errorData);
                } catch (e) {
                    const errorText = await parseResponse.text().catch(() => parseResponse.statusText);
                    errorMessage = errorText || errorMessage;
                }
                throw new Error(errorMessage);
            }
            
            if (onProgress) onProgress(1.0);
            const result = await parseResponse.json();
            console.log(`[Client] Parse successful: ${result.count || 0} logs inserted`);
            return result;
        } catch (error) {
            console.error('[Client] Error in blob upload flow:', error);
            // Re-throw with more context
            if (error instanceof Error) {
                throw error;
            }
            throw new Error(`Upload/parse failed: ${String(error)}`);
        }
    }
    
    // For files < 4.5MB, use legacy method (multipart/form-data)
    console.log(`[Client] File ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB) under limit, using direct upload`);
    
    const formData = new FormData();
    formData.append('file', file);

    // Use XMLHttpRequest for progress tracking
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Track upload progress
        if (onProgress) {
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    // Upload progress (0-0.5) - file upload
                    const uploadProgress = (e.loaded / e.total) * 0.5;
                    onProgress(uploadProgress);
                }
            });

            // Simulate parsing progress (0.5-0.9) - we can't track actual parsing progress
            // Cap at 0.9 to leave room for server processing (database inserts)
            // The remaining 0.1 (10%) will complete when server responds
            let parseProgress = 0.5;
            const parseInterval = setInterval(() => {
                parseProgress = Math.min(parseProgress + 0.01, 0.9); // Cap at 90% instead of 95%
                onProgress(parseProgress);
            }, 200); // Slower increment to better reflect server processing time

            xhr.addEventListener('load', () => {
                clearInterval(parseInterval);
                onProgress(1.0);
            });

        xhr.addEventListener('error', (e) => {
            clearInterval(parseInterval);
            reject(new Error(`Network error: ${xhr.statusText || 'Failed to connect to server'}`));
        });
        }

        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    resolve(response);
                } catch (e) {
                    reject(new Error('Invalid response format'));
                }
            } else {
                try {
                    const error = JSON.parse(xhr.responseText);
                    reject(new Error(error.error || `HTTP ${xhr.status}`));
                } catch (e) {
                    reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
                }
            }
        });

        xhr.addEventListener('error', (e) => {
            reject(new Error(`Network error: ${xhr.statusText || 'Failed to connect to server. Make sure the dev server is running.'}`));
        });

        xhr.open('POST', `${API_BASE}/parse`);
        xhr.send(formData);
    });
}

/**
 * Query logs with filters and pagination
 * @param params - Query parameters
 * @returns Logs response with logs array, total count, offset, and limit
 */
export async function getLogs(params: LogsQueryParams = {}): Promise<LogsResponse> {
    const queryParams = new URLSearchParams();
    
    if (params.offset !== undefined) queryParams.append('offset', params.offset.toString());
    if (params.limit !== undefined) queryParams.append('limit', params.limit.toString());
    if (params.component) queryParams.append('component', params.component);
    if (params.callId) queryParams.append('callId', params.callId);
    if (params.fileName) queryParams.append('fileName', params.fileName);
    if (params.level) queryParams.append('level', params.level);
    if (params.isSip !== undefined) queryParams.append('isSip', params.isSip.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.startTime !== undefined) queryParams.append('startTime', params.startTime.toString());
    if (params.endTime !== undefined) queryParams.append('endTime', params.endTime.toString());

    const response = await fetch(`${API_BASE}/logs?${queryParams.toString()}`);
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
}

/**
 * Get correlation counts by type
 * @param type - Type of correlation: 'file' | 'callId' | 'report' | 'operator' | 'extension' | 'station'
 * @returns Array of counts with value and count
 */
export async function getCorrelationCounts(type: string): Promise<CorrelationCount[]> {
    const response = await fetch(`${API_BASE}/counts?type=${encodeURIComponent(type)}`);
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(error.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.counts || [];
}

/**
 * Get timeline data
 * @param params - Timeline query parameters
 * @returns Timeline response with buckets
 */
export async function getTimelineData(params: TimelineQueryParams): Promise<TimelineResponse> {
    const queryParams = new URLSearchParams();
    queryParams.append('startTime', params.startTime.toString());
    queryParams.append('endTime', params.endTime.toString());
    if (params.fileName) queryParams.append('fileName', params.fileName);
    if (params.bucketSize) queryParams.append('bucketSize', params.bucketSize.toString());

    const response = await fetch(`${API_BASE}/timeline?${queryParams.toString()}`);
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
}

/**
 * Clear all logs and temporary blob files
 * @returns Clear response with counts of deleted items
 */
export async function clearAllLogs(): Promise<ClearResponse> {
    const response = await fetch(`${API_BASE}/clear`, {
        method: 'POST',
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
}
