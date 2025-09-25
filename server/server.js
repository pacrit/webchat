// backend/server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { verifyFirebaseToken } = require('./src/auth');
const socketHandlers = require('./src/socketHandlers');
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

// Middleware de autenticação do Socket.IO
io.use(verifyFirebaseToken);

// Aplicar handlers do Socket.IO
socketHandlers(io);

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

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`🔒 Ambiente: ${process.env.NODE_ENV}`);
    console.log(`🌐 CORS configurado para: ${corsOptions.origin}`);
});

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