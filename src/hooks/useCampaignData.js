import { useQuery } from '@tanstack/react-query';
import { useCampaign } from '../context/CampaignContext';
import { api } from '../lib/api';

/**
 * Custom hook for fetching campaign-specific data
 * Automatically includes campaign_id in requests
 *
 * @example
 * const { data: agents, isLoading } = useCampaignData('agents', '/agents');
 */
export function useCampaignData(queryKey, endpoint, options = {}) {
  const { activeCampaignId } = useCampaign();

  return useQuery({
    queryKey: [queryKey, activeCampaignId],
    queryFn: async () => {
      const headers = {
        'X-Campaign-ID': activeCampaignId,
      };
      return api.get(endpoint, { headers });
    },
    enabled: !!activeCampaignId,
    ...options,
  });
}
