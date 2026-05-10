import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  handleReset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          gap: '16px',
          background: 'var(--gm-bg)',
          color: 'var(--gm-white)',
          fontFamily: "'DM Sans', system-ui, sans-serif",
          padding: '32px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '32px' }}>✦</div>
          <div style={{ fontSize: '16px', fontWeight: 700 }}>Une erreur est survenue</div>
          <div style={{ fontSize: '12px', color: 'var(--gm-muted)', maxWidth: '440px', lineHeight: 1.6 }}>
            {this.state.error.message}
          </div>
          <button
            onClick={this.handleReset}
            style={{
              padding: '8px 20px',
              background: 'var(--gm-accent)',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              fontFamily: 'inherit',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
