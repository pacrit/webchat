// backend/src/auth.js
const admin = require('firebase-admin');
require('dotenv').config();

// Verificar se as variáveis de ambiente necessárias estão definidas
const requiredEnvVars = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error('❌ Variáveis de ambiente obrigatórias não encontradas:', missingVars);
    console.error('💡 Verifique seu arquivo .env');
    process.exit(1);
}

// Configuração do Firebase Admin SDK
const serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
};

// Inicializar Firebase Admin SDK
try {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID
    });
    console.log('✅ Firebase Admin SDK inicializado com sucesso');
} catch (error) {
    console.error('❌ Erro ao inicializar Firebase Admin SDK:', error.message);
    process.exit(1);
}

// Cache de tokens para evitar verificações desnecessárias
const tokenCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

// Função para limpar cache expirado
const cleanExpiredTokens = () => {
    const now = Date.now();
    for (const [token, data] of tokenCache.entries()) {
        if (now - data.timestamp > CACHE_DURATION) {
            tokenCache.delete(token);
        }
    }
};

// Limpar cache a cada 10 minutos
setInterval(cleanExpiredTokens, 10 * 60 * 1000);

/**
 * Middleware para verificar tokens Firebase no Socket.IO
 */
const verifyFirebaseToken = async (socket, next) => {
    try {
        const token = socket.handshake.auth?.token;
        
        if (!token) {
            return next(new Error('Token não fornecido'));
        }

        // Verificar cache primeiro
        const cachedData = tokenCache.get(token);
        if (cachedData && (Date.now() - cachedData.timestamp) < CACHE_DURATION) {
            console.log(`🔄 Token encontrado no cache para usuário: ${cachedData.user.name}`);
            socket.userId = cachedData.user.uid;
            socket.userInfo = cachedData.user;
            return next();
        }

        // Verificar token com Firebase Admin
        const decodedToken = await admin.auth().verifyIdToken(token, true);
        
        // Obter informações adicionais do usuário
        const userRecord = await admin.auth().getUser(decodedToken.uid);
        
        const userInfo = {
            uid: decodedToken.uid,
            email: decodedToken.email || userRecord.email,
            name: decodedToken.name || userRecord.displayName || 'Usuário',
            avatar: decodedToken.picture || userRecord.photoURL || generateAvatarUrl(decodedToken.name || 'U'),
            emailVerified: decodedToken.email_verified || userRecord.emailVerified,
            authTime: decodedToken.auth_time,
            iat: decodedToken.iat,
            exp: decodedToken.exp
        };
        
        // Validações adicionais
        if (!userInfo.emailVerified && process.env.NODE_ENV === 'production') {
            return next(new Error('Email não verificado'));
        }
        
        // Armazenar no cache
        tokenCache.set(token, {
            user: userInfo,
            timestamp: Date.now()
        });
        
        // Anexar ao socket
        socket.userId = userInfo.uid;
        socket.userInfo = userInfo;
        
        console.log(`✅ Usuário autenticado: ${userInfo.name} (${userInfo.uid})`);
        next();
        
    } catch (error) {
        console.error('❌ Erro na verificação do token:', error.message);
        
        // Remover token inválido do cache
        if (socket.handshake.auth?.token) {
            tokenCache.delete(socket.handshake.auth.token);
        }
        
        // Determinar tipo de erro para resposta apropriada
        let errorMessage = 'Token inválido';
        
        if (error.code === 'auth/id-token-expired') {
            errorMessage = 'Token expirado';
        } else if (error.code === 'auth/id-token-revoked') {
            errorMessage = 'Token revogado';
        } else if (error.code === 'auth/user-not-found') {
            errorMessage = 'Usuário não encontrado';
        } else if (error.code === 'auth/user-disabled') {
            errorMessage = 'Usuário desabilitado';
        }
        
        next(new Error(errorMessage));
    }
};

/**
 * Middleware para verificar tokens em rotas Express
 */
