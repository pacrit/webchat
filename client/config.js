// frontend/config.js
// Configurações públicas do Firebase
const firebaseConfig = {
    // SUBSTITUA PELAS SUAS CONFIGURAÇÕES DO FIREBASE
    apiKey: "AIzaSyDrn5H_NZoNlENflki99wC17FfMeziGxuQ",
    authDomain: "webchat-18022.firebaseapp.com",
    projectId: "webchat-18022",
    storageBucket: "webchat-18022.firebasestorage.app",
    messagingSenderId: "974913365020",
    appId: "1:974913365020:web:937cb2278273474fdb2bd9"
};

// Configurações da aplicação
const appConfig = {
    // URL do servidor Socket.IO baseada no ambiente
    SOCKET_URL: (() => {
        const hostname = window.location.hostname;
        const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
        
        // Desenvolvimento local
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return 'http://localhost:3030';
        }
        
        // Produção - substitua pela URL do seu servidor
        return 'https://seu-servidor.herokuapp.com';
    })(),
    
    // Configurações do chat
    MAX_MESSAGE_LENGTH: 500,
    RECONNECT_ATTEMPTS: 5,
    RECONNECT_DELAY: 1000,
    
    // Rate limiting frontend
    MESSAGE_RATE_LIMIT: {
        maxMessages: 10,
        windowMs: 60000 // 1 minuto
    },
    
    // Timeouts
    CONNECTION_TIMEOUT: 10000,
    AUTH_TIMEOUT: 5000,
    
    // Features
    FEATURES: {
        enableNotifications: true,
        enableSoundNotifications: false,
        enableEmojiPicker: false,
        enableFileUpload: false
    }
};

// Configurações de validação
const validationConfig = {
    message: {
        minLength: 1,
        maxLength: appConfig.MAX_MESSAGE_LENGTH,
        allowedChars: /^[\s\S]*$/, // Permite todos os caracteres
        forbiddenWords: [] // Lista de palavras proibidas (opcional)
    },
    
    user: {
        nameMinLength: 2,
        nameMaxLength: 50
    }
};

// Configurações de segurança
const securityConfig = {
    // CSP (Content Security Policy) - já definido no HTML
    sanitizeInput: true,
    validateTokens: true,
    
    // Headers de segurança que o cliente deve verificar
    requiredHeaders: [
        'X-Content-Type-Options',
        'X-Frame-Options',
        'X-XSS-Protection'
    ]
};

// Mensagens de erro padronizadas
const errorMessages = {
    AUTH_FAILED: 'Falha na autenticação. Tente novamente.',
    CONNECTION_FAILED: 'Não foi possível conectar ao servidor.',
    MESSAGE_TOO_LONG: `Mensagem muito longa. Máximo ${appConfig.MAX_MESSAGE_LENGTH} caracteres.`,
    MESSAGE_EMPTY: 'Mensagem não pode estar vazia.',
    RATE_LIMIT_EXCEEDED: 'Você está enviando mensagens muito rapidamente.',
    TOKEN_EXPIRED: 'Sua sessão expirou. Faça login novamente.',
    NETWORK_ERROR: 'Erro de rede. Verifique sua conexão.',
    SERVER_ERROR: 'Erro do servidor. Tente novamente mais tarde.',
    PERMISSION_DENIED: 'Permissão negada.',
    USER_NOT_FOUND: 'Usuário não encontrado.',
    INVALID_DATA: 'Dados inválidos enviados.'
};

// Mensagens de sucesso
const successMessages = {
    LOGIN_SUCCESS: 'Login realizado com sucesso!',
    LOGOUT_SUCCESS: 'Logout realizado com sucesso!',
    MESSAGE_SENT: 'Mensagem enviada!',
    CONNECTED: 'Conectado ao servidor!',
    RECONNECTED: 'Reconectado ao servidor!'
};

// Temas de cores (opcional para futuras implementações)
const themes = {
    default: {
        primary: '#667eea',
        secondary: '#764ba2',
        success: '#4CAF50',
        error: '#f44336',
        warning: '#ff9800',
        background: '#f8f9fa'
    },
    dark: {
        primary: '#4f46e5',
        secondary: '#7c3aed',
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
        background: '#1f2937'
    }
};

// Utilitários de validação
const validators = {
    isValidMessage: (text) => {
        if (!text || typeof text !== 'string') return false;
        const trimmed = text.trim();
        return trimmed.length >= validationConfig.message.minLength && 
               trimmed.length <= validationConfig.message.maxLength;
    },
    
    isValidEmail: (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },
    
    sanitizeMessage: (text) => {
        if (!text) return '';
        // Remove scripts e HTML potencialmente perigosos
        return text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                  .replace(/<[^>]*>/g, '')
                  .trim();
    },
    
    escapeHtml: (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Utilitários de rate limiting
const rateLimiter = {
    messageTimestamps: [],
    
    canSendMessage: () => {
        const now = Date.now();
        const windowStart = now - appConfig.MESSAGE_RATE_LIMIT.windowMs;
        
        // Remove timestamps antigos
        rateLimiter.messageTimestamps = rateLimiter.messageTimestamps.filter(
            timestamp => timestamp > windowStart
        );
        
        return rateLimiter.messageTimestamps.length < appConfig.MESSAGE_RATE_LIMIT.maxMessages;
    },
    
    recordMessage: () => {
        rateLimiter.messageTimestamps.push(Date.now());
    }
};

// Debug helpers (apenas em desenvolvimento)
const debugHelpers = {
    isDevMode: () => {
        return window.location.hostname === 'localhost' || 
               window.location.hostname === '127.0.0.1' ||
               window.location.search.includes('debug=true');
    },
    
    log: (...args) => {
        if (debugHelpers.isDevMode()) {
            console.log('[DEBUG]', ...args);
        }
    },
    
    warn: (...args) => {
        if (debugHelpers.isDevMode()) {
            console.warn('[DEBUG]', ...args);
        }
    },
    
    error: (...args) => {
        console.error('[ERROR]', ...args);
    }
};

// Exportar todas as configurações para o escopo global
window.FIREBASE_CONFIG = firebaseConfig;
window.APP_CONFIG = appConfig;
window.VALIDATION_CONFIG = validationConfig;
window.SECURITY_CONFIG = securityConfig;
window.ERROR_MESSAGES = errorMessages;
window.SUCCESS_MESSAGES = successMessages;
window.THEMES = themes;
window.VALIDATORS = validators;
window.RATE_LIMITER = rateLimiter;
window.DEBUG = debugHelpers;

// Log de inicialização (apenas em desenvolvimento)
debugHelpers.log('Configurações carregadas:', {
    socketUrl: appConfig.SOCKET_URL,
    maxMessageLength: appConfig.MAX_MESSAGE_LENGTH,
    features: appConfig.FEATURES,
    isDevMode: debugHelpers.isDevMode()
});