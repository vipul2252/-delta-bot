# 🤖 Personal Delta Trading Bot

Your private delta hedging assistant for Delta Exchange.

## 🚀 Quick Deploy to Railway

1. Push this code to GitHub
2. Go to [Railway.app](https://railway.app)
3. Click "New Project" → "Deploy from GitHub"
4. Select this repository
5. Add environment variables (see below)
6. Deploy! ✅

## 🔐 Environment Variables

Add these in Railway dashboard:
```
DELTA_API_KEY=your_api_key_here
DELTA_API_SECRET=your_api_secret_here
ETH_FUTURE_PRODUCT_ID=27
DELTA_THRESHOLD=0.15
CHECK_INTERVAL=60000
MIN_HEDGE_SIZE=0.01
```

## 📊 Features

- ✅ Auto delta hedging (±15% threshold)
- ✅ Real-time dashboard
- ✅ Live charts & logs
- ✅ Trade history
- ✅ WebSocket updates
- ✅ No database needed
- ✅ Personal use optimized

## 💻 Local Development
```bash
# Install dependencies
npm install

# Create .env file with your credentials
cp .env.example .env

# Start bot
npm start

# Open browser
http://localhost:3000
```

## ⚙️ Configuration

- **Delta Threshold**: 15% (adjustable in dashboard)
- **Check Interval**: 60 seconds
- **Min Hedge Size**: 0.01 ETH

## 📱 Dashboard Access

Once deployed on Railway, you'll get a URL like:
```
https://your-bot.up.railway.app
```

## 💡 How It Works

1. Bot checks your positions every 60 seconds
2. Calculates portfolio delta
3. If delta exceeds ±15%, automatically hedges
4. Uses ETH futures for hedging
5. Shows real-time updates on dashboard

## 💰 Cost

- Railway: $5 free credit/month (sufficient)
- No database costs
- Total: **FREE** ✅

## ⚠️ Important

- For personal use only
- Data stored in memory (resets on restart)
- Monitor regularly
- Start with small amounts

## 📝 License

MIT
