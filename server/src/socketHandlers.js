// backend/src/socketHandlers.js - Com Sistema de Salas
const { validateUserData } = require('./auth');
const { sanitizeMessage, generateMessageId, validateMessage, generateRoomId } = require('./utils');

/**
 * Configurar handlers do Socket.IO com sistema de salas
 */
function setupSocketHandlers(io, databaseManager) { // ADICIONAR databaseManager
    const activeRooms = new Map();
    const connectedUsers = new Map();
    const messageRateLimits = new Map();

    // Carregar salas do banco de dados na inicialização
    loadRoomsFromDatabase(activeRooms, databaseManager);

    // Criar salas padrão se não existirem
    createDefaultRooms(activeRooms, databaseManager);

    // Rate limiting por usuário para mensagens
    const MESSAGE_RATE_LIMIT = {
        maxMessages: 10,
        windowMs: 60 * 1000 // 1 minuto
    };
    
    // Configurações de salas
    const ROOM_CONFIG = {
        maxRooms: 100,
        maxUsersPerRoom: 50,
        maxRoomNameLength: 30,
        minRoomNameLength: 2,
        defaultRooms: ['Geral', 'Tecnologia', 'Jogos']
    };
    
    // Criar salas padrão
    initializeDefaultRooms();
    
    io.on('connection', (socket) => {
        console.log(`👋 Usuário conectado: ${socket.userInfo.name} (${socket.userId})`);
        
        // Salvar sessão do usuário no banco
        databaseManager.saveUserSession(socket.userId, {
            name: socket.userInfo.name,
            email: socket.userInfo.email,
            avatar: socket.userInfo.avatar,
            socketId: socket.id,
            connectedAt: new Date(),
            isOnline: true
        });

        // Validar dados do usuário
        const validation = validateUserData(socket.userInfo);
        if (!validation.isValid) {
            console.error('❌ Dados do usuário inválidos:', validation.errors);
            socket.emit('error', { message: 'Dados do usuário inválidos' });
            socket.disconnect();
            return;
        }
        
        // Adicionar usuário à lista de conectados
        connectedUsers.set(socket.userId, {
            socketId: socket.id,
            user: socket.userInfo,
            connectedAt: new Date(),
            lastActivity: new Date(),
            currentRoom: null
        });
        
        // Enviar salas disponíveis
        sendAvailableRooms(socket);
        
        // === HANDLERS DE SALAS ===
        
        // Criar nova sala
        socket.on('createRoom', (data) => handleCreateRoom(socket, data, activeRooms, connectedUsers, io, databaseManager)); // ADICIONAR databaseManager
        
        // Entrar em uma sala
        socket.on('joinRoom', (data) => {
            handleJoinRoom(socket, data, activeRooms, connectedUsers, io);
        });
        
        // Sair de uma sala
        socket.on('leaveRoom', (data) => {
            handleLeaveRoom(socket, data, activeRooms, connectedUsers, io);
        });
        
        // Obter lista de salas
        socket.on('getRooms', () => {
            sendAvailableRooms(socket);
        });
        
        // Obter usuários de uma sala
        socket.on('getRoomUsers', (data) => {
            handleGetRoomUsers(socket, data, activeRooms);
        });
        
        // === HANDLERS DE MENSAGENS ===
        
        // Mensagem para sala específica
        socket.on('roomMessage', (data) => handleRoomMessage(socket, data, activeRooms, connectedUsers, io, messageRateLimits, databaseManager)); // ADICIONAR databaseManager
        
        // Mensagem privada (DM)
        socket.on('privateMessage', (data) => {
            handlePrivateMessage(socket, data, connectedUsers, io);
        });
        
        // === HANDLERS GERAIS ===
        
        // Ping/pong para health check
        socket.on('ping', () => {
            socket.emit('pong');
            updateUserActivity(socket.userId, connectedUsers);
        });
        
        // Indicador de digitação
        socket.on('typing', (data) => {
            handleTyping(socket, data, activeRooms, io);
        });
        
        // Quando o usuário se desconecta
        socket.on('disconnect', (reason) => {
            handleDisconnect(socket, reason, connectedUsers, activeRooms, io);
        });
        
        // Handler para erros do socket
        socket.on('error', (error) => {
            console.error(`❌ Erro do socket ${socket.userInfo.name}:`, error);
        });
        
        // Atualizar atividade do usuário
        updateUserActivity(socket.userId, connectedUsers);
        
        console.log(`📊 Total de usuários conectados: ${connectedUsers.size}`);
        console.log(`📊 Total de salas ativas: ${activeRooms.size}`);
    });
    
    // Limpar salas vazias e usuários inativos a cada 5 minutos
    setInterval(() => {
        cleanupInactiveData(connectedUsers, activeRooms, io);
    }, 5 * 60 * 1000);
    
    // === FUNÇÕES AUXILIARES ===
    
    function initializeDefaultRooms() {
        ROOM_CONFIG.defaultRooms.forEach(roomName => {
            const roomId = generateRoomId();
            activeRooms.set(roomName, {
                id: roomId,
                name: roomName,
                createdBy: 'system',
                createdAt: new Date(),
                isPrivate: false,
                users: new Map(),
                userCount: 0,
                messageCount: 0,
                lastActivity: new Date()
            });
        });
        console.log(`🏠 ${ROOM_CONFIG.defaultRooms.length} salas padrão criadas`);
    }
    
    function sendAvailableRooms(socket) {
        const rooms = Array.from(activeRooms.values()).map(room => ({
            name: room.name,
            userCount: room.userCount,
            isPrivate: room.isPrivate,
            createdBy: room.createdBy,
            createdAt: room.createdAt
        }));
        
        socket.emit('availableRooms', rooms);
    }
    
    return { 
        connectedUsers, 
        activeRooms,
        getServerStats: () => getServerStats(connectedUsers, activeRooms)
    };
}

