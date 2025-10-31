// app.js - Personal Delta Bot Frontend
const API_URL = window.location.origin;
const socket = io(API_URL);

let botStatus = 'stopped';
let chartInstance = null;

// DOM Elements
const toggleBotBtn = document.getElementById('toggleBot');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const saveSettingsBtn = document.getElementById('saveSettings');
const closeModal = document.querySelector('.close');
const connectionStatus = document.getElementById('connectionStatus');
const clearLogsBtn = document.getElementById('clearLogs');

// Toast notification
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Initializing Delta Bot Dashboard...');
  initChart();
  loadInitialData();
  setupEventListeners();
  setupSocketListeners();
});

// Setup Event Listeners
function setupEventListeners() {
  toggleBotBtn.addEventListener('click', toggleBot);
  settingsBtn.addEventListener('click', () => settingsModal.classList.add('active'));
  closeModal.addEventListener('click', () => settingsModal.classList.remove('active'));
  saveSettingsBtn.addEventListener('click', saveSettings);
  
  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', clearLogs);
  }
  
  window.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.classList.remove('active');
    }
  });
}

// Setup Socket Listeners
function setupSocketListeners() {
  socket.on('connect', () => {
    console.log('✅ Connected to server');
    connectionStatus.textContent = '🟢 Connected';
    connectionStatus.classList.add('connected');
    showToast('Connected to server', 'success');
  });

  socket.on('deltaUpdate', (data) => {
    updateDelta(data.delta, data.ethValue, data.lastCheck);
    updateChartRealtime(data.delta);
  });

  socket.on('tradeExecuted', (data) => {
    addTrade(data);
    updateTotalTrades(data.totalTrades);
    showToast(`✅ Hedge executed: ${data.side.toUpperCase()} ${data.size.toFixed(2)}`, 'success');
  });

  socket.on('log', (data) => {
    addLog(data.level, data.message);
  });

  socket.on('status', (data) => {
    updateStatus(data);
  });

  socket.on('disconnect', () => {
    console.log('❌ Disconnected from server');
    connectionStatus.textContent = '🔴 Disconnected';
    connectionStatus.classList.remove('connected');
    showToast('Disconnected from server', 'error');
  });
}

// Load Initial Data
async function loadInitialData() {
  try {
    const [status, trades, history, logs] = await Promise.all([
      fetch(`${API_URL}/api/status`).then(r => r.json()),
      fetch(`${API_URL}/api/trades`).then(r => r.json()),
      fetch(`${API_URL}/api/delta-history`).then(r => r.json()),
      fetch(`${API_URL}/api/logs`).then(r => r.json())
    ]);

    updateStatus(status);
    displayTrades(trades);
    updateChart(history);
    displayLogs(logs);
    
    // Update settings display
    if (status.settings) {
      document.getElementById('deltaThreshold').value = status.settings.deltaThreshold * 100;
      document.getElementById('checkInterval').value = status.settings.checkInterval / 1000;
      document.getElementById('minHedgeSize').value = status.settings.minHedgeSize;
      document.getElementById('deltaThresholdDisplay').textContent = 
        `Threshold: ±${(status.settings.deltaThreshold * 100).toFixed(1)}%`;
    }
    
    console.log('✅ Initial data loaded');
  } catch (error) {
    console.error('Error loading data:', error);
    showToast('Failed to load data', 'error');
  }
}

// Update Status
function updateStatus(data) {
  botStatus = data.status;
  
  document.getElementById('botStatus').textContent = data.status.toUpperCase();
  document.getElementById('currentDelta').textContent = `${(data.currentDelta * 100).toFixed(2)}%`;
  document.getElementById('ethValue').textContent = `$${data.ethValue.toLocaleString(undefined, {maximumFractionDigits: 0})}`;
  document.getElementById('totalTrades').textContent = data.totalTrades;
  
  if (data.lastCheck) {
    document.getElementById('lastCheck').textContent = 
      `Last check: ${new Date(data.lastCheck).toLocaleTimeString()}`;
  }
  
  const deltaEl = document.getElementById('currentDelta');
  deltaEl.classList.remove('positive', 'negative');
  deltaEl.classList.add(data.currentDelta >= 0 ? 'positive' : 'negative');
  
  // Update button
  const icon = toggleBotBtn.querySelector('.icon');
  if (botStatus === 'running') {
    toggleBotBtn.className = 'btn btn-danger';
    toggleBotBtn.innerHTML = '<span class="icon">⏸️</span> Stop Bot';
  } else {
    toggleBotBtn.className = 'btn btn-success';
    toggleBotBtn.innerHTML = '<span class="icon">▶️</span> Start Bot';
  }
}

