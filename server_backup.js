const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const PORT = 3000;

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/temp/' });

app.use(express.static('.'));
app.use(express.json()); // Add JSON parsing middleware

// 📋 Get User Profile
app.get('/api/user/:email', (req, res) => {
  const safeEmail = encodeURIComponent(req.params.email);
  const userFile = path.join(__dirname, 'users', `${safeEmail}.json`);
  
  if (!fs.existsSync(userFile)) {
    return res.status(404).send({ error: "User not found." });
  }

  const user = JSON.parse(fs.readFileSync(userFile));
  res.json(user);
});

// 📝 Create New User
app.post('/api/signup', express.json(), (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).send({ error: "Name and email are required." });
  }

  const safeEmail = encodeURIComponent(email);
  const userFile = path.join(__dirname, 'users', `${safeEmail}.json`);

  if (fs.existsSync(userFile)) {
    return res.status(400).send({ error: "User already exists." });
  }

  const newUser = { name, email };
  fs.writeFileSync(userFile, JSON.stringify(newUser, null, 2));
  res.status(200).json(newUser);
});

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Image upload endpoint
app.post('/api/upload-image', upload.single('profileImage'), (req, res) => {
  const email = req.query.email;
  if (!email || !req.file) return res.status(400).json({ error: 'Missing email or file.' });

  const safeEmail = encodeURIComponent(email);
  const userDir = path.join(__dirname, 'uploads', safeEmail);
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });

  // Save image as profile.jpg
  const imagePath = path.join(userDir, 'profile.jpg');
  fs.renameSync(req.file.path, imagePath);

  // Update user's JSON
  const userJsonPath = path.join(__dirname, 'users', `${safeEmail}.json`);
  let userData = {};
  if (fs.existsSync(userJsonPath)) {
    userData = JSON.parse(fs.readFileSync(userJsonPath, 'utf8'));
  }
  userData.imageUrl = `/uploads/${safeEmail}/profile.jpg`;
  fs.writeFileSync(userJsonPath, JSON.stringify(userData, null, 2));

  res.json({ success: true, imageUrl: userData.imageUrl });
});

// 🪙 ProfCoin API Endpoints

// Update user's ProfCoin balance
app.post('/api/user/update-balance', (req, res) => {
  const { email, balance, blocksMined, totalEarned } = req.body;
  if (!email || balance === undefined) {
    return res.status(400).json({ error: 'Missing email or balance' });
  }

  try {
    const safeEmail = encodeURIComponent(email);
    const userFile = path.join(__dirname, 'users', `${safeEmail}.json`);
    
    if (!fs.existsSync(userFile)) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = JSON.parse(fs.readFileSync(userFile, 'utf8'));
    userData.profcoinBalance = balance;
    userData.blocksMined = blocksMined || userData.blocksMined || 0;
    userData.totalEarned = totalEarned || userData.totalEarned || 0;
    userData.lastMiningUpdate = new Date().toISOString();
    
    fs.writeFileSync(userFile, JSON.stringify(userData, null, 2));
    res.json({ success: true, balance: userData.profcoinBalance });
  } catch (error) {
    console.error('Error updating user balance:', error);
    res.status(500).json({ error: 'Failed to update balance' });
  }
});

