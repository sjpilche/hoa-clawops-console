/**
 * @file DiscoveryDashboard.jsx
 * @description HOA Discovery Pipeline dashboard — migrated to shared components + Tailwind.
 */
import { useState, useEffect, useCallback } from "react";
import { RefreshCw, MapPin, Globe, Star, ExternalLink } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import Badge from "@/components/ui/Badge";
import Tabs from "@/components/ui/Tabs";
import ProgressBar from "@/components/ui/ProgressBar";
import SectionHeader from "@/components/ui/SectionHeader";
import Button from "@/components/ui/Button";

const API_BASE = "/api/discovery";

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
  useEffect(() => { setPage(1); }, [search, state, geoTargetId, maxRating]);

  const ratingColor = (r) => {
    if (!r) return "text-text-muted";
    if (r <= 2.5) return "text-accent-danger";
    if (r <= 3.5) return "text-accent-warning";
    return "text-accent-success";
  };

  const selectClass = "px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary";

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-2.5 mb-4 flex-wrap">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, city, address..."
          className="flex-[2_1_220px] px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-primary"
        />
        <select value={geoTargetId} onChange={e => setGeoTargetId(e.target.value)} className={`flex-[1_1_180px] ${selectClass}`}>
          <option value="">All Markets</option>
          {(data?.geoTargets || []).map(g => (
            <option key={g.id} value={g.id}>{g.name} ({g.count})</option>
          ))}
        </select>
        <select value={state} onChange={e => setState(e.target.value)} className={`flex-[0_1_110px] ${selectClass}`}>
          <option value="">All States</option>
          {(data?.states || []).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={maxRating} onChange={e => setMaxRating(e.target.value)} className={`flex-[0_1_170px] ${selectClass}`}>
          <option value="">All Ratings</option>
          <option value="2.5">Low (≤ 2.5) — Hot leads</option>
          <option value="3.0">Under 3.0</option>
          <option value="3.5">Under 3.5</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className={`flex-[0_1_160px] ${selectClass}`}>
          <option value="google_rating">Sort: Rating</option>
          <option value="review_count">Sort: Reviews</option>
          <option value="name">Sort: Name A-Z</option>
          <option value="discovered_at">Sort: Newest</option>
        </select>
      </div>

      <div className="text-xs text-text-muted mb-3">
        {loading ? "Loading..." : `${(data?.total || 0).toLocaleString()} communities${data?.pages > 1 ? ` — page ${page} of ${data.pages}` : ""}`}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-text-muted uppercase tracking-wider">
              <th className="text-left py-2 pr-4 font-medium">Name</th>
              <th className="text-left py-2 pr-4 font-medium">City, State</th>
              <th className="text-left py-2 pr-4 font-medium hidden md:table-cell">Market</th>
              <th className="text-right py-2 pr-4 font-medium">Rating</th>
              <th className="text-right py-2 pr-4 font-medium hidden sm:table-cell">Reviews</th>
              <th className="text-left py-2 font-medium">Links</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(data?.communities || []).map((c, i) => (
              <tr key={c.id || i} className="hover:bg-bg-elevated transition-colors">
                <td className="py-2.5 pr-4 font-medium text-text-primary max-w-[220px] truncate">{c.name}</td>
                <td className="py-2.5 pr-4 text-text-secondary whitespace-nowrap">
                  {c.city ? `${c.city}, ${c.state || ""}` : (c.state || "\u2014")}
                </td>
                <td className="py-2.5 pr-4 text-text-muted text-xs hidden md:table-cell whitespace-nowrap max-w-[140px] truncate">
                  {c.geo_target_id ? c.geo_target_id.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase()) : "\u2014"}
                </td>
                <td className={`py-2.5 pr-4 text-right font-mono font-semibold ${ratingColor(c.google_rating)}`}>
                  {c.google_rating ? `${c.google_rating}` : "\u2014"}
                </td>
                <td className="py-2.5 pr-4 text-right font-mono text-text-muted hidden sm:table-cell">
                  {c.review_count?.toLocaleString() || "\u2014"}
                </td>
                <td className="py-2.5 flex items-center gap-2">
                  {c.google_maps_url && (
                    <a href={c.google_maps_url} target="_blank" rel="noopener" className="text-accent-primary text-xs hover:underline">Maps</a>
                  )}
                  {c.website_url && (
                    <a href={c.website_url} target="_blank" rel="noopener" className="text-accent-info text-xs hover:underline">Site</a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data?.pages > 1 && (
        <div className="flex gap-2 mt-4 justify-center items-center">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</Button>
          <span className="text-sm text-text-muted px-3">{page} / {data.pages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(data.pages, p + 1))} disabled={page === data.pages}>Next</Button>
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
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-text-muted text-sm gap-2">
        <RefreshCw size={16} className="animate-spin" /> Loading pipeline data...
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="text-lg font-semibold text-accent-danger">Connection Error</div>
        <div className="text-sm text-text-muted">{error}</div>
        <Button variant="outline" size="sm" onClick={fetchStats}>Retry</Button>
      </div>
    );
  }

  const data = stats || {
    totalCommunities: 0, awaitingScrape: 0, awaitingReviewScan: 0,
    awaitingContactEnrichment: 0, managementCompanies: 0,
    byState: [], recentRuns: [], lowRatedCommunities: [],
  };

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "communities", label: "Communities" },
    { key: "runs", label: "Run History" },
    { key: "signals", label: "Hot Signals" },
    { key: "geo", label: "Geo Coverage" },
  ];

  const pipelineFunnel = [
    { label: "Discovered", value: data.totalCommunities, color: "bg-accent-warning", pct: 100 },
    { label: "Website Scraped", value: data.totalCommunities - data.awaitingScrape, color: "bg-accent-primary", pct: data.totalCommunities > 0 ? Math.round(((data.totalCommunities - data.awaitingScrape) / data.totalCommunities) * 100) : 0 },
    { label: "Reviews Scanned", value: data.totalCommunities - data.awaitingReviewScan, color: "bg-accent-info", pct: data.totalCommunities > 0 ? Math.round(((data.totalCommunities - data.awaitingReviewScan) / data.totalCommunities) * 100) : 0 },
    { label: "Contacts Enriched", value: data.totalCommunities - data.awaitingContactEnrichment, color: "bg-accent-success", pct: data.totalCommunities > 0 ? Math.round(((data.totalCommunities - data.awaitingContactEnrichment) / data.totalCommunities) * 100) : 0 },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-accent-warning mb-1">HOA Lead Engine</div>
          <h1 className="text-2xl font-bold text-text-primary">Discovery Pipeline</h1>
          <p className="text-sm text-text-muted mt-0.5">Google Maps &rarr; Contact Scrape &rarr; Email Enrichment &rarr; Review Monitor</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStats}>
          <RefreshCw size={14} /> Refresh
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        <StatCard icon={MapPin} label="Communities Found" value={data.totalCommunities.toLocaleString()} color="text-accent-warning" />
        <StatCard label="Awaiting Scrape" value={data.awaitingScrape.toLocaleString()} sub="Website → Board contacts" color="text-accent-primary" />
        <StatCard label="Awaiting Reviews" value={data.awaitingReviewScan.toLocaleString()} sub="Google Reviews scan" color="text-accent-info" />
        <StatCard label="Needs Contacts" value={data.awaitingContactEnrichment.toLocaleString()} sub="Email enrichment" color="text-accent-success" />
        <StatCard label="Mgmt Companies" value={data.managementCompanies.toLocaleString()} sub="Potential partners" color="text-accent-warning" />
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* State breakdown */}
          <div className="lg:col-span-2 bg-bg-secondary border border-border rounded-xl p-5">
            <SectionHeader title="Communities by State" />
            {data.byState.length === 0 ? (
              <div className="text-text-muted text-sm py-8 text-center">No communities discovered yet. Run the discovery agent to populate.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-text-muted uppercase tracking-wider">
                      <th className="text-left py-2 font-medium">State</th>
                      <th className="text-right py-2 font-medium">Count</th>
                      <th className="text-right py-2 font-medium">Avg Rating</th>
                      <th className="text-right py-2 font-medium">Total Reviews</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.byState.map((row) => (
                      <tr key={row.state} className="hover:bg-bg-elevated transition-colors">
                        <td className="py-2.5 font-semibold text-text-primary">{row.state}</td>
                        <td className="py-2.5 text-right font-mono text-accent-warning">{row.count.toLocaleString()}</td>
                        <td className={`py-2.5 text-right ${row.avg_rating <= 3.0 ? 'text-accent-danger' : 'text-text-secondary'}`}>
                          {row.avg_rating ? `${row.avg_rating}` : "\u2014"}
                        </td>
                        <td className="py-2.5 text-right text-text-muted">{(row.total_reviews || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pipeline funnel */}
          <div className="bg-bg-secondary border border-border rounded-xl p-5">
            <SectionHeader title="Pipeline Funnel" />
            <div className="space-y-4">
              {pipelineFunnel.map((stage) => (
                <div key={stage.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-text-secondary">{stage.label}</span>
                    <span className="font-mono font-semibold text-text-primary">
                      {stage.value.toLocaleString()} <span className="text-text-muted font-normal">({stage.pct}%)</span>
                    </span>
                  </div>
                  <ProgressBar value={stage.pct} color={stage.color} size="sm" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "communities" && (
        <div className="bg-bg-secondary border border-border rounded-xl p-5">
          <SectionHeader title="Discovered Communities" />
          <CommunitiesBrowser />
        </div>
      )}

      {activeTab === "runs" && (
        <div className="bg-bg-secondary border border-border rounded-xl p-5">
          <SectionHeader title="Recent Discovery Runs" />
          {data.recentRuns.length === 0 ? (
            <div className="text-text-muted text-sm py-8 text-center">No runs yet. Start the discovery agent via OpenClaw or the API.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-text-muted uppercase tracking-wider">
                    <th className="text-left py-2 font-medium">Geo Target</th>
                    <th className="text-left py-2 font-medium">Status</th>
                    <th className="text-right py-2 font-medium">Results</th>
                    <th className="text-right py-2 font-medium">New</th>
                    <th className="text-right py-2 font-medium hidden sm:table-cell">Updated</th>
                    <th className="text-right py-2 font-medium hidden md:table-cell">Started</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.recentRuns.map((run) => (
                    <tr key={run.id} className="hover:bg-bg-elevated transition-colors">
                      <td className="py-2.5 font-medium text-text-primary">{run.geo_target || "\u2014"}</td>
                      <td className="py-2.5"><Badge variant={Badge.variantFromStatus(run.status)} dot>{run.status}</Badge></td>
                      <td className="py-2.5 text-right font-mono text-text-primary">{(run.results_count || 0).toLocaleString()}</td>
                      <td className="py-2.5 text-right font-mono text-accent-success">+{run.new_records || 0}</td>
                      <td className="py-2.5 text-right font-mono text-text-muted hidden sm:table-cell">{run.updated_records || 0}</td>
                      <td className="py-2.5 text-right text-text-muted text-xs hidden md:table-cell">
                        {run.started_at ? new Date(run.started_at).toLocaleString() : "\u2014"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "signals" && (
        <div className="bg-bg-secondary border border-border rounded-xl p-5">
          <SectionHeader title="Low-Rated Communities" />
          <p className="text-xs text-text-muted mb-4">Rating 3.0 or below with 5+ reviews — high probability of deferred maintenance</p>
          {data.lowRatedCommunities.length === 0 ? (
            <div className="text-text-muted text-sm py-8 text-center">No low-rated communities found yet.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {data.lowRatedCommunities.map((comm, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-bg-elevated rounded-xl border border-border hover:border-accent-danger/30 transition-colors">
                  <div>
                    <div className="font-semibold text-text-primary">{comm.name}</div>
                    <div className="text-xs text-text-muted mt-0.5">
                      {comm.city}, {comm.state}
                      {comm.website_url && (
                        <> &middot; <a href={comm.website_url} target="_blank" rel="noopener" className="text-accent-primary hover:underline">website</a></>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-accent-danger font-mono">{comm.google_rating}</div>
                    <div className="text-xs text-text-muted">{comm.review_count} reviews</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "geo" && (
        <div className="bg-bg-secondary border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <SectionHeader title={`Market Coverage — ${data.geoTargets?.length || 0} Geo-Targets`} />
            <span className="text-xs text-text-muted">2 runs/day &middot; full cycle ~10 days</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-text-muted uppercase tracking-wider">
                  <th className="text-left py-2 pr-4 font-medium">Market</th>
                  <th className="text-right py-2 pr-4 font-medium">HOAs Found</th>
                  <th className="text-left py-2 pr-4 font-medium hidden sm:table-cell">Last Sweep</th>
                  <th className="text-left py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(data.geoTargets || []).map((gt) => {
                  const swept = !!gt.last_sweep_at;
                  const sweepDate = swept ? new Date(gt.last_sweep_at).toLocaleDateString() : null;
                  const daysSince = swept ? Math.floor((Date.now() - new Date(gt.last_sweep_at)) / 86400000) : null;
                  return (
                    <tr key={gt.id} className="hover:bg-bg-elevated transition-colors">
                      <td className="py-2.5 pr-4 font-medium text-text-primary">{gt.name}</td>
                      <td className={`py-2.5 pr-4 text-right font-mono ${gt.community_count > 0 ? 'text-accent-warning' : 'text-text-muted'}`}>
                        {gt.community_count > 0 ? gt.community_count.toLocaleString() : "\u2014"}
                      </td>
                      <td className="py-2.5 pr-4 text-text-muted text-xs hidden sm:table-cell">
                        {sweepDate ? `${sweepDate} (${daysSince}d ago)` : "\u2014"}
                      </td>
                      <td className="py-2.5">
                        <Badge variant={swept ? "success" : "neutral"} dot size="sm">
                          {swept ? "done" : "pending"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {(!data.geoTargets || data.geoTargets.length === 0) && (
            <div className="text-text-muted text-sm py-8 text-center">No geo-targets found. Run: node scripts/seed-geo-targets.js</div>
          )}
        </div>
      )}
    </div>
  );
}
