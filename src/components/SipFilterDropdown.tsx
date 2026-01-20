import { ChevronDown, Check } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface SipFilterDropdownProps {
    availableMethods: string[];
    selectedMethod: string | null;
    onSelect: (method: string | null) => void;
}

const SipFilterDropdown = ({
    availableMethods,
    selectedMethod,
    onSelect
}: SipFilterDropdownProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    // Sort methods: Responses (with codes) first, then Requests (all caps)
    const sortedMethods = [...availableMethods].sort((a, b) => {
        const aIsResponse = /^\d{3}/.test(a);
        const bIsResponse = /^\d{3}/.test(b);
        if (aIsResponse && !bIsResponse) return -1;
        if (!aIsResponse && bIsResponse) return 1;
        return a.localeCompare(b);
    });

    const handleSelect = (method: string | null) => {
        onSelect(method);
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors border border-[var(--border-color)] rounded-md hover:border-[var(--accent-blue)] bg-[var(--bg-light)]"
            >
                <span>SIP Filter</span>
                {selectedMethod && (
                    <span className="px-1.5 py-0.5 bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] rounded text-[10px] font-mono">
                        {selectedMethod.length > 20 ? selectedMethod.substring(0, 20) + '...' : selectedMethod}
                    </span>
                )}
                <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-1 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-md shadow-lg z-50 min-w-[200px] max-h-[300px] overflow-y-auto">
                    <div className="px-2 py-1 border-b border-[var(--border-color)]">
                        <span className="text-xs font-medium text-[var(--text-secondary)] px-2">Filter by SIP Method</span>
                    </div>
                    <div className="py-1">
                        <button
                            onClick={() => handleSelect(null)}
                            className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                                selectedMethod === null
                                    ? 'bg-[var(--accent-blue)] text-white'
                                    : 'text-[var(--text-primary)] hover:bg-[var(--bg-light)]'
                            }`}
                        >
                            <span className="w-4">{selectedMethod === null && <Check size={14} />}</span>
                            <span>All SIP Messages</span>
                        </button>
                        {sortedMethods.map((method) => (
                            <button
                                key={method}
                                onClick={() => handleSelect(method)}
                                className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                                    selectedMethod === method
                                        ? 'bg-[var(--accent-blue)] text-white'
                                        : 'text-[var(--text-primary)] hover:bg-[var(--bg-light)]'
                                }`}
                            >
                                <span className="w-4">{selectedMethod === method && <Check size={14} />}</span>
                                <span className="font-mono">{method}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SipFilterDropdown;