/**
 * Handler para criar sala
 */
function handleCreateRoom(socket, data, activeRooms, connectedUsers, io, databaseManager) {
    console.log('🔧 DEBUG - handleCreateRoom chamado');
    console.log('🔧 DEBUG - socket.userInfo:', socket.userInfo);
    console.log('🔧 DEBUG - socket.userId:', socket.userId);
    console.log('🔧 DEBUG - data recebido:', data);
    try {
        const { roomName, isPrivate = false, password = null } = data;
        
        // Validações
        if (!roomName || typeof roomName !== 'string') {
            socket.emit('roomError', { message: 'Nome da sala é obrigatório' });
            return;
        }
        
        const sanitizedRoomName = roomName.trim();
        
        if (sanitizedRoomName.length < 2 || sanitizedRoomName.length > 30) {
            socket.emit('roomError', { message: 'Nome da sala deve ter entre 2 e 30 caracteres' });
            return;
        }
        
        if (activeRooms.has(sanitizedRoomName)) {
            socket.emit('roomError', { message: 'Já existe uma sala com esse nome' });
            return;
        }
        
        if (activeRooms.size >= 100) {
            socket.emit('roomError', { message: 'Limite máximo de salas atingido' });
            return;
        }
        
        // Criar nova sala
        const roomId = generateRoomId();
        const newRoom = {
            id: roomId,
            name: sanitizedRoomName,
            createdBy: socket.userId,
            createdAt: new Date(),
            isPrivate: !!isPrivate,
            password: password,
            users: new Map(),
            userCount: 0,
            messageCount: 0,
            lastActivity: new Date()
        };
        
        activeRooms.set(sanitizedRoomName, newRoom);
        
        console.log(`🏠 Sala criada: "${sanitizedRoomName}" por ${socket.userInfo.name}`);
        
        // Notificar o criador
        socket.emit('roomCreated', {
            roomName: sanitizedRoomName,
            room: {
                name: newRoom.name,
                userCount: newRoom.userCount,
                isPrivate: newRoom.isPrivate,
                createdBy: newRoom.createdBy,
                createdAt: newRoom.createdAt
            }
        });
        
        // Notificar todos sobre a nova sala (se pública)
        if (!isPrivate) {
            socket.broadcast.emit('availableRooms', getPublicRooms(activeRooms));
        }
        
        // Auto-join na sala criada
        handleJoinRoom(socket, { roomName: sanitizedRoomName }, activeRooms, connectedUsers, io);
        
        // Salvar nova sala no banco de dados
        databaseManager.createRoom({
            name: sanitizedRoomName,
            description: `Sala ${sanitizedRoomName}`,
            createdBy: socket.userId,
            isPrivate: !!isPrivate,
            password: password
        }).then(() => {
            console.log(`✅ Sala "${sanitizedRoomName}" salva no banco de dados`);
        }).catch(err => {
            console.error(`❌ Erro ao salvar sala "${sanitizedRoomName}" no banco de dados:`, err);
        });
        
    } catch (error) {
        console.error('Erro ao criar sala:', error);
        socket.emit('roomError', { message: 'Erro ao criar sala' });
    }
}

