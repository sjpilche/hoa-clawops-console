/**
 * @file CampaignCard.jsx
 * @description Campaign card component for the global overview grid.
 * Shows campaign icon, name, stats, and status with click-through to campaign view.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useCampaign } from '../../context/CampaignContext';

export function CampaignCard({ campaign }) {
  const { switchCampaign } = useCampaign();

  const handleClick = () => {
    switchCampaign(campaign.id);
  };

  // Format last activity time
  const lastActivityText = campaign.lastActivity
    ? new Date(campaign.lastActivity).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'No activity';

  // Status badge styling
  const statusStyles = {
    active: 'bg-accent-success text-white',
    paused: 'bg-accent-warning text-white',
    archived: 'bg-bg-primary text-text-muted',
  };

  return (
    <Link
      to={`/c/${campaign.slug}`}
      onClick={handleClick}
      className="block p-6 bg-bg-secondary rounded-lg hover:bg-bg-elevated transition-all duration-200 hover:shadow-lg"
      style={{ borderTop: `4px solid ${campaign.color}` }}
    >
      {/* Header: Icon + Status */}
      <div className="flex items-start justify-between mb-4">
        <span className="text-3xl" role="img" aria-label={campaign.name}>
          {campaign.icon}
        </span>
        <span
          className={`px-2 py-1 rounded text-xs font-medium ${
            statusStyles[campaign.status] || statusStyles.active
          }`}
        >
          {campaign.status}
        </span>
      </div>

      {/* Campaign Name & Company */}
      <h3 className="text-lg font-semibold mb-1 text-text-primary">
        {campaign.name}
      </h3>
      <p className="text-sm text-text-muted mb-4">{campaign.company}</p>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-2xl font-bold text-text-primary">
            {campaign.agentCount || 0}
          </div>
          <div className="text-xs text-text-muted">Agents</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-text-primary">
            {campaign.leadCount || 0}
          </div>
          <div className="text-xs text-text-muted">Leads</div>
        </div>
      </div>

      {/* Last Activity */}
      <div className="text-xs text-text-muted border-t border-border pt-3">
        Last activity: {lastActivityText}
      </div>

      {/* Description (if present) */}
      {campaign.description && (
        <p className="text-xs text-text-muted mt-2 line-clamp-2">
          {campaign.description}
        </p>
      )}
    </Link>
  );
}
