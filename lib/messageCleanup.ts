/**
 * Message cleanup utilities for ServerLense (server-side)
 * Simplifies component names and messages for better readability
 */

export interface CleanupResult {
    displayComponent: string;
    displayMessage: string;
    discoveredService?: string;
}

// Simple service mappings (can be extended later)
const serviceMappings: Record<string, string> = {};

/**
 * Extract service name from pekko actor path
 */
function extractServiceFromPath(componentPath: string): string | null {
    const pekkoMatch = componentPath.match(/\/controller\/((?:[^/$]+\/?)+)/);
    if (pekkoMatch) {
        const fullPath = pekkoMatch[1];
        const segments = fullPath.split('/').filter(s => s && !s.startsWith('$'));
        return segments[segments.length - 1];
    }

    const simpleMatch = componentPath.match(/\/([^\/\$]+)$/);
    if (simpleMatch) {
        return simpleMatch[1];
    }

    return null;
}

/**
 * Convert kebab-case or snake_case to PascalCase
 */
function toPascalCase(str: string): string {
    return str
        .split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');
}

/**
 * Clean up component name
 */
export function cleanComponentName(originalComponent: string): string {
    const extracted = extractServiceFromPath(originalComponent);

    if (!extracted) {
        const lastSegment = originalComponent.split('/').pop()?.replace(/\$[a-z]$/, '');
        return lastSegment ? toPascalCase(lastSegment) : originalComponent;
    }

    const mapped = serviceMappings[extracted.toLowerCase()];
    if (mapped) {
        return mapped;
    }

    return toPascalCase(extracted);
}

/**
 * Clean up message content
 */
export function cleanMessage(originalMessage: string): string {
    let cleaned = originalMessage;

    // Remove timestamp patterns
    cleaned = cleaned.replace(/\b[A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+GMT[+-]\d{4}\s+\([^)]+\)/g, '');

    // Remove standalone time patterns
    cleaned = cleaned.replace(/\s+at\s+\d{2}:\d{2}:\d{2}\s+[A-Z]{2,4}/g, '');

    // Clean up Optional[value] -> value
    cleaned = cleaned.replace(/Optional\[([^\]]+)\]/g, '$1');

    // Clean up multiple spaces
    cleaned = cleaned.replace(/\s+/g, ' ');

    // Remove leading/trailing commas or brackets
    cleaned = cleaned.replace(/^[\s,\]]+|[\s,\[]+$/g, '');

    // Remove standalone timestamp markers
    cleaned = cleaned.replace(/\[CallTakingTimestamp\]\s+\d+:\s*/g, '');

    return cleaned.trim();
}

/**
 * Clean both component and message
 */
export function cleanupLogEntry(component: string, message: string): CleanupResult {
    const messagePekkoMatch = message.match(/^\[pekko:\/\/operator-actor-system\/user\/controller\/((?:[^/$\]]+\/?)+)/);

    let extractedService: string | null = null;
    let cleanedMessage = message;

    if (messagePekkoMatch) {
        const fullPath = messagePekkoMatch[1];
        const segments = fullPath.split('/').filter(s => s && !s.startsWith('$'));
        extractedService = segments[segments.length - 1];
        cleanedMessage = message.replace(/^\[pekko:\/\/[^\]]+\]\s*/, '');
    } else {
        extractedService = extractServiceFromPath(component);
    }

    let displayComponent: string;
    if (extractedService) {
        const mapped = serviceMappings[extractedService.toLowerCase()];
        displayComponent = mapped || toPascalCase(extractedService);
    } else {
        const lastSegment = component.split('.').pop()?.split('-')[0];
        displayComponent = lastSegment ? toPascalCase(lastSegment) : component;
    }

    return {
        displayComponent,
        displayMessage: cleanMessage(cleanedMessage),
        discoveredService: extractedService || undefined,
    };
}
