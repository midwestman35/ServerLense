import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
        };
    }

    static getDerivedStateFromError(error: Error): State {
        return {
            hasError: true,
            error,
            errorInfo: null,
        };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        this.setState({
            error,
            errorInfo,
        });
    }

    handleReset = () => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
        });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-8">
                    <div className="max-w-2xl w-full bg-slate-800 rounded-lg p-6 border border-red-500">
                        <h2 className="text-2xl font-bold text-red-400 mb-4">
                            Something went wrong
                        </h2>
                        <p className="text-slate-300 mb-4">
                            The application encountered an error. Please try refreshing the page.
                        </p>
                        {this.state.error && (
                            <details className="mb-4">
                                <summary className="cursor-pointer text-slate-400 hover:text-white mb-2">
                                    Error Details
                                </summary>
                                <pre className="bg-slate-900 p-4 rounded text-xs overflow-auto max-h-64 text-red-300">
                                    {this.state.error.toString()}
                                    {this.state.errorInfo?.componentStack && (
                                        <div className="mt-2 text-slate-400">
                                            {this.state.errorInfo.componentStack}
                                        </div>
                                    )}
                                </pre>
                            </details>
                        )}
                        <button
                            onClick={this.handleReset}
                            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded mr-2"
                        >
                            Try Again
                        </button>
                        <button
                            onClick={() => window.location.reload()}
                            className="bg-slate-600 hover:bg-slate-700 px-4 py-2 rounded"
                        >
                            Reload Page
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
