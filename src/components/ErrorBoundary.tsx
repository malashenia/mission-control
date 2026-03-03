'use client';

import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  name?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ''}]`, error, errorInfo.componentStack);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="p-4 rounded-lg border border-mc-accent-red/30 bg-mc-accent-red/5">
          <p className="text-sm text-mc-accent-red font-medium">
            {this.props.name || 'Panel'} failed to render
          </p>
          <p className="text-xs text-mc-text-secondary mt-1">
            {this.state.error?.message || 'Unknown error'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-2 text-xs text-mc-accent hover:underline"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