/**
 * Handler para entrar em sala
 */
function handleJoinRoom(socket, data, activeRooms, connectedUsers, io) {
    try {
        const { roomName, password = null } = data;
        
        if (!roomName || typeof roomName !== 'string') {
            socket.emit('roomError', { message: 'Nome da sala é obrigatório' });
            return;
        }
        
        const room = activeRooms.get(roomName);
        if (!room) {
            socket.emit('roomError', { message: 'Sala não encontrada' });
            return;
        }
        
        // Verificar senha se necessário
        if (room.isPrivate && room.password && room.password !== password) {
            socket.emit('roomError', { message: 'Senha incorreta' });
            return;
        }
        
        // Verificar limite de usuários
        if (room.userCount >= 50) {
            socket.emit('roomError', { message: 'Sala lotada' });
            return;
        }
        
        // Sair da sala atual se estiver em alguma
        const userData = connectedUsers.get(socket.userId);
        if (userData && userData.currentRoom) {
            handleLeaveRoom(socket, { roomName: userData.currentRoom }, activeRooms, connectedUsers, io, false);
        }
        
        // Entrar na nova sala
        socket.join(roomName);
        room.users.set(socket.userId, {
            user: socket.userInfo,
            joinedAt: new Date()
        });
        room.userCount = room.users.size;
        room.lastActivity = new Date();
        
        // Atualizar dados do usuário
        if (userData) {
            userData.currentRoom = roomName;
        }
        
        console.log(`🚪 ${socket.userInfo.name} entrou na sala "${roomName}"`);
        
        // Notificar o usuário
        socket.emit('roomJoined', {
            roomName: roomName,
            room: {
                name: room.name,
                userCount: room.userCount,
                isPrivate: room.isPrivate,
                createdBy: room.createdBy,
                createdAt: room.createdAt
            }
        });
        
        // Notificar outros usuários da sala
        socket.to(roomName).emit('userJoinedRoom', {
            roomName: roomName,
            user: socket.userInfo,
            userCount: room.userCount
        });
        
        // Enviar lista de usuários da sala
        const roomUsers = Array.from(room.users.values()).map(userData => ({
            uid: userData.user.uid,
            name: userData.user.name,
            avatar: userData.user.avatar,
            joinedAt: userData.joinedAt
        }));
        
        io.to(roomName).emit('roomUsers', {
            roomName: roomName,
            users: roomUsers
        });
        
        // Mensagem de boas-vindas
        const welcomeMessage = {
            id: generateMessageId(),
            text: `${socket.userInfo.name} entrou na sala`,
            user: {
                uid: 'system',
                name: 'Sistema',
                avatar: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="35" height="35"><circle cx="17.5" cy="17.5" r="17.5" fill="%234CAF50"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="white">🏠</text></svg>'
            },
            room: roomName,
            timestamp: Date.now(),
            isSystem: true
        };
        
        io.to(roomName).emit('roomMessage', welcomeMessage);
        
    } catch (error) {
        console.error('Erro ao entrar na sala:', error);
        socket.emit('roomError', { message: 'Erro ao entrar na sala' });
    }
}

/**
 * Handler para sair de sala
 */
