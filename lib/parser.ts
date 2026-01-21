/**
 * Server-side Log Parser for ServerLense
 * 
 * Supports multiple log formats:
 * 1. Original: [LEVEL] [MM/DD/YYYY, time] [component]: message
 * 2. ISO Date: [LEVEL] [YYYY-MM-DD HH:MM:SS,mmm] [component] message
 * 3. Homer SIP Export: Text format with session metadata and SIP messages
 * 4. Datadog CSV: CSV format with JSON content
 * 
 * Key differences from client-side:
 * - Accepts blob URL instead of File object
 * - Returns LogEntry[] without IDs (database assigns IDs)
 * - No IndexedDB writes
 * - Streaming support for large files
 */

import type { LogEntry, LogLevel } from './types.js';
import { cleanupLogEntry } from './messageCleanup.js';

/**
 * Fetch file content from blob URL (streaming for large files)
 * Processes file incrementally to avoid memory exhaustion
 * Includes retry logic for blob availability
 */
async function* fetchBlobContentStreaming(blobUrl: string): AsyncGenerator<string> {
    // Retry logic: blobs might not be immediately available after upload
    // For large files (700MB+), propagation can take longer
    const MAX_RETRIES = 5; // Increased from 3 to 5 for large files
    const INITIAL_RETRY_DELAY = 2000; // Start with 2 seconds
    
    let response: Response | null = null;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            console.error(`[Parser] Fetching blob for streaming (attempt ${attempt + 1}/${MAX_RETRIES}): ${blobUrl}`);
            
            response = await fetch(blobUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'text/plain, */*',
                },
            });
            
            if (response.ok) {
                break; // Success, exit retry loop
            }
            
            // If 404, wait and retry (blob might not be immediately available)
            if (response.status === 404 && attempt < MAX_RETRIES - 1) {
                console.error(`[Parser] Blob not found (404), retrying in ${RETRY_DELAY}ms...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                continue;
            }
            
            // For other errors, throw immediately
            const errorText = await response.text().catch(() => response.statusText);
            throw new Error(`Failed to fetch blob: HTTP ${response.status} - ${errorText}`);
        } catch (error: any) {
            lastError = error;
            if (attempt < MAX_RETRIES - 1 && (error.message?.includes('404') || error.message?.includes('Not Found'))) {
                console.error(`[Parser] Fetch failed, retrying in ${RETRY_DELAY}ms...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                continue;
            }
            throw error;
        }
    }
    
    if (!response || !response.ok) {
        throw lastError || new Error(`Failed to fetch blob after ${MAX_RETRIES} attempts`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            if (buffer) yield buffer;
            break;
        }

        buffer += decoder.decode(value, { stream: true });
        
        // Yield complete lines, keep incomplete line in buffer
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || ''; // Keep last (possibly incomplete) line
        
        for (const line of lines) {
            yield line;
        }
    }
}

/**
 * Fetch file content from blob URL (non-streaming, for small files)
 * Use only when file size is known to be small (< 10MB)
 * Includes retry logic for blob availability
 */
async function fetchBlobContent(blobUrl: string): Promise<string> {
    // Retry logic: blobs might not be immediately available after upload
    // For large files (700MB+), propagation can take longer
    const MAX_RETRIES = 5; // Increased from 3 to 5 for large files
    const INITIAL_RETRY_DELAY = 2000; // Start with 2 seconds
    
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            console.error(`[Parser] Fetching blob (attempt ${attempt + 1}/${MAX_RETRIES}): ${blobUrl}`);
            
            const response = await fetch(blobUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'text/plain, */*',
                },
            });
            
            if (response.ok) {
                return await response.text();
            }
            
            // If 404, wait and retry with exponential backoff (blob might not be immediately available)
            if (response.status === 404 && attempt < MAX_RETRIES - 1) {
                const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt); // Exponential backoff: 2s, 4s, 8s, 16s
                console.error(`[Parser] Blob not found (404), retrying in ${delay}ms... (attempt ${attempt + 1}/${MAX_RETRIES})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            
            // For other errors, throw immediately
            const errorText = await response.text().catch(() => response.statusText);
            throw new Error(`Failed to fetch blob: HTTP ${response.status} - ${errorText}`);
        } catch (error: any) {
            lastError = error;
            if (attempt < MAX_RETRIES - 1 && (error.message?.includes('404') || error.message?.includes('Not Found'))) {
                const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt); // Exponential backoff
                console.error(`[Parser] Fetch failed, retrying in ${delay}ms... (attempt ${attempt + 1}/${MAX_RETRIES})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw error;
        }
    }
    
    throw lastError || new Error(`Failed to fetch blob after ${MAX_RETRIES} attempts`);
}

