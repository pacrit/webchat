const admin = require('firebase-admin');

// Configurar Firebase Admin
if (!admin.apps.length) {
    const serviceAccount = require('../firebase-service-account.json');
    
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'webchat-18022'
    });
}

const db = admin.firestore();

// Configurações do Firestore
db.settings({
    ignoreUndefinedProperties: true
});

class DatabaseManager {
    constructor() {
        this.db = db;
    }

    // === GERENCIAMENTO DE SALAS ===
    
    async createRoom(roomData) {
        try {
            const roomRef = await this.db.collection('rooms').add({
                ...roomData,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                lastActivity: admin.firestore.FieldValue.serverTimestamp(),
                messageCount: 0,
                userCount: 0
            });
            
            console.log(`💾 Sala salva no banco: ${roomData.name} (${roomRef.id})`);
            return roomRef.id;
        } catch (error) {
            console.error('❌ Erro ao salvar sala:', error);
            throw error;
        }
    }

    async getRooms() {
        try {
            const snapshot = await this.db.collection('rooms')
                .orderBy('createdAt', 'desc')
                .get();
            
            const rooms = [];
            snapshot.forEach(doc => {
                rooms.push({
                    id: doc.id,
                    ...doc.data(),
                    createdAt: doc.data().createdAt?.toDate(),
                    lastActivity: doc.data().lastActivity?.toDate()
                });
            });
            
            return rooms;
        } catch (error) {
            console.error('❌ Erro ao carregar salas:', error);
            throw error;
        }
    }

    async updateRoomStats(roomName, updates) {
        try {
            const roomQuery = await this.db.collection('rooms')
                .where('name', '==', roomName)
                .limit(1)
                .get();

            if (!roomQuery.empty) {
                const roomDoc = roomQuery.docs[0];
                await roomDoc.ref.update({
                    ...updates,
                    lastActivity: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        } catch (error) {
            console.error('❌ Erro ao atualizar estatísticas da sala:', error);
        }
    }

    // === GERENCIAMENTO DE MENSAGENS ===
    
    async saveMessage(messageData) {
        try {
            const messageRef = await this.db.collection('messages').add({
                ...messageData,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
            
            // Atualizar contador de mensagens da sala
            await this.updateRoomStats(messageData.roomName, {
                messageCount: admin.firestore.FieldValue.increment(1)
            });
            
            return messageRef.id;
        } catch (error) {
            console.error('❌ Erro ao salvar mensagem:', error);
            throw error;
        }
    }

    async getRoomMessages(roomName, limit = 50) {
        try {
            const snapshot = await this.db.collection('messages')
                .where('roomName', '==', roomName)
                .orderBy('timestamp', 'desc')
                .limit(limit)
                .get();
            
            const messages = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                messages.push({
                    id: doc.id,
                    ...data,
                    timestamp: data.timestamp?.toDate()?.getTime() || Date.now()
                });
            });
            
            return messages.reverse(); // Ordem cronológica
        } catch (error) {
            console.error('❌ Erro ao carregar mensagens:', error);
            return [];
        }
    }

    // === GERENCIAMENTO DE USUÁRIOS ===
    
    async saveUserSession(userId, sessionData) {
        try {
            await this.db.collection('userSessions').doc(userId).set({
                ...sessionData,
                lastActivity: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } catch (error) {
            console.error('❌ Erro ao salvar sessão do usuário:', error);
        }
    }

    async getUserSessions() {
        try {
            const snapshot = await this.db.collection('userSessions').get();
            const sessions = {};
            
            snapshot.forEach(doc => {
                sessions[doc.id] = {
                    ...doc.data(),
                    lastActivity: doc.data().lastActivity?.toDate()
                };
            });
            
            return sessions;
        } catch (error) {
            console.error('❌ Erro ao carregar sessões:', error);
            return {};
        }
    }

    async removeUserSession(userId) {
        try {
            await this.db.collection('userSessions').doc(userId).delete();
        } catch (error) {
            console.error('❌ Erro ao remover sessão:', error);
        }
    }

    // === LIMPEZA E MANUTENÇÃO ===
    
    async cleanupOldData() {
        try {
            const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            
            // Limpar mensagens antigas (mais de 7 dias)
            const oldMessages = await this.db.collection('messages')
                .where('timestamp', '<', oneWeekAgo)
                .limit(500)
                .get();
            
            const batch = this.db.batch();
            oldMessages.forEach(doc => {
                batch.delete(doc.ref);
            });
            
            if (!oldMessages.empty) {
                await batch.commit();
                console.log(`🧹 ${oldMessages.size} mensagens antigas removidas`);
            }
            
            // Limpar sessões inativas (mais de 24 horas)
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const inactiveSessions = await this.db.collection('userSessions')
                .where('lastActivity', '<', oneDayAgo)
                .get();
            
            const sessionBatch = this.db.batch();
            inactiveSessions.forEach(doc => {
                sessionBatch.delete(doc.ref);
            });
            
            if (!inactiveSessions.empty) {
                await sessionBatch.commit();
                console.log(`🧹 ${inactiveSessions.size} sessões inativas removidas`);
            }
            
        } catch (error) {
            console.error('❌ Erro na limpeza de dados:', error);
        }
    }
}

// Instância singleton
const databaseManager = new DatabaseManager();

module.exports = {
    db,
    databaseManager,
    admin
};