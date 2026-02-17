const axios = require('axios');

class LinkedInService {
  constructor() {
    this.baseUrl = 'https://api.linkedin.com/v2';
    this.clientId = process.env.LINKEDIN_CLIENT_ID;
    this.clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    this.redirectUri = process.env.NODE_ENV === 'production'
      ? process.env.LINKEDIN_REDIRECT_URI_PROD
      : process.env.LINKEDIN_REDIRECT_URI;
    this.accessToken = process.env.LINKEDIN_ACCESS_TOKEN || null;
    this.organizationUrn = process.env.LINKEDIN_ORGANIZATION_ID
      ? `urn:li:organization:${process.env.LINKEDIN_ORGANIZATION_ID}`
      : null;
  }

  /**
   * Generate OAuth authorization URL
   * User clicks this to grant permissions
   */
  getAuthorizationUrl(state = 'random_state_string') {
    const scopes = [
      'r_liteprofile',     // Read basic profile
      'r_emailaddress',    // Read email
      'w_member_social'    // Post updates
    ].join(' ');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state,
      scope: scopes
    });

    return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
  }

  /**
   * Exchange authorization code for access token
   * Called after user authorizes the app
   */
  async getAccessToken(code) {
    try {
      const response = await axios.post(
        'https://www.linkedin.com/oauth/v2/accessToken',
        null,
        {
          params: {
            grant_type: 'authorization_code',
            code,
            client_id: this.clientId,
            client_secret: this.clientSecret,
            redirect_uri: this.redirectUri
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.accessToken = response.data.access_token;
      console.log('[LinkedIn] ✅ Access token obtained');
      console.log('[LinkedIn] Token expires in:', response.data.expires_in, 'seconds');

      return {
        access_token: response.data.access_token,
        expires_in: response.data.expires_in,
        scope: response.data.scope
      };
    } catch (error) {
      console.error('[LinkedIn] ❌ Failed to get access token:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Set access token manually (for testing or if you have a long-lived token)
   */
  setAccessToken(token) {
    this.accessToken = token;
    console.log('[LinkedIn] Access token set manually');
  }

  /**
   * Get current user's profile (requires r_liteprofile scope)
   * If you only have w_member_social, use getUserInfo() instead
   */
  async getProfile() {
    try {
      const response = await axios.get(
        `${this.baseUrl}/me`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      console.log('[LinkedIn] ✅ Profile retrieved:', response.data.localizedFirstName, response.data.localizedLastName);
      return response.data;
    } catch (error) {
      console.error('[LinkedIn] ❌ Failed to get profile:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get user info from token introspection (works with w_member_social only)
   */
  async getUserInfo() {
    try {
      const response = await axios.get(
        `${this.baseUrl}/userinfo`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      console.log('[LinkedIn] ✅ User info retrieved');
      return response.data;
    } catch (error) {
      console.error('[LinkedIn] ❌ Failed to get user info:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Post a text-only update to LinkedIn
   * If personURN is provided, posts to that person's profile
   * If organizationURN is provided, posts to that company page
   * If neither provided, attempts to post to authenticated user
   */
  async postTextUpdate(text, authorURN = null) {
    try {
      // Default to company page if configured, then fall back to personal profile lookup
      let author = authorURN || this.organizationUrn;

      if (!author) {
        try {
          const userInfo = await this.getUserInfo();
          author = userInfo.sub;
        } catch (e) {
          throw new Error('Cannot determine author. Set LINKEDIN_ORGANIZATION_ID in .env.local or provide authorURN parameter.');
        }
      }

      const response = await axios.post(
        `${this.baseUrl}/ugcPosts`,
        {
          author,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: {
                text
              },
              shareMediaCategory: 'NONE'
            }
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0'
          }
        }
      );

      console.log('[LinkedIn] ✅ Text post created:', response.data.id);
      return response.data;
    } catch (error) {
      console.error('[LinkedIn] ❌ Post failed:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Post a link with preview to LinkedIn
   */
  async postLink(text, url, title, description, imageUrl = null) {
    try {
      const profile = await this.getProfile();
      const author = `urn:li:person:${profile.id}`;

      const media = {
        status: 'READY',
        originalUrl: url
      };

      if (title) {
        media.title = { text: title };
      }

      if (description) {
        media.description = { text: description };
      }

      if (imageUrl) {
        media.thumbnails = [{ url: imageUrl }];
      }

      const response = await axios.post(
        `${this.baseUrl}/ugcPosts`,
        {
          author,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: {
                text
              },
              shareMediaCategory: 'ARTICLE',
              media: [media]
            }
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0'
          }
        }
      );

      console.log('[LinkedIn] ✅ Link post created:', response.data.id);
      return response.data;
    } catch (error) {
      console.error('[LinkedIn] ❌ Link post failed:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get post statistics (likes, comments, shares)
   */
  async getPostStats(postId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/socialActions/${postId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      console.log('[LinkedIn] ✅ Post stats retrieved');
      return response.data;
    } catch (error) {
      console.error('[LinkedIn] ❌ Failed to get post stats:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Test connection to LinkedIn API
   */
  async testConnection() {
    try {
      console.log('[LinkedIn] Testing connection...');

      if (!this.accessToken) {
        throw new Error('No access token set. Call setAccessToken() or getAccessToken() first.');
      }

      const profile = await this.getProfile();

      return {
        success: true,
        message: 'LinkedIn connection successful',
        user: {
          name: `${profile.localizedFirstName} ${profile.localizedLastName}`,
          id: profile.id
        }
      };
    } catch (error) {
      return {
        success: false,
        message: 'LinkedIn connection failed',
        error: error.message
      };
    }
  }
}

module.exports = new LinkedInService();
