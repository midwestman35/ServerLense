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
 * Fetch file content from blob URL
 */
async function fetchBlobContent(blobUrl: string): Promise<string> {
    const response = await fetch(blobUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch blob: ${response.statusText}`);
    }
    return response.text();
}

/**
 * Fetch file content in chunks (for large files)
 */
async function fetchBlobContentStreaming(
    blobUrl: string,
    onProgress?: (progress: number) => void
): Promise<string> {
    const response = await fetch(blobUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch blob: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let text = '';
    let receivedBytes = 0;
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        text += decoder.decode(value, { stream: true });
        receivedBytes += value.length;

        if (onProgress && contentLength > 0) {
            onProgress(receivedBytes / contentLength);
        }
    }

    return text;
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
 */
async function parseStandardLogStreaming(
    text: string,
    fileColor: string,
    fileName: string,
    onProgress?: (progress: number) => void
): Promise<LogEntry[]> {
    const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks
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
 * Main parser function - server-side version
 * 
 * @param blobUrl - URL to the blob file (from Vercel Blob Storage)
 * @param fileName - Original file name
 * @param fileColor - Color for file identification
 * @param onProgress - Optional progress callback
 * @returns Array of parsed log entries (without IDs - database assigns them)
 */
export async function parseLogFile(
    blobUrl: string,
    fileName: string,
    fileColor: string = '#3b82f6',
    onProgress?: (progress: number) => void
): Promise<LogEntry[]> {
    // Determine if we should use streaming based on content-length header
    // For now, always fetch full content (Vercel functions have enough memory)
    // In production, we might want to check Content-Length header first
    
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