// Get user's ProfCoin balance
app.get('/api/user/:email/balance', (req, res) => {
  try {
    const safeEmail = encodeURIComponent(req.params.email);
    const userFile = path.join(__dirname, 'users', `${safeEmail}.json`);
    
    if (!fs.existsSync(userFile)) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = JSON.parse(fs.readFileSync(userFile, 'utf8'));
    res.json({ 
      balance: userData.profcoinBalance || 0,
      blocksMined: userData.blocksMined || 0,
      totalEarned: userData.totalEarned || 0
    });
  } catch (error) {
    console.error('Error getting user balance:', error);
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

// Trading system
let trades = []; // In-memory trades (use database for production)

// Create a trade proposal
app.post('/api/trade', (req, res) => {
  const { sender, recipient, amount, note } = req.body;
  if (!sender || !recipient || !amount || amount <= 0) {
    return res.status(400).json({ error: 'Missing or invalid trade details' });
  }

  try {
    // Check if sender has sufficient balance
    const senderFile = path.join(__dirname, 'users', `${encodeURIComponent(sender)}.json`);
    if (!fs.existsSync(senderFile)) {
      return res.status(404).json({ error: 'Sender not found' });
    }

    const senderData = JSON.parse(fs.readFileSync(senderFile, 'utf8'));
    const senderBalance = senderData.profcoinBalance || 0;

    if (senderBalance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Check if recipient exists
    const recipientFile = path.join(__dirname, 'users', `${encodeURIComponent(recipient)}.json`);
    if (!fs.existsSync(recipientFile)) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    const trade = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sender,
      recipient,
      amount: parseFloat(amount),
      note: note || '',
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    trades.push(trade);
    res.json({ success: true, trade });
  } catch (error) {
    console.error('Error creating trade:', error);
    res.status(500).json({ error: 'Failed to create trade' });
  }
});

// Get trades for a user (sent and received)
app.get('/api/trades/:email', (req, res) => {
  const email = req.params.email;
  const userTrades = trades.filter(trade => 
    trade.sender === email || trade.recipient === email
  );
  res.json(userTrades);
});

// Accept or reject a trade
app.post('/api/trade/update', (req, res) => {
  const { tradeId, status, userEmail } = req.body;
  
  if (!['accepted', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const trade = trades.find(t => t.id === tradeId);
    if (!trade) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    if (trade.recipient !== userEmail) {
      return res.status(403).json({ error: 'Unauthorized to update this trade' });
    }

    if (trade.status !== 'pending') {
      return res.status(400).json({ error: 'Trade already processed' });
    }

    trade.status = status;
    trade.updatedAt = new Date().toISOString();

    // If accepted, transfer the coins
    if (status === 'accepted') {
      const senderFile = path.join(__dirname, 'users', `${encodeURIComponent(trade.sender)}.json`);
      const recipientFile = path.join(__dirname, 'users', `${encodeURIComponent(trade.recipient)}.json`);

      const senderData = JSON.parse(fs.readFileSync(senderFile, 'utf8'));
      const recipientData = JSON.parse(fs.readFileSync(recipientFile, 'utf8'));

      // Check sender still has balance
      if ((senderData.profcoinBalance || 0) < trade.amount) {
        return res.status(400).json({ error: 'Sender no longer has sufficient balance' });
      }

      // Transfer coins
      senderData.profcoinBalance = (senderData.profcoinBalance || 0) - trade.amount;
      recipientData.profcoinBalance = (recipientData.profcoinBalance || 0) + trade.amount;

      // Save updated balances
      fs.writeFileSync(senderFile, JSON.stringify(senderData, null, 2));
      fs.writeFileSync(recipientFile, JSON.stringify(recipientData, null, 2));
    }

    res.json({ success: true, trade });
  } catch (error) {
    console.error('Error updating trade:', error);
    res.status(500).json({ error: 'Failed to update trade' });
  }
});

// Get all pending trades (for marketplace view)
app.get('/api/trades', (req, res) => {
  const pendingTrades = trades.filter(trade => trade.status === 'pending');
  res.json(pendingTrades);
});

// Cancel a trade (only by sender)
app.delete('/api/trade/:tradeId', (req, res) => {
  const { tradeId } = req.params;
  const { userEmail } = req.body;

  try {
    const tradeIndex = trades.findIndex(t => t.id === tradeId);
    if (tradeIndex === -1) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    const trade = trades[tradeIndex];
    if (trade.sender !== userEmail) {
      return res.status(403).json({ error: 'Unauthorized to cancel this trade' });
    }

    if (trade.status !== 'pending') {
      return res.status(400).json({ error: 'Cannot cancel processed trade' });
    }

    trades.splice(tradeIndex, 1);
    res.json({ success: true, message: 'Trade cancelled' });
  } catch (error) {
    console.error('Error cancelling trade:', error);
    res.status(500).json({ error: 'Failed to cancel trade' });
  }
});

// Get messages between two users
app.get('/api/messages', (req, res) => {
  const { user1, user2 } = req.query;
  if (!user1 || !user2) return res.status(400).json({ error: 'Missing user1 or user2 parameters' });

  // Create a consistent conversation ID by sorting emails alphabetically
  const conversationId = [user1, user2].sort().join('|');
  const messagesPath = path.join(__dirname, 'messages', `${encodeURIComponent(conversationId)}.json`);
  
  if (!fs.existsSync(messagesPath)) {
    return res.json({ messages: [] });
  }

  const messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
  res.json({ messages });
});

// Send a message
app.post('/api/messages', (req, res) => {
  const { sender, recipient, message, timestamp } = req.body;
  if (!sender || !recipient || !message) return res.status(400).json({ error: 'Missing required fields' });

  // Create a consistent conversation ID by sorting emails alphabetically
  const conversationId = [sender, recipient].sort().join('|');
  const messagesPath = path.join(__dirname, 'messages', `${encodeURIComponent(conversationId)}.json`);
  
  // Load existing messages or create empty array
  let messages = [];
  if (fs.existsSync(messagesPath)) {
    messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
  }

  // Add new message
  const newMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    sender,
    recipient,
    message,
    timestamp: timestamp || new Date().toISOString()
  };
  
  messages.push(newMessage);
  
  // Save messages
  fs.writeFileSync(messagesPath, JSON.stringify(messages, null, 2));
  
  res.json({ success: true, message: newMessage });
});

// News API
app.get('/api/news', (req, res) => {
  const newsPath = path.join(__dirname, 'news-stories.json');
  
  if (!fs.existsSync(newsPath)) {
    return res.json({ stories: [] });
  }

  const newsData = JSON.parse(fs.readFileSync(newsPath, 'utf8'));
  res.json(newsData);
});

app.post('/api/news', (req, res) => {
  const { title, content, author, timestamp } = req.body;
  if (!title || !content || !author) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const newsPath = path.join(__dirname, 'news-stories.json');
  
  // Load existing news or create empty array
  let newsData = { stories: [] };
  if (fs.existsSync(newsPath)) {
    newsData = JSON.parse(fs.readFileSync(newsPath, 'utf8'));
  }

  // Add new story
  const newStory = {
    id: `story_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    title,
    content,
    author,
    timestamp: timestamp || new Date().toISOString(),
    likes: 0,
    comments: []
  };
  
  newsData.stories.unshift(newStory);
  
  // Save news
  fs.writeFileSync(newsPath, JSON.stringify(newsData, null, 2));
  
  // Emit to all connected clients
  io.to('news-feed').emit('new-story', newStory);
  
  res.json({ success: true, story: newStory });
});

// Socket.IO for real-time updates
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.join('news-feed');
  
  socket.on('story-engagement', (data) => {
    socket.to('news-feed').emit('engagement-updated', data);
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// 🚀 Start Server
server.listen(PORT, () => {
  console.log(`✅ Prof Server with real-time updates running at http://localhost:${PORT}`);
  console.log(`📡 WebSocket server ready for real-time news updates`);
  console.log(`🪙 ProfCoin trading system enabled`);
});
