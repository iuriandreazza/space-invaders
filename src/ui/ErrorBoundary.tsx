import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

/** Without it, one failure while drawing (a browser with no canvas, say) would leave a blank page and no way out. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Space Invaders stopped:', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="app">
        <main className="screen" role="alert">
          <h1 className="logo logo--small">Something went wrong</h1>
          <p className="muted">The game stopped unexpectedly. Reloading the page usually fixes it.</p>
          <button type="button" className="button button--primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </main>
      </div>
    );
  }
}
