const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"], // Allow both
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors({
  origin: ["http://localhost:5173", "http://127.0.0.1:5173"]
}));
app.use(express.json());

// API health check
app.get('/api/health', (req, res) => {
  res.json({ message: 'Chat server is running!' });
});

// Store connected users
let connectedUsers = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Handle user joining
    socket.on('user-joined', (username) => {
        connectedUsers.set(socket.id, username);
        socket.broadcast.emit('user-connected', username);
        
        // Send list of connected users to the new user
        const usersList = Array.from(connectedUsers.values());
        socket.emit('users-list', usersList);
        
        console.log(`${username} joined the chat`);
    });

    // Handle sending messages
    socket.on('send-message', (data) => {
        const username = connectedUsers.get(socket.id);
        if (username) {
            // Broadcast message to all users including sender
            io.emit('receive-message', {
                username: username,
                message: data.message,
                timestamp: new Date().toLocaleTimeString()
            });
        }
    });

    // Handle typing indicator
    socket.on('typing', () => {
        const username = connectedUsers.get(socket.id);
        if (username) {
            socket.broadcast.emit('user-typing', username);
        }
    });

    socket.on('stop-typing', () => {
        const username = connectedUsers.get(socket.id);
        if (username) {
            socket.broadcast.emit('user-stop-typing', username);
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        const username = connectedUsers.get(socket.id);
        if (username) {
            connectedUsers.delete(socket.id);
            socket.broadcast.emit('user-disconnected', username);
            console.log(`${username} left the chat`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Backend server ready for frontend connections');
}); 