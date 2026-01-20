import type { LogEntry } from '../types';

const API_BASE = '/api';

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
 * @param file - The log file to upload
 * @param onProgress - Optional progress callback (0-1)
 * @returns Parse response with count and fileName
 */
export async function uploadLogFile(
    file: File,
    onProgress?: (progress: number) => void
): Promise<ParseResponse> {
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
