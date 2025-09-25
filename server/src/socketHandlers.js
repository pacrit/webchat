// backend/src/socketHandlers.js
const { validateUserData } = require('./auth');
const { sanitizeMessage, generateMessageId, validateMessage } = require('./utils');

// Rate limiting configuration
const MESSAGE_RATE_LIMIT = {
    maxMessages: 10,
    windowMs: 60 * 1000 // 1 minuto
};

/**
 * Configurar handlers do Socket.IO
 */
function setupSocketHandlers(io) {
    // Armazenar usuários conectados
    const connectedUsers = new Map();
    
    // Rate limiting por usuário para mensagens
    const messageRateLimits = new Map();
    
    io.on('connection', (socket) => {
        console.log(`👋 Usuário conectado: ${socket.userInfo.name} (${socket.userId})`);
        
        // Validar dados do usuário
        const validation = validateUserData(socket.userInfo);
        if (!validation.isValid) {
            console.error('❌ Dados do usuário inválidos:', validation.errors);
            socket.emit('error', 'Dados do usuário inválidos');
            socket.disconnect();
            return;
        }
        
        // Adicionar usuário à lista de conectados
        connectedUsers.set(socket.userId, {
            socketId: socket.id,
            user: socket.userInfo,
            connectedAt: new Date(),
            lastActivity: new Date()
        });
        
        // Notificar outros usuários sobre a entrada
        socket.broadcast.emit('userJoined', {
            user: socket.userInfo,
            userCount: connectedUsers.size
        });
        
        // Enviar contagem de usuários para o usuário que acabou de se conectar
        socket.emit('userCount', connectedUsers.size);
        
        // Enviar mensagens de boas-vindas
        socket.emit('message', {
            id: generateMessageId(),
            text: `Bem-vindo ao chat, ${socket.userInfo.name}!`,
            user: {
                uid: 'system',
                name: 'Sistema',
                avatar: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="35" height="35"><circle cx="17.5" cy="17.5" r="17.5" fill="%23667eea"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="white">🤖</text></svg>'
            },
            timestamp: Date.now(),
            isSystem: true
        });
        
        // Handler para mensagens
        socket.on('message', (data) => {
            handleMessage(socket, data, connectedUsers, io, messageRateLimits);
        });
        
        // Handler para obter usuários online
        socket.on('getOnlineUsers', () => {
            handleGetOnlineUsers(socket, connectedUsers);
        });
        
        // Handler para typing indicators (opcional)
        socket.on('typing', (isTyping) => {
            handleTyping(socket, isTyping, connectedUsers, io);
        });
        
        // Handler para ping/pong (health check)
        socket.on('ping', () => {
            socket.emit('pong');
            updateUserActivity(socket.userId, connectedUsers);
        });
        
        // Quando o usuário se desconecta
        socket.on('disconnect', (reason) => {
            handleDisconnect(socket, reason, connectedUsers, io);
        });
        
        // Handler para erros do socket
        socket.on('error', (error) => {
            console.error(`❌ Erro do socket ${socket.userInfo.name}:`, error);
        });
        
        // Atualizar atividade do usuário
        updateUserActivity(socket.userId, connectedUsers);
    });
    
    // Limpar usuários inativos a cada 5 minutos
    setInterval(() => {
        cleanInactiveUsers(connectedUsers, io);
    }, 5 * 60 * 1000);
    
    return { connectedUsers };
}

/**
 * Handler para mensagens
 */
function handleMessage(socket, data, connectedUsers, io, messageRateLimits) {
    try {
        // Verificar rate limiting
        if (!checkMessageRateLimit(socket.userId, messageRateLimits)) {
            socket.emit('error', 'Você está enviando mensagens muito rapidamente. Aguarde um momento.');
            return;
        }
        
        // Validar dados da mensagem
        const validation = validateMessage(data);
        if (!validation.isValid) {
            socket.emit('error', validation.error);
            return;
        }
        
        // Sanitizar texto da mensagem
        const sanitizedText = sanitizeMessage(data.text);
        
        // Criar objeto da mensagem
        const message = {
            id: generateMessageId(),
            text: sanitizedText,
            user: socket.userInfo,
            timestamp: Date.now(),
            socketId: socket.id
        };
        
        // Log da mensagem
        console.log(`💬 ${socket.userInfo.name}: ${sanitizedText}`);
        
        // Enviar mensagem para todos os clientes
        io.emit('message', message);
        
        // Atualizar atividade do usuário
        updateUserActivity(socket.userId, connectedUsers);
        
        // Registrar mensagem para rate limiting
        recordMessageForRateLimit(socket.userId, messageRateLimits);
        
    } catch (error) {
        console.error('❌ Erro ao processar mensagem:', error);
        socket.emit('error', 'Erro ao processar mensagem');
    }
}

