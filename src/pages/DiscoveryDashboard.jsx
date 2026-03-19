import { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";

const API_BASE = "/api/discovery";

// ── Status badge ─────────────────────────────────────────────────
const STATUS_CLASSES = {
  success: "bg-accent-success/10 text-accent-success border-accent-success/30",
  running: "bg-accent-info/10 text-accent-info border-accent-info/30",
  failed: "bg-accent-danger/10 text-accent-danger border-accent-danger/30",
  pending: "bg-bg-secondary text-text-muted border-border",
};

function StatusBadge({ status }) {
  const cls = STATUS_CLASSES[status] || STATUS_CLASSES.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider border ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full bg-current ${status === "running" ? "animate-pulse" : ""}`} />
      {status}
    </span>
  );
}

// ── Stat card ────────────────────────────────────────────────────
const ACCENT_CLASSES = {
  "#f97316": "text-accent-warning",
  "#22c55e": "text-accent-success",
  "#60a5fa": "text-accent-info",
  "#8b5cf6": "text-purple-400",
};

function StatCard({ label, value, sub, accent = "#f97316" }) {
  const accentClass = ACCENT_CLASSES[accent] || "text-accent-warning";
  return (
    <div className="bg-bg-elevated border border-border rounded-lg p-4 min-w-[160px] flex-1">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">{label}</div>
      <div className={`text-3xl font-bold leading-none font-mono ${accentClass}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {sub && <div className="text-xs text-text-muted mt-1.5">{sub}</div>}
    </div>
  );
}

