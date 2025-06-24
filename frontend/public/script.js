// Connect to backend server
const socket = io('http://localhost:3000');

// DOM elements
const loginContainer = document.getElementById('login-container');
const chatContainer = document.getElementById('chat-container');
const usernameInput = document.getElementById('username-input');
const joinBtn = document.getElementById('join-btn');
const leaveBtn = document.getElementById('leave-btn');
const currentUserSpan = document.getElementById('current-user');
const usersList = document.getElementById('users-list');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const typingIndicator = document.getElementById('typing-indicator');

let currentUsername = '';
let typingTimer;
let voiceChat;

// Event listeners
joinBtn.addEventListener('click', joinChat);
leaveBtn.addEventListener('click', leaveChat);
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', handleMessageInput);
messageInput.addEventListener('input', handleTyping);
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinChat();
});

// Functions
function joinChat() {
    const username = usernameInput.value.trim();
    if (username) {
        currentUsername = username;
        currentUserSpan.textContent = username;
        
        // Hide login, show chat
        loginContainer.classList.add('hidden');
        chatContainer.classList.remove('hidden');
        
        // Emit user joined event
        socket.emit('user-joined', username);
        
        // Focus message input
        messageInput.focus();
        
        // Initialize voice chat after joining
        voiceChat = new VoiceChat(socket);
    }
}

function leaveChat() {
    // Show login, hide chat
    chatContainer.classList.add('hidden');
    loginContainer.classList.remove('hidden');
    
    // Clear inputs
    usernameInput.value = '';
    messageInput.value = '';
    messagesContainer.innerHTML = '';
    usersList.innerHTML = '';
    
    // Disconnect socket
    socket.disconnect();
    
    // Reconnect for next session
    setTimeout(() => {
        socket.connect();
    }, 100);
}

function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
        socket.emit('send-message', { message });
        messageInput.value = '';
        socket.emit('stop-typing');
    }
}

function handleMessageInput(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
}

function handleTyping() {
    socket.emit('typing');
    
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        socket.emit('stop-typing');
    }, 1000);
}

function addMessage(data, isOwnMessage = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwnMessage ? 'own-message' : 'other-message'}`;
    
    messageDiv.innerHTML = `
        <div class="message-header">
            <span class="message-username">${data.username}</span>
            <span class="message-timestamp">${data.timestamp}</span>
        </div>
        <div class="message-text">${escapeHtml(data.message)}</div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addSystemMessage(message) {
    const systemDiv = document.createElement('div');
    systemDiv.className = 'system-message';
    systemDiv.textContent = message;
    messagesContainer.appendChild(systemDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function updateUsersList(users) {
    usersList.innerHTML = '';
    users.forEach(username => {
        const li = document.createElement('li');
        li.textContent = username;
        if (username === currentUsername) {
            li.style.fontWeight = 'bold';
            li.textContent += ' (You)';
        }
        usersList.appendChild(li);
    });
    
    // Enable/disable voice call based on available users
    if (voiceChat) {
        if (users.length > 1) {
            voiceChat.enableVoiceCall();
        } else {
            voiceChat.disableVoiceCall();
        }
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Socket event listeners
socket.on('user-connected', (username) => {
    addSystemMessage(`${username} joined the chat`);
});

socket.on('user-disconnected', (username) => {
    addSystemMessage(`${username} left the chat`);
});

socket.on('users-list', (users) => {
    updateUsersList(users);
});

socket.on('receive-message', (data) => {
    const isOwnMessage = data.username === currentUsername;
    addMessage(data, isOwnMessage);
});

socket.on('user-typing', (username) => {
    typingIndicator.textContent = `${username} is typing...`;
});

socket.on('user-stop-typing', () => {
    typingIndicator.textContent = '';
});

// Handle connection events
socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
}); 