/**
 * Process log payload to extract correlation IDs and SIP information
 */
function processLogPayload(log: LogEntry) {
    const trimmedPayload = log.payload?.trim() || '';
    log._payloadLower = trimmedPayload.toLowerCase();

    // 1. Check for JSON
    if (trimmedPayload.startsWith('{') && trimmedPayload.endsWith('}')) {
        try {
            log.json = JSON.parse(trimmedPayload);
            log.type = 'JSON';

            // Extract IDs from JSON
            if (log.json.reportNLPConversation?.reportID) {
                log.reportId = String(log.json.reportNLPConversation.reportID);
            }
            if (log.json.recipientsClientIDs && Array.isArray(log.json.recipientsClientIDs) && log.json.recipientsClientIDs.length > 0) {
                log.operatorId = log.json.recipientsClientIDs[0];
            }
            if (log.json.operatorID) log.operatorId = log.json.operatorID;
            if (log.json.extensionID) {
                log.extensionId = String(log.json.extensionID);
                if (log.extensionId.length > 2) log.stationId = log.extensionId.substring(2);
            }
        } catch (e) {
            // Not valid JSON, ignore
        }
    }

    // 2. Extract IDs from Message/Payload via Regex
    const searchText = `${log.message} ${log.payload || ''}`;

    // Report ID
    const reportIdMatch = searchText.match(/report id:\s*(\d+)/i);
    if (reportIdMatch && !log.reportId) {
        log.reportId = reportIdMatch[1];
    }

    // Extension ID
    const extIdMatch = searchText.match(/extensionID: Optional\[(\d+)\]/i);
    if (extIdMatch && !log.extensionId) {
        log.extensionId = extIdMatch[1];
        if (log.extensionId.length > 2) log.stationId = log.extensionId.substring(2);
    }

    // 3. Check for SIP
    if (log.payload?.includes('SIP/2.0') || log._messageLower?.includes('sip')) {
        log.isSip = true;

        const firstLine = log.payload?.split('\n')[0] || '';
        const responseMatch = firstLine.match(/^SIP\/2\.0\s+(\d{3})\s+(.*)/i);
        if (responseMatch) {
            log.sipMethod = `${responseMatch[1]} ${responseMatch[2]}`;
        } else {
            const requestMatch = firstLine.match(/^([A-Z]+)\s+sip:.*SIP\/2\.0/i);
            if (requestMatch) {
                log.sipMethod = requestMatch[1];
            } else {
                const knownMethods = ['INVITE', 'ACK', 'BYE', 'CANCEL', 'OPTIONS', 'REGISTER', 'PRACK', 'UPDATE', 'SUBSCRIBE', 'NOTIFY', 'REFER', 'INFO', 'MESSAGE', 'PUBLISH'];
                for (const m of knownMethods) {
                    if (firstLine.toUpperCase().includes(m)) {
                        log.sipMethod = m;
                        break;
                    }
                }
            }
        }

        // Extract Call-ID
        const callIdMatch = log.payload?.match(/Call-ID:\s*(.+)/i);
        if (callIdMatch) {
            log.callId = callIdMatch[1].trim();
            log._callIdLower = log.callId.toLowerCase();
        }

        // Extract From/To
        const fromMatch = log.payload?.match(/From:\s*(.+)/i);
        if (fromMatch) log.sipFrom = fromMatch[1].trim();

        const toMatch = log.payload?.match(/To:\s*(.+)/i);
        if (toMatch) log.sipTo = toMatch[1].trim();

        // Extract Agent ID
        const agentIdMatch = log.payload?.match(/agentid=([a-f0-9\-]+)/i);
        if (agentIdMatch && !log.operatorId) {
            log.operatorId = agentIdMatch[1];
        }
    }

    if (log.callId && !log._callIdLower) {
        log._callIdLower = log.callId.toLowerCase();
    }
}

