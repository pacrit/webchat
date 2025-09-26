// backend/server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { verifyFirebaseToken } = require('./src/auth');
const { setupSocketHandlers } = require('./src/socketHandlers'); 
const { databaseManager } = require('./src/database');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Segurança - Headers de segurança
app.use(helmet());

// Rate Limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
    message: 'Muitas tentativas, tente novamente mais tarde.',
    standardHeaders: true,
    legacyHeaders: false,
});

app.use(limiter);

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// CORS configurado adequadamente
const corsOptions = {
    origin: process.env.NODE_ENV === 'production' 
        ? process.env.CORS_ORIGIN?.split(',') || ['https://seudominio.com']
        : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:8080'],
    methods: ['GET', 'POST'],
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Socket.IO com CORS
const io = socketIo(server, {
    cors: corsOptions,
    pingTimeout: 60000,
    pingInterval: 25000
});

// Configurar CORS para Socket.IO
io.engine.on("connection_error", (err) => {
    console.log("Erro de conexão Socket.IO:", err.req);
    console.log("Código do erro:", err.code);
    console.log("Mensagem:", err.message);
    console.log("Contexto:", err.context);
});

// Função auxiliar para gerar avatar padrão
function generateDefaultAvatar(name) {
    const firstLetter = name ? name.charAt(0).toUpperCase() : 'U';
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
    const color = colors[Math.abs(name.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % colors.length];
    
    return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="35" height="35"><circle cx="17.5" cy="17.5" r="17.5" fill="${color}"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="white" font-family="Arial" font-size="14">${firstLetter}</text></svg>`;
}

// Middleware de autenticação do Socket.IO
io.use(async (socket, next) => {
    try {
        console.log('🔐 Verificando autenticação do socket...');
        
        // Pegar token do handshake
        const token = socket.handshake.auth?.token || 
                     socket.handshake.query?.token ||
                     socket.handshake.headers?.authorization?.replace('Bearer ', '');
        
        console.log('🔧 DEBUG - Token recebido:', token ? 'Presente' : 'Ausente');
        
        if (!token) {
            console.log('❌ Token não fornecido');
            return next(new Error('Token de autenticação necessário'));
        }
        
        // TEMPORÁRIO - Para desenvolvimento, vamos pegar dados do query
        const userData = {
            uid: socket.handshake.query.uid || 'user_' + Date.now(),
            name: socket.handshake.query.name || 'Usuário Anônimo',
            email: socket.handshake.query.email || 'anonimo@example.com',
            avatar: socket.handshake.query.avatar || generateDefaultAvatar('Usuário')
        };
        
        console.log('✅ Usuário autenticado:', userData.name);
        
        // IMPORTANTE: Definir essas propriedades
        socket.userId = userData.uid;
        socket.userInfo = {
            uid: userData.uid,
            name: userData.name,
            email: userData.email,
            avatar: userData.avatar,
            emailVerified: true
        };
        
        next();
    } catch (error) {
        console.error('❌ Erro de autenticação do socket:', error);
        next(new Error('Falha na autenticação'));
    }
});

// Configurar handlers do Socket.IO - CORRIGIDO
const socketData = setupSocketHandlers(io, databaseManager);

// Rotas da API
app.get('/', (req, res) => {
    res.json({
        message: 'Chat Server está rodando!',
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Endpoint para configurações públicas do Firebase
app.get('/config', (req, res) => {
    res.json({
        firebase: {
            apiKey: process.env.FIREBASE_API_KEY,
            authDomain: process.env.FIREBASE_AUTH_DOMAIN,
            projectId: process.env.FIREBASE_PROJECT_ID,
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.FIREBASE_APP_ID
        },
        app: {
            socketUrl: process.env.NODE_ENV === 'production' 
                ? process.env.PRODUCTION_SOCKET_URL || 'https://seu-servidor.herokuapp.com'
                : `http://localhost:${process.env.PORT || 3030}`,
            maxMessageLength: process.env.MAX_MESSAGE_LENGTH || 500,
            features: {
                enableNotifications: true,
                enableSoundNotifications: false,
                enableEmojiPicker: false,
                enableFileUpload: false
            }
        }
    });
});

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: process.env.NODE_ENV === 'production' 
            ? 'Erro interno do servidor' 
            : err.message
    });
});

// Tratamento de rotas não encontradas
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
});

const PORT = process.env.PORT || 3030;

server.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`🔒 Ambiente: ${process.env.NODE_ENV}`);
    console.log(`🌐 CORS configurado para: ${corsOptions.origin}`);
});

// Limpeza de dados antigas a cada 6 horas
setInterval(() => {
    databaseManager.cleanupOldData();
}, 6 * 60 * 60 * 1000);

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
    });
});

module.exports = { app, server, io };