// ── Communities Browser ──────────────────────────────────────────
function CommunitiesBrowser() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [geoTargetId, setGeoTargetId] = useState("");
  const [maxRating, setMaxRating] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("google_rating");

  const fetchCommunities = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 50, sortBy, sortDir: "desc" });
      if (search) params.set("search", search);
      if (state) params.set("state", state);
      if (geoTargetId) params.set("geoTargetId", geoTargetId);
      if (maxRating) params.set("maxRating", maxRating);
      const res = await fetch(`/api/discovery/communities?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, search, state, geoTargetId, maxRating]);

  useEffect(() => { fetchCommunities(); }, [fetchCommunities]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, state, geoTargetId, maxRating]);

  const ratingColor = (r) => {
    if (!r) return "#555";
    if (r <= 2.5) return "#ef4444";
    if (r <= 3.5) return "#f97316";
    return "#22c55e";
  };

  return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, city, address..."
          style={{
            flex: "2 1 220px", padding: "8px 12px", background: "#111",
            border: "1px solid #2a2a2a", borderRadius: 6, color: "#e5e5e5",
            fontSize: 13, outline: "none",
          }}
        />
        <select
          value={geoTargetId}
          onChange={e => setGeoTargetId(e.target.value)}
          style={{
            flex: "1 1 180px", padding: "8px 12px", background: "#111",
            border: "1px solid #2a2a2a", borderRadius: 6, color: "#e5e5e5",
            fontSize: 13, cursor: "pointer",
          }}
        >
          <option value="">All Markets</option>
          {(data?.geoTargets || []).map(g => (
            <option key={g.id} value={g.id}>{g.name} ({g.count})</option>
          ))}
        </select>
        <select
          value={state}
          onChange={e => setState(e.target.value)}
          style={{
            flex: "0 1 110px", padding: "8px 12px", background: "#111",
            border: "1px solid #2a2a2a", borderRadius: 6, color: "#e5e5e5",
            fontSize: 13, cursor: "pointer",
          }}
        >
          <option value="">All States</option>
          {(data?.states || []).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={maxRating}
          onChange={e => setMaxRating(e.target.value)}
          style={{
            flex: "0 1 170px", padding: "8px 12px", background: "#111",
            border: "1px solid #2a2a2a", borderRadius: 6, color: "#e5e5e5",
            fontSize: 13, cursor: "pointer",
          }}
        >
          <option value="">All Ratings</option>
          <option value="2.5">Low (≤ 2.5★) — Hot leads</option>
          <option value="3.0">Under 3.0★</option>
          <option value="3.5">Under 3.5★</option>
        </select>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          style={{
            flex: "0 1 160px", padding: "8px 12px", background: "#111",
            border: "1px solid #2a2a2a", borderRadius: 6, color: "#e5e5e5",
            fontSize: 13, cursor: "pointer",
          }}
        >
          <option value="google_rating">Sort: Rating ↓</option>
          <option value="review_count">Sort: Reviews ↓</option>
          <option value="name">Sort: Name A–Z</option>
          <option value="discovered_at">Sort: Newest</option>
        </select>
      </div>

      {/* Results count */}
      <div style={{ fontSize: 12, color: "#555", marginBottom: 12 }}>
        {loading ? "Loading..." : `${(data?.total || 0).toLocaleString()} communities${data?.pages > 1 ? ` — page ${page} of ${data.pages}` : ""}`}
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #222", color: "#555", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              <th style={{ textAlign: "left", padding: "8px 0", paddingRight: 16 }}>Name</th>
              <th style={{ textAlign: "left", padding: "8px 0", paddingRight: 16 }}>City, State</th>
              <th style={{ textAlign: "left", padding: "8px 0", paddingRight: 16 }}>Market</th>
              <th style={{ textAlign: "right", padding: "8px 0", paddingRight: 16 }}>Rating</th>
              <th style={{ textAlign: "right", padding: "8px 0", paddingRight: 16 }}>Reviews</th>
              <th style={{ textAlign: "left", padding: "8px 0" }}>Links</th>
            </tr>
          </thead>
          <tbody>
            {(data?.communities || []).map((c, i) => (
              <tr key={c.id || i} style={{ borderBottom: "1px solid #161616" }}>
                <td style={{ padding: "9px 0", paddingRight: 16, fontWeight: 500, color: "#ddd", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.name}
                </td>
                <td style={{ padding: "9px 0", paddingRight: 16, color: "#888", whiteSpace: "nowrap" }}>
                  {c.city ? `${c.city}, ${c.state || ""}` : (c.state || "—")}
                </td>
                <td style={{ padding: "9px 0", paddingRight: 16, color: "#555", fontSize: 11, whiteSpace: "nowrap", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {c.geo_target_id
                    ? c.geo_target_id.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase())
                    : "—"}
                </td>
                <td style={{ padding: "9px 0", paddingRight: 16, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: ratingColor(c.google_rating) }}>
                  {c.google_rating ? `★ ${c.google_rating}` : "—"}
                </td>
                <td style={{ padding: "9px 0", paddingRight: 16, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", color: "#666" }}>
                  {c.review_count?.toLocaleString() || "—"}
                </td>
                <td style={{ padding: "9px 0" }}>
                  {c.google_maps_url && (
                    <a href={c.google_maps_url} target="_blank" rel="noopener" style={{ color: "#60a5fa", fontSize: 12, marginRight: 8, textDecoration: "none" }}>Maps</a>
                  )}
                  {c.website_url && (
                    <a href={c.website_url} target="_blank" rel="noopener" style={{ color: "#a78bfa", fontSize: 12, textDecoration: "none" }}>Site</a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data?.pages > 1 && (
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "center" }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ padding: "6px 14px", background: "#161616", color: page === 1 ? "#333" : "#888", border: "1px solid #2a2a2a", borderRadius: 6, cursor: page === 1 ? "default" : "pointer", fontSize: 13 }}
          >
            ← Prev
          </button>
          <span style={{ padding: "6px 14px", color: "#666", fontSize: 13 }}>
            {page} / {data.pages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(data.pages, p + 1))}
            disabled={page === data.pages}
            style={{ padding: "6px 14px", background: "#161616", color: page === data.pages ? "#333" : "#888", border: "1px solid #2a2a2a", borderRadius: 6, cursor: page === data.pages ? "default" : "pointer", fontSize: 13 }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────
export default function DiscoveryDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/stats`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStats(await res.json());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center text-text-muted text-sm gap-2">
        <RefreshCw size={16} className="animate-spin" /> Loading pipeline data...
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0a0a0a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#ef4444",
          fontFamily: "'Inter', system-ui, sans-serif",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600 }}>Connection Error</div>
        <div style={{ fontSize: 13, color: "#888" }}>{error}</div>
        <button
          onClick={fetchStats}
          style={{
            marginTop: 8,
            padding: "8px 20px",
            background: "#222",
            color: "#ccc",
            border: "1px solid #333",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // Use mock data for preview when no API is available
  const data = stats || {
    totalCommunities: 0,
    awaitingScrape: 0,
    awaitingReviewScan: 0,
    awaitingContactEnrichment: 0,
    managementCompanies: 0,
    byState: [],
    recentRuns: [],
    lowRatedCommunities: [],
  };

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "communities", label: "Communities" },
    { id: "runs", label: "Run History" },
    { id: "signals", label: "Hot Signals" },
    { id: "geo", label: "Geo Coverage" },
  ];

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary px-8 py-6">
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>

      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 32,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "1.5px",
              color: "#f97316",
              marginBottom: 6,
            }}
          >
            HOA Lead Engine
          </div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: "#fff",
              margin: 0,
              letterSpacing: "-0.5px",
            }}
          >
            Discovery Pipeline
          </h1>
          <div style={{ fontSize: 13, color: "#555", marginTop: 4 }}>
            Google Maps → Contact Scrape → Email Enrichment → Review Monitor
          </div>
        </div>
        <button
          onClick={fetchStats}
          style={{
            padding: "8px 16px",
            background: "#161616",
            color: "#888",
            border: "1px solid #2a2a2a",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 28,
          flexWrap: "wrap",
        }}
      >
        <StatCard
          label="Communities Found"
          value={data.totalCommunities}
          accent="#f97316"
        />
        <StatCard
          label="Awaiting Scrape"
          value={data.awaitingScrape}
          sub="Website → Board contacts"
          accent="#60a5fa"
        />
        <StatCard
          label="Awaiting Reviews"
          value={data.awaitingReviewScan}
          sub="Google Reviews scan"
          accent="#a78bfa"
        />
        <StatCard
          label="Needs Contacts"
          value={data.awaitingContactEnrichment}
          sub="Email enrichment"
          accent="#34d399"
        />
        <StatCard
          label="Mgmt Companies"
          value={data.managementCompanies}
          sub="Potential partners"
          accent="#fbbf24"
        />
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 0,
          marginBottom: 24,
          borderBottom: "1px solid #1a1a1a",
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "10px 20px",
              background: "transparent",
              color: activeTab === tab.id ? "#f97316" : "#555",
              border: "none",
              borderBottom:
                activeTab === tab.id
                  ? "2px solid #f97316"
                  : "2px solid transparent",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.3px",
              transition: "all 0.2s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {/* State breakdown */}
          <div
            style={{
              background: "#111",
              border: "1px solid #1e1e1e",
              borderRadius: 10,
              padding: 20,
              flex: "2 1 400px",
            }}
          >
            <h3
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#888",
                marginTop: 0,
                marginBottom: 16,
              }}
            >
              Communities by State
            </h3>
            {data.byState.length === 0 ? (
              <div style={{ color: "#444", fontSize: 13, padding: "20px 0" }}>
                No communities discovered yet. Run the discovery agent to
                populate.
              </div>
            ) : (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid #222",
                      color: "#555",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    <th style={{ textAlign: "left", padding: "8px 0" }}>
                      State
                    </th>
                    <th style={{ textAlign: "right", padding: "8px 0" }}>
                      Count
                    </th>
                    <th style={{ textAlign: "right", padding: "8px 0" }}>
                      Avg Rating
                    </th>
                    <th style={{ textAlign: "right", padding: "8px 0" }}>
                      Total Reviews
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.byState.map((row) => (
                    <tr
                      key={row.state}
                      style={{ borderBottom: "1px solid #1a1a1a" }}
                    >
                      <td style={{ padding: "10px 0", fontWeight: 600 }}>
                        {row.state}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          padding: "10px 0",
                          fontFamily: "'JetBrains Mono', monospace",
                          color: "#f97316",
                        }}
                      >
                        {row.count.toLocaleString()}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          padding: "10px 0",
                          color: row.avg_rating <= 3.0 ? "#ef4444" : "#888",
                        }}
                      >
                        {row.avg_rating ? `★ ${row.avg_rating}` : "—"}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          padding: "10px 0",
                          color: "#666",
                        }}
                      >
                        {(row.total_reviews || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pipeline funnel */}
          <div
            style={{
              background: "#111",
              border: "1px solid #1e1e1e",
              borderRadius: 10,
              padding: 20,
              flex: "1 1 280px",
            }}
          >
            <h3
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#888",
                marginTop: 0,
                marginBottom: 16,
              }}
            >
              Pipeline Funnel
            </h3>
            {[
              {
                label: "Discovered",
                count: data.totalCommunities,
                color: "#f97316",
                pct: 100,
              },
              {
                label: "Website Scraped",
                count:
                  data.totalCommunities - data.awaitingScrape,
                color: "#60a5fa",
                pct:
                  data.totalCommunities > 0
                    ? Math.round(
                        ((data.totalCommunities - data.awaitingScrape) /
                          data.totalCommunities) *
                          100
                      )
                    : 0,
              },
              {
                label: "Reviews Scanned",
                count:
                  data.totalCommunities - data.awaitingReviewScan,
                color: "#a78bfa",
                pct:
                  data.totalCommunities > 0
                    ? Math.round(
                        ((data.totalCommunities - data.awaitingReviewScan) /
                          data.totalCommunities) *
                          100
                      )
                    : 0,
              },
              {
                label: "Contacts Enriched",
                count:
                  data.totalCommunities - data.awaitingContactEnrichment,
                color: "#34d399",
                pct:
                  data.totalCommunities > 0
                    ? Math.round(
                        ((data.totalCommunities -
                          data.awaitingContactEnrichment) /
                          data.totalCommunities) *
                          100
                      )
                    : 0,
              },
            ].map((stage) => (
              <div key={stage.label} style={{ marginBottom: 16 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ color: "#aaa" }}>{stage.label}</span>
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      color: stage.color,
                      fontWeight: 600,
                    }}
                  >
                    {stage.count.toLocaleString()} ({stage.pct}%)
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    background: "#1a1a1a",
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${stage.pct}%`,
                      background: stage.color,
                      borderRadius: 3,
                      transition: "width 0.5s ease",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "communities" && (
        <div
          style={{
            background: "#111",
            border: "1px solid #1e1e1e",
            borderRadius: 10,
            padding: 20,
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#888", marginTop: 0, marginBottom: 16 }}>
            Discovered Communities
          </h3>
          <CommunitiesBrowser />
        </div>
      )}

      {activeTab === "runs" && (
        <div
          style={{
            background: "#111",
            border: "1px solid #1e1e1e",
            borderRadius: 10,
            padding: 20,
          }}
        >
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#888",
              marginTop: 0,
              marginBottom: 16,
            }}
          >
            Recent Discovery Runs
          </h3>
          {data.recentRuns.length === 0 ? (
            <div style={{ color: "#444", fontSize: 13, padding: "20px 0" }}>
              No runs yet. Start the discovery agent via OpenClaw or the API.
            </div>
          ) : (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid #222",
                    color: "#555",
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  <th style={{ textAlign: "left", padding: "8px 0" }}>
                    Geo Target
                  </th>
                  <th style={{ textAlign: "left", padding: "8px 0" }}>
                    Status
                  </th>
                  <th style={{ textAlign: "right", padding: "8px 0" }}>
                    Results
                  </th>
                  <th style={{ textAlign: "right", padding: "8px 0" }}>New</th>
                  <th style={{ textAlign: "right", padding: "8px 0" }}>
                    Updated
                  </th>
                  <th style={{ textAlign: "right", padding: "8px 0" }}>
                    Started
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.recentRuns.map((run) => (
                  <tr
                    key={run.id}
                    style={{ borderBottom: "1px solid #1a1a1a" }}
                  >
                    <td style={{ padding: "10px 0", fontWeight: 500 }}>
                      {run.geo_target || "—"}
                    </td>
                    <td style={{ padding: "10px 0" }}>
                      <StatusBadge status={run.status} />
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        padding: "10px 0",
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      {(run.results_count || 0).toLocaleString()}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        padding: "10px 0",
                        fontFamily: "'JetBrains Mono', monospace",
                        color: "#34d399",
                      }}
                    >
                      +{run.new_records || 0}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        padding: "10px 0",
                        fontFamily: "'JetBrains Mono', monospace",
                        color: "#888",
                      }}
                    >
                      {run.updated_records || 0}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        padding: "10px 0",
                        color: "#555",
                        fontSize: 12,
                      }}
                    >
                      {run.started_at
                        ? new Date(run.started_at).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === "signals" && (
        <div
          style={{
            background: "#111",
            border: "1px solid #1e1e1e",
            borderRadius: 10,
            padding: 20,
          }}
        >
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#888",
              marginTop: 0,
              marginBottom: 4,
            }}
          >
            Low-Rated Communities
          </h3>
          <div style={{ fontSize: 12, color: "#555", marginBottom: 16 }}>
            ★ ≤ 3.0 with 5+ reviews — high probability of deferred maintenance
          </div>
          {data.lowRatedCommunities.length === 0 ? (
            <div style={{ color: "#444", fontSize: 13, padding: "20px 0" }}>
              No low-rated communities found yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.lowRatedCommunities.map((comm, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    background: "#0d0d0d",
                    borderRadius: 8,
                    border: "1px solid #1a1a1a",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 14,
                        color: "#e5e5e5",
                      }}
                    >
                      {comm.name}
                    </div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                      {comm.city}, {comm.state}
                      {comm.website_url && (
                        <>
                          {" "}
                          ·{" "}
                          <a
                            href={comm.website_url}
                            target="_blank"
                            rel="noopener"
                            style={{
                              color: "#60a5fa",
                              textDecoration: "none",
                            }}
                          >
                            website
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: "#ef4444",
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      ★ {comm.google_rating}
                    </div>
                    <div style={{ fontSize: 11, color: "#555" }}>
                      {comm.review_count} reviews
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "geo" && (
        <div
          style={{
            background: "#111",
            border: "1px solid #1e1e1e",
            borderRadius: 10,
            padding: 20,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#888", margin: 0 }}>
              Market Coverage — {data.geoTargets?.length || 19} Geo-Targets
            </h3>
            <div style={{ fontSize: 12, color: "#555" }}>
              2 runs/day · full cycle ~10 days
            </div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #222", color: "#555", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                <th style={{ textAlign: "left", padding: "8px 0", paddingRight: 16 }}>Market</th>
                <th style={{ textAlign: "right", padding: "8px 0", paddingRight: 16 }}>HOAs Found</th>
                <th style={{ textAlign: "left", padding: "8px 0", paddingRight: 16 }}>Last Sweep</th>
                <th style={{ textAlign: "left", padding: "8px 0" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {(data.geoTargets || []).map((gt) => {
                const swept = !!gt.last_sweep_at;
                const sweepDate = swept ? new Date(gt.last_sweep_at).toLocaleDateString() : null;
                const daysSince = swept
                  ? Math.floor((Date.now() - new Date(gt.last_sweep_at)) / 86400000)
                  : null;
                return (
                  <tr key={gt.id} style={{ borderBottom: "1px solid #161616" }}>
                    <td style={{ padding: "9px 0", paddingRight: 16, fontWeight: 500, color: "#ddd" }}>
                      {gt.name}
                    </td>
                    <td style={{ padding: "9px 0", paddingRight: 16, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", color: gt.community_count > 0 ? "#f97316" : "#333" }}>
                      {gt.community_count > 0 ? gt.community_count.toLocaleString() : "—"}
                    </td>
                    <td style={{ padding: "9px 0", paddingRight: 16, color: "#666", fontSize: 12 }}>
                      {sweepDate ? `${sweepDate} (${daysSince}d ago)` : "—"}
                    </td>
                    <td style={{ padding: "9px 0" }}>
                      {swept ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: "#0d2818", color: "#22c55e", border: "1px solid #166534" }}>
                          ● done
                        </span>
                      ) : (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: "#1c1917", color: "#a3a3a3", border: "1px solid #404040" }}>
                          ○ pending
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(!data.geoTargets || data.geoTargets.length === 0) && (
            <div style={{ color: "#444", fontSize: 13, padding: "20px 0" }}>
              No geo-targets found. Run: node scripts/seed-geo-targets.js
            </div>
          )}
        </div>
      )}
    </div>
  );
}
