# Prof - Social Network Platform

A colorful, interactive social network platform with profile management, messaging, file sharing, gaming, radio streaming, and cryptocurrency mining.

## Features

- 👤 **User Profiles** - Profile creation with image uploads
- 💬 **Messaging System** - Real-time chat between users  
- 📁 **File Sharing** - Collaborative file workspace
- 🎮 **Grid Game** - Interactive gaming feature
- 📻 **Breeze Radio** - Music streaming
- ⛏️ **ProfCoin Mining** - Cryptocurrency simulation with wallet system

## Tech Stack

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js, Express.js
- **Storage**: File-based JSON storage
- **File Uploads**: Multer middleware

## Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/YourUsername/Prof.git
   cd Prof
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create required directories**
   ```bash
   mkdir users messages uploads
   mkdir uploads/temp
   ```

4. **Start the server**
   ```bash
   npm start
   ```
   or
   ```bash
   node server.js
   ```

5. **Access the application**
   - Open your browser to `http://localhost:3000`

## Project Structure

```
Prof/
├── index.html          # Landing/login page
├── profile.html        # User profile page
├── game.html          # Grid game
├── radio.html         # Music streaming
├── messenger.html     # Chat interface
├── file.html          # File sharing workspace
├── coins.html         # ProfCoin mining & wallet
├── server.js          # Express.js backend
├── package.json       # Dependencies
├── users/             # User data storage (gitignored)
├── messages/          # Chat message storage (gitignored)
├── uploads/           # User uploaded files (gitignored)
└── sample-data/       # Example data structures
```

## API Endpoints

- `GET /api/user/:email` - Get user profile
- `POST /api/signup` - Create new user
- `POST /api/upload-image` - Upload profile image
- `GET /api/messages` - Get chat messages
- `POST /api/messages` - Send chat message

## Security Notes

- User data is stored locally in JSON files
- File uploads are stored in `/uploads/{user-email}/`
- No actual authentication system (development only)
- Private keys for ProfCoin wallets stored in localStorage

## Development

The application uses file-based storage for simplicity. For production use, consider:
- Database integration (MongoDB, PostgreSQL)
- Proper authentication system
- Session management
- Input validation and sanitization
- HTTPS encryption

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is for educational/development purposes.
