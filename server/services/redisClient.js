// ==============================================================================
// Redis Client Service — Distributed state management for agent fleet
// ==============================================================================
// Provides workflow state management, task queuing, pub/sub coordination,
// and agent heartbeat tracking for the HOA funding agent fleet.

const redis = require('redis');
const { EventEmitter } = require('events');

class RedisClient extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.subscriber = null;
    this.publisher = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
  }

  /**
   * Connect to Redis server
   * Creates three clients: main, subscriber, and publisher
   */
  async connect() {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      const redisPassword = process.env.REDIS_PASSWORD;

      const config = {
        url: redisUrl,
        password: redisPassword,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > this.maxReconnectAttempts) {
              console.error('[Redis] Max reconnect attempts reached');
              return new Error('Redis connection failed');
            }
            // Exponential backoff: 50ms, 100ms, 200ms, etc.
            return Math.min(retries * 50, 3000);
          }
        }
      };

      // Main client for general operations
      this.client = redis.createClient(config);
      this.client.on('error', (err) => this.handleError('client', err));
      this.client.on('connect', () => console.log('[Redis] Main client connected'));
      this.client.on('ready', () => this.emit('ready'));

      // Subscriber client for pub/sub
      this.subscriber = this.client.duplicate();
      this.subscriber.on('error', (err) => this.handleError('subscriber', err));
      this.subscriber.on('connect', () => console.log('[Redis] Subscriber connected'));

      // Publisher client for pub/sub
      this.publisher = this.client.duplicate();
      this.publisher.on('error', (err) => this.handleError('publisher', err));
      this.publisher.on('connect', () => console.log('[Redis] Publisher connected'));

      // Connect all clients
      await Promise.all([
        this.client.connect(),
        this.subscriber.connect(),
        this.publisher.connect()
      ]);

      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log('[Redis] All clients connected successfully');

      return true;
    } catch (error) {
      console.error('[Redis] Connection failed:', error.message);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect() {
    try {
      if (this.client) await this.client.quit();
      if (this.subscriber) await this.subscriber.quit();
      if (this.publisher) await this.publisher.quit();

      this.isConnected = false;
      console.log('[Redis] Disconnected');
    } catch (error) {
      console.error('[Redis] Disconnect error:', error.message);
    }
  }

  /**
   * Handle Redis errors
   */
  handleError(clientType, error) {
    console.error(`[Redis] ${clientType} error:`, error.message);
    this.emit('error', { clientType, error });
  }

  // ==========================================================================
  // WORKFLOW STATE MANAGEMENT
  // ==========================================================================

  /**
   * Set workflow state (creates or updates)
   * @param {string} workflowId - Workflow UUID
   * @param {Object} state - State object to store
   */
  async setWorkflowState(workflowId, state) {
    if (!this.isConnected) throw new Error('Redis not connected');

    const key = `workflow:${workflowId}`;
    const stateWithTimestamp = {
      ...state,
      updated_at: new Date().toISOString()
    };

    await this.client.hSet(key, this.flattenObject(stateWithTimestamp));

    // Set TTL: 7 days (workflows auto-expire after completion)
    await this.client.expire(key, 7 * 24 * 60 * 60);

    console.log(`[Redis] Workflow state set: ${workflowId}`);
  }

  /**
   * Get workflow state
   * @param {string} workflowId - Workflow UUID
   * @returns {Object|null} Workflow state or null if not found
   */
  async getWorkflowState(workflowId) {
    if (!this.isConnected) throw new Error('Redis not connected');

    const key = `workflow:${workflowId}`;
    const state = await this.client.hGetAll(key);

    if (!state || Object.keys(state).length === 0) {
      return null;
    }

    return this.unflattenObject(state);
  }

  /**
   * Update specific workflow fields
   * @param {string} workflowId - Workflow UUID
   * @param {Object} updates - Fields to update
   */
  async updateWorkflowState(workflowId, updates) {
    if (!this.isConnected) throw new Error('Redis not connected');

    const key = `workflow:${workflowId}`;
    const updatesWithTimestamp = {
      ...updates,
      updated_at: new Date().toISOString()
    };

    await this.client.hSet(key, this.flattenObject(updatesWithTimestamp));
  }

  /**
   * Delete workflow state
   * @param {string} workflowId - Workflow UUID
   */
  async deleteWorkflowState(workflowId) {
    if (!this.isConnected) throw new Error('Redis not connected');

    const key = `workflow:${workflowId}`;
    await this.client.del(key);
    console.log(`[Redis] Workflow state deleted: ${workflowId}`);
  }

  // ==========================================================================
  // TASK QUEUE OPERATIONS
  // ==========================================================================

  /**
   * Push task to queue
   * @param {string} queueName - Queue name (e.g., 'lending-tasks')
   * @param {Object} task - Task object
   */
  async pushTask(queueName, task) {
    if (!this.isConnected) throw new Error('Redis not connected');

    const key = `queue:${queueName}`;
    const taskWithTimestamp = {
      ...task,
      queued_at: new Date().toISOString()
    };

    await this.client.lPush(key, JSON.stringify(taskWithTimestamp));
    console.log(`[Redis] Task pushed to ${queueName}`);
  }

  /**
   * Pop task from queue (blocking)
   * @param {string} queueName - Queue name
   * @param {number} timeout - Timeout in seconds (default: 30)
   * @returns {Object|null} Task object or null if timeout
   */
  async popTask(queueName, timeout = 30) {
    if (!this.isConnected) throw new Error('Redis not connected');

    const key = `queue:${queueName}`;
    const result = await this.client.brPop(key, timeout);

    if (!result) {
      return null;
    }

    const task = JSON.parse(result.element);
    console.log(`[Redis] Task popped from ${queueName}`);
    return task;
  }

  /**
   * Get queue length
   * @param {string} queueName - Queue name
   * @returns {number} Number of tasks in queue
   */
  async getQueueLength(queueName) {
    if (!this.isConnected) throw new Error('Redis not connected');

    const key = `queue:${queueName}`;
    return await this.client.lLen(key);
  }

  /**
   * Peek at queue without removing (non-blocking)
   * @param {string} queueName - Queue name
   * @param {number} count - Number of items to peek (default: 10)
   * @returns {Array} Array of tasks
   */
  async peekQueue(queueName, count = 10) {
    if (!this.isConnected) throw new Error('Redis not connected');

    const key = `queue:${queueName}`;
    const items = await this.client.lRange(key, 0, count - 1);
    return items.map(item => JSON.parse(item));
  }

  /**
   * Clear queue
   * @param {string} queueName - Queue name
   */
  async clearQueue(queueName) {
    if (!this.isConnected) throw new Error('Redis not connected');

    const key = `queue:${queueName}`;
    await this.client.del(key);
    console.log(`[Redis] Queue cleared: ${queueName}`);
  }

  // ==========================================================================
  // PUB/SUB FOR REAL-TIME COORDINATION
  // ==========================================================================

  /**
   * Publish message to channel
   * @param {string} channel - Channel name
   * @param {Object} message - Message object
   */
  async publish(channel, message) {
    if (!this.isConnected) throw new Error('Redis not connected');

    const messageWithTimestamp = {
      ...message,
      published_at: new Date().toISOString()
    };

    await this.publisher.publish(channel, JSON.stringify(messageWithTimestamp));
    console.log(`[Redis] Published to ${channel}`);
  }

  /**
   * Subscribe to channel
   * @param {string} channel - Channel name
   * @param {Function} handler - Message handler function
   */
  async subscribe(channel, handler) {
    if (!this.isConnected) throw new Error('Redis not connected');

    await this.subscriber.subscribe(channel, (message) => {
      try {
        const parsed = JSON.parse(message);
        handler(parsed);
      } catch (error) {
        console.error(`[Redis] Error parsing message from ${channel}:`, error);
        handler(message); // Pass raw message if JSON parse fails
      }
    });

    console.log(`[Redis] Subscribed to ${channel}`);
  }

  /**
   * Unsubscribe from channel
   * @param {string} channel - Channel name
   */
  async unsubscribe(channel) {
    if (!this.isConnected) throw new Error('Redis not connected');

    await this.subscriber.unsubscribe(channel);
    console.log(`[Redis] Unsubscribed from ${channel}`);
  }

  /**
   * Pattern subscribe (e.g., 'workflow:*')
   * @param {string} pattern - Pattern to match
   * @param {Function} handler - Message handler function
   */
  async pSubscribe(pattern, handler) {
    if (!this.isConnected) throw new Error('Redis not connected');

    await this.subscriber.pSubscribe(pattern, (message, channel) => {
      try {
        const parsed = JSON.parse(message);
        handler(parsed, channel);
      } catch (error) {
        console.error(`[Redis] Error parsing message from ${channel}:`, error);
        handler(message, channel);
      }
    });

    console.log(`[Redis] Pattern subscribed: ${pattern}`);
  }

  // ==========================================================================
  // AGENT HEARTBEAT TRACKING
  // ==========================================================================

  /**
   * Set agent status with TTL
   * @param {string} agentId - Agent UUID
   * @param {string} status - Status ('running', 'idle', 'error')
   * @param {number} ttl - Time to live in seconds (default: 300)
   */
  async setAgentStatus(agentId, status, ttl = 300) {
    if (!this.isConnected) throw new Error('Redis not connected');

    const key = `agent:${agentId}:status`;
    const statusData = {
      status,
      updated_at: new Date().toISOString()
    };

    await this.client.set(key, JSON.stringify(statusData), { EX: ttl });
  }

  /**
   * Get agent status
   * @param {string} agentId - Agent UUID
   * @returns {Object|null} Status object or null if expired/not found
   */
  async getAgentStatus(agentId) {
    if (!this.isConnected) throw new Error('Redis not connected');

    const key = `agent:${agentId}:status`;
    const data = await this.client.get(key);

    if (!data) {
      return null;
    }

    return JSON.parse(data);
  }

  /**
   * Get all active agents
   * @returns {Array} Array of agent IDs with active status
   */
  async getActiveAgents() {
    if (!this.isConnected) throw new Error('Redis not connected');

    const keys = await this.client.keys('agent:*:status');
    const activeAgents = [];

    for (const key of keys) {
      const data = await this.client.get(key);
      if (data) {
        const agentId = key.split(':')[1];
        const statusData = JSON.parse(data);
        activeAgents.push({ agentId, ...statusData });
      }
    }

    return activeAgents;
  }

  /**
   * Clear agent status (when agent stops)
   * @param {string} agentId - Agent UUID
   */
  async clearAgentStatus(agentId) {
    if (!this.isConnected) throw new Error('Redis not connected');

    const key = `agent:${agentId}:status`;
    await this.client.del(key);
  }

  // ==========================================================================
  // CACHING UTILITIES
  // ==========================================================================

  /**
   * Set cache value with TTL
   * @param {string} key - Cache key
   * @param {*} value - Value to cache (will be JSON stringified)
   * @param {number} ttl - Time to live in seconds (default: 3600)
   */
  async setCache(key, value, ttl = 3600) {
    if (!this.isConnected) throw new Error('Redis not connected');

    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    await this.client.set(`cache:${key}`, serialized, { EX: ttl });
  }

  /**
   * Get cache value
   * @param {string} key - Cache key
   * @returns {*} Cached value or null
   */
  async getCache(key) {
    if (!this.isConnected) throw new Error('Redis not connected');

    const data = await this.client.get(`cache:${key}`);

    if (!data) {
      return null;
    }

    try {
      return JSON.parse(data);
    } catch {
      return data; // Return raw string if not JSON
    }
  }

  /**
   * Delete cache value
   * @param {string} key - Cache key
   */
  async deleteCache(key) {
    if (!this.isConnected) throw new Error('Redis not connected');

    await this.client.del(`cache:${key}`);
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Flatten object for Redis hash storage
   * @param {Object} obj - Object to flatten
   * @returns {Object} Flattened object
   */
  flattenObject(obj) {
    const flattened = {};

    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        continue;
      }

      if (typeof value === 'object' && !Array.isArray(value)) {
        flattened[key] = JSON.stringify(value);
      } else if (Array.isArray(value)) {
        flattened[key] = JSON.stringify(value);
      } else {
        flattened[key] = String(value);
      }
    }

    return flattened;
  }

  /**
   * Unflatten object from Redis hash
   * @param {Object} obj - Flattened object
   * @returns {Object} Unflattened object
   */
  unflattenObject(obj) {
    const unflattened = {};

    for (const [key, value] of Object.entries(obj)) {
      try {
        // Try to parse as JSON (for objects/arrays)
        unflattened[key] = JSON.parse(value);
      } catch {
        // If not JSON, keep as string (or convert to number if possible)
        const num = Number(value);
        unflattened[key] = isNaN(num) ? value : num;
      }
    }

    return unflattened;
  }

  /**
   * Health check
   * @returns {Object} Health status
   */
  async healthCheck() {
    try {
      if (!this.isConnected) {
        return { healthy: false, message: 'Not connected' };
      }

      await this.client.ping();

      return {
        healthy: true,
        connected: this.isConnected,
        message: 'Redis operational'
      };
    } catch (error) {
      return {
        healthy: false,
        connected: false,
        message: error.message
      };
    }
  }

  /**
   * Get Redis info
   * @returns {Object} Redis server info
   */
  async getInfo() {
    if (!this.isConnected) throw new Error('Redis not connected');

    const info = await this.client.info();
    return this.parseRedisInfo(info);
  }

  /**
   * Parse Redis INFO command output
   * @param {string} infoString - Raw INFO output
   * @returns {Object} Parsed info
   */
  parseRedisInfo(infoString) {
    const lines = infoString.split('\r\n');
    const info = {};
    let section = null;

    for (const line of lines) {
      if (line.startsWith('#')) {
        section = line.substring(2).toLowerCase();
        info[section] = {};
      } else if (line.includes(':')) {
        const [key, value] = line.split(':');
        if (section) {
          info[section][key] = value;
        }
      }
    }

    return info;
  }
}

// Export singleton instance
const redisClient = new RedisClient();

module.exports = redisClient;
