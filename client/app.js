// frontend/rooms-app.js
class ChatWithRoomsApp {
    constructor() {
        this.socket = null;
        this.currentUser = null;
        this.currentRoom = null;
        this.availableRooms = new Map();
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        
        // DOM Elements
        this.elements = {
            // Login
            loginScreen: document.getElementById('loginScreen'),
            chatScreen: document.getElementById('chatScreen'),
            loginBtn: document.getElementById('loginBtn'),
            logoutBtn: document.getElementById('logoutBtn'),
            userAvatar: document.getElementById('userAvatar'),
            userName: document.getElementById('userName'),
            connectionStatus: document.getElementById('connectionStatus'),
            notification: document.getElementById('notification'),
            
            // Rooms
            roomNameInput: document.getElementById('roomNameInput'),
            createRoomBtn: document.getElementById('createRoomBtn'),
            joinRoomInput: document.getElementById('joinRoomInput'),
            joinRoomBtn: document.getElementById('joinRoomBtn'),
            roomList: document.getElementById('roomList'),
            currentRoomName: document.getElementById('currentRoomName'),
            roomUsersCount: document.getElementById('roomUsersCount'),
            leaveCurrentRoomBtn: document.getElementById('leaveCurrentRoomBtn'),
            
            // Chat
            chatHeader: document.getElementById('chatHeader'),
            noRoomSelected: document.getElementById('noRoomSelected'),
            messagesContainer: document.getElementById('messagesContainer'),
            messageInput: document.getElementById('messageInput'),
            sendBtn: document.getElementById('sendBtn'),
            inputContainer: document.getElementById('inputContainer')
        };
        
        this.init();
    }
    
    async init() {
        try {
            DEBUG.log('Inicializando aplicação com salas...');
            
            // Inicializar Firebase
            firebase.initializeApp(FIREBASE_CONFIG);
            this.auth = firebase.auth();
            
            // Configurar provedor Google
            this.googleProvider = new firebase.auth.GoogleAuthProvider();
            this.googleProvider.addScope('profile');
            this.googleProvider.addScope('email');
            
            // Event listeners
            this.setupEventListeners();
            
            // Monitor de autenticação
            this.auth.onAuthStateChanged((user) => {
                this.handleAuthStateChange(user);
            });
            
            DEBUG.log('Aplicação inicializada com sucesso');
            
        } catch (error) {
            DEBUG.error('Erro ao inicializar aplicação:', error);
            this.showNotification(ERROR_MESSAGES.SERVER_ERROR, 'error');
        }
    }
    
