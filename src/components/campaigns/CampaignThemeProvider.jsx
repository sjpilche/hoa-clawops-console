import { useEffect } from 'react';
import { useCampaign } from '../../context/CampaignContext';

export function CampaignThemeProvider({ children }) {
  const { activeCampaign } = useCampaign();

  useEffect(() => {
    if (activeCampaign?.color) {
      // Apply campaign color as CSS variable
      document.documentElement.style.setProperty('--campaign-accent', activeCampaign.color);
    }
  }, [activeCampaign?.color]);

  return children;
}
