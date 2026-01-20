import { createContext, useContext, useState, useMemo, useEffect, useCallback, type ReactNode } from 'react';
import type { LogEntry, LogState } from '../types';
import { loadSearchHistory, addToSearchHistory as saveToHistory, clearSearchHistory as clearHistoryStorage } from '../store/searchHistory';
import { getLogs, getCorrelationCounts, clearAllLogs as apiClearAllLogs, type LogsQueryParams } from '../api/client';

export interface CorrelationItem {
    type: 'report' | 'operator' | 'extension' | 'station' | 'callId' | 'file';
    value: string;
    excluded?: boolean;
}

interface LogContextType extends LogState {
    setLogs: (logs: LogEntry[]) => void;
    setLoading: (loading: boolean) => void;
    parsingProgress: number; // Progress from 0 to 1
    setParsingProgress: (progress: number) => void;
    setFilterText: (text: string) => void;
    isSipFilterEnabled: boolean;
    setIsSipFilterEnabled: (enabled: boolean) => void;
    selectedSipMethod: string | null;
    setSelectedSipMethod: (method: string | null) => void;
    // Deprecated alias aliases kept for compatibility if needed, otherwise removed
    smartFilterActive: boolean;
    setSmartFilterActive: (active: boolean) => void;

    setSelectedLogId: (id: number | null) => void;
    searchHistory: string[];
    addToSearchHistory: (term: string) => void;
    clearSearchHistory: () => void;
    clearAllFilters: () => void;

    // New View Options
    isTextWrapEnabled: boolean;
    setIsTextWrapEnabled: (enabled: boolean) => void;
    sortConfig: { field: 'timestamp' | 'level', direction: 'asc' | 'desc' };
    setSortConfig: (config: { field: 'timestamp' | 'level', direction: 'asc' | 'desc' }) => void;
    selectedComponentFilter: string | null;
    setSelectedComponentFilter: (component: string | null) => void;

    // Timeline States
    visibleRange: { start: number; end: number };
    setVisibleRange: (range: { start: number; end: number }) => void;
    scrollTargetTimestamp: number | null;
    setScrollTargetTimestamp: (timestamp: number | null) => void;
    timelineViewMode: 'full' | 'filtered';
    setTimelineViewMode: (mode: 'full' | 'filtered') => void;
    isTimelineCompact: boolean;
    setIsTimelineCompact: (isCompact: boolean) => void;

    // Correlation
    activeCorrelations: CorrelationItem[];
    setActiveCorrelations: (items: CorrelationItem[]) => void;
    toggleCorrelation: (item: CorrelationItem) => void;
    setOnlyCorrelation: (item: CorrelationItem) => void;
    correlationCounts: Record<string, number>;

    timelineZoomRange: { start: number; end: number } | null;
    setTimelineZoomRange: (range: { start: number; end: number } | null) => void;
    timelineEventFilters: { requests: boolean; success: boolean; provisional: boolean; error: boolean; options: boolean; keepAlive: boolean };
    setTimelineEventFilters: (filters: { requests: boolean; success: boolean; provisional: boolean; error: boolean; options: boolean; keepAlive: boolean }) => void;
    hoveredCallId: string | null;
    setHoveredCallId: (id: string | null) => void;

    // Navigation (Jump To)
    jumpState: { active: boolean; previousFilters: any | null };
    setJumpState: (state: { active: boolean; previousFilters: any | null }) => void;

    hoveredCorrelation: CorrelationItem | null;
    setHoveredCorrelation: (item: CorrelationItem | null) => void;

    isSidebarOpen: boolean;
    setIsSidebarOpen: (isOpen: boolean) => void;

    isTimelineOpen: boolean;
    setIsTimelineOpen: (isOpen: boolean) => void;

    activeCallFlowId: string | null;
    setActiveCallFlowId: (id: string | null) => void;
    correlationData: {
        reportIds: string[];
        operatorIds: string[];
        extensionIds: string[];
        stationIds: string[];
        callIds: string[];
        fileNames: string[];
    };
    // Favorites
    favoriteLogIds: Set<number>;
    toggleFavorite: (logId: number) => void;
    isShowFavoritesOnly: boolean;
    setIsShowFavoritesOnly: (show: boolean) => void;
    