    setupEventListeners() {
        // Login/Logout
        this.elements.loginBtn.addEventListener('click', () => this.handleLogin());
        this.elements.logoutBtn.addEventListener('click', () => this.handleLogout());
        
        // Room management
        this.elements.createRoomBtn.addEventListener('click', () => this.createRoom());
        this.elements.joinRoomBtn.addEventListener('click', () => this.joinRoom());
        this.elements.leaveCurrentRoomBtn.addEventListener('click', () => this.leaveCurrentRoom());
        
        // Input handlers
        this.elements.roomNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.createRoom();
        });
        
        this.elements.joinRoomInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
        
        // Message handling
        this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
        this.elements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        
        this.elements.messageInput.addEventListener('input', () => {
            this.validateMessageInput();
        });
        
        // Connection monitoring
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.socket && !this.socket.connected) {
                this.reconnectSocket();
            }
        });
        
        window.addEventListener('online', () => {
            if (this.currentUser && (!this.socket || !this.socket.connected)) {
                this.reconnectSocket();
            }
        });
        
        window.addEventListener('offline', () => {
            this.updateConnectionStatus('Offline', 'disconnected');
        });
    }
    
    async handleLogin() {
        if (this.isConnecting) return;
        
        try {
            this.setLoginButtonState(true, 'Entrando...');
            
            const result = await this.auth.signInWithPopup(this.googleProvider);
            DEBUG.log('Login bem-sucedido:', result.user.displayName);
            
            this.showNotification(SUCCESS_MESSAGES.LOGIN_SUCCESS, 'success');
            
        } catch (error) {
            DEBUG.error('Erro no login:', error);
            
            let errorMessage = ERROR_MESSAGES.AUTH_FAILED;
            if (error.code === 'auth/popup-closed-by-user') {
                errorMessage = 'Login cancelado pelo usuário.';
            } else if (error.code === 'auth/popup-blocked') {
                errorMessage = 'Popup bloqueado. Permita popups para este site.';
            }
            
            this.showNotification(errorMessage, 'error');
        } finally {
            this.setLoginButtonState(false, 'Entrar com Google');
        }
    }
    
    async handleLogout() {
        try {
            if (this.socket) {
                this.socket.disconnect();
                this.socket = null;
            }
            
            await this.auth.signOut();
            this.showNotification(SUCCESS_MESSAGES.LOGOUT_SUCCESS, 'success');
            DEBUG.log('Logout bem-sucedido');
            
        } catch (error) {
            DEBUG.error('Erro no logout:', error);
            this.showNotification('Erro ao fazer logout.', 'error');
        }
    }
    
    handleAuthStateChange(user) {
        if (user) {
            this.currentUser = user;
            this.showChatScreen();
            this.connectSocket();
        } else {
            this.currentUser = null;
            this.currentRoom = null;
            this.availableRooms.clear();
            this.showLoginScreen();
            if (this.socket) {
                this.socket.disconnect();
                this.socket = null;
            }
        }
    }
    
    async connectSocket() {
        if (this.isConnecting || !this.currentUser) return;
        
        try {
            this.isConnecting = true;
            this.updateConnectionStatus('Conectando...', 'connecting');
            
            const idToken = await this.currentUser.getIdToken();
            
            this.socket = io(APP_CONFIG.SOCKET_URL, {
                auth: {
                    token: idToken,
                    user: {
                        uid: this.currentUser.uid,
                        name: this.currentUser.displayName,
                        avatar: this.currentUser.photoURL,
                        email: this.currentUser.email
                    }
                },
                timeout: APP_CONFIG.CONNECTION_TIMEOUT,
                forceNew: true
            });
            
            this.setupSocketListeners();
            
        } catch (error) {
            DEBUG.error('Erro ao conectar socket:', error);
            this.updateConnectionStatus('Erro de conexão', 'disconnected');
            this.showNotification(ERROR_MESSAGES.CONNECTION_FAILED, 'error');
        } finally {
            this.isConnecting = false;
        }
    }
    
    setupSocketListeners() {
        if (!this.socket) return;
        
        // Connection events
        this.socket.on('connect', () => {
            DEBUG.log('Conectado ao servidor');
            this.updateConnectionStatus('Online', 'connected');
            this.reconnectAttempts = 0;
            this.requestAvailableRooms();
        });
        
        this.socket.on('disconnect', (reason) => {
            DEBUG.warn('Desconectado do servidor:', reason);
            this.updateConnectionStatus('Desconectado', 'disconnected');
            
            if (reason !== 'io client disconnect') {
                this.scheduleReconnect();
            }
        });
        
        this.socket.on('connect_error', (error) => {
            DEBUG.error('Erro de conexão:', error);
            this.updateConnectionStatus('Erro de conexão', 'disconnected');
            this.scheduleReconnect();
        });
        
        // Room events
        this.socket.on('roomCreated', (data) => {
            DEBUG.log('Sala criada:', data.roomName);
            this.showNotification(`Sala "${data.roomName}" criada com sucesso!`, 'success');
            this.addRoomToList(data.room);
            this.elements.roomNameInput.value = '';
        });
        
        this.socket.on('roomJoined', (data) => {
            DEBUG.log('Entrou na sala:', data.roomName);
            this.currentRoom = data.room;
            this.updateCurrentRoom();
            this.clearMessages();
            this.showNotification(`Entrou na sala "${data.roomName}"`, 'success');
            this.elements.joinRoomInput.value = '';
        });
        
        this.socket.on('roomLeft', (data) => {
            DEBUG.log('Saiu da sala:', data.roomName);
            if (this.currentRoom && this.currentRoom.name === data.roomName) {
                this.currentRoom = null;
                this.updateCurrentRoom();
                this.clearMessages();
            }
            this.showNotification(`Saiu da sala "${data.roomName}"`, 'success');
        });
        
        this.socket.on('availableRooms', (rooms) => {
            DEBUG.log('Salas disponíveis:', rooms);
            this.updateRoomsList(rooms);
        });
        
        this.socket.on('roomUsers', (data) => {
            if (this.currentRoom && this.currentRoom.name === data.roomName) {
                this.updateRoomUserCount(data.users.length);
            }
        });
        
        // Message events
        this.socket.on('message', (data) => {
            if (this.currentRoom && data.room === this.currentRoom.name) {
                this.addMessage(data);
            }
        });
        
        this.socket.on('roomMessage', (data) => {
            this.addMessage(data);
        });
        
        // User events
        this.socket.on('userJoinedRoom', (data) => {
            if (this.currentRoom && data.roomName === this.currentRoom.name) {
                this.addSystemMessage(`${data.user.name} entrou na sala`);
                this.updateRoomUserCount(data.userCount);
            }
        });
        
        this.socket.on('userLeftRoom', (data) => {
            if (this.currentRoom && data.roomName === this.currentRoom.name) {
                this.addSystemMessage(`${data.user.name} saiu da sala`);
                this.updateRoomUserCount(data.userCount);
            }
        });
        
        // Error events
        this.socket.on('error', (error) => {
            DEBUG.error('Erro do socket:', error);
            this.showNotification(error.message || ERROR_MESSAGES.SERVER_ERROR, 'error');
        });
        
        this.socket.on('roomError', (error) => {
            DEBUG.error('Erro de sala:', error);
            this.showNotification(error.message || 'Erro relacionado à sala', 'error');
        });
    }
    
    // Room Management Methods
    createRoom() {
        const roomName = this.elements.roomNameInput.value.trim();
        
        if (!roomName) {
            this.showNotification('Digite um nome para a sala', 'error');
            return;
        }
        
        if (roomName.length < 2 || roomName.length > 30) {
            this.showNotification('Nome da sala deve ter entre 2 e 30 caracteres', 'error');
            return;
        }
        
        if (!this.socket || !this.socket.connected) {
            this.showNotification('Não conectado ao servidor', 'error');
            return;
        }
        
        DEBUG.log('Criando sala:', roomName);
        this.socket.emit('createRoom', { roomName });
    }
    
    joinRoom() {
        const roomName = this.elements.joinRoomInput.value.trim();
        
        if (!roomName) {
            this.showNotification('Digite o nome da sala para entrar', 'error');
            return;
        }
        
        if (!this.socket || !this.socket.connected) {
            this.showNotification('Não conectado ao servidor', 'error');
            return;
        }
        
        DEBUG.log('Entrando na sala:', roomName);
        this.socket.emit('joinRoom', { roomName });
    }
    
    joinRoomFromList(roomName) {
        if (!this.socket || !this.socket.connected) {
            this.showNotification('Não conectado ao servidor', 'error');
            return;
        }
        
        DEBUG.log('Entrando na sala da lista:', roomName);
        this.socket.emit('joinRoom', { roomName });
    }
    
    leaveCurrentRoom() {
        if (!this.currentRoom) {
            this.showNotification('Você não está em nenhuma sala', 'error');
            return;
        }
        
        if (!this.socket || !this.socket.connected) {
            this.showNotification('Não conectado ao servidor', 'error');
            return;
        }
        
        DEBUG.log('Saindo da sala:', this.currentRoom.name);
        this.socket.emit('leaveRoom', { roomName: this.currentRoom.name });
    }
    
    requestAvailableRooms() {
        if (this.socket && this.socket.connected) {
            this.socket.emit('getRooms');
        }
    }
    
    // UI Update Methods
    updateRoomsList(rooms) {
        this.availableRooms.clear();
        this.elements.roomList.innerHTML = '';
        
        rooms.forEach(room => {
            this.availableRooms.set(room.name, room);
            this.addRoomToList(room);
        });
        
        if (rooms.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'room-item';
            emptyState.style.cssText = 'text-align: center; color: #999; font-style: italic;';
            emptyState.textContent = 'Nenhuma sala disponível. Crie uma!';
            this.elements.roomList.appendChild(emptyState);
        }
    }
    
    addRoomToList(room) {
        const roomElement = document.createElement('div');
        roomElement.className = `room-item ${this.currentRoom && this.currentRoom.name === room.name ? 'active' : ''}`;
        roomElement.dataset.roomName = room.name;
        
        roomElement.innerHTML = `
            <div class="room-info">
                <div class="room-name">${this.escapeHtml(room.name)}</div>
                <div class="room-users">${room.userCount || 0} usuários</div>
            </div>
            <div class="room-type">${room.isPrivate ? 'Privada' : 'Pública'}</div>
        `;
        
        roomElement.addEventListener('click', () => {
            if (!this.currentRoom || this.currentRoom.name !== room.name) {
                this.joinRoomFromList(room.name);
            }
        });
        
        this.elements.roomList.appendChild(roomElement);
        
        // Update existing room if it exists
        const existingRoom = this.elements.roomList.querySelector(`[data-room-name="${room.name}"]`);
        if (existingRoom && existingRoom !== roomElement) {
            existingRoom.remove();
        }
    }
    
    updateCurrentRoom() {
        // Update active room in sidebar
        this.elements.roomList.querySelectorAll('.room-item').forEach(item => {
            item.classList.remove('active');
            if (this.currentRoom && item.dataset.roomName === this.currentRoom.name) {
                item.classList.add('active');
            }
        });
        
        // Update chat header and input state
        if (this.currentRoom) {
            this.elements.chatHeader.classList.remove('hidden');
            this.elements.noRoomSelected.classList.add('hidden');
            this.elements.messagesContainer.classList.remove('hidden');
            this.elements.inputContainer.classList.remove('hidden');
            
            this.elements.currentRoomName.textContent = this.currentRoom.name;
            this.elements.messageInput.disabled = false;
            this.elements.messageInput.placeholder = `Conversar em ${this.currentRoom.name}...`;
            this.validateMessageInput();
            
            // Focus input
            setTimeout(() => {
                this.elements.messageInput.focus();
            }, 100);
            
        } else {
            this.elements.chatHeader.classList.add('hidden');
            this.elements.noRoomSelected.classList.remove('hidden');
            this.elements.messagesContainer.classList.add('hidden');
            this.elements.inputContainer.classList.add('hidden');
            
            this.elements.messageInput.disabled = true;
            this.elements.messageInput.placeholder = 'Selecione uma sala para conversar...';
        }
    }
    
    updateRoomUserCount(count) {
        this.elements.roomUsersCount.textContent = `${count} usuário${count !== 1 ? 's' : ''} online`;
        
        // Update in room list as well
        if (this.currentRoom) {
            const roomElement = this.elements.roomList.querySelector(`[data-room-name="${this.currentRoom.name}"]`);
            if (roomElement) {
                const usersElement = roomElement.querySelector('.room-users');
                if (usersElement) {
                    usersElement.textContent = `${count} usuários`;
                }
            }
        }
    }
    
    // Message Methods
    sendMessage() {
        if (!this.currentRoom) {
            this.showNotification('Selecione uma sala primeiro', 'error');
            return;
        }
        
        const text = this.elements.messageInput.value.trim();
        
        if (!this.validateMessage(text)) return;
        if (!this.socket || !this.socket.connected) {
            this.showNotification('Não conectado ao servidor.', 'error');
            return;
        }
        if (!RATE_LIMITER.canSendMessage()) {
            this.showNotification(ERROR_MESSAGES.RATE_LIMIT_EXCEEDED, 'error');
            return;
        }
        
        const sanitizedText = VALIDATORS.sanitizeMessage(text);
        
        this.socket.emit('roomMessage', {
            roomName: this.currentRoom.name,
            text: sanitizedText,
            timestamp: Date.now()
        });
        
        RATE_LIMITER.recordMessage();
        
        this.elements.messageInput.value = '';
        this.validateMessageInput();
        this.elements.messageInput.focus();
        
        DEBUG.log('Mensagem enviada para sala:', this.currentRoom.name, sanitizedText);
    }
    
    validateMessage(text) {
        if (!VALIDATORS.isValidMessage(text)) {
            if (!text || text.length === 0) {
                this.showNotification(ERROR_MESSAGES.MESSAGE_EMPTY, 'error');
            } else if (text.length > VALIDATION_CONFIG.message.maxLength) {
                this.showNotification(ERROR_MESSAGES.MESSAGE_TOO_LONG, 'error');
            }
            return false;
        }
        return true;
    }
    
    validateMessageInput() {
        const text = this.elements.messageInput.value.trim();
        const isValid = VALIDATORS.isValidMessage(text) && 
                       this.socket && 
                       this.socket.connected && 
                       this.currentRoom;
        this.elements.sendBtn.disabled = !isValid;
    }
    
    addMessage(data) {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${data.user.uid === this.currentUser.uid ? 'own' : ''}`;
        
        const time = new Date(data.timestamp).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const escapedText = this.escapeHtml(data.text);
        const escapedName = this.escapeHtml(data.user.name);
        
        messageEl.innerHTML = `
            <img class="message-avatar" src="${data.user.avatar}" alt="${escapedName}" onerror="this.src='data:image/svg+xml,<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"35\\" height=\\"35\\"><circle cx=\\"17.5\\" cy=\\"17.5\\" r=\\"17.5\\" fill=\\"%23ddd\\"/><text x=\\"50%\\" y=\\"50%\\" text-anchor=\\"middle\\" dy=\\".3em\\" fill=\\"white\\">${escapedName[0]}</text></svg>'">
            <div class="message-content">
                <div class="message-author">${escapedName}</div>
                <div class="message-text">${escapedText}</div>
                <div class="message-time">${time}</div>
            </div>
        `;
        
        this.elements.messagesContainer.appendChild(messageEl);
        this.scrollToBottom();
    }
    
    addSystemMessage(text) {
        const messageEl = document.createElement('div');
        messageEl.className = 'system-message';
        messageEl.textContent = text;
        this.elements.messagesContainer.appendChild(messageEl);
        this.scrollToBottom();
    }
    
    clearMessages() {
        this.elements.messagesContainer.innerHTML = '';
    }
    
    scrollToBottom() {
        this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
    }
    
    // Utility Methods
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    scheduleReconnect() {
        if (this.reconnectAttempts >= APP_CONFIG.RECONNECT_ATTEMPTS) {
            this.showNotification('Não foi possível reconectar. Recarregue a página.', 'error');
            return;
        }
        
        const delay = APP_CONFIG.RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts);
        this.reconnectAttempts++;
        
        DEBUG.log(`Tentando reconectar em ${delay}ms (tentativa ${this.reconnectAttempts})`);
        
        setTimeout(() => {
            if (this.currentUser && (!this.socket || !this.socket.connected)) {
                this.reconnectSocket();
            }
        }, delay);
    }
    
    async reconnectSocket() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        await this.connectSocket();
    }
    
    updateConnectionStatus(text, status) {
        this.elements.connectionStatus.textContent = text;
        this.elements.connectionStatus.className = `connection-status ${status}`;
    }
    
    showLoginScreen() {
        this.elements.loginScreen.classList.remove('hidden');
        this.elements.chatScreen.classList.add('hidden');
    }
    
    showChatScreen() {
        this.elements.loginScreen.classList.add('hidden');
        this.elements.chatScreen.classList.remove('hidden');
        
        this.elements.userName.textContent = this.currentUser.displayName;
        this.elements.userAvatar.src = this.currentUser.photoURL;
        
        // Reset room state
        this.currentRoom = null;
        this.updateCurrentRoom();
    }
    
    setLoginButtonState(loading, text) {
        this.elements.loginBtn.disabled = loading;
        this.elements.loginBtn.innerHTML = loading 
            ? text
            : `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>${text}`;
    }
    
    showNotification(message, type = 'info') {
        const notification = this.elements.notification;
        notification.textContent = message;
        notification.className = type === 'error' ? 'error-message' : 'success-message';
        notification.classList.remove('hidden');
        
        DEBUG.log(`Notificação [${type}]:`, message);
        
        setTimeout(() => {
            notification.classList.add('hidden');
        }, 5000);
    }
}

// Inicializar aplicação quando DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    window.chatApp = new ChatWithRoomsApp();
    DEBUG.log('Chat App com Salas inicializada');
});