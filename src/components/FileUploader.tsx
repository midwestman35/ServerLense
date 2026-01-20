import React, { useState } from 'react';
import { useLogContext } from '../contexts/LogContext';
import { uploadLogFile } from '../api/client';
import { Upload, AlertTriangle, X } from 'lucide-react';
import { validateFile, exceedsCriticalSize, estimateMemoryUsage, formatFileSize } from '../utils/fileUtils';

const FileUploader = () => {
    const { setLoading, setSelectedLogId, parsingProgress, setParsingProgress, refreshLogs } = useLogContext();
    const [fileError, setFileError] = useState<string | null>(null);
    const [fileWarning, setFileWarning] = useState<string | null>(null);

    const handleFiles = async (files: FileList) => {
        if (!files || files.length === 0) return;

        setFileError(null);
        setFileWarning(null);

        // Validate all files first
        const filesArray = Array.from(files);
        const validationResults = filesArray.map(file => ({
            file,
            validation: validateFile(file)
        }));

        // Check for validation errors
        const errors = validationResults.filter(r => !r.validation.valid);
        if (errors.length > 0) {
            setFileError(errors[0].validation.error || 'Invalid file');
            return;
        }

        // Check for critical file sizes and request confirmation
        const criticalFiles = filesArray.filter(f => exceedsCriticalSize(f.size));
        if (criticalFiles.length > 0) {
            const totalSize = criticalFiles.reduce((sum, f) => sum + f.size, 0);
            const estimatedMB = estimateMemoryUsage(totalSize);
            const confirmMessage = `Warning: You are about to process ${criticalFiles.length} very large file(s) totaling ${formatFileSize(totalSize)}.\n\nEstimated memory usage: ~${estimatedMB}MB\n\nThis may cause Chrome to crash due to memory limits. Consider splitting files into smaller chunks (<200MB each).\n\nDo you want to continue?`;
            
            if (!window.confirm(confirmMessage)) {
                return; // User cancelled
            }
        }

        // Collect warnings
        const warnings = validationResults
            .map(r => r.validation.warning)
            .filter((w): w is string => !!w);

        if (warnings.length > 0) {
            setFileWarning(warnings[0]);
        }

        setLoading(true);
        setParsingProgress(0);
        try {
            // Process all files using API
            let totalParsed = 0;
            
            for (let i = 0; i < validationResults.length; i++) {
                const { file } = validationResults[i];
                
                // Calculate progress callback for this file
                const fileProgressCallback = (progress: number) => {
                    // Progress for this file: (i / total) + (progress / total)
                    const fileProgress = (i / validationResults.length) + (progress / validationResults.length);
                    setParsingProgress(fileProgress);
                };
                
                try {
                    const result = await uploadLogFile(file, fileProgressCallback);
                    totalParsed += result.count;
                } catch (err) {
                    // If one file fails, continue with others but show error
                    console.error(`Failed to parse ${file.name}:`, err);
                    setFileError(`Failed to parse ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
                    // Continue with next file
                }
            }
            
            // Refresh logs from API after all files are processed
            if (totalParsed > 0 && refreshLogs) {
                await refreshLogs();
            }
            
            setSelectedLogId(null);
        } catch (err) {
            console.error("Failed to parse", err);
            setFileError(`Failed to parse file${files.length > 1 ? 's' : ''}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setLoading(false);
            setParsingProgress(0); // Reset progress when done
            if (fileWarning) {
                setTimeout(() => setFileWarning(null), 5000);
            }
        }
    };

    const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
        }
    };

    const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    };

    const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFiles(e.target.files);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center p-8 w-full max-w-3xl mx-auto">
            {(fileError || fileWarning) && (
                <div className="w-full max-w-md mb-4 p-3 rounded-md border border-[var(--border-color)]">
                    {fileError && (
                        <div className="flex items-center gap-2 text-[var(--err)]/80 text-sm bg-[var(--err)]/10 border border-[var(--err)]/20 rounded p-2">
                            <AlertTriangle size={16} />
                            <span className="flex-grow">{fileError}</span>
                            <button
                                onClick={() => setFileError(null)}
                                className="text-[var(--err)] hover:opacity-80"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    )}
                    {fileWarning && !fileError && (
                        <div className="flex items-center gap-2 text-yellow-400 text-sm bg-yellow-900/20 border border-yellow-800 rounded p-2">
                            <AlertTriangle size={16} />
                            <span className="flex-grow">{fileWarning}</span>
                            <button
                                onClick={() => setFileWarning(null)}
                                className="text-yellow-500 hover:text-yellow-300"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    )}
                </div>
            )}
            
            {/* Progress indicator */}
            {parsingProgress > 0 && parsingProgress < 1 && (
                <div className="w-full max-w-md mb-4 p-3 rounded-md border border-[var(--border-color)] bg-[var(--bg-light)]/50">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="text-sm text-[var(--text-secondary)]">Parsing file...</div>
                        <div className="text-sm font-medium text-[var(--accent-blue)]">{Math.round(parsingProgress * 100)}%</div>
                    </div>
                    <div className="w-full bg-[var(--border-color)] rounded-full h-2 overflow-hidden">
                        <div
                            className="h-full bg-[var(--accent-blue)] transition-all duration-300 ease-out"
                            style={{ width: `${parsingProgress * 100}%` }}
                        />
                    </div>
                </div>
            )}
            <div
                className="w-full flex flex-col items-center justify-center p-12 border-2 border-dashed border-[var(--border-color)] rounded-xl bg-[var(--bg-light)]/50 hover:bg-[var(--bg-light)] transition-colors cursor-pointer group hover:border-[var(--accent-blue)]/50"
                onDrop={onDrop}
                onDragOver={onDragOver}
                onClick={() => document.getElementById('file-input')?.click()}
            >
                <input
                    type="file"
                    id="file-input"
                    className="hidden"
                    accept=".log,.txt,.csv"
                    multiple
                    onChange={onChange}
                />

                <div className="p-4 rounded-full bg-[var(--card-bg)] shadow-[var(--shadow)] mb-4 group-hover:scale-110 transition-transform duration-300">
                    <Upload size={40} className="text-[var(--accent-blue)]" />
                </div>

                <h3 className="text-xl font-bold mb-2 text-[var(--text-primary)]">Drop Log File(s) Here</h3>
                <p className="text-[var(--text-secondary)] text-sm mb-4">or click to browse (.log, .txt, .csv)</p>
            </div>
        </div>
    );
};

export default FileUploader;