    // API-based data fetching
    totalLogCount: number;
    refreshLogs: () => Promise<void>;
    loadMoreLogs: () => Promise<void>;
    hasMoreLogs: boolean;
    clearAllData: () => Promise<void>;
}

const LogContext = createContext<LogContextType | null>(null);

export const useLogContext = () => {
    const context = useContext(LogContext);
    if (!context) {
        throw new Error('useLogContext must be used within a LogProvider');
    }
    return context;
};

export const LogProvider = ({ children }: { children: ReactNode }) => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [parsingProgress, setParsingProgress] = useState<number>(0); // Progress from 0 to 1
    const [totalLogCount, setTotalLogCount] = useState(0); // Total count from API
    const [filterText, setFilterText] = useState('');
    const [isSipFilterEnabled, setIsSipFilterEnabled] = useState(false);
    const [selectedSipMethod, setSelectedSipMethod] = useState<string | null>(null);
    const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
    const [searchHistory, setSearchHistory] = useState<string[]>([]);
    
    // Pagination state
    const [currentOffset, setCurrentOffset] = useState(0);
    const [pageSize] = useState(1000); // Load 1000 logs at a time
    const [hasMoreLogs, setHasMoreLogs] = useState(false);
    
    // Load initial logs on mount
    useEffect(() => {
        refreshLogs();
    }, []);
    
    // Load search history on mount
    useEffect(() => {
        setSearchHistory(loadSearchHistory());
    }, []);

    // New State for View Options
    const [isTextWrapEnabled, setIsTextWrapEnabled] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ field: 'timestamp' | 'level', direction: 'asc' | 'desc' }>({ field: 'timestamp', direction: 'asc' });
    const [selectedComponentFilter, setSelectedComponentFilter] = useState<string | null>(null);
    const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>({ start: 0, end: 1 });
    const [scrollTargetTimestamp, setScrollTargetTimestamp] = useState<number | null>(null);
    const [timelineViewMode, setTimelineViewMode] = useState<'full' | 'filtered'>('filtered');

    // Reset zoom when switching between Full/Filtered modes to prevent "blank" timeline issues
    useEffect(() => {
        setTimelineZoomRange(null);
    }, [timelineViewMode]);
    const [isTimelineCompact, setIsTimelineCompact] = useState(false);
    const [timelineZoomRange, setTimelineZoomRange] = useState<{ start: number; end: number } | null>(null);
    const [timelineEventFilters, setTimelineEventFilters] = useState({ requests: true, success: true, provisional: true, error: true, options: true, keepAlive: true });
    const [hoveredCallId, setHoveredCallId] = useState<string | null>(null);
    const [jumpState, setJumpState] = useState<{ active: boolean; previousFilters: any | null }>({ active: false, previousFilters: null });
    const [hoveredCorrelation, setHoveredCorrelation] = useState<CorrelationItem | null>(null);

    // Correlation State
    const [activeCorrelations, setActiveCorrelations] = useState<CorrelationItem[]>([]);
    const [activeCallFlowId, setActiveCallFlowId] = useState<string | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isTimelineOpen, setIsTimelineOpen] = useState(true);

    // Favorites State
    const [favoriteLogIds, setFavoriteLogIds] = useState<Set<number>>(new Set());
    const [isShowFavoritesOnly, setIsShowFavoritesOnly] = useState(false);

    // Function to refresh logs from API (reloads from beginning)
    const refreshLogs = useCallback(async () => {
        setLoading(true);
        setCurrentOffset(0);
        try {
            const queryParams: LogsQueryParams = {
                offset: 0,
                limit: pageSize,
            };
            
            // Build query params from filters
            if (selectedComponentFilter) {
                queryParams.component = selectedComponentFilter;
            }
            
            if (isSipFilterEnabled) {
                queryParams.isSip = true;
            }
            
            // Correlation filters
            const activeFileFilters = activeCorrelations.filter(c => c.type === 'file' && !c.excluded);
            if (activeFileFilters.length > 0) {
                queryParams.fileName = activeFileFilters[0].value;
            }
            
            const callIdFilters = activeCorrelations.filter(c => c.type === 'callId' && !c.excluded);
            if (callIdFilters.length > 0) {
                queryParams.callId = callIdFilters[0].value;
            }
            
            if (filterText) {
                queryParams.search = filterText;
            }
            
            // Note: Timeline filtering by visibleRange is handled client-side after loading
            // The API doesn't need to know about the visible range for initial load
            
            // Fetch logs and correlation counts in parallel for better performance
            const [response, ...countResults] = await Promise.all([
                getLogs(queryParams),
                getCorrelationCounts('file'),
                getCorrelationCounts('callId'),
                getCorrelationCounts('report'),
                getCorrelationCounts('operator'),
                getCorrelationCounts('extension'),
                getCorrelationCounts('station'),
            ]);
            
            // Convert string timestamps to numbers and filter out invalid logs
            const validLogs = response.logs
                .map(log => ({
                    ...log,
                    // Convert timestamp from string to number if needed
                    timestamp: typeof log.timestamp === 'string' 
                        ? parseInt(log.timestamp, 10) 
                        : log.timestamp
                }))
                .filter(log => 
                    log.timestamp && 
                    typeof log.timestamp === 'number' && 
                    !isNaN(log.timestamp) && 
                    isFinite(log.timestamp) &&
                    log.timestamp > 0
                );
            setLogs(validLogs);
            setTotalLogCount(response.total);
            setHasMoreLogs(validLogs.length < response.total);
            
            // Update correlation counts
            const counts: Record<string, number> = {};
            const types = ['file', 'callId', 'report', 'operator', 'extension', 'station'];
            countResults.forEach((result, idx) => {
                result.forEach((item: any) => {
                    counts[`${types[idx]}:${item.value}`] = item.count;
                });
            });
            setCorrelationCountsState(counts);
            
            // Also update correlation data arrays
            const fileCounts = countResults[0] || [];
            const callIdCounts = countResults[1] || [];
            const reportCounts = countResults[2] || [];
            const operatorCounts = countResults[3] || [];
            const extensionCounts = countResults[4] || [];
            const stationCounts = countResults[5] || [];
            
            setCorrelationDataState({
                reportIds: reportCounts.map(c => c.value).sort(),
                operatorIds: operatorCounts.map(c => c.value).sort(),
                extensionIds: extensionCounts.map(c => c.value).sort(),
                stationIds: stationCounts.map(c => c.value).sort(),
                callIds: callIdCounts.map(c => c.value).sort(),
                fileNames: fileCounts.map(c => c.value).sort()
            });
        } catch (error) {
            console.error('Failed to refresh logs:', error);
        } finally {
            setLoading(false);
        }
    }, [selectedComponentFilter, isSipFilterEnabled, activeCorrelations, filterText, pageSize]);
    
    // Function to load more logs (pagination)
    const loadMoreLogs = useCallback(async () => {
        if (!hasMoreLogs || loading) return;
        
        setLoading(true);
        try {
            const queryParams: LogsQueryParams = {
                offset: currentOffset + pageSize,
                limit: pageSize,
            };
            
            // Apply same filters as refreshLogs
            if (selectedComponentFilter) {
                queryParams.component = selectedComponentFilter;
            }
            
            if (isSipFilterEnabled) {
                queryParams.isSip = true;
            }
            
            const activeFileFilters = activeCorrelations.filter(c => c.type === 'file' && !c.excluded);
            if (activeFileFilters.length > 0) {
                queryParams.fileName = activeFileFilters[0].value;
            }
            
            const callIdFilters = activeCorrelations.filter(c => c.type === 'callId' && !c.excluded);
            if (callIdFilters.length > 0) {
                queryParams.callId = callIdFilters[0].value;
            }
            
            if (filterText) {
                queryParams.search = filterText;
            }
            
            const response = await getLogs(queryParams);
            // Convert string timestamps to numbers and filter out invalid logs
            const validLogs = response.logs
                .map(log => ({
                    ...log,
                    // Convert timestamp from string to number if needed
                    timestamp: typeof log.timestamp === 'string' 
                        ? parseInt(log.timestamp, 10) 
                        : log.timestamp
                }))
                .filter(log => 
                    log.timestamp && 
                    typeof log.timestamp === 'number' && 
                    !isNaN(log.timestamp) && 
                    isFinite(log.timestamp) &&
                    log.timestamp > 0
                );
            setLogs(prev => [...prev, ...validLogs]);
            setCurrentOffset(prev => prev + validLogs.length);
            setHasMoreLogs(validLogs.length === pageSize && (currentOffset + validLogs.length) < response.total);
        } catch (error) {
            console.error('Failed to load more logs:', error);
        } finally {
            setLoading(false);
        }
    }, [hasMoreLogs, loading, currentOffset, pageSize, selectedComponentFilter, isSipFilterEnabled, activeCorrelations, filterText]);
    
    // Refresh logs when filters change (debounced)
    // Note: This debounce is only for filter changes, not for manual refreshLogs() calls
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            refreshLogs();
        }, 300); // Debounce filter changes to avoid excessive API calls
        
        return () => clearTimeout(timeoutId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedComponentFilter, isSipFilterEnabled, JSON.stringify(activeCorrelations), filterText]);

    // Phase 2 Optimization: Wrap event handlers in useCallback to prevent unnecessary re-renders
    const toggleCorrelation = useCallback((item: CorrelationItem) => {
        setActiveCorrelations(prev => {
            const exists = prev.some(i => i.type === item.type && i.value === item.value);
            if (exists) {
                return prev.filter(i => !(i.type === item.type && i.value === item.value));
            } else {
                return [...prev, item];
            }
        });
    }, []);

    const setOnlyCorrelation = useCallback((item: CorrelationItem) => {
        setActiveCorrelations([item]);
    }, []);

    // Favorites Functions
    const toggleFavorite = useCallback((logId: number) => {
        setFavoriteLogIds(prev => {
            const next = new Set(prev);
            if (next.has(logId)) {
                next.delete(logId);
            } else {
                next.add(logId);
            }
            return next;
        });
    }, []);

    // Load favorites from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem('noclense-favorites');
        if (stored) {
            try {
                const ids = JSON.parse(stored) as number[];
                setFavoriteLogIds(new Set(ids));
            } catch (e) {
                console.error('Failed to load favorites:', e);
            }
        }
    }, []);

    // Save favorites to localStorage when they change
    useEffect(() => {
        localStorage.setItem('noclense-favorites', JSON.stringify(Array.from(favoriteLogIds)));
    }, [favoriteLogIds]);

    // Clear favorites when logs are cleared
    useEffect(() => {
        if (logs.length === 0) {
            setFavoriteLogIds(new Set());
        }
    }, [logs.length]);


    // State for correlation data (loaded from API)
    const [correlationDataState, setCorrelationDataState] = useState<{
        reportIds: string[];
        operatorIds: string[];
        extensionIds: string[];
        stationIds: string[];
        callIds: string[];
        fileNames: string[];
    }>({
        reportIds: [],
        operatorIds: [],
        extensionIds: [],
        stationIds: [],
        callIds: [],
        fileNames: []
    });
    const [correlationCountsState, setCorrelationCountsState] = useState<Record<string, number>>({});

    // Load correlation data from API
    useEffect(() => {
        const loadCorrelationData = async () => {
            try {
                // Load all correlation types in parallel
                const [fileCounts, callIdCounts, reportCounts, operatorCounts, extensionCounts, stationCounts] = await Promise.all([
                    getCorrelationCounts('file'),
                    getCorrelationCounts('callId'),
                    getCorrelationCounts('report'),
                    getCorrelationCounts('operator'),
                    getCorrelationCounts('extension'),
                    getCorrelationCounts('station'),
                ]);

                // Build correlation data arrays
                const reportIds = reportCounts.map(c => c.value).sort();
                const operatorIds = operatorCounts.map(c => c.value).sort();
                const extensionIds = extensionCounts.map(c => c.value).sort();
                const stationIds = stationCounts.map(c => c.value).sort();
                const callIds = callIdCounts.map(c => c.value).sort();
                const fileNames = fileCounts.map(c => c.value).sort();

                setCorrelationDataState({
                    reportIds,
                    operatorIds,
                    extensionIds,
                    stationIds,
                    callIds,
                    fileNames
                });

                // Build counts object
                const counts: Record<string, number> = {};
                fileCounts.forEach(c => counts[`file:${c.value}`] = c.count);
                callIdCounts.forEach(c => counts[`callId:${c.value}`] = c.count);
                reportCounts.forEach(c => counts[`report:${c.value}`] = c.count);
                operatorCounts.forEach(c => counts[`operator:${c.value}`] = c.count);
                extensionCounts.forEach(c => counts[`extension:${c.value}`] = c.count);
                stationCounts.forEach(c => counts[`station:${c.value}`] = c.count);
                
                setCorrelationCountsState(counts);
            } catch (error) {
                console.error('Failed to load correlation data from API:', error);
            }
        };

        // Only load if we have logs
        if (totalLogCount > 0) {
            loadCorrelationData();
        }
    }, [totalLogCount]);

    // Use API-loaded correlation data
    const correlationData = correlationDataState;
    const correlationCounts = correlationCountsState;

    // Phase 2 Optimization: Pre-compute correlation indexes and lowercase filter text outside the filter loop
    const correlationIndexes = useMemo(() => {
        if (activeCorrelations.length === 0) return { inclusions: {}, exclusions: {} };
        
        const inclusions: Record<string, Set<string>> = {};
        const exclusions: Record<string, Set<string>> = {};
        
        activeCorrelations.forEach(c => {
            const target = c.excluded ? exclusions : inclusions;
            if (!target[c.type]) target[c.type] = new Set();
            target[c.type].add(c.value);
        });
        
        return { inclusions, exclusions };
    }, [activeCorrelations]);

    // Phase 2 Optimization: Pre-compute lowercase filter text once
    const lowerFilterText = useMemo(() => filterText.toLowerCase(), [filterText]);

    // Computed filtered logs - Apply client-side filters that API doesn't handle
    const filteredLogs = useMemo(() => {
        if (!logs.length) return [];

        const { inclusions, exclusions } = correlationIndexes;
        const hasCorrelationFilters = Object.keys(inclusions).length > 0 || Object.keys(exclusions).length > 0;

        let result = logs.filter(log => {
            // If this is the selected log, always include it so the viewer can sync to it
            if (selectedLogId !== null && log.id === selectedLogId) return true;

            // Correlation Filter (Facetted Logic: AND between types, OR within type)
            // Phase 2: Use pre-computed indexes instead of building them inside the loop
            if (hasCorrelationFilters) {
                // 1. Handle Inclusions (AND between types, OR within type)
                for (const type in inclusions) {
                    const values = inclusions[type];
                    let match = false;
                    switch (type) {
                        case 'report': match = !!log.reportId && values.has(log.reportId); break;
                        case 'operator': match = !!log.operatorId && values.has(log.operatorId); break;
                        case 'extension': match = !!log.extensionId && values.has(log.extensionId); break;
                        case 'station': match = !!log.stationId && values.has(log.stationId); break;
                        case 'callId': match = !!log.callId && values.has(log.callId); break;
                        case 'file': match = !!log.fileName && values.has(log.fileName); break;
                    }
                    if (!match) return false;
                }

                // 2. Handle Exclusions (Always AND NOT)
                for (const type in exclusions) {
                    const values = exclusions[type];
                    let matchExclude = false;
                    switch (type) {
                        case 'report': matchExclude = !!log.reportId && values.has(log.reportId); break;
                        case 'operator': matchExclude = !!log.operatorId && values.has(log.operatorId); break;
                        case 'extension': matchExclude = !!log.extensionId && values.has(log.extensionId); break;
                        case 'station': matchExclude = !!log.stationId && values.has(log.stationId); break;
                        case 'callId': matchExclude = !!log.callId && values.has(log.callId); break;
                        case 'file': matchExclude = !!log.fileName && values.has(log.fileName); break;
                    }
                    if (matchExclude) return false; // Fail if any excluded value matches
                }
            }

            // Component Filter
            if (selectedComponentFilter && log.displayComponent !== selectedComponentFilter) {
                return false;
            }

            // SIP Filter (Show Only SIP)
            if (isSipFilterEnabled && !log.isSip) return false;

            // SIP Method Filter (when specific method selected)
            // If a method is selected, only show SIP logs matching that method
            // Normalize comparison: "100 trying" and "100 trying -- your call is important to us" should both match "100 Trying"
            if (selectedSipMethod !== null) {
                if (!log.isSip || !log.sipMethod) return false;
                
                // Normalize both values for comparison
                const normalizeMethod = (method: string): string => {
                    const responseMatch = method.match(/^(\d{3})\s+(\w+)(?:\s+.*)?$/i);
                    if (responseMatch) {
                        const code = responseMatch[1];
                        const firstWord = responseMatch[2].charAt(0).toUpperCase() + responseMatch[2].slice(1).toLowerCase();
                        return `${code} ${firstWord}`;
                    }
                    return method; // Request methods (INVITE, ACK, etc.) remain unchanged
                };
                
                const normalizedSelected = normalizeMethod(selectedSipMethod);
                const normalizedLog = normalizeMethod(log.sipMethod);
                
                if (normalizedLog !== normalizedSelected) return false;
            }

            // Phase 2 Optimization: Use pre-computed lowercase strings from parsing for O(1) string operations
            // This eliminates toLowerCase() calls during filtering (major performance win for 100k+ logs)
            if (lowerFilterText) {
                const matchContent =
                    (log._messageLower && log._messageLower.includes(lowerFilterText)) ||
                    (log._payloadLower && log._payloadLower.includes(lowerFilterText)) ||
                    (log._componentLower && log._componentLower.includes(lowerFilterText)) ||
                    (log._callIdLower && log._callIdLower.includes(lowerFilterText));

                if (!matchContent) return false;
            }

            return true;
        });


        // Favorites filter (applied last)
        if (isShowFavoritesOnly) {
            result = result.filter(log => favoriteLogIds.has(log.id));
        }

        // Sorting
        result.sort((a, b) => {
            if (sortConfig.field === 'timestamp') {
                const timeA = new Date(a.timestamp).getTime();
                const timeB = new Date(b.timestamp).getTime();
                return sortConfig.direction === 'asc' ? timeA - timeB : timeB - timeA;
            } else if (sortConfig.field === 'level') {
                const levels = { ERROR: 3, WARN: 2, INFO: 1, DEBUG: 0 };
                const valA = levels[a.level] || 0;
                const valB = levels[b.level] || 0;
                return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
            }
            return 0;
        });

        return result;
    }, [logs, selectedLogId, correlationIndexes, selectedComponentFilter, isSipFilterEnabled, selectedSipMethod, lowerFilterText, sortConfig, isShowFavoritesOnly, favoriteLogIds]);

    // Phase 2 Optimization: Wrap event handlers in useCallback
    const addToSearchHistory = useCallback((term: string) => {
        saveToHistory(term);
        setSearchHistory(loadSearchHistory());
    }, []);

    const clearSearchHistory = useCallback(() => {
        clearHistoryStorage();
        setSearchHistory([]);
    }, []);

    // Phase 2 Optimization: Wrap clearAllFilters in useCallback
    const clearAllFilters = useCallback(() => {
        setFilterText('');
        setIsSipFilterEnabled(false);
        setSelectedSipMethod(null);
        setSelectedComponentFilter(null);
        setActiveCorrelations([]);
        setSelectedLogId(null);
        setIsShowFavoritesOnly(false);
    }, []);

    // Phase 2 Optimization: Memoize context value to prevent unnecessary re-renders
    // This is critical - without memoization, the entire value object is recreated on every render
    // causing all consuming components to re-render unnecessarily
    // Note: Setters from useState are stable and don't need to be in dependencies
    // Callbacks wrapped in useCallback are also stable
    // Clear all data via API
    const clearAllData = useCallback(async () => {
        try {
            await apiClearAllLogs();
        } catch (error) {
            console.error('Failed to clear logs via API:', error);
        }
        
        // Clear all state
        setLogs([]);
        setTotalLogCount(0);
        setCurrentOffset(0);
        setHasMoreLogs(false);
        setCorrelationDataState({
            reportIds: [],
            operatorIds: [],
            extensionIds: [],
            stationIds: [],
            callIds: [],
            fileNames: []
        });
        setCorrelationCountsState({});
    }, []);

    // Enhanced setLogs - now just sets logs directly (API handles storage)
    const enhancedSetLogs = useCallback((newLogs: LogEntry[], clearMode: boolean = false) => {
        if (clearMode || newLogs.length === 0) {
            clearAllData();
            return;
        }
        setLogs(newLogs);
    }, [clearAllData]);
    
    const value = useMemo(() => ({
        logs,
        setLogs: enhancedSetLogs,
        loading,
        setLoading,
        parsingProgress,
        setParsingProgress,
        filterText,
        setFilterText,
        isSipFilterEnabled,
        setIsSipFilterEnabled,
        selectedSipMethod,
        setSelectedSipMethod,
        smartFilterActive: isSipFilterEnabled, // Alias
        setSmartFilterActive: setIsSipFilterEnabled, // Alias
        filteredLogs,
        selectedLogId,
        setSelectedLogId,
        searchHistory,
        addToSearchHistory,
        clearSearchHistory,
        clearAllFilters,
        isTextWrapEnabled,
        setIsTextWrapEnabled,
        sortConfig,
        setSortConfig,
        selectedComponentFilter,
        setSelectedComponentFilter,
        visibleRange,
        setVisibleRange,
        scrollTargetTimestamp,
        setScrollTargetTimestamp,
        timelineViewMode,
        setTimelineViewMode,
        isTimelineCompact,
        setIsTimelineCompact,
        timelineZoomRange,
        setTimelineZoomRange,
        timelineEventFilters,
        setTimelineEventFilters,
        hoveredCallId,
        setHoveredCallId,
        hoveredCorrelation,
        setHoveredCorrelation,
        jumpState,
        setJumpState,
        activeCorrelations,
        setActiveCorrelations,
        toggleCorrelation,
        setOnlyCorrelation,
        correlationCounts,
        isSidebarOpen,
        setIsSidebarOpen,
        isTimelineOpen,
        setIsTimelineOpen,
        activeCallFlowId,
        setActiveCallFlowId,
        correlationData,
        favoriteLogIds,
        toggleFavorite,
        isShowFavoritesOnly,
        setIsShowFavoritesOnly,
        // API-based data fetching
        totalLogCount,
        refreshLogs,
        loadMoreLogs,
        hasMoreLogs,
        clearAllData
    }), [
        // Only include values that actually change and affect consumers
        logs,
        loading,
        parsingProgress,
        filterText,
        isSipFilterEnabled,
        filteredLogs,
        selectedLogId,
        searchHistory,
        isTextWrapEnabled,
        sortConfig,
        selectedComponentFilter,
        visibleRange,
        scrollTargetTimestamp,
        timelineViewMode,
        isTimelineCompact,
        timelineZoomRange,
        timelineEventFilters,
        hoveredCallId,
        hoveredCorrelation,
        jumpState,
        activeCorrelations,
        correlationCounts,
        isSidebarOpen,
        isTimelineOpen,
        activeCallFlowId,
        correlationData,
        favoriteLogIds,
        isShowFavoritesOnly,
        totalLogCount,
        // Stable callbacks - included to satisfy exhaustive-deps but won't cause unnecessary recalculations
        addToSearchHistory,
        clearSearchHistory,
        clearAllFilters,
        toggleCorrelation,
        setOnlyCorrelation,
        toggleFavorite,
        refreshLogs,
        loadMoreLogs,
        enhancedSetLogs
    ]);

    return (
        <LogContext.Provider value={value}>
            {children}
        </LogContext.Provider>
    );
};
