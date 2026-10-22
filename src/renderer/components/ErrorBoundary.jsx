import { Component } from 'react'
import { api } from '../api'

/** Last-resort guard so a rendering bug never leaves a blank launcher window. */
export default class ErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    window.addEventListener('keydown', this.onKey)
  }

  onKey = (e) => {
    if (e.key === 'Escape') this.reset()
  }

  reset = () => {
    window.removeEventListener('keydown', this.onKey)
    this.setState({ failed: false })
    api.launcher.hide()
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div style={{ padding: 24, font: '14px -apple-system, system-ui', color: 'var(--text)' }}>
        <b>Something went wrong.</b>
        <p style={{ color: 'var(--text-2)' }}>Press Esc to dismiss and try again.</p>
      </div>
    )
  }
}