/**
 * Parse Datadog CSV export format
 */
function parseDatadogCSV(text: string, fileColor: string, fileName: string): LogEntry[] {
    const lines = text.split(/\r?\n/);
    const parsedLogs: LogEntry[] = [];

    // Skip header row
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
            const csvMatch = line.match(/^"([^"]+)","([^"]+)","([^"]+)","(.+)"$/);
            if (!csvMatch) continue;

            const [_, isoDate, host, service, contentJson] = csvMatch;
            const unescapedJson = contentJson.replace(/""/g, '"');
            const content = JSON.parse(unescapedJson);

            if (!content.log) continue;

            const log = content.log;
            const timestamp = new Date(isoDate).getTime();
            const level: LogLevel = (log.logLevel || 'INFO').toUpperCase() as LogLevel;
            const component = log.logSource || service || 'Unknown';
            const message = log.message || '';
            const rawTimestamp = log.timestamp || isoDate;

            let payload = '';
            if (log.machineData) {
                payload += `Machine: ${log.machineData.name || ''}\n`;
                payload += `Stack: ${log.machineData.stack || ''}\n`;
                payload += `Call Center: ${log.machineData.callCenterName || ''}\n`;
            }
            if (log.threadName) {
                payload += `Thread: ${log.threadName}\n`;
            }
            if (log.optionCause) {
                payload += `\nException:\n${log.optionCause}`;
            }

            const cleanupResult = cleanupLogEntry(component, message);

            const entry: LogEntry = {
                timestamp,
                rawTimestamp,
                level,
                component,
                displayComponent: cleanupResult.displayComponent,
                message,
                displayMessage: cleanupResult.displayMessage,
                payload: payload.trim(),
                type: 'LOG',
                isSip: false,
                fileName: `${host}-${service}`,
                fileColor,
                _messageLower: message.toLowerCase(),
                _componentLower: component.toLowerCase()
            };

            // Extract correlation IDs
            const callIdMatch = message.match(/callId[=:]\s*([^\s;,\[\]\(\)]+)/i) || message.match(/Call-ID:\s*([^\s]+)/i);
            if (callIdMatch) {
                entry.callId = callIdMatch[1].trim();
                entry._callIdLower = entry.callId?.toLowerCase() || '';
            }

            const extensionMatch = message.match(/extensionID:\s*Optional\[(\d+)\]/);
            if (extensionMatch) {
                entry.extensionId = extensionMatch[1];
            }

            if (payload) {
                entry._payloadLower = payload.toLowerCase();
            }

            processLogPayload(entry);
            parsedLogs.push(entry);
        } catch (error) {
            console.warn(`Failed to parse CSV line ${i}:`, error);
            continue;
        }
    }

    return parsedLogs;
}

/**
 * Parse Homer SIP export format
 */
