import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

const CampaignContext = createContext();

export function CampaignProvider({ children }) {
  const [activeCampaignId, setActiveCampaignId] = useState(
    localStorage.getItem('activeCampaignId') || null
  );
  const [campaigns, setCampaigns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch all campaigns on mount
  useEffect(() => {
    const fetchCampaigns = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await api.get('/campaigns');
        setCampaigns(data);

        // If no active campaign, set first as active
        if (!activeCampaignId && data.length > 0) {
          setActiveCampaignId(data[0].id);
        }
      } catch (err) {
        console.error('[CampaignContext] Failed to fetch campaigns:', err);
        setError(err.message || 'Failed to load campaigns');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCampaigns();
  }, []);

  // Persist active campaign selection
  useEffect(() => {
    if (activeCampaignId) {
      localStorage.setItem('activeCampaignId', activeCampaignId);
    }
  }, [activeCampaignId]);

  // Campaign-aware fetch wrapper
  const campaignFetch = useCallback(async (url, options = {}) => {
    const headers = {
      ...options.headers,
      'X-Campaign-ID': activeCampaignId,
    };

    return api.fetch(url, { ...options, headers });
  }, [activeCampaignId]);

  // Refresh campaigns list
  const refreshCampaigns = useCallback(async () => {
    try {
      const data = await api.get('/campaigns');
      setCampaigns(data);
    } catch (err) {
      console.error('[CampaignContext] Failed to refresh campaigns:', err);
    }
  }, []);

  const activeCampaign = campaigns.find(c => c.id === activeCampaignId);

  return (
    <CampaignContext.Provider value={{
      activeCampaign,
      activeCampaignId,
      campaigns,
      setActiveCampaignId,
      campaignFetch,
      switchCampaign: setActiveCampaignId,
      isLoading,
      error,
      refreshCampaigns,
    }}>
      {children}
    </CampaignContext.Provider>
  );
}

export const useCampaign = () => {
  const context = useContext(CampaignContext);
  if (!context) {
    throw new Error('useCampaign must be used within a CampaignProvider');
  }
  return context;
};
