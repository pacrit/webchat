// backend/src/utils.js
const validator = require('validator');

/**
 * Sanitizar mensagem para prevenir XSS e outros ataques
 */
function sanitizeMessage(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }
    
    // Remover scripts e HTML potencialmente perigosos
    let sanitized = text
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
        .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
        .replace(/<link\b[^>]*>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    
    // Escapar HTML básico mas permitir algumas formatações
    sanitized = validator.escape(sanitized);
    
    // Permitir algumas tags básicas (opcional)
    // sanitized = sanitized
    //     .replace(/&lt;b&gt;/gi, '<b>')
    //     .replace(/&lt;\/b&gt;/gi, '</b>')
    //     .replace(/&lt;i&gt;/gi, '<i>')
    //     .replace(/&lt;\/i&gt;/gi, '</i>');
    
    return sanitized.trim();
}

/**
 * Validar mensagem
 */
function validateMessage(data) {
    const errors = [];
    
    // Verificar se data existe
    if (!data || typeof data !== 'object') {
        return {
            isValid: false,
            error: 'Dados da mensagem inválidos'
        };
    }
    
    // Verificar texto
    if (!data.text || typeof data.text !== 'string') {
        errors.push('Texto da mensagem é obrigatório');
    } else {
        const trimmed = data.text.trim();
        
        if (trimmed.length === 0) {
            errors.push('Mensagem não pode estar vazia');
        } else if (trimmed.length > 500) {
            errors.push('Mensagem muito longa (máximo 500 caracteres)');
        } else if (trimmed.length < 1) {
            errors.push('Mensagem muito curta');
        }
        
        // Verificar conteúdo suspeito
        if (containsSuspiciousContent(trimmed)) {
            errors.push('Conteúdo não permitido');
        }
    }
    
    // Verificar timestamp
    if (data.timestamp && !isValidTimestamp(data.timestamp)) {
        errors.push('Timestamp inválido');
    }
    
    return {
        isValid: errors.length === 0,
        error: errors.length > 0 ? errors[0] : null,
        errors: errors
    };
}

/**
 * Verificar conteúdo suspeito
 */
function containsSuspiciousContent(text) {
    // Lista de padrões suspeitos
    const suspiciousPatterns = [
        /<script/i,
        /javascript:/i,
        /vbscript:/i,
        /onload=/i,
        /onerror=/i,
        /onclick=/i,
        /eval\(/i,
        /expression\(/i
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(text));
}

/**
 * Validar timestamp
 */
function isValidTimestamp(timestamp) {
    if (!timestamp || typeof timestamp !== 'number') {
        return false;
    }
    
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const oneHourFromNow = now + (60 * 60 * 1000);
    
    // Timestamp deve estar entre 1 hora atrás e 1 hora no futuro
    return timestamp >= oneHourAgo && timestamp <= oneHourFromNow;
}

/**
 * Gerar ID único para mensagens
 */
function generateMessageId() {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substr(2, 9);
    return `msg_${timestamp}_${random}`;
}

/**
 * Gerar ID único para usuários temporários
 */
function generateUserId() {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substr(2, 9);
    return `user_${timestamp}_${random}`;
}

/**
 * Gerar ID único para salas
 */
function generateRoomId() {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substr(2, 9);
    return `room_${timestamp}_${random}`;
}

/**
 * Formatar data para logs
 */
function formatLogDate(date = new Date()) {
    return date.toISOString().replace('T', ' ').substr(0, 19);
}

/**
 * Validar email
 */
function isValidEmail(email) {
    return validator.isEmail(email);
}

/**
 * Validar URL
 */
function isValidUrl(url) {
    return validator.isURL(url, {
        protocols: ['http', 'https'],
        require_protocol: true
    });
}

/**
 * Limitar comprimento de string
 */
function truncateString(str, maxLength) {
    if (!str || typeof str !== 'string') {
        return '';
    }
    
    if (str.length <= maxLength) {
        return str;
    }
    
    return str.substring(0, maxLength - 3) + '...';
}

/**
 * Escapar caracteres especiais para RegExp
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Delay assíncrono
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry function com backoff exponencial
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    
    for (let i = 0; i <= maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            
            if (i === maxRetries) {
                throw lastError;
            }
            
            const delayMs = baseDelay * Math.pow(2, i);
            console.log(`Tentativa ${i + 1} falhou, tentando novamente em ${delayMs}ms...`);
            await delay(delayMs);
        }
    }
}

/**
 * Filtro de profanidade básico (opcional)
 */
function filterProfanity(text) {
    // Lista básica de palavras a serem filtradas
    const profanityList = [
        // Adicione palavras conforme necessário
    ];
    
    let filtered = text;
    profanityList.forEach(word => {
        const regex = new RegExp(escapeRegExp(word), 'gi');
        filtered = filtered.replace(regex, '*'.repeat(word.length));
    });
    
    return filtered;
}

/**
 * Detectar spam básico
 */
function isSpam(text, previousMessages = []) {
    // Verificar se é repetitiva
    const duplicateCount = previousMessages.filter(msg => msg.toLowerCase() === text.toLowerCase()).length;
    if (duplicateCount > 2) {
        return true;
    }
    
    // Verificar se tem muitas maiúsculas
    const uppercaseRatio = (text.match(/[A-Z]/g) || []).length / text.length;
    if (uppercaseRatio > 0.7 && text.length > 10) {
        return true;
    }
    
    // Verificar se tem muitos caracteres especiais repetidos
    const repeatedChars = text.match(/(.)\1{4,}/g);
    if (repeatedChars && repeatedChars.length > 0) {
        return true;
    }
    
    return false;
}

/**
 * Extrair URLs de texto
 */
function extractUrls(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.match(urlRegex) || [];
}

/**
 * Verificar se URL é segura (lista básica)
 */
function isSafeUrl(url) {
    const suspiciousDomains = [
        'malicious.com',
        'phishing.com',
        'spam.com'
        // Adicione mais conforme necessário
    ];
    
    try {
        const urlObj = new URL(url);
        return !suspiciousDomains.some(domain => urlObj.hostname.includes(domain));
    } catch {
        return false;
    }
}

/**
 * Calcular hash simples para detecção de duplicatas
 */
function simpleHash(str) {
    let hash = 0;
    if (str.length === 0) return hash;
    
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    
    return hash;
}

/**
 * Obter IP do cliente a partir do socket
 */
function getClientIp(socket) {
    return socket.handshake.headers['x-forwarded-for'] || 
           socket.handshake.headers['x-real-ip'] || 
           socket.conn.remoteAddress ||
           socket.handshake.address;
}

/**
 * Formatar bytes para legível
 */
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

module.exports = {
    sanitizeMessage,
    validateMessage,
    containsSuspiciousContent,
    isValidTimestamp,
    generateMessageId,
    generateUserId,
    generateRoomId,
    formatLogDate,
    isValidEmail,
    isValidUrl,
    truncateString,
    escapeRegExp,
    delay,
    retryWithBackoff,
    filterProfanity,
    isSpam,
    extractUrls,
    isSafeUrl,
    simpleHash,
    getClientIp,
    formatBytes
};