function parseHomerText(text: string, fileColor: string, fileName: string): LogEntry[] {
    const parsedLogs: LogEntry[] = [];
    const lines = text.split(/\r?\n/);
    let currentMessage: string[] = [];
    let currentTimestamp: number | null = null;
    let currentTimestampStr: string = '';
    let currentDirection: string = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        const protoMatch = trimmed.match(/^proto:(\S+)\s+(\S+)\s+(\S+)\s*(--->|&lt;---)\s*(\S+)/i);
        if (protoMatch) {
            if (currentMessage.length > 0 && currentTimestamp !== null) {
                const sipPayload = currentMessage.join('\n');
                const firstLine = currentMessage[0] || '';
                let message = firstLine.length > 100 ? firstLine.substring(0, 100) + '...' : firstLine;
                if (currentDirection) {
                    message = `[${currentDirection}] ${message}`;
                }

                const entry: LogEntry = {
                    timestamp: currentTimestamp,
                    rawTimestamp: currentTimestampStr,
                    level: 'INFO',
                    component: 'Homer SIP',
                    displayComponent: 'Homer SIP',
                    message,
                    displayMessage: message,
                    payload: sipPayload,
                    type: 'LOG',
                    isSip: true,
                    sipMethod: null,
                    fileName: fileName,
                    fileColor,
                    _messageLower: message.toLowerCase(),
                    _componentLower: 'homer sip'
                };

                processLogPayload(entry);
                parsedLogs.push(entry);
            }

            const [_, protocol, timestampStr, source, direction, dest] = protoMatch;
            currentTimestamp = new Date(timestampStr).getTime();
            currentTimestampStr = timestampStr;
            currentDirection = direction === '--->' ? 'OUT' : 'IN';
            currentMessage = [];
        } else if (currentTimestamp !== null) {
            if (currentMessage.length === 0 && !trimmed) {
                continue;
            }
            if (trimmed || currentMessage.length > 0) {
                currentMessage.push(line);
            }
        }
    }

    // Process last message
    if (currentMessage.length > 0 && currentTimestamp !== null) {
        const sipPayload = currentMessage.join('\n');
        const firstLine = currentMessage[0] || '';
        let message = firstLine.length > 100 ? firstLine.substring(0, 100) + '...' : firstLine;
        if (currentDirection) {
            message = `[${currentDirection}] ${message}`;
        }

        const entry: LogEntry = {
            timestamp: currentTimestamp,
            rawTimestamp: currentTimestampStr,
            level: 'INFO',
            component: 'Homer SIP',
            displayComponent: 'Homer SIP',
            message,
            displayMessage: message,
            payload: sipPayload,
            type: 'LOG',
            isSip: true,
            sipMethod: null,
            fileName: fileName,
            fileColor,
            _messageLower: message.toLowerCase(),
            _componentLower: 'homer sip'
        };

        processLogPayload(entry);
        parsedLogs.push(entry);
    }

    return parsedLogs;
}

/**
 * Parse standard log format (streaming for large files)
 * NOTE: Currently still loads full text - streaming parser TODO
 */
async function parseStandardLogStreaming(
    text: string,
    fileColor: string,
    fileName: string,
    onProgress?: (progress: number) => void
): Promise<LogEntry[]> {
    const parsedLogs: LogEntry[] = [];
    const lines = text.split(/\r?\n/);
    
    const logRegex1 = /^\[(INFO|DEBUG|ERROR|WARN)\]\s\[(\d{1,2}\/\d{1,2}\/\d{4}),\s(.*?)\]\s\[(.*?)\]:\s(.*)/;
    const logRegex2 = /^\[(INFO|DEBUG|ERROR|WARN)\]\s\[(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2}:\d{2},\d+)\]\s\[(.*?)\]\s(.*)/;
    
    let currentLog: LogEntry | null = null;
    const YIELD_EVERY_N_LINES = 5000;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (i % YIELD_EVERY_N_LINES === 0 && onProgress) {
            onProgress(0.1 + (i / lines.length) * 0.8);
        }

        if (!line.trim()) continue;

        let match = line.match(logRegex1);
        let dateFormat = 'original';

        if (!match) {
            match = line.match(logRegex2);
            dateFormat = 'iso';
        }

        if (match) {
            if (currentLog) {
                processLogPayload(currentLog);
                parsedLogs.push(currentLog);
            }

            const [_, level, date, time, component, message] = match;
            let timestampStr: string;
            let timestamp: number;

            // Try to extract timestamp from message
            const messageTimestampMatch = message.match(/(\w{3}\s+\w{3}\s+\d{1,2}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+GMT[+-]\d{4})/);
            
            if (messageTimestampMatch) {
                try {
                    timestamp = new Date(messageTimestampMatch[1]).getTime();
                    if (!isNaN(timestamp)) {
                        timestampStr = messageTimestampMatch[1];
                    } else {
                        throw new Error('Invalid timestamp');
                    }
                } catch (e) {
                    if (dateFormat === 'iso') {
                        timestampStr = `${date} ${time}`;
                        const isoString = `${date}T${time.replace(',', '.')}`;
                        timestamp = new Date(isoString).getTime();
                    } else {
                        timestampStr = `${date} ${time}`;
                        timestamp = new Date(timestampStr).getTime();
                    }
                }
            } else {
                if (dateFormat === 'iso') {
                    timestampStr = `${date} ${time}`;
                    const isoString = `${date}T${time.replace(',', '.')}`;
                    timestamp = new Date(isoString).getTime();
                } else {
                    let timeWithoutMs = time;
                    let milliseconds = 0;
                    
                    const msMatch = time.match(/(.+?),\s*(\d+)$/);
                    if (msMatch) {
                        timeWithoutMs = msMatch[1].trim();
                        milliseconds = parseInt(msMatch[2], 10);
                    }
                    
                    timestampStr = `${date} ${time}`;
                    const baseTimestamp = new Date(`${date} ${timeWithoutMs}`).getTime();
                    
                    if (!isNaN(baseTimestamp)) {
                        timestamp = baseTimestamp + milliseconds;
                    } else {
                        timestamp = Date.now();
                    }
                }
            }

            const cleaned = cleanupLogEntry(component, message.trim());

            // Check for special tags
            let specialTag = '';
            if (message.includes('MEDIA_TIMEOUT') || line.includes('MEDIA_TIMEOUT')) {
                specialTag += '⚠️ [MEDIA_TIMEOUT] ';
            }
            if (line.includes('X-Recovery: true') || message.includes('X-Recovery: true')) {
                specialTag += '🔄 [RECOVERED] ';
            }

            const trimmedMessage = message.trim();
            currentLog = {
                timestamp: isNaN(timestamp) ? Date.now() : timestamp,
                rawTimestamp: timestampStr,
                level: level as LogLevel,
                component,
                displayComponent: cleaned.displayComponent,
                message: trimmedMessage,
                displayMessage: specialTag + cleaned.displayMessage,
                payload: '',
                type: 'LOG',
                isSip: false,
                fileName: fileName,
                fileColor,
                _messageLower: trimmedMessage.toLowerCase(),
                _componentLower: component.toLowerCase()
            };
        } else if (currentLog) {
            currentLog.payload = (currentLog.payload || '') + (currentLog.payload ? '\n' : '') + line;
            currentLog._payloadLower = undefined;
        }
    }

    if (currentLog) {
        processLogPayload(currentLog);
        parsedLogs.push(currentLog);
    }

    if (onProgress) onProgress(0.95);

    // Sort by timestamp
    parsedLogs.sort((a, b) => a.timestamp - b.timestamp);

    if (onProgress) onProgress(1.0);

    return parsedLogs;
}