function handleLeaveRoom(socket, data, activeRooms, connectedUsers, io, notify = true) {
    try {
        const { roomName } = data;
        
        if (!roomName) {
            if (notify) socket.emit('roomError', { message: 'Nome da sala é obrigatório' });
            return;
        }
        
        const room = activeRooms.get(roomName);
        const userData = connectedUsers.get(socket.userId);
        
        if (!room || !userData || userData.currentRoom !== roomName) {
            if (notify) socket.emit('roomError', { message: 'Você não está nesta sala' });
            return;
        }
        
        // Remover da sala
        socket.leave(roomName);
        room.users.delete(socket.userId);
        room.userCount = room.users.size;
        room.lastActivity = new Date();
        
        // Atualizar dados do usuário
        userData.currentRoom = null;
        
        console.log(`🚪 ${socket.userInfo.name} saiu da sala "${roomName}"`);
        
        if (notify) {
            // Notificar o usuário
            socket.emit('roomLeft', { roomName: roomName });
        }
        
        // Notificar outros usuários da sala
        socket.to(roomName).emit('userLeftRoom', {
            roomName: roomName,
            user: socket.userInfo,
            userCount: room.userCount
        });
        
        // Mensagem de saída
        if (notify) {
            const leaveMessage = {
                id: generateMessageId(),
                text: `${socket.userInfo.name} saiu da sala`,
                user: {
                    uid: 'system',
                    name: 'Sistema',
                    avatar: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="35" height="35"><circle cx="17.5" cy="17.5" r="17.5" fill="%23ff9800"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="white">👋</text></svg>'
                },
                room: roomName,
                timestamp: Date.now(),
                isSystem: true
            };
            
            io.to(roomName).emit('roomMessage', leaveMessage);
        }
        
        // Remover sala se vazia e não for padrão
        const defaultRooms = ['Geral', 'Tecnologia', 'Jogos'];
        if (room.userCount === 0 && !defaultRooms.includes(roomName)) {
            activeRooms.delete(roomName);
            console.log(`🗑️ Sala "${roomName}" removida (vazia)`);
        }
        
    } catch (error) {
        console.error('Erro ao sair da sala:', error);
        if (notify) socket.emit('roomError', { message: 'Erro ao sair da sala' });
    }
}

/**
 * Handler para obter usuários de uma sala
 */
function handleGetRoomUsers(socket, data, activeRooms) {
    try {
        const { roomName } = data;
        
        if (!roomName) {
            socket.emit('roomError', { message: 'Nome da sala é obrigatório' });
            return;
        }
        
        const room = activeRooms.get(roomName);
        if (!room) {
            socket.emit('roomError', { message: 'Sala não encontrada' });
            return;
        }
        
        const roomUsers = Array.from(room.users.values()).map(userData => ({
            uid: userData.user.uid,
            name: userData.user.name,
            avatar: userData.user.avatar,
            joinedAt: userData.joinedAt
        }));
        
        socket.emit('roomUsers', {
            roomName: roomName,
            users: roomUsers
        });
        
    } catch (error) {
        console.error('Erro ao obter usuários da sala:', error);
        socket.emit('roomError', { message: 'Erro ao obter usuários da sala' });
    }
}

/**
 * Handler para mensagens em salas
 */
function handleRoomMessage(socket, data, activeRooms, connectedUsers, io, messageRateLimits, databaseManager) {
    try {
        const { roomName, text } = data;
        
        // Verificar se usuário está na sala
        const userData = connectedUsers.get(socket.userId);
        if (!userData || userData.currentRoom !== roomName) {
            socket.emit('roomError', { message: 'Você não está nesta sala' });
            return;
        }
        
        // Verificar se sala existe
        const room = activeRooms.get(roomName);
        if (!room) {
            socket.emit('roomError', { message: 'Sala não encontrada' });
            return;
        }
        
        // Verificar rate limiting
        if (!checkMessageRateLimit(socket.userId, messageRateLimits)) {
            socket.emit('roomError', { message: 'Você está enviando mensagens muito rapidamente. Aguarde um momento.' });
            return;
        }
        
        // Validar mensagem
        const validation = validateMessage({ text });
        if (!validation.isValid) {
            socket.emit('roomError', { message: validation.error });
            return;
        }
        
        // Sanitizar texto
        const sanitizedText = sanitizeMessage(text);
        
        // Criar objeto da mensagem
        const message = {
            id: generateMessageId(),
            text: sanitizedText,
            user: socket.userInfo,
            room: roomName,
            timestamp: Date.now(),
            socketId: socket.id
        };
        
        // Log da mensagem
        console.log(`💬 [${roomName}] ${socket.userInfo.name}: ${sanitizedText}`);
        
        // Enviar mensagem para todos na sala
        io.to(roomName).emit('roomMessage', message);
        
        // Atualizar estatísticas da sala
        room.messageCount++;
        room.lastActivity = new Date();
        
        // Atualizar atividade do usuário
        updateUserActivity(socket.userId, connectedUsers);
        
        // Registrar para rate limiting
        recordMessageForRateLimit(socket.userId, messageRateLimits);
        
        // Salvar mensagem no banco de dados
        databaseManager.saveMessage({
            id: message.id,
            text: message.text,
            userId: socket.userId,
            roomId: room.id,
            timestamp: message.timestamp
        }).then(() => {
            console.log(`✅ Mensagem salva no banco de dados: ${message.id}`);
        }).catch(err => {
            console.error(`❌ Erro ao salvar mensagem no banco de dados:`, err);
        });
        
    } catch (error) {
        console.error('❌ Erro ao processar mensagem da sala:', error);
        socket.emit('roomError', { message: 'Erro ao processar mensagem' });
    }
}

