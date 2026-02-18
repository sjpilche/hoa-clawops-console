/**
 * @file GlobalOverview.jsx
 * @description Global campaign overview page showing all campaigns in a grid.
 * Includes cross-campaign metrics and campaign creation button.
 */

import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { CampaignCard } from '../components/campaigns/CampaignCard';
import { CampaignForm } from '../components/campaigns/CampaignForm';
import { api } from '../lib/api';
import { useCampaign } from '../context/CampaignContext';

export default function GlobalOverview() {
  const { campaigns, refreshCampaigns } = useCampaign();
  const [stats, setStats] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchOverviewStats();
  }, []);

  const fetchOverviewStats = async () => {
    try {
      setIsLoading(true);
      const data = await api.get('/campaigns/overview');
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch overview stats:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCampaignCreated = (campaign) => {
    console.log('Campaign created:', campaign);
    refreshCampaigns?.();
    fetchOverviewStats();
  };

  // Filter active campaigns
  const activeCampaigns = campaigns.filter((c) => c.status === 'active');
  const pausedCampaigns = campaigns.filter((c) => c.status === 'paused');
  const archivedCampaigns = campaigns.filter((c) => c.status === 'archived');

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-text-primary mb-2">
            All Campaigns
          </h1>
          <p className="text-text-muted">
            Manage and monitor all your marketing campaigns
          </p>
        </div>
        <button
          onClick={() => setIsFormOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-opacity-90 transition-all font-medium shadow-lg hover:shadow-xl"
        >
          <Plus className="w-4 h-4" />
          New Campaign
        </button>
      </div>

      {/* Cross-Campaign Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="p-6 bg-bg-secondary rounded-lg border-l-4 border-accent-info hover:bg-bg-elevated transition-colors">
            <div className="text-3xl font-bold text-text-primary">
              {stats.totalLeads || 0}
            </div>
            <div className="text-sm text-text-muted mt-1">Total Leads</div>
          </div>
          <div className="p-6 bg-bg-secondary rounded-lg border-l-4 border-accent-success hover:bg-bg-elevated transition-colors">
            <div className="text-3xl font-bold text-text-primary">
              {stats.totalAgentRuns || 0}
            </div>
            <div className="text-sm text-text-muted mt-1">Agent Runs</div>
          </div>
          <div className="p-6 bg-bg-secondary rounded-lg border-l-4 border-accent-warning hover:bg-bg-elevated transition-colors">
            <div className="text-3xl font-bold text-text-primary">
              {stats.totalEmails || 0}
            </div>
            <div className="text-sm text-text-muted mt-1">Emails Sent</div>
          </div>
          <div className="p-6 bg-bg-secondary rounded-lg border-l-4 border-accent-primary hover:bg-bg-elevated transition-colors">
            <div className="text-3xl font-bold text-text-primary">
              ${(stats.totalCost || 0).toFixed(2)}
            </div>
            <div className="text-sm text-text-muted mt-1">Total Cost</div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-accent-primary border-r-transparent"></div>
          <p className="text-text-muted mt-4">Loading campaigns...</p>
        </div>
      )}

      {/* Active Campaigns */}
      {!isLoading && activeCampaigns.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-text-primary mb-4">
            Active Campaigns ({activeCampaigns.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeCampaigns.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </div>
        </div>
      )}

      {/* Paused Campaigns */}
      {!isLoading && pausedCampaigns.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-text-primary mb-4">
            Paused Campaigns ({pausedCampaigns.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pausedCampaigns.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </div>
        </div>
      )}

      {/* Archived Campaigns */}
      {!isLoading && archivedCampaigns.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-text-primary mb-4">
            Archived Campaigns ({archivedCampaigns.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {archivedCampaigns.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </div>
        </div>
      )}

      {/* Empty State + New Campaign Card */}
      {!isLoading && campaigns.length === 0 && (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🎯</div>
          <h3 className="text-xl font-semibold text-text-primary mb-2">
            No Campaigns Yet
          </h3>
          <p className="text-text-muted mb-6">
            Create your first campaign to get started
          </p>
          <button
            onClick={() => setIsFormOpen(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-accent-primary text-white rounded-lg hover:bg-opacity-90 transition-all font-medium"
          >
            <Plus className="w-5 h-5" />
            Create Your First Campaign
          </button>
        </div>
      )}

      {/* New Campaign Placeholder Card (only show if campaigns exist) */}
      {!isLoading && campaigns.length > 0 && (
        <button
          onClick={() => setIsFormOpen(true)}
          className="w-full p-8 bg-bg-secondary rounded-lg border-2 border-dashed border-border hover:border-accent-primary transition-all flex flex-col items-center justify-center gap-4 group"
        >
          <Plus className="w-12 h-12 text-text-muted group-hover:text-accent-primary transition-colors" />
          <span className="text-text-muted group-hover:text-accent-primary transition-colors font-medium">
            Create New Campaign
          </span>
        </button>
      )}

      {/* Campaign Creation Form Modal */}
      <CampaignForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onCreated={handleCampaignCreated}
      />
    </div>
  );
}