/**
 * Handler para obter usuários online
 */
function handleGetOnlineUsers(socket, connectedUsers) {
    const users = Array.from(connectedUsers.values()).map(userData => ({
        uid: userData.user.uid,
        name: userData.user.name,
        avatar: userData.user.avatar,
        connectedAt: userData.connectedAt,
        isActive: (Date.now() - userData.lastActivity) < 5 * 60 * 1000 // Ativo nos últimos 5 min
    }));
    
    socket.emit('onlineUsers', users);
}

/**
 * Handler para indicadores de digitação
 */
function handleTyping(socket, isTyping, connectedUsers, io) {
    // Broadcast para outros usuários (não para si mesmo)
    socket.broadcast.emit('userTyping', {
        user: socket.userInfo,
        isTyping: isTyping
    });
    
    updateUserActivity(socket.userId, connectedUsers);
}

/**
 * Handler para desconexão
 */
function handleDisconnect(socket, reason, connectedUsers, io) {
    console.log(`👋 Usuário desconectado: ${socket.userInfo.name} (${reason})`);
    
    // Remover usuário da lista
    const userData = connectedUsers.get(socket.userId);
    connectedUsers.delete(socket.userId);
    
    // Notificar outros usuários sobre a saída
    if (userData) {
        socket.broadcast.emit('userLeft', {
            user: socket.userInfo,
            userCount: connectedUsers.size
        });
    }
    
    // Log de desconexão
    const connectionDuration = userData 
        ? Math.round((Date.now() - userData.connectedAt.getTime()) / 1000)
        : 0;
    
    console.log(`📊 Duração da conexão: ${connectionDuration}s`);
}

/**
 * Verificar rate limiting de mensagens
 */
function checkMessageRateLimit(userId, messageRateLimits) {
    const now = Date.now();
    const userLimit = messageRateLimits.get(userId) || { messages: [], resetTime: now };
    
    // Reset se janela expirou
    if (now - userLimit.resetTime > MESSAGE_RATE_LIMIT.windowMs) {
        userLimit.messages = [];
        userLimit.resetTime = now;
    }
    
    // Verificar limite
    if (userLimit.messages.length >= MESSAGE_RATE_LIMIT.maxMessages) {
        return false;
    }
    
    return true;
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
 * Limpar usuários inativos
 */
function cleanInactiveUsers(connectedUsers, io) {
    const now = Date.now();
    const inactiveThreshold = 30 * 60 * 1000; // 30 minutos
    
    for (const [userId, userData] of connectedUsers.entries()) {
        if (now - userData.lastActivity.getTime() > inactiveThreshold) {
            console.log(`🧹 Removendo usuário inativo: ${userData.user.name}`);
            
            // Desconectar socket se ainda estiver conectado
            const socket = io.sockets.sockets.get(userData.socketId);
            if (socket) {
                socket.disconnect(true);
            }
            
            // Remover da lista
            connectedUsers.delete(userId);
            
            // Notificar outros usuários
            io.emit('userLeft', {
                user: userData.user,
                userCount: connectedUsers.size
            });
        }
    }
}

/**
 * Obter estatísticas do servidor
 */
function getServerStats(connectedUsers) {
    const now = new Date();
    const users = Array.from(connectedUsers.values());
    
    return {
        totalUsers: connectedUsers.size,
        activeUsers: users.filter(u => (now - u.lastActivity) < 5 * 60 * 1000).length,
        averageConnectionTime: users.length > 0 
            ? Math.round(users.reduce((sum, u) => sum + (now - u.connectedAt), 0) / users.length / 1000)
            : 0,
        uptime: process.uptime(),
        timestamp: now.toISOString()
    };
}

module.exports = setupSocketHandlers;
