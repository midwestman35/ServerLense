/**
 * @deprecated IndexedDB utilities are no longer used in ServerLense
 * 
 * ServerLense now uses server-side processing with PostgreSQL database.
 * All data operations go through the API client (src/api/client.ts).
 * 
 * This file is kept for reference but should not be imported or used.
 * 
 * Migration guide:
 * - File uploads: Use uploadLogFile() from src/api/client.ts
 * - Log queries: Use getLogs() from src/api/client.ts
 * - Correlation counts: Use getCorrelationCounts() from src/api/client.ts
 * - Timeline data: Use getTimelineData() from src/api/client.ts
 * - Clear data: Use clearAllLogs() from src/api/client.ts
 */

// Original IndexedDB implementation removed - see git history if needed

export {};