// Toggle Bot
async function toggleBot() {
  try {
    const endpoint = botStatus === 'running' ? '/api/bot/stop' : '/api/bot/start';
    const response = await fetch(`${API_URL}${endpoint}`, { method: 'POST' });
    const data = await response.json();
    
    botStatus = data.status;
    
    if (botStatus === 'running') {
      toggleBotBtn.className = 'btn btn-danger';
      toggleBotBtn.innerHTML = '<span class="icon">⏸️</span> Stop Bot';
    } else {
      toggleBotBtn.className = 'btn btn-success';
      toggleBotBtn.innerHTML = '<span class="icon">▶️</span> Start Bot';
    }
    
    document.getElementById('botStatus').textContent = botStatus.toUpperCase();
    
    showToast(`Bot ${botStatus}`, botStatus === 'running' ? 'success' : 'info');
  } catch (error) {
    console.error('Error toggling bot:', error);
    showToast('Failed to toggle bot', 'error');
  }
}

// Save Settings
async function saveSettings() {
  const settings = {
    deltaThreshold: parseFloat(document.getElementById('deltaThreshold').value) / 100,
    checkInterval: parseInt(document.getElementById('checkInterval').value) * 1000,
    minHedgeSize: parseFloat(document.getElementById('minHedgeSize').value)
  };

  try {
    await fetch(`${API_URL}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });

    settingsModal.classList.remove('active');
    document.getElementById('deltaThresholdDisplay').textContent = 
      `Threshold: ±${(settings.deltaThreshold * 100).toFixed(1)}%`;
    
    showToast('✅ Settings saved successfully', 'success');
    
    // Update chart threshold lines
    if (chartInstance) {
      updateChartThresholds(settings.deltaThreshold * 100);
    }
  } catch (error) {
    console.error('Error saving settings:', error);
    showToast('Failed to save settings', 'error');
  }
}

// Update Delta
function updateDelta(delta, ethValue, lastCheck) {
  document.getElementById('currentDelta').textContent = `${(delta * 100).toFixed(2)}%`;
  document.getElementById('ethValue').textContent = `$${ethValue.toLocaleString(undefined, {maximumFractionDigits: 0})}`;
  document.getElementById('lastCheck').textContent = 
    `Last check: ${new Date(lastCheck).toLocaleTimeString()}`;
  
  const deltaEl = document.getElementById('currentDelta');
  deltaEl.classList.remove('positive', 'negative');
  deltaEl.classList.add(delta >= 0 ? 'positive' : 'negative');
}

// Display Trades
function displayTrades(trades) {
  const tbody = document.getElementById('tradesBody');
  
  if (trades.length === 0) {
    tbody.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <p>No trades yet</p>
        <small>Trades will appear here when bot executes hedges</small>
      </div>
    `;
    document.getElementById('tradeCount').textContent = '0 trades';
    return;
  }

  document.getElementById('tradeCount').textContent = `${trades.length} trades`;
  
  tbody.innerHTML = trades.slice(0, 20).map(trade => `
    <div class="trade-item">
      <div class="trade-header">
        <span class="trade-side ${trade.side}">${trade.side}</span>
        <span class="trade-time">${new Date(trade.createdAt).toLocaleTimeString()}</span>
      </div>
      <div class="trade-details">
        <div class="trade-detail">
          <span class="trade-detail-label">Size:</span>
          <span class="trade-detail-value">${Math.abs(trade.hedgeSize).toFixed(4)} ETH</span>
        </div>
        <div class="trade-detail">
          <span class="trade-detail-label">Delta Before:</span>
          <span class="trade-detail-value ${trade.currentDelta >= 0 ? 'positive' : 'negative'}">
            ${(trade.currentDelta * 100).toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  `).join('');
}

// Add Trade
function addTrade(trade) {
  const tbody = document.getElementById('tradesBody');
  
  // Remove empty state if exists
  const emptyState = tbody.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }
  
  const tradeHtml = `
    <div class="trade-item">
      <div class="trade-header">
        <span class="trade-side ${trade.side}">${trade.side}</span>
        <span class="trade-time">${new Date().toLocaleTimeString()}</span>
      </div>
      <div class="trade-details">
        <div class="trade-detail">
          <span class="trade-detail-label">Size:</span>
          <span class="trade-detail-value">${trade.size.toFixed(4)} ETH</span>
        </div>
        <div class="trade-detail">
          <span class="trade-detail-label">Delta Before:</span>
          <span class="trade-detail-value ${trade.deltaBefore >= 0 ? 'positive' : 'negative'}">
            ${(trade.deltaBefore * 100).toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  `;
  
  tbody.insertAdjacentHTML('afterbegin', tradeHtml);
  
  // Keep only last 20 trades
  const items = tbody.querySelectorAll('.trade-item');
  if (items.length > 20) {
    items[items.length - 1].remove();
  }
  
  // Update count
  document.getElementById('tradeCount').textContent = `${items.length} trades`;
}