/**
 * Main parser function - server-side version with incremental processing
 * 
 * @param blobUrl - URL to the blob file (from Vercel Blob Storage)
 * @param fileName - Original file name
 * @param fileColor - Color for file identification
 * @param onBatchReady - Callback called with batches of parsed logs (for incremental DB insertion)
 * @param batchSize - Size of batches to pass to onBatchReady
 * @param onProgress - Optional progress callback
 * @returns Total count of parsed log entries
 */
export async function parseLogFileIncremental(
    blobUrl: string,
    fileName: string,
    fileColor: string = '#3b82f6',
    onBatchReady: (batch: LogEntry[]) => Promise<void>,
    batchSize: number = 500,
    onProgress?: (progress: number) => void
): Promise<number> {
    if (onProgress) onProgress(0.05);
    
    // Check Content-Length to determine if we should stream
    const headResponse = await fetch(blobUrl, { method: 'HEAD' });
    const contentLength = parseInt(headResponse.headers.get('content-length') || '0', 10);
    const USE_STREAMING = contentLength > 10 * 1024 * 1024; // Stream if > 10MB
    
    console.error(`[Parser] File size: ${(contentLength / 1024 / 1024).toFixed(2)}MB, Using TRUE streaming: ${USE_STREAMING}`);
    
    if (USE_STREAMING) {
        // TRUE STREAMING: Process line-by-line without loading entire file
        return await parseLogFileStreaming(blobUrl, fileName, fileColor, onBatchReady, batchSize, onProgress);
    } else {
        // Small file - load all at once (faster for small files, acceptable memory)
        const text = await fetchBlobContent(blobUrl);
        if (onProgress) onProgress(0.3);

        // Check file type
        const isCSV = fileName.toLowerCase().endsWith('.csv');
        const isHomer = text.match(/^proto:\S+\s+\S+\s+\S+\s*(--->|&lt;---)\s+\S+/im);

        if (isCSV) {
            const allLogs = parseDatadogCSV(text, fileColor, fileName);
            // Process in batches (small file, acceptable to load all)
            for (let i = 0; i < allLogs.length; i += batchSize) {
                await onBatchReady(allLogs.slice(i, i + batchSize));
            }
            return allLogs.length;
        }

        if (isHomer) {
            const allLogs = parseHomerText(text, fileColor, fileName);
            // Process in batches (small file, acceptable to load all)
            for (let i = 0; i < allLogs.length; i += batchSize) {
                await onBatchReady(allLogs.slice(i, i + batchSize));
            }
            return allLogs.length;
        }

        // Standard log format - small file, acceptable to load all
        const allLogs = await parseStandardLogStreaming(text, fileColor, fileName, onProgress);
        // Process in batches
        for (let i = 0; i < allLogs.length; i += batchSize) {
            await onBatchReady(allLogs.slice(i, i + batchSize));
        }
        return allLogs.length;
    }
}

