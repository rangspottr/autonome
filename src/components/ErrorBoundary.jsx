import { Component } from "react";
import { T } from "../lib/theme.js";
import { KEY } from "../lib/storage.js";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }

  handleExportData() {
    try {
      const raw = localStorage.getItem(KEY) || "{}";
      const blob = new Blob([raw], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `autonome-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Could not export data: " + e.message);
    }
  }

  handleReset() {
    if (window.confirm("Reset Autonome? This will clear all data and restart setup.")) {
      try {
        localStorage.removeItem(KEY);
      } catch (_) {}
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 32,
            textAlign: "center",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, color: T.am, marginBottom: 12 }}>ERROR</div>
          <h3 style={{ color: T.tx, marginBottom: 8 }}>Something went wrong</h3>
          <p style={{ color: T.dm, fontSize: 14, marginBottom: 20 }}>
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                padding: "8px 20px",
                background: T.bl,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              Try Again
            </button>
            <button
              onClick={() => this.handleExportData()}
              style={{
                padding: "8px 20px",
                background: T.gn,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              Export Data
            </button>
            <button
              onClick={() => this.handleReset()}
              style={{
                padding: "8px 20px",
                background: "transparent",
                color: T.rd,
                border: `1px solid ${T.rd}`,
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              Reset
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
