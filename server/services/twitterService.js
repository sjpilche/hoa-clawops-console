const { TwitterApi } = require('twitter-api-v2');

class TwitterService {
  constructor() {
    this.client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_SECRET,
    });

    // Read-write client for posting
    this.rwClient = this.client.readWrite;
  }

  /**
   * Test connection to Twitter API
   */
  async testConnection() {
    try {
      console.log('[Twitter] Testing connection...');

      const user = await this.rwClient.v2.me();

      return {
        success: true,
        message: 'Twitter connection successful',
        user: {
          name: user.data.name,
          username: user.data.username,
          id: user.data.id
        }
      };
    } catch (error) {
      return {
        success: false,
        message: 'Twitter connection failed',
        error: error.message
      };
    }
  }

  /**
   * Post a single tweet
   * @param {string} text - Tweet text (max 280 characters)
   */
  async postTweet(text) {
    try {
      if (text.length > 280) {
        throw new Error(`Tweet too long: ${text.length} characters (max 280)`);
      }

      const tweet = await this.rwClient.v2.tweet(text);

      console.log('[Twitter] ✅ Tweet posted:', tweet.data.id);
      return {
        success: true,
        tweetId: tweet.data.id,
        text: tweet.data.text,
        url: `https://twitter.com/i/web/status/${tweet.data.id}`
      };
    } catch (error) {
      console.error('[Twitter] ❌ Tweet failed:', error.message);
      throw error;
    }
  }

  /**
   * Post a thread (multiple tweets)
   * @param {string[]} tweets - Array of tweet texts
   */
  async postThread(tweets) {
    try {
      if (!Array.isArray(tweets) || tweets.length === 0) {
        throw new Error('Tweets must be a non-empty array');
      }

      console.log(`[Twitter] Posting thread of ${tweets.length} tweets...`);

      const results = [];
      let previousTweetId = null;

      for (let i = 0; i < tweets.length; i++) {
        const text = tweets[i];

        if (text.length > 280) {
          throw new Error(`Tweet ${i + 1} too long: ${text.length} characters (max 280)`);
        }

        const tweetData = { text };

        // Reply to previous tweet if this is part of a thread
        if (previousTweetId) {
          tweetData.reply = { in_reply_to_tweet_id: previousTweetId };
        }

        const tweet = await this.rwClient.v2.tweet(tweetData);
        previousTweetId = tweet.data.id;

        results.push({
          tweetId: tweet.data.id,
          text: tweet.data.text,
          url: `https://twitter.com/i/web/status/${tweet.data.id}`
        });

        console.log(`[Twitter] ✅ Tweet ${i + 1}/${tweets.length} posted:`, tweet.data.id);

        // Wait a bit between tweets to avoid rate limits
        if (i < tweets.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      return {
        success: true,
        threadLength: results.length,
        tweets: results,
        threadUrl: results[0].url
      };
    } catch (error) {
      console.error('[Twitter] ❌ Thread failed:', error.message);
      throw error;
    }
  }

  /**
   * Search for tweets
   * @param {string} query - Search query
   * @param {number} maxResults - Max number of results (default 10, max 100)
   */
  async searchTweets(query, maxResults = 10) {
    try {
      const tweets = await this.rwClient.v2.search(query, {
        max_results: Math.min(maxResults, 100),
        'tweet.fields': ['created_at', 'public_metrics', 'author_id']
      });

      console.log('[Twitter] ✅ Search completed:', tweets.data?.data?.length || 0, 'results');

      return {
        success: true,
        count: tweets.data?.data?.length || 0,
        tweets: tweets.data?.data || []
      };
    } catch (error) {
      console.error('[Twitter] ❌ Search failed:', error.message);
      throw error;
    }
  }

  /**
   * Get authenticated user's profile
   */
  async getProfile() {
    try {
      const user = await this.rwClient.v2.me({
        'user.fields': ['created_at', 'description', 'public_metrics', 'profile_image_url']
      });

      console.log('[Twitter] ✅ Profile retrieved:', user.data.username);
      return user.data;
    } catch (error) {
      console.error('[Twitter] ❌ Failed to get profile:', error.message);
      throw error;
    }
  }

  /**
   * Get mentions (tweets mentioning the authenticated user)
   * @param {number} maxResults - Max number of results (default 10)
   */
  async getMentions(maxResults = 10) {
    try {
      const user = await this.rwClient.v2.me();
      const mentions = await this.rwClient.v2.userMentionTimeline(user.data.id, {
        max_results: Math.min(maxResults, 100),
        'tweet.fields': ['created_at', 'author_id']
      });

      console.log('[Twitter] ✅ Mentions retrieved:', mentions.data?.data?.length || 0);

      return {
        success: true,
        count: mentions.data?.data?.length || 0,
        mentions: mentions.data?.data || []
      };
    } catch (error) {
      console.error('[Twitter] ❌ Failed to get mentions:', error.message);
      throw error;
    }
  }

  /**
   * Delete a tweet
   * @param {string} tweetId - ID of tweet to delete
   */
  async deleteTweet(tweetId) {
    try {
      await this.rwClient.v2.deleteTweet(tweetId);

      console.log('[Twitter] ✅ Tweet deleted:', tweetId);
      return {
        success: true,
        tweetId
      };
    } catch (error) {
      console.error('[Twitter] ❌ Delete failed:', error.message);
      throw error;
    }
  }
}

module.exports = new TwitterService();