/**
 * Stream and parse log file incrementally (for large files)
 * TRUE STREAMING: Processes line-by-line without loading entire file into memory
 */
async function parseLogFileStreaming(
    blobUrl: string,
    fileName: string,
    fileColor: string,
    onBatchReady: (batch: LogEntry[]) => Promise<void>,
    batchSize: number,
    onProgress?: (progress: number) => void
): Promise<number> {
    console.error(`[Parser] Starting TRUE streaming parse for ${fileName}`);
    console.error(`[Parser] Blob URL: ${blobUrl}`);
    
    // Get file size for progress tracking (with retry)
    let contentLength = 0;
    try {
        const headResponse = await fetch(blobUrl, { 
            method: 'HEAD',
            headers: {
                'Accept': 'text/plain, */*',
            },
        });
        if (headResponse.ok) {
            contentLength = parseInt(headResponse.headers.get('content-length') || '0', 10);
        } else {
            console.error(`[Parser] HEAD request failed: ${headResponse.status} ${headResponse.statusText}`);
        }
    } catch (error) {
        console.error(`[Parser] HEAD request error:`, error);
        // Continue without content-length (progress won't be accurate)
    }
    
    const lineGenerator = fetchBlobContentStreaming(blobUrl);
    const batch: LogEntry[] = [];
    let totalCount = 0;
    let processedBytes = 0;
    let currentLog: LogEntry | null = null;
    
    const logRegex1 = /^\[(INFO|DEBUG|ERROR|WARN)\]\s\[(\d{1,2}\/\d{1,2}\/\d{4}),\s(.*?)\]\s\[(.*?)\]:\s(.*)/;
    const logRegex2 = /^\[(INFO|DEBUG|ERROR|WARN)\]\s\[(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2}:\d{2},\d+)\]\s\[(.*?)\]\s(.*)/;
    
    // Process lines as they stream in
    for await (const line of lineGenerator) {
        processedBytes += line.length + 1; // +1 for newline
        
        // Update progress
        if (onProgress && contentLength > 0) {
            const progress = Math.min(0.1 + (processedBytes / contentLength) * 0.9, 0.95);
            onProgress(progress);
        }
        
        if (!line.trim()) continue;
        
        // Try to match log line patterns
        let match = line.match(logRegex1);
        let dateFormat = 'original';
        
        if (!match) {
            match = line.match(logRegex2);
            dateFormat = 'iso';
        }
        
        if (match) {
            // Save previous log entry if exists
            if (currentLog) {
                processLogPayload(currentLog);
                batch.push(currentLog);
                totalCount++;
                
                // Insert batch when it reaches size
                if (batch.length >= batchSize) {
                    await onBatchReady(batch);
                    batch.length = 0; // Clear batch (free memory)
                }
            }
            
            // Parse new log entry
            const [_, level, date, time, component, message] = match;
            let timestampStr: string;
            let timestamp: number;
            
            // Extract timestamp
            const messageTimestampMatch = message.match(/(\w{3}\s+\w{3}\s+\d{1,2}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+GMT[+-]\d{4})/);
            
            if (messageTimestampMatch) {
                try {
                    timestamp = new Date(messageTimestampMatch[1]).getTime();
                    if (!isNaN(timestamp)) {
                        timestampStr = messageTimestampMatch[1];
                    } else {
                        throw new Error('Invalid timestamp');
                    }
                } catch (e) {
                    if (dateFormat === 'iso') {
                        timestampStr = `${date} ${time}`;
                        const isoString = `${date}T${time.replace(',', '.')}`;
                        timestamp = new Date(isoString).getTime();
                    } else {
                        timestampStr = `${date} ${time}`;
                        timestamp = new Date(timestampStr).getTime();
                    }
                }
            } else {
                if (dateFormat === 'iso') {
                    timestampStr = `${date} ${time}`;
                    const isoString = `${date}T${time.replace(',', '.')}`;
                    timestamp = new Date(isoString).getTime();
                } else {
                    let timeWithoutMs = time;
                    let milliseconds = 0;
                    
                    const msMatch = time.match(/(.+?),\s*(\d+)$/);
                    if (msMatch) {
                        timeWithoutMs = msMatch[1].trim();
                        milliseconds = parseInt(msMatch[2], 10);
                    }
                    
                    timestampStr = `${date} ${time}`;
                    const baseTimestamp = new Date(`${date} ${timeWithoutMs}`).getTime();
                    
                    if (!isNaN(baseTimestamp)) {
                        timestamp = baseTimestamp + milliseconds;
                    } else {
                        timestamp = Date.now();
                    }
                }
            }
            
            const cleaned = cleanupLogEntry(component, message.trim());
            
            // Check for special tags
            let specialTag = '';
            if (message.includes('MEDIA_TIMEOUT') || line.includes('MEDIA_TIMEOUT')) {
                specialTag += '⚠️ [MEDIA_TIMEOUT] ';
            }
            if (line.includes('X-Recovery: true') || message.includes('X-Recovery: true')) {
                specialTag += '🔄 [RECOVERED] ';
            }
            
            const trimmedMessage = message.trim();
            currentLog = {
                timestamp: isNaN(timestamp) ? Date.now() : timestamp,
                rawTimestamp: timestampStr,
                level: level as LogLevel,
                component,
                displayComponent: cleaned.displayComponent,
                message: trimmedMessage,
                displayMessage: specialTag + cleaned.displayMessage,
                payload: '',
                type: 'LOG',
                isSip: false,
                fileName: fileName,
                fileColor,
                _messageLower: trimmedMessage.toLowerCase(),
                _componentLower: component.toLowerCase()
            };
        } else if (currentLog) {
            // Continuation line (payload)
            currentLog.payload = (currentLog.payload || '') + (currentLog.payload ? '\n' : '') + line;
            currentLog._payloadLower = undefined; // Invalidate cached lowercase
        }
    }
    
    // Process final log entry
    if (currentLog) {
        processLogPayload(currentLog);
        batch.push(currentLog);
        totalCount++;
    }
    
    // Insert final batch
    if (batch.length > 0) {
        await onBatchReady(batch);
    }
    
    if (onProgress) onProgress(1.0);
    
    console.error(`[Parser] Streaming parse complete: ${totalCount} entries processed`);
    return totalCount;
}

/**
 * Legacy function - kept for backward compatibility
 * WARNING: This loads entire file into memory - use parseLogFileIncremental for large files
 */
export async function parseLogFile(
    blobUrl: string,
    fileName: string,
    fileColor: string = '#3b82f6',
    onProgress?: (progress: number) => void
): Promise<LogEntry[]> {
    if (onProgress) onProgress(0.1);
    
    const text = await fetchBlobContent(blobUrl);
    
    if (onProgress) onProgress(0.3);

    // Check file type
    const isCSV = fileName.toLowerCase().endsWith('.csv');
    const isHomer = text.match(/^proto:\S+\s+\S+\s+\S+\s*(--->|&lt;---)\s+\S+/im);

    if (isCSV) {
        if (onProgress) onProgress(0.5);
        const result = parseDatadogCSV(text, fileColor, fileName);
        if (onProgress) onProgress(1.0);
        return result;
    }

    if (isHomer) {
        if (onProgress) onProgress(0.5);
        const result = parseHomerText(text, fileColor, fileName);
        if (onProgress) onProgress(1.0);
        return result;
    }

    // Standard log format
    if (onProgress) onProgress(0.4);
    const result = await parseStandardLogStreaming(text, fileColor, fileName, onProgress);
    return result;
}
