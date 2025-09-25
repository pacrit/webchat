# 🔒 Chat Seguro com Firebase Auth + Socket.IO

Um sistema de chat em tempo real com autenticação Firebase e comunicação via Socket.IO, desenvolvido com foco em **segurança** e **boas práticas**.

## 🚀 Recursos

### Frontend
- ✅ Interface moderna e responsiva
- ✅ Autenticação Google via Firebase
- ✅ Conexão em tempo real com Socket.IO
- ✅ Validação de dados client-side
- ✅ Rate limiting frontend
- ✅ Sanitização de mensagens
- ✅ Reconexão automática
- ✅ Indicadores de status de conexão

### Backend
- ✅ Autenticação Firebase Admin SDK
- ✅ Validação e sanitização server-side
- ✅ Rate limiting por usuário
- ✅ Headers de segurança (Helmet)
- ✅ CORS configurável
- ✅ Logs de segurança
- ✅ Cache de tokens
- ✅ Detecção de spam básica

### Segurança
- ✅ Todas as chaves sensíveis em variáveis de ambiente
- ✅ Validação de tokens Firebase server-side
- ✅ Sanitização contra XSS
- ✅ Rate limiting por IP e usuário
- ✅ Headers de segurança
- ✅ Validação de dados de entrada
- ✅ Logs de auditoria

## 📁 Estrutura do Projeto

```
firebase-socketio-chat/
│
├── 📁 frontend/                    # Aplicação client-side
│   ├── 📄 index.html              # Interface principal
│   ├── 📄 config.js               # Configurações públicas
│   └── 📄 app.js                  # Lógica principal do frontend
│
├── 📁 backend/                     # Servidor Node.js
│   ├── 📄 server.js               # Servidor principal
│   ├── 📄 package.json            # Dependências
│   ├── 📄 .env                    # Variáveis de ambiente (PRIVADO)
│   └── 📁 src/
│       ├── 📄 auth.js             # Autenticação Firebase
│       ├── 📄 socketHandlers.js   # Handlers do Socket.IO
│       └── 📄 utils.js            # Funções utilitárias
│
├── 📄 .gitignore                  # Arquivos ignorados pelo Git
├── 📄 .env.example                # Exemplo de variáveis
└── 📄 README.md                   # Este arquivo
```

## 🛠️ Configuração

### 1. Pré-requisitos

- Node.js 16+ e npm 8+
- Conta no Firebase
- Editor de código (VS Code recomendado)

### 2. Clone do Repositório

```bash
git clone https://github.com/seu-usuario/firebase-socketio-chat.git
cd firebase-socketio-chat
```

### 3. Configuração do Firebase

#### 3.1. Criar Projeto Firebase

