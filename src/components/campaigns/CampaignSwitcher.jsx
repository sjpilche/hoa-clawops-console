import { useState, useEffect, useRef } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { ChevronDown, Search, Plus, Check } from 'lucide-react';

export function CampaignSwitcher() {
  const { activeCampaign, campaigns, switchCampaign, activeCampaignId } = useCampaign();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef(null);

  const filteredCampaigns = campaigns.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.company.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Cmd/Ctrl + K to open switcher
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleSelectCampaign = (campaignId) => {
    switchCampaign(campaignId);
    setIsOpen(false);
    setSearchQuery('');
  };

  if (!activeCampaign) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-secondary">
        <div className="w-4 h-4 rounded-full bg-text-muted animate-pulse" />
        <span className="text-sm text-text-muted">Loading campaigns...</span>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-secondary hover:bg-bg-elevated transition-colors"
        style={{ borderLeft: `3px solid ${activeCampaign.color}` }}
        title="Switch campaign (Ctrl/Cmd + K)"
      >
        <span className="text-lg">{activeCampaign.icon}</span>
        <span className="font-medium text-sm max-w-[200px] truncate">
          {activeCampaign.name}
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-bg-elevated rounded-lg shadow-lg border border-bg-secondary z-50">
          {/* Search */}
          <div className="p-3 border-b border-bg-secondary">
            <div className="flex items-center gap-2 px-3 py-2 bg-bg-secondary rounded">
              <Search className="w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search campaigns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent border-0 outline-none text-sm"
                autoFocus
              />
              <kbd className="px-1 py-0.5 text-xs bg-bg-primary rounded">Ctrl+K</kbd>
            </div>
          </div>

          {/* Campaign List */}
          <div className="max-h-96 overflow-y-auto">
            {filteredCampaigns.length === 0 ? (
              <div className="p-4 text-center text-sm text-text-muted">
                No campaigns found
              </div>
            ) : (
              filteredCampaigns.map(campaign => (
                <button
                  key={campaign.id}
                  onClick={() => handleSelectCampaign(campaign.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-bg-secondary transition-colors text-left"
                  style={{ borderLeft: `3px solid ${campaign.color}` }}
                >
                  <span className="text-xl flex-shrink-0">{campaign.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{campaign.name}</div>
                    <div className="text-xs text-text-muted truncate">{campaign.company}</div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-text-muted">
                        {campaign.agentCount || 0} agents
                      </span>
                      <span className="text-xs text-text-muted">
                        {campaign.leadCount || 0} leads
                      </span>
                    </div>
                  </div>
                  {campaign.id === activeCampaignId && (
                    <Check className="w-4 h-4 text-accent-success flex-shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Create Campaign Button */}
          <div className="p-3 border-t border-bg-secondary">
            <button className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded bg-accent-primary text-white hover:bg-opacity-90 transition-opacity text-sm font-medium">
              <Plus className="w-4 h-4" />
              <span>Create New Campaign</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
