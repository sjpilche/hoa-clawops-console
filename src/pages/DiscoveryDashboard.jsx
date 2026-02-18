import { useState, useEffect, useCallback } from "react";

const API_BASE = "/api/discovery";

// ── Status badge colors ──────────────────────────────────────────
const STATUS_COLORS = {
  success: { bg: "#0d2818", text: "#22c55e", border: "#166534" },
  running: { bg: "#1a1a2e", text: "#60a5fa", border: "#1e3a5f" },
  failed: { bg: "#2d1215", text: "#ef4444", border: "#7f1d1d" },
  pending: { bg: "#1c1917", text: "#a3a3a3", border: "#404040" },
};

function StatusBadge({ status }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.pending;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.5px",
        textTransform: "uppercase",
        background: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: colors.text,
          animation: status === "running" ? "pulse 1.5s infinite" : "none",
        }}
      />
      {status}
    </span>
  );
}

// ── Stat card ────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent = "#f97316" }) {
  return (
    <div
      style={{
        background: "#111",
        border: "1px solid #222",
        borderRadius: 10,
        padding: "20px 24px",
        minWidth: 160,
        flex: 1,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.8px",
          color: "#666",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 32,
          fontWeight: 700,
          color: accent,
          lineHeight: 1,
          fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
        }}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: "#555", marginTop: 6 }}>{sub}</div>
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
      <div
        style={{
          minHeight: "100vh",
          background: "#0a0a0a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#666",
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        Loading pipeline data...
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
    { id: "runs", label: "Run History" },
    { id: "signals", label: "Hot Signals" },
    { id: "geo", label: "Geo Coverage" },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#e5e5e5",
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: "24px 32px",
      }}
    >
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600;700&display=swap');
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
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#888",
              marginTop: 0,
              marginBottom: 16,
            }}
          >
            Geo-Target Coverage
          </h3>
          <div style={{ color: "#555", fontSize: 13 }}>
            Geo-target status is loaded from the /api/discovery/next-target
            endpoint. Run the seed script to populate targets, then the
            discovery agent will process them in priority order.
          </div>
          {data.byState.length > 0 && (
            <div
              style={{
                marginTop: 20,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                gap: 8,
              }}
            >
              {data.byState.map((s) => (
                <div
                  key={s.state}
                  style={{
                    background: "#0d0d0d",
                    border: "1px solid #1a1a1a",
                    borderRadius: 8,
                    padding: "14px 16px",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: "#f97316",
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    {s.state}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "#888",
                      marginTop: 4,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    {s.count.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                    communities
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
