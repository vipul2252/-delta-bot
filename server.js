// server.js - Personal Delta Bot
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, { 
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Delta Exchange API
class DeltaAPI {
  constructor(apiKey, apiSecret) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseURL = 'https://api.delta.exchange';
  }

  generateSignature(method, endpoint, payload = '') {
    const timestamp = Math.floor(Date.now() / 1000);
    const signatureData = method + timestamp + endpoint + payload;
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(signatureData)
      .digest('hex');
    return { signature, timestamp };
  }

  getHeaders(method, endpoint, payload = '') {
    const { signature, timestamp } = this.generateSignature(method, endpoint, payload);
    return {
      'api-key': this.apiKey,
      'timestamp': timestamp,
      'signature': signature,
      'Content-Type': 'application/json'
    };
  }

  async getPositions() {
    const endpoint = '/v2/positions';
    const headers = this.getHeaders('GET', endpoint);
    try {
      const response = await axios.get(this.baseURL + endpoint, { 
        headers, 
        timeout: 10000 
      });
      return response.data.result || [];
    } catch (error) {
      console.error('Error fetching positions:', error.message);
      return null;
    }
  }

  async placeFutureOrder(productId, size, side) {
    const endpoint = '/v2/orders';
    const data = {
      product_id: productId,
      size: Math.abs(size),
      side: side,
      order_type: 'market_order',
      time_in_force: 'ioc'
    };
    const payload = JSON.stringify(data);
    const headers = this.getHeaders('POST', endpoint, payload);
    
    try {
      const response = await axios.post(this.baseURL + endpoint, data, { 
        headers, 
        timeout: 10000 
      });
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Error placing order:', error.message);
      return { success: false, error: error.message };
    }
  }
}

// Trading Bot
class TradingBot {
  constructor(io) {
    this.io = io;
    this.api = new DeltaAPI(
      process.env.DELTA_API_KEY,
      process.env.DELTA_API_SECRET
    );
    
    this.status = 'stopped';
    this.currentDelta = 0;
    this.ethValue = 0;
    this.totalTrades = 0;
    this.lastCheck = null;
    
    this.settings = {
      deltaThreshold: parseFloat(process.env.DELTA_THRESHOLD || 0.15),
      checkInterval: parseInt(process.env.CHECK_INTERVAL || 60000),
      minHedgeSize: parseFloat(process.env.MIN_HEDGE_SIZE || 0.01),
      ethFutureProductId: parseInt(process.env.ETH_FUTURE_PRODUCT_ID || 27)
    };
    
    this.deltaHistory = [];
    this.trades = [];
    this.logs = [];
    this.interval = null;
  }

  start() {
    if (this.status === 'running') return;
    this.status = 'running';
    this.log('INFO', '🚀 Personal bot started');
    
    this.interval = setInterval(() => {
      this.checkAndHedge();
    }, this.settings.checkInterval);
    
    this.checkAndHedge();
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.status = 'stopped';
    this.log('INFO', '🛑 Bot stopped');
  }

  async checkAndHedge() {
    try {
      this.log('INFO', '🔍 Checking positions...');
      
      const positions = await this.api.getPositions();
      
      if (!positions || positions.length === 0) {
        this.log('INFO', '📭 No open positions');
        return;
      }

      const deltaInfo = this.calculatePortfolioDelta(positions);
      
      this.currentDelta = deltaInfo.deltaPercentage;
      this.ethValue = deltaInfo.ethValue;
      this.lastCheck = new Date();

      this.deltaHistory.push({
        deltaPercentage: this.currentDelta,
        totalDelta: deltaInfo.totalDelta,
        ethValue: this.ethValue,
        positionsCount: positions.length,
        createdAt: new Date()
      });
      if (this.deltaHistory.length > 100) this.deltaHistory.shift();

      this.log('INFO', `📊 Delta: ${(this.currentDelta * 100).toFixed(2)}%, ETH: $${this.ethValue.toFixed(2)}`);

      this.io.emit('deltaUpdate', {
        delta: this.currentDelta,
        ethValue: this.ethValue,
        lastCheck: this.lastCheck
      });

      if (Math.abs(this.currentDelta) >= this.settings.deltaThreshold) {
        await this.executeHedge(deltaInfo.totalDelta);
      } else {
        this.log('INFO', `✅ Delta within range (${(this.currentDelta * 100).toFixed(2)}%)`);
      }

    } catch (error) {
      this.log('ERROR', `❌ Error: ${error.message}`);
    }
  }