const verifyFirebaseTokenExpress = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split('Bearer ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'Token não fornecido' });
        }

        // Verificar cache
        const cachedData = tokenCache.get(token);
        if (cachedData && (Date.now() - cachedData.timestamp) < CACHE_DURATION) {
            req.user = cachedData.user;
            return next();
        }

        // Verificar token
        const decodedToken = await admin.auth().verifyIdToken(token, true);
        const userRecord = await admin.auth().getUser(decodedToken.uid);
        
        const userInfo = {
            uid: decodedToken.uid,
            email: decodedToken.email || userRecord.email,
            name: decodedToken.name || userRecord.displayName,
            avatar: decodedToken.picture || userRecord.photoURL,
            emailVerified: decodedToken.email_verified || userRecord.emailVerified
        };
        
        // Cache do token
        tokenCache.set(token, {
            user: userInfo,
            timestamp: Date.now()
        });
        
        req.user = userInfo;
        next();
        
    } catch (error) {
        console.error('Erro na verificação do token Express:', error.message);
        
        if (req.headers.authorization) {
            const token = req.headers.authorization.split('Bearer ')[1];
            tokenCache.delete(token);
        }
        
        res.status(401).json({ error: 'Token inválido ou expirado' });
    }
};

/**
 * Função para gerar URL de avatar padrão
 */
const generateAvatarUrl = (name) => {
    const initial = name.charAt(0).toUpperCase();
    return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="20" fill="%23667eea"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="white" font-size="16">${initial}</text></svg>`;
};

/**
 * Função para validar se o usuário tem permissões específicas
 */
const checkUserPermissions = (userInfo, requiredPermissions = []) => {
    // Implementar lógica de permissões se necessário
    // Por exemplo: admin, moderator, user
    return true; // Por enquanto, todos os usuários têm acesso
};

/**
 * Função para revogar token de usuário
 */
const revokeUserToken = async (uid) => {
    try {
        await admin.auth().revokeRefreshTokens(uid);
        
        // Limpar do cache todos os tokens do usuário
        for (const [token, data] of tokenCache.entries()) {
            if (data.user.uid === uid) {
                tokenCache.delete(token);
            }
        }
        
        console.log(`🔒 Tokens revogados para usuário: ${uid}`);
        return true;
    } catch (error) {
        console.error('Erro ao revogar tokens:', error);
        return false;
    }
};

/**
 * Função para obter estatísticas do cache
 */
const getCacheStats = () => {
    return {
        totalTokens: tokenCache.size,
        cacheHitRate: 0, // Implementar se necessário
        lastCleanup: new Date().toISOString()
    };
};

/**
 * Função para validar dados do usuário
 */
const validateUserData = (userInfo) => {
    const errors = [];
    
    if (!userInfo.uid || typeof userInfo.uid !== 'string') {
        errors.push('UID inválido');
    }
    
    if (!userInfo.email || typeof userInfo.email !== 'string') {
        errors.push('Email inválido');
    }
    
    if (!userInfo.name || typeof userInfo.name !== 'string' || userInfo.name.trim().length < 2) {
        errors.push('Nome inválido');
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
};

/**
 * Middleware para rate limiting por usuário
 */
const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
    const userRequests = new Map();
    
    // Limpar dados antigos a cada minuto
    setInterval(() => {
        const now = Date.now();
        for (const [userId, data] of userRequests.entries()) {
            if (now - data.resetTime > windowMs) {
                userRequests.delete(userId);
            }
        }
    }, 60 * 1000);
    
    return (socket, next) => {
        const userId = socket.userId;
        const now = Date.now();
        
        if (!userRequests.has(userId)) {
            userRequests.set(userId, {
                count: 1,
                resetTime: now
            });
            return next();
        }
        
        const userData = userRequests.get(userId);
        
        // Reset counter se janela expirou
        if (now - userData.resetTime > windowMs) {
            userData.count = 1;
            userData.resetTime = now;
            return next();
        }
        
        // Verificar limite
        if (userData.count >= maxRequests) {
            return next(new Error('Rate limit excedido'));
        }
        
        userData.count++;
        next();
    };
};

module.exports = {
    admin,
    verifyFirebaseToken,
    verifyFirebaseTokenExpress,
    generateAvatarUrl,
    checkUserPermissions,
    revokeUserToken,
    getCacheStats,
    validateUserData,
    userRateLimit,
    
    // Constantes
    CACHE_DURATION
};