// Update Total Trades
function updateTotalTrades(total) {
  document.getElementById('totalTrades').textContent = total;
}

// Display Logs
function displayLogs(logs) {
  const logsBody = document.getElementById('logsBody');
  
  if (logs.length === 0) {
    logsBody.innerHTML = `
      <div class="log-item info">
        <span class="log-time">--:--:--</span>
        <span class="log-level">INFO</span>
        <span class="log-message">No activity yet</span>
      </div>
    `;
    return;
  }
  
  logsBody.innerHTML = logs.slice(0, 50).map(log => `
    <div class="log-item ${log.level.toLowerCase()}">
      <span class="log-time">${new Date(log.createdAt).toLocaleTimeString()}</span>
      <span class="log-level">${log.level}</span>
      <span class="log-message">${escapeHtml(log.message)}</span>
    </div>
  `).join('');
}

// Add Log
function addLog(level, message) {
  const logsBody = document.getElementById('logsBody');
  
  const logHtml = `
    <div class="log-item ${level.toLowerCase()}">
      <span class="log-time">${new Date().toLocaleTimeString()}</span>
      <span class="log-level">${level}</span>
      <span class="log-message">${escapeHtml(message)}</span>
    </div>
  `;
  
  logsBody.insertAdjacentHTML('afterbegin', logHtml);
  
  // Keep only last 50 logs
  const items = logsBody.querySelectorAll('.log-item');
  if (items.length > 50) {
    items[items.length - 1].remove();
  }
}

// Clear Logs
function clearLogs() {
  const logsBody = document.getElementById('logsBody');
  logsBody.innerHTML = `
    <div class="log-item info">
      <span class="log-time">${new Date().toLocaleTimeString()}</span>
      <span class="log-level">INFO</span>
      <span class="log-message">Logs cleared</span>
    </div>
  `;
  showToast('Logs cleared', 'info');
}

// Initialize Chart
function initChart() {
  const ctx = document.getElementById('deltaChart').getContext('2d');
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Delta %',
        data: [],
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        tension: 0.4,
        fill: true,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 12,
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: '#8b5cf6',
          borderWidth: 1,
          displayColors: false,
          callbacks: {
            label: function(context) {
              return `Delta: ${context.parsed.y.toFixed(2)}%`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          grid: {
            color: 'rgba(0, 0, 0, 0.05)'
          },
          ticks: {
            callback: function(value) {
              return value.toFixed(1) + '%';
            },
            color: '#6b7280'
          }
        },
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: '#6b7280',
            maxRotation: 0
          }
        }
      }
    }
  });
}

// Update Chart
function updateChart(history) {
  if (!chartInstance) return;
  
  const labels = history.slice(0, 20).map(h => 
    new Date(h.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
  ).reverse();
  
  const data = history.slice(0, 20).map(h => 
    (h.deltaPercentage * 100)
  ).reverse();
  
  chartInstance.data.labels = labels;
  chartInstance.data.datasets[0].data = data;
  chartInstance.update();
}

// Update Chart Realtime
function updateChartRealtime(delta) {
  if (!chartInstance) return;
  
  const now = new Date();
  const timeLabel = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  
  chartInstance.data.labels.push(timeLabel);
  chartInstance.data.datasets[0].data.push(delta * 100);
  
  // Keep only last 20 points
  if (chartInstance.data.labels.length > 20) {
    chartInstance.data.labels.shift();
    chartInstance.data.datasets[0].data.shift();
  }
  
  chartInstance.update();
}

// Update Chart Thresholds
function updateChartThresholds(threshold) {
  if (!chartInstance) return;
  // You can add reference lines here if needed
  chartInstance.update();
}

// Escape HTML
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Auto refresh every 30 seconds
setInterval(() => {
  if (botStatus === 'running') {
    fetch(`${API_URL}/api/status`)
      .then(r => r.json())
      .then(data => {
        if (data.lastCheck) {
          document.getElementById('lastCheck').textContent = 
            `Last check: ${new Date(data.lastCheck).toLocaleTimeString()}`;
        }
      })
      .catch(err => console.error('Auto-refresh error:', err));
  }
}, 30000);

// Log page visibility changes
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    console.log('👁️ Page visible - refreshing data');
    loadInitialData();
  }
});

console.log('✅ Dashboard initialized');
```

---

## 🎉 **Complete! Ab ZIP Banao:**

### **Final Folder Structure:**
```
personal-delta-bot