1. Acesse [Firebase Console](https://console.firebase.google.com)
2. Clique em "Criar projeto" ou "Add project"
3. Digite o nome do projeto e siga as instruções
4. Ative o Google Analytics (opcional)

#### 3.2. Configurar Autenticação

1. No console Firebase: **Authentication** → **Sign-in method**
2. Ative **Google** como provedor
3. Configure os domínios autorizados:
   - `localhost` (desenvolvimento)
   - `seu-dominio.com` (produção)

#### 3.3. Obter Credenciais para Frontend

1. Vá em **Configurações do projeto** (⚙️) → **Geral**
2. Na seção "Seus aplicativos", clique em **Adicionar aplicativo** → **Web** 📱
3. Registre o aplicativo com um nome
4. Copie o objeto `firebaseConfig`

#### 3.4. Obter Credenciais para Backend

1. Vá em **Configurações do projeto** (⚙️) → **Contas de serviço**
2. Clique em **Gerar nova chave privada**
3. Baixe o arquivo JSON (mantenha-o seguro!)

### 4. Configuração do Backend

#### 4.1. Instalar Dependências

```bash
cd backend
npm install
```

#### 4.2. Configurar Variáveis de Ambiente

```bash
# Copiar arquivo de exemplo
cp .env.example .env

# Editar arquivo .env
nano .env  # ou code .env
```

Preencha o arquivo `.env` com suas credenciais:

```env
# Firebase (extrair do arquivo JSON baixado)
FIREBASE_PROJECT_ID=seu-projeto-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nSua-Chave-Aqui\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@seu-projeto.iam.gserviceaccount.com

# Servidor
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000
```

#### 4.3. Testar Configuração

```bash
npm run env:check
```

#### 4.4. Iniciar Servidor

```bash
# Desenvolvimento
npm run dev

# Produção
npm start
```

### 5. Configuração do Frontend

#### 5.1. Atualizar Configurações

Edite `frontend/config.js`:

```javascript
const firebaseConfig = {
    apiKey: "SUA_API_KEY",
    authDomain: "seu-projeto.firebaseapp.com",
    projectId: "seu-projeto-id",
    // ... outras configurações
};
```

#### 5.2. Servir Frontend

**Opção 1: Servidor HTTP simples**
```bash
cd frontend
python -m http.server 8080  # Python 3
# ou
python -m SimpleHTTPServer 8080  # Python 2
```

**Opção 2: Live Server (VS Code)**
- Instale a extensão "Live Server"
- Clique direito em `index.html` → "Open with Live Server"

**Opção 3: Node.js serve**
```bash
npx serve frontend -p 8080
```

## Segurança Implementada

### Autenticação
- Tokens Firebase verificados server-side
- Cache de tokens com TTL
- Revogação automática de tokens inválidos
- Validação de email verificado

### Prevenção de Ataques
- **XSS**: Sanitização de HTML/JavaScript
- **Rate Limiting**: Limites por IP e usuário
- **CORS**: Origins específicos configurados
- **Headers de Segurança**: Helmet.js implementado
- **Validação**: Todos os inputs validados

### Logs de Auditoria
- Conexões e desconexões
- Tentativas de autenticação
- Mensagens enviadas
- Erros de segurança

### Variáveis de Ambiente
- Todas as chaves em `.env`
- Nunca commitadas no Git
- Diferentes configs por ambiente


## Testes

```bash
# Instalar dependências de teste
npm install --only=dev

# Executar testes
npm test

# Coverage
npm run test:coverage

# Testes em watch mode
npm run test:watch
```

## Docker

```bash
# Build da imagem
docker build -t chat-server .

# Executar container
docker run -p 3000:3000 --env-file .env chat-server

# Com Docker Compose
docker-compose up -d
```

## Personalização

### Adicionar Novas Funcionalidades

1. **Salas de Chat**
```javascript
// Em socketHandlers.js
socket.on('joinRoom', (roomName) => {
    socket.join(roomName);
    socket.emit('joinedRoom', roomName);
});
```

2. **Mensagens Privadas**
```javascript
socket.on('privateMessage', (data) => {
    io.to(data.targetUserId).emit('privateMessage', {
        from: socket.userInfo,
        text: data.text
    });
});
```

3. **Upload de Arquivos**
```javascript
// Usar multer para uploads
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
```

### Configurar Banco de Dados

```javascript
// Para persistir mensagens
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});
```

## Troubleshooting

### Problemas Comuns

1. **Erro de CORS**
```bash
# Verificar CORS_ORIGIN no .env
CORS_ORIGIN=http://localhost:8080,https://seu-dominio.com
```

2. **Firebase Authentication Failed**
```bash
# Verificar variáveis Firebase no .env
npm run env:check
```

3. **Socket não conecta**
```bash
# Verificar se servidor está rodando
curl http://localhost:3000/health
```

4. **Rate Limit Exceeded**
```bash
# Aguardar ou ajustar limites no .env
RATE_LIMIT_MAX_REQUESTS=200
```


## 🆘 Suporte

### Documentação Oficial
- [Firebase Documentation](https://firebase.google.com/docs)
- [Socket.IO Documentation](https://socket.io/docs/)
- [Express.js Documentation](https://expressjs.com/)

### Comunidade
- [Stack Overflow](https://stackoverflow.com/questions/tagged/firebase)
- [Firebase Discord](https://discord.gg/firebase)
- [Socket.IO Slack](https://socket.io/slack/)

### Relatório de Bugs
Abra uma issue no GitHub com:
- Descrição detalhada do problema
- Logs relevantes
- Passos para reproduzir
- Ambiente (Node.js version, OS, etc.)

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -am 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

---

**Feito com ❤️ e foco em segurança**
**README FEITO COM IA (Esta em teste ainda :) )**