/**
 * Handler para mensagens privadas
 */
function handlePrivateMessage(socket, data, connectedUsers, io) {
    try {
        const { targetUserId, text } = data;
        
        if (!targetUserId || !text) {
            socket.emit('error', { message: 'Dados da mensagem privada inválidos' });
            return;
        }
        
        // Verificar se usuário alvo existe e está conectado
        const targetUser = connectedUsers.get(targetUserId);
        if (!targetUser) {
            socket.emit('error', { message: 'Usuário não encontrado ou offline' });
            return;
        }
        
        // Validar mensagem
        const validation = validateMessage({ text });
        if (!validation.isValid) {
            socket.emit('error', { message: validation.error });
            return;
        }
        
        // Sanitizar texto
        const sanitizedText = sanitizeMessage(text);
        
        // Criar mensagem privada
        const privateMessage = {
            id: generateMessageId(),
            text: sanitizedText,
            from: socket.userInfo,
            to: targetUser.user,
            timestamp: Date.now(),
            isPrivate: true
        };
        
        // Enviar para o remetente e destinatário
        socket.emit('privateMessage', privateMessage);
        io.to(targetUser.socketId).emit('privateMessage', privateMessage);
        
        console.log(`📩 Mensagem privada: ${socket.userInfo.name} → ${targetUser.user.name}`);
        
    } catch (error) {
        console.error('Erro ao enviar mensagem privada:', error);
        socket.emit('error', { message: 'Erro ao enviar mensagem privada' });
    }
}

/**
 * Handler para indicadores de digitação
 */
function handleTyping(socket, data, activeRooms, io) {
    try {
        const { roomName, isTyping } = data;
        
        if (!roomName) return;
        
        const room = activeRooms.get(roomName);
        if (!room || !room.users.has(socket.userId)) return;
        
        // Broadcast para outros usuários da sala
        socket.to(roomName).emit('userTyping', {
            roomName: roomName,
            user: socket.userInfo,
            isTyping: isTyping
        });
        
    } catch (error) {
        console.error('Erro no indicador de digitação:', error);
    }
}

/**
 * Handler para desconexão
 */
function handleDisconnect(socket, reason, connectedUsers, activeRooms, io) {
    console.log(`👋 Usuário desconectado: ${socket.userInfo.name} (${reason})`);
    
    try {
        const userData = connectedUsers.get(socket.userId);
        if (userData) {
            // Sair da sala atual se estiver em alguma
            if (userData.currentRoom) {
                handleLeaveRoom(socket, { roomName: userData.currentRoom }, activeRooms, connectedUsers, io, true);
            }
            
            // Remover da lista de conectados
            connectedUsers.delete(socket.userId);
            
            // Log de duração da conexão
            const connectionDuration = Math.round((Date.now() - userData.connectedAt.getTime()) / 1000);
            console.log(`📊 Duração da conexão: ${connectionDuration}s`);
        }
        
    } catch (error) {
        console.error('Erro ao processar desconexão:', error);
    }
}

/**
 * Verificar rate limiting de mensagens
 */
function checkMessageRateLimit(userId, messageRateLimits) {
    const now = Date.now();
    const MESSAGE_RATE_LIMIT = { maxMessages: 10, windowMs: 60 * 1000 };
    const userLimit = messageRateLimits.get(userId) || { messages: [], resetTime: now };
    
    // Reset se janela expirou
    if (now - userLimit.resetTime > MESSAGE_RATE_LIMIT.windowMs) {
        userLimit.messages = [];
        userLimit.resetTime = now;
    }
    
    // Verificar limite
    return userLimit.messages.length < MESSAGE_RATE_LIMIT.maxMessages;
}

/**
 * Registrar mensagem para rate limiting
 */
function recordMessageForRateLimit(userId, messageRateLimits) {
    const now = Date.now();
    const userLimit = messageRateLimits.get(userId) || { messages: [], resetTime: now };
    
    userLimit.messages.push(now);
    messageRateLimits.set(userId, userLimit);
}