  calculatePortfolioDelta(positions) {
    let totalDelta = 0;
    let ethValue = 0;

    positions.forEach(position => {
      const size = position.size || 0;
      const delta = position.delta || 0;
      const productType = position.product?.product_type || '';
      const markPrice = position.mark_price || 0;

      let positionDelta = 0;
      
      if (productType === 'future') {
        positionDelta = size;
      } else if (['call_options', 'put_options'].includes(productType)) {
        positionDelta = size * delta;
      }

      totalDelta += positionDelta;
      ethValue += Math.abs(size) * markPrice;
    });

    const deltaPercentage = ethValue > 0 ? totalDelta / ethValue : 0;
    return { deltaPercentage, totalDelta, ethValue };
  }

  async executeHedge(currentDelta) {
    const hedgeSize = -currentDelta;

    if (Math.abs(hedgeSize) < this.settings.minHedgeSize) {
      this.log('INFO', `⏭️ Hedge size too small (${Math.abs(hedgeSize).toFixed(4)})`);
      return;
    }

    const side = hedgeSize > 0 ? 'buy' : 'sell';

    this.log('WARNING', `⚠️ Delta threshold breached! (${(currentDelta * 100).toFixed(2)}%)`);
    this.log('INFO', `🔄 Executing hedge: ${side.toUpperCase()} ${Math.abs(hedgeSize).toFixed(4)} contracts`);

    try {
      const order = await this.api.placeFutureOrder(
        this.settings.ethFutureProductId,
        Math.abs(hedgeSize),
        side
      );

      if (order && order.success) {
        this.log('INFO', '✅ Hedge successful!');
        
        this.totalTrades++;

        this.trades.unshift({
          side,
          hedgeSize,
          currentDelta,
          orderResponse: order,
          createdAt: new Date()
        });
        if (this.trades.length > 50) this.trades.pop();

        this.io.emit('tradeExecuted', {
          side,
          size: Math.abs(hedgeSize),
          deltaBefore: currentDelta,
          totalTrades: this.totalTrades
        });

      } else {
        this.log('ERROR', '❌ Hedge failed!');
      }

    } catch (error) {
      this.log('ERROR', `❌ Hedge error: ${error.message}`);
    }
  }

  log(level, message) {
    const logEntry = {
      level,
      message,
      createdAt: new Date()
    };
    
    console.log(`[${level}] ${message}`);
    
    this.logs.unshift(logEntry);
    if (this.logs.length > 200) this.logs.pop();
    
    this.io.emit('log', { level, message, time: new Date() });
  }

  updateSettings(newSettings) {
    if (newSettings.deltaThreshold) {
      this.settings.deltaThreshold = newSettings.deltaThreshold;
    }
    if (newSettings.checkInterval) {
      this.settings.checkInterval = newSettings.checkInterval;
      if (this.status === 'running') {
        this.stop();
        this.start();
      }
    }
    if (newSettings.minHedgeSize) {
      this.settings.minHedgeSize = newSettings.minHedgeSize;
    }
    this.log('INFO', '⚙️ Settings updated');
  }

  getRecentTrades(limit = 50) {
    return this.trades.slice(0, limit);
  }

  getDeltaHistory(limit = 100) {
    return this.deltaHistory.slice(-limit);
  }

  getRecentLogs(limit = 200) {
    return this.logs.slice(0, limit);
  }
}

// Initialize Bot
const bot = new TradingBot(io);

// API Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/api/status', (req, res) => {
  res.json({
    status: bot.status,
    currentDelta: bot.currentDelta,
    ethValue: bot.ethValue,
    totalTrades: bot.totalTrades,
    lastCheck: bot.lastCheck,
    settings: bot.settings
  });
});

app.get('/api/trades', (req, res) => {
  res.json(bot.getRecentTrades(50));
});

app.get('/api/delta-history', (req, res) => {
  res.json(bot.getDeltaHistory(100));
});

app.get('/api/logs', (req, res) => {
  res.json(bot.getRecentLogs(200));
});

app.post('/api/bot/start', (req, res) => {
  bot.start();
  res.json({ success: true, status: 'running' });
});

app.post('/api/bot/stop', (req, res) => {
  bot.stop();
  res.json({ success: true, status: 'stopped' });
});

app.post('/api/settings', (req, res) => {
  bot.updateSettings(req.body);
  res.json({ success: true, settings: bot.settings });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    botStatus: bot.status,
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// WebSocket
io.on('connection', (socket) => {
  console.log('✅ Client connected');
  
  socket.emit('status', {
    status: bot.status,
    currentDelta: bot.currentDelta,
    ethValue: bot.ethValue,
    totalTrades: bot.totalTrades
  });
  
  socket.on('disconnect', () => {
    console.log('❌ Client disconnected');
  });
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log(`🚀 Personal Delta Trading Bot`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔧 API: http://localhost:${PORT}/api/status`);
  console.log(`💚 Health: http://localhost:${PORT}/health`);
  console.log('='.repeat(60));
  
  // Auto-start bot
  bot.start();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  bot.stop();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});