/**
 * @file CampaignLayout.jsx
 * @description Layout wrapper for campaign-specific routes.
 * Ensures the correct campaign is active based on the URL slug.
 */

import React, { useEffect } from 'react';
import { useParams, Outlet, Navigate } from 'react-router-dom';
import { useCampaign } from '../context/CampaignContext';
import AppShell from '../components/layout/AppShell';

export function CampaignLayout() {
  const { campaignSlug } = useParams();
  const { campaigns, switchCampaign, activeCampaign, isLoading } = useCampaign();

  useEffect(() => {
    // Find campaign by slug and set as active
    const campaign = campaigns.find((c) => c.slug === campaignSlug);
    if (campaign && (!activeCampaign || activeCampaign.id !== campaign.id)) {
      switchCampaign(campaign.id);
    }
  }, [campaignSlug, campaigns, activeCampaign, switchCampaign]);

  // Loading state
  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-accent-primary border-r-transparent mb-4"></div>
            <p className="text-text-muted">Loading campaign...</p>
          </div>
        </div>
      </AppShell>
    );
  }

  // Campaign not found
  const campaign = campaigns.find((c) => c.slug === campaignSlug);
  if (!campaign) {
    return <Navigate to="/" replace />;
  }

  // Render campaign routes
  return <Outlet />;
}