/**
 * Atualizar atividade do usuário
 */
function updateUserActivity(userId, connectedUsers) {
    const userData = connectedUsers.get(userId);
    if (userData) {
        userData.lastActivity = new Date();
    }
}

/**
 * Obter salas públicas
 */
function getPublicRooms(activeRooms) {
    return Array.from(activeRooms.values())
        .filter(room => !room.isPrivate)
        .map(room => ({
            name: room.name,
            userCount: room.userCount,
            isPrivate: room.isPrivate,
            createdBy: room.createdBy,
            createdAt: room.createdAt
        }));
}

/**
 * Limpar dados inativos
 */
function cleanupInactiveData(connectedUsers, activeRooms, io) {
    const now = Date.now();
    const inactiveThreshold = 30 * 60 * 1000; // 30 minutos
    const defaultRooms = ['Geral', 'Tecnologia', 'Jogos'];
    
    // Limpar usuários inativos
    for (const [userId, userData] of connectedUsers.entries()) {
        if (now - userData.lastActivity.getTime() > inactiveThreshold) {
            console.log(`🧹 Removendo usuário inativo: ${userData.user.name}`);
            
            // Desconectar socket se ainda estiver conectado
            const socket = io.sockets.sockets.get(userData.socketId);
            if (socket) {
                socket.disconnect(true);
            }
            
            connectedUsers.delete(userId);
        }
    }
    
    // Limpar salas vazias (exceto padrão)
    for (const [roomName, room] of activeRooms.entries()) {
        if (room.userCount === 0 && !defaultRooms.includes(roomName)) {
            // Verificar se sala está realmente vazia há mais de 5 minutos
            if (now - room.lastActivity.getTime() > 5 * 60 * 1000) {
                console.log(`🧹 Removendo sala vazia: ${roomName}`);
                activeRooms.delete(roomName);
            }
        }
    }
}

/**
 * Obter estatísticas do servidor
 */
function getServerStats(connectedUsers, activeRooms) {
    const now = new Date();
    const users = Array.from(connectedUsers.values());
    const rooms = Array.from(activeRooms.values());
    
    return {
        users: {
            total: connectedUsers.size,
            active: users.filter(u => (now - u.lastActivity) < 5 * 60 * 1000).length,
            averageConnectionTime: users.length > 0 
                ? Math.round(users.reduce((sum, u) => sum + (now - u.connectedAt), 0) / users.length / 1000)
                : 0
        },
        rooms: {
            total: activeRooms.size,
            active: rooms.filter(r => r.userCount > 0).length,
            totalMessages: rooms.reduce((sum, r) => sum + r.messageCount, 0),
            averageUsersPerRoom: rooms.length > 0 
                ? Math.round(rooms.reduce((sum, r) => sum + r.userCount, 0) / rooms.length)
                : 0
        },
        server: {
            uptime: process.uptime(),
            timestamp: now.toISOString()
        }
    };
}

// Função para carregar salas do banco
async function loadRoomsFromDatabase(activeRooms, databaseManager) {
    try {
        const rooms = await databaseManager.getRooms();
        rooms.forEach(room => {
            activeRooms.set(room.name, {
                ...room,
                users: new Map(), // Usuários ativos em memória
                createdAt: room.createdAt || new Date()
            });
        });
        console.log(`📋 ${rooms.length} salas carregadas do banco de dados`);
    } catch (error) {
        console.error('❌ Erro ao carregar salas do banco:', error);
    }
}

// Função para criar salas padrão
async function createDefaultRooms(activeRooms, databaseManager) {
    const defaultRooms = ['Geral', 'Tecnologia', 'Jogos'];
    
    for (const roomName of defaultRooms) {
        if (!activeRooms.has(roomName)) {
            const roomData = {
                name: roomName,
                description: `Sala ${roomName}`,
                createdBy: 'system',
                isPrivate: false,
                password: null
            };
            
            try {
                await databaseManager.createRoom(roomData);
                activeRooms.set(roomName, {
                    ...roomData,
                    users: new Map(),
                    createdAt: new Date()
                });
                console.log(`🏠 Sala padrão criada: ${roomName}`);
            } catch (error) {
                console.error(`❌ Erro ao criar sala padrão ${roomName}:`, error);
            }
        }
    }
}

module.exports = {
    setupSocketHandlers
};