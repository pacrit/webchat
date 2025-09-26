// frontend/rooms-app.js
class ChatWithRoomsApp {
  constructor() {
    this.socket = null;
    this.currentUser = null;
    this.currentRoom = null;
    this.availableRooms = new Map();
    this.isConnecting = false;
    this.reconnectAttempts = 0;

    // Emoji system
    this.emojiPickerVisible = false;
    this.currentEmojiCategory = "smileys";
    this.recentEmojis = JSON.parse(
      localStorage.getItem("recentEmojis") || "[]"
    );

    // Rate limiting
    this.messageTimestamps = [];

    // DOM Elements
    this.elements = {
      // Login
      loginScreen: document.getElementById("loginScreen"),
      roomsScreen: document.getElementById("roomsScreen"),
      chatScreen: document.getElementById("chatScreen"),
      loginBtn: document.getElementById("loginBtn"),
      logoutBtn: document.getElementById("logoutBtn"),
      roomsLogoutBtn: document.getElementById("roomsLogoutBtn"),
      userAvatar: document.getElementById("userAvatar"),
      userName: document.getElementById("userName"),
      connectionStatus: document.getElementById("connectionStatus"),
      notification: document.getElementById("notification"),

      // Tabs
      loginTab: document.getElementById("loginTab"),
      signupTab: document.getElementById("signupTab"),
      loginTabBtn: document.getElementById("loginTabBtn"),
      signupTabBtn: document.getElementById("signupTabBtn"),

      // Email Auth
      emailInput: document.getElementById("emailInput"),
      passwordInput: document.getElementById("passwordInput"),
      emailAuthBtn: document.getElementById("emailAuthBtn"),

      // Rooms
      createRoomBtn: document.getElementById("createRoomBtn"),
      joinPrivateRoomBtn: document.getElementById("joinPrivateRoomBtn"),
      confirmCreateRoom: document.getElementById("confirmCreateRoom"),
      cancelCreateRoom: document.getElementById("cancelCreateRoom"),
      createRoomModal: document.getElementById("createRoomModal"),
      roomName: document.getElementById("roomName"),
      roomDescription: document.getElementById("roomDescription"),
      isPrivateRoom: document.getElementById("isPrivateRoom"),
      privateRoomCode: document.getElementById("privateRoomCode"),
      roomsList: document.getElementById("roomsList"),

      // Chat
      currentRoomName: document.getElementById("currentRoomName"),
      currentRoomUsers: document.getElementById("currentRoomUsers"),
      backToRoomsBtn: document.getElementById("backToRoomsBtn"),
      messages: document.getElementById("messages"),
      messageInput: document.getElementById("messageInput"),
      sendBtn: document.getElementById("sendBtn"),
    };

    // Configurações usando window.appConfig do config.js
    this.config = window.appConfig || {
      SOCKET_URL: "http://localhost:3030",
      CONNECTION_TIMEOUT: 10000,
      MAX_MESSAGE_LENGTH: 500,
      FEATURES: {
        enableNotifications: true,
      },
    };

    this.init();
  }

  async init() {
    try {
      console.log("🚀 Inicializando ChatWithRoomsApp...");

      // Buscar configurações do Firebase do backend
      const firebaseConfig = await this.fetchFirebaseConfig();

      if (!firebaseConfig) {
        throw new Error("Não foi possível obter configurações do Firebase");
      }

      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }

      this.auth = firebase.auth();
      this.googleProvider = new firebase.auth.GoogleAuthProvider();
      this.googleProvider.addScope("profile");
      this.googleProvider.addScope("email");

      // Event listeners
      this.setupEventListeners();
      this.setupEmojiSystem();

      // Monitor de autenticação
      this.auth.onAuthStateChanged((user) => {
        this.handleAuthStateChange(user);
      });

      console.log("✅ ChatWithRoomsApp inicializada com sucesso");
    } catch (error) {
      console.error("❌ Erro ao inicializar aplicação:", error);
      this.showNotification("Erro ao inicializar aplicação", "error");
    }
  }

  // Método para buscar configurações do Firebase do backend
  async fetchFirebaseConfig() {
    try {
      console.log("🔧 Buscando configurações Firebase do servidor...");

      const response = await fetch(
        `${this.config.SOCKET_URL}/api/config/firebase-config`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success || !data.config) {
        throw new Error("Resposta inválida do servidor");
      }

      console.log("✅ Configurações Firebase obtidas com sucesso");
      return data.config;
    } catch (error) {
      console.error("❌ Erro ao buscar configurações Firebase:", error);

      // Fallback para configurações do window (se existirem)
      if (window.FIREBASE_CONFIG) {
        console.warn("⚠️ Usando configurações Firebase do fallback");
        return window.FIREBASE_CONFIG;
      }

      this.showNotification("Erro ao conectar com servidor", "error");
      return null;
    }
  }

  setupEventListeners() {
    // Login/Logout buttons
    const loginBtn = document.getElementById("loginBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    const roomsLogoutBtn = document.getElementById("roomsLogoutBtn");

    if (loginBtn) {
      loginBtn.addEventListener("click", () => this.handleGoogleLogin());
    }

    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => this.handleLogout());
    }

    if (roomsLogoutBtn) {
      roomsLogoutBtn.addEventListener("click", () => this.handleLogout());
    }

    // Tabs
    const loginTabBtn = document.getElementById("loginTabBtn");
    const signupTabBtn = document.getElementById("signupTabBtn");

    if (loginTabBtn) {
      loginTabBtn.addEventListener("click", () => this.showLoginTab());
    }

    if (signupTabBtn) {
      signupTabBtn.addEventListener("click", () => this.showSignupTab());
    }

    // Email Auth
    const emailAuthBtn = document.getElementById("emailAuthBtn");
    const signupEmailAuthBtn = document.getElementById("signupEmailAuthBtn");
    const signupGoogleBtn = document.getElementById("signupGoogleBtn");

    if (emailAuthBtn) {
      emailAuthBtn.addEventListener("click", () => this.handleEmailAuth(false));
    }

    if (signupEmailAuthBtn) {
      signupEmailAuthBtn.addEventListener("click", () =>
        this.handleEmailAuth(true)
      );
    }

    if (signupGoogleBtn) {
      signupGoogleBtn.addEventListener("click", () => this.handleGoogleLogin());
    }

    // Room management
    const createRoomBtn = document.getElementById("createRoomBtn");
    const confirmCreateRoom = document.getElementById("confirmCreateRoom");
    const cancelCreateRoom = document.getElementById("cancelCreateRoom");
    const joinPrivateRoomBtn = document.getElementById("joinPrivateRoomBtn");
    const backToRoomsBtn = document.getElementById("backToRoomsBtn");

    if (createRoomBtn) {
      createRoomBtn.addEventListener("click", () => this.showCreateRoomModal());
    }

    if (confirmCreateRoom) {
      confirmCreateRoom.addEventListener("click", () => this.createRoom());
    }

    if (cancelCreateRoom) {
      cancelCreateRoom.addEventListener("click", () =>
        this.hideCreateRoomModal()
      );
    }

    if (joinPrivateRoomBtn) {
      joinPrivateRoomBtn.addEventListener("click", () =>
        this.joinPrivateRoom()
      );
    }

    if (backToRoomsBtn) {
      backToRoomsBtn.addEventListener("click", () => this.leaveCurrentRoom());
    }

    // Message handling
    const sendBtn = document.getElementById("sendBtn");
    const messageInput = document.getElementById("messageInput");

    if (sendBtn) {
      sendBtn.addEventListener("click", () => this.sendMessage());
    }

    if (messageInput) {
      messageInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });

      messageInput.addEventListener("input", () => {
        this.validateMessageInput();
      });
    }

    // Modal close on background click
    const createRoomModal = document.getElementById("createRoomModal");
    if (createRoomModal) {
      createRoomModal.addEventListener("click", (e) => {
        if (e.target === createRoomModal) {
          this.hideCreateRoomModal();
        }
      });
    }

    // Enter key handling for auth inputs
    this.setupAuthInputListeners();
  }

  // ===== AUTHENTICATION METHODS =====

  async handleGoogleLogin() {
    if (this.isConnecting) return;

    try {
      this.setLoginButtonState(true, "Entrando...");

      const result = await this.auth.signInWithPopup(this.googleProvider);
      console.log("✅ Login Google bem-sucedido:", result.user.displayName);
      this.showNotification("Login realizado com sucesso!", "success");
    } catch (error) {
      console.error("❌ Erro no login Google:", error);

      let errorMessage = "Erro na autenticação";
      if (error.code === "auth/popup-closed-by-user") {
        errorMessage = "Login cancelado pelo usuário.";
      } else if (error.code === "auth/popup-blocked") {
        errorMessage = "Popup bloqueado. Permita popups para este site.";
      }

      this.showNotification(errorMessage, "error");
    } finally {
      this.setLoginButtonState(false, "Entrar com Google");
    }
  }

  async handleEmailAuth(isSignup = false) {
    let email, password, confirmPassword;

    if (isSignup) {
      email = document.getElementById("signupEmailInput")?.value.trim();
      password = document.getElementById("signupPasswordInput")?.value.trim();
      confirmPassword = document
        .getElementById("confirmPasswordInput")
        ?.value.trim();

      if (password !== confirmPassword) {
        this.showNotification("As senhas não coincidem", "error");
        return;
      }
    } else {
      email = document.getElementById("emailInput")?.value.trim();
      password = document.getElementById("passwordInput")?.value.trim();
    }

    if (!email || !password) {
      this.showNotification("Digite email e senha", "error");
      return;
    }

    if (password.length < 6) {
      this.showNotification(
        "A senha deve ter pelo menos 6 caracteres",
        "error"
      );
      return;
    }

    try {
      this.setEmailAuthButtonState(
        true,
        isSignup ? "Criando conta..." : "Entrando...",
        isSignup
      );

      let result;
      if (isSignup) {
        result = await this.auth.createUserWithEmailAndPassword(
          email,
          password
        );
        console.log("✅ Conta criada com sucesso:", result.user.email);
        this.showNotification("Conta criada com sucesso!", "success");
      } else {
        result = await this.auth.signInWithEmailAndPassword(email, password);
        console.log("✅ Login email bem-sucedido:", result.user.email);
        this.showNotification("Login realizado com sucesso!", "success");
      }
    } catch (error) {
      console.error("❌ Erro na autenticação email:", error);

      let errorMessage = "Erro na autenticação";
      switch (error.code) {
        case "auth/email-already-in-use":
          errorMessage = "Email já está em uso";
          break;
        case "auth/weak-password":
          errorMessage = "Senha muito fraca (mínimo 6 caracteres)";
          break;
        case "auth/user-not-found":
          errorMessage = "Usuário não encontrado";
          break;
        case "auth/wrong-password":
          errorMessage = "Senha incorreta";
          break;
        case "auth/invalid-email":
          errorMessage = "Email inválido";
          break;
        case "auth/too-many-requests":
          errorMessage = "Muitas tentativas. Tente novamente mais tarde";
          break;
      }

      this.showNotification(errorMessage, "error");
    } finally {
      this.setEmailAuthButtonState(
        false,
        isSignup ? "Criar Conta" : "Entrar",
        isSignup
      );
    }
  }

  setupAuthInputListeners() {
    const emailInput = document.getElementById("emailInput");
    const passwordInput = document.getElementById("passwordInput");
    const signupEmailInput = document.getElementById("signupEmailInput");
    const signupPasswordInput = document.getElementById("signupPasswordInput");
    const confirmPasswordInput = document.getElementById(
      "confirmPasswordInput"
    );

    if (emailInput) {
      emailInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") this.handleEmailAuth(false);
      });
    }

    if (passwordInput) {
      passwordInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") this.handleEmailAuth(false);
      });
    }

    if (signupEmailInput) {
      signupEmailInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") this.handleEmailAuth(true);
      });
    }

    if (signupPasswordInput) {
      signupPasswordInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") this.handleEmailAuth(true);
      });
    }

    if (confirmPasswordInput) {
      confirmPasswordInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") this.handleEmailAuth(true);
      });
    }
  }

  async handleLogout() {
    try {
      if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
      }

      await this.auth.signOut();
      this.showNotification("Logout realizado com sucesso!", "success");
      console.log("✅ Logout bem-sucedido");
    } catch (error) {
      console.error("❌ Erro no logout:", error);
      this.showNotification("Erro ao fazer logout.", "error");
    }
  }

  // ===== UI METHODS =====

  showLoginTab() {
    if (this.elements.loginTab) this.elements.loginTab.classList.add("active");
    if (this.elements.signupTab)
      this.elements.signupTab.classList.remove("active");
    if (this.elements.loginTabBtn)
      this.elements.loginTabBtn.classList.add("active");
    if (this.elements.signupTabBtn)
      this.elements.signupTabBtn.classList.remove("active");

    if (this.elements.emailAuthBtn) {
      this.elements.emailAuthBtn.textContent = "Entrar";
    }
  }

  showSignupTab() {
    if (this.elements.loginTab)
      this.elements.loginTab.classList.remove("active");
    if (this.elements.signupTab)
      this.elements.signupTab.classList.add("active");
    if (this.elements.loginTabBtn)
      this.elements.loginTabBtn.classList.remove("active");
    if (this.elements.signupTabBtn)
      this.elements.signupTabBtn.classList.add("active");

    if (this.elements.emailAuthBtn) {
      this.elements.emailAuthBtn.textContent = "Criar Conta";
    }
  }

  handleAuthStateChange(user) {
    if (user) {
      this.currentUser = user;
      this.showRoomsScreen();
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

  showLoginScreen() {
    if (this.elements.loginScreen)
      this.elements.loginScreen.classList.remove("hidden");
    if (this.elements.roomsScreen)
      this.elements.roomsScreen.classList.add("hidden");
    if (this.elements.chatScreen)
      this.elements.chatScreen.classList.add("hidden");
  }

  showRoomsScreen() {
    if (this.elements.loginScreen)
      this.elements.loginScreen.classList.add("hidden");
    if (this.elements.roomsScreen)
      this.elements.roomsScreen.classList.remove("hidden");
    if (this.elements.chatScreen)
      this.elements.chatScreen.classList.add("hidden");

    // Atualizar informações do usuário
    if (this.currentUser) {
      const userNameEl = document.getElementById("roomsUserName");
      const userAvatarEl = document.getElementById("roomsUserAvatar");

      if (userNameEl) {
        userNameEl.textContent =
          this.currentUser.displayName || this.currentUser.email || "Usuário";
      }
      if (userAvatarEl) {
        // CORRIGIR: Usar o método getUserAvatar
        userAvatarEl.src = this.getUserAvatar(this.currentUser);
        userAvatarEl.onerror = () => {
          userAvatarEl.src = this.generateDefaultAvatar(this.currentUser);
        };
      }
    }

    this.loadAvailableRooms();
  }

  showChatScreen() {
    if (this.elements.loginScreen)
      this.elements.loginScreen.classList.add("hidden");
    if (this.elements.roomsScreen)
      this.elements.roomsScreen.classList.add("hidden");
    if (this.elements.chatScreen)
      this.elements.chatScreen.classList.remove("hidden");

    // Setup emoji picker if not exists
    this.setupEmojiPickerInChat();

    // Update room info
    if (this.currentRoom && this.elements.currentRoomName) {
      this.elements.currentRoomName.textContent =
        this.currentRoom.name || "Sala";
    }

    if (this.elements.messageInput) {
      this.elements.messageInput.focus();
    }
  }

  // ===== SOCKET CONNECTION =====

  async connectSocket() {
    if (this.isConnecting || !this.currentUser) return;

    try {
      this.isConnecting = true;
      console.log(
        "🔌 Conectando ao socket com usuário:",
        this.currentUser.displayName
      );

      const idToken = await this.currentUser.getIdToken();

      this.socket = io(this.config.SOCKET_URL, {
        auth: {
          token: idToken,
        },
        query: {
          uid: this.currentUser.uid,
          name:
            this.currentUser.displayName || this.currentUser.email || "Usuário",
          email: this.currentUser.email,
          avatar: this.currentUser.photoURL || null,
        },
        transports: ["websocket", "polling"],
        timeout: this.config.CONNECTION_TIMEOUT,
        forceNew: true,
      });

      this.setupSocketListeners();
    } catch (error) {
      console.error("❌ Erro ao conectar socket:", error);
      this.showNotification("Erro de conexão com servidor", "error");
    } finally {
      this.isConnecting = false;
    }
  }

  setupSocketListeners() {
    if (!this.socket) return;

    // Connection events
    this.socket.on("connect", () => {
      console.log("✅ Conectado ao servidor Socket.IO");
      console.log("🔧 Socket ID:", this.socket.id);
      this.updateConnectionStatus("Online", "connected");
      this.reconnectAttempts = 0;
      this.requestAvailableRooms();
    });

    this.socket.on("disconnect", (reason) => {
      console.log("❌ Desconectado do servidor:", reason);
      this.updateConnectionStatus("Desconectado", "disconnected");
    });

    this.socket.on("connect_error", (error) => {
      console.error("❌ Erro de conexão:", error);
      this.updateConnectionStatus("Erro de conexão", "disconnected");
    });

    // Room events
    this.socket.on("roomCreated", (data) => {
      console.log("✅ Sala criada:", data.roomName);
      this.showNotification(
        `Sala "${data.roomName}" criada com sucesso!`,
        "success"
      );
      this.hideCreateRoomModal();
      this.requestAvailableRooms();
    });

    this.socket.on("roomJoined", (data) => {
      console.log("✅ Entrou na sala:", data.roomName);
      this.currentRoom = {
        name: data.roomName,
        users: data.userCount || 0,
      };
      this.showChatScreen();

      // REMOVER: Notificação popup duplicada
      // this.showNotification(`Entrou na sala "${data.roomName}"`, "success");

      if (this.elements.messages) {
        this.elements.messages.innerHTML = `
                  <div style="text-align: center; color: #81c784; padding: 20px;">
                    <div style="font-weight: 600;">Bem-vindo à ${data.roomName}!</div>
                    <div style="font-size: 14px; margin-top: 5px; opacity: 0.8;">Você entrou na sala com sucesso</div>
                  </div>
                `;
      }
    });

    this.socket.on("roomLeft", (data) => {
      console.log("🚪 Saiu da sala:", data.roomName);
      this.currentRoom = null;
      this.showRoomsScreen();

      // REMOVER: Notificação popup duplicada
      // this.showNotification(`Saiu da sala "${data.roomName}"`, "info");
    });

    this.socket.on("availableRooms", (rooms) => {
      console.log("📋 Salas disponíveis:", rooms);
      this.updateRoomsList(rooms);
    });

    this.socket.on("roomMessage", (message) => {
      console.log("💬 Nova mensagem na sala:", message);
      this.addMessage(message);
    });

    this.socket.on("userJoinedRoom", (data) => {
      console.log("👋 Usuário entrou na sala:", data);

      // MANTER: Apenas a mensagem verde no chat
      this.addSystemMessage(
        `${data.user.name || data.user.email || "Usuário"} entrou na sala`
      );

      // REMOVER: Notificação popup se existir
      // if (data.userCount) {
      //   this.updateRoomUserCount(data.roomName, data.userCount);
      // }
    });

    this.socket.on("userLeftRoom", (data) => {
      console.log("👋 Usuário saiu da sala:", data);

      // MANTER: Apenas a mensagem verde no chat
      this.addSystemMessage(
        `${data.user.name || data.user.email || "Usuário"} saiu da sala`
      );

      // REMOVER: Notificação popup se existir
      // if (data.userCount) {
      //   this.updateRoomUserCount(data.roomName, data.userCount);
      // }
    });

    this.socket.on("roomError", (error) => {
      console.error("❌ Erro de sala:", error);
      this.showNotification(
        error.message || "Erro relacionado à sala",
        "error"
      );
    });

    // Debug de eventos
    this.socket.onAny((eventName, ...args) => {
      console.log(`🔔 Socket evento: ${eventName}`, args);
    });
  }

  // ===== ROOM MANAGEMENT =====

  loadAvailableRooms() {
    const roomsList = document.getElementById("roomsList");

    if (this.socket && this.socket.connected) {
      this.socket.emit("getRooms");
      if (roomsList) {
        roomsList.innerHTML =
          '<div class="loading">Carregando salas do servidor...</div>';
      }
    } else {
      if (roomsList) {
        roomsList.innerHTML = `
          <div style="text-align: center; padding: 40px 20px; color: #999;">
            <div style="font-size: 16px; margin-bottom: 8px;">Nenhuma sala disponível</div>
            <div style="font-size: 14px; opacity: 0.7;">Conecte-se ao servidor para ver as salas</div>
          </div>
        `;
      }
    }
  }

  updateRoomsList(rooms) {
    const roomsList = document.getElementById("roomsList"); // Usar getElementById direto
    if (!roomsList) return;

    if (rooms.length === 0) {
      roomsList.innerHTML = `
        <div class="loading">
          <div style="font-size: 16px; margin-bottom: 8px;">Nenhuma sala disponível</div>
          <div style="font-size: 14px; opacity: 0.7;">Seja o primeiro a criar uma sala!</div>
        </div>
      `;
      return;
    }

    // CORRIGIR: Remover referência a método inexistente
    roomsList.innerHTML = rooms
      .map(
        (room) => `
          <div class="room-card" data-room-name="${this.escapeHtml(room.name)}">
            <div class="room-name">${this.escapeHtml(room.name)}</div>
            <div class="room-description">${this.escapeHtml(
              room.description || "Sem descrição"
            )}</div>
            <div class="room-stats">
              <div class="room-users">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                </svg>
                ${room.users || room.userCount || 0} usuários
              </div>
              <div class="room-privacy ${
                room.isPrivate ? "private" : "public"
              }">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="${
                    room.isPrivate
                      ? "M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6z"
                      : "M12,17A2,2 0 0,0 14,15C14,13.89 13.1,13 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6A2,6 0 0,1 4,20V10C4,8.89 4.9,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3Z"
                  }"/>
                </svg>
                ${room.isPrivate ? "Privada" : "Pública"}
              </div>
            </div>
          </div>
        `
      )
      .join("");

    // CORRIGIR: Usar método correto (joinRoom)
    roomsList.querySelectorAll(".room-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        e.preventDefault();
        const roomName = card.dataset.roomName;
        if (roomName) {
          console.log("🚪 Clicou na sala:", roomName);
          this.joinRoom(roomName); // Usar método correto
        }
      });
    });
  }

  showCreateRoomModal() {
    if (this.elements.createRoomModal) {
      this.elements.createRoomModal.classList.remove("hidden");
    }
  }

  hideCreateRoomModal() {
    if (this.elements.createRoomModal) {
      this.elements.createRoomModal.classList.add("hidden");
    }

    // Clear form
    if (this.elements.roomName) this.elements.roomName.value = "";
    if (this.elements.roomDescription) this.elements.roomDescription.value = "";
    if (this.elements.isPrivateRoom)
      this.elements.isPrivateRoom.checked = false;
  }

  createRoom() {
    const roomName = this.elements.roomName?.value.trim();
    const roomDescription = this.elements.roomDescription?.value.trim();
    const isPrivate = this.elements.isPrivateRoom?.checked || false;

    if (!roomName) {
      this.showNotification("Por favor, digite um nome para a sala!", "error");
      return;
    }

    if (!roomName.match(/^[a-zA-Z0-9\s\-_]+$/)) {
      this.showNotification(
        "Nome da sala só pode conter letras, números, espaços e hífens",
        "error"
      );
      return;
    }

    if (roomName.length < 3 || roomName.length > 50) {
      this.showNotification(
        "Nome da sala deve ter entre 3 e 50 caracteres",
        "error"
      );
      return;
    }

    if (this.socket && this.socket.connected) {
      const createData = {
        roomName: roomName,
        isPrivate: isPrivate,
      };

      if (roomDescription) {
        createData.description = roomDescription;
      }

      console.log("🏗️ DEBUG - Dados da sala:", createData);
      console.log("🔧 DEBUG - Socket conectado:", this.socket?.connected);
      console.log("🔧 DEBUG - Socket ID:", this.socket?.id);

      this.socket.emit("createRoom", createData);
    } else {
      this.showNotification(
        "Servidor não disponível. Conecte-se para criar salas.",
        "warning"
      );
    }
  }

  joinRoom(roomName) {
    if (!roomName) {
      this.showNotification("Nome da sala não fornecido!", "error");
      return;
    }

    if (!this.socket || !this.socket.connected) {
      this.showNotification("Não conectado ao servidor", "warning");
      console.log('❌ Socket não conectado:', {
        socket: !!this.socket,
        connected: this.socket?.connected
      });
      return;
    }

    console.log('🚪 Entrando na sala:', roomName);
    console.log('🔧 Socket status:', {
      connected: this.socket.connected,
      id: this.socket.id
    });

    // REMOVER: Notificação "Entrando na sala" desnecessária
    // this.showNotification(`Entrando na sala "${roomName}"...`, "info");
    
    // Emitir evento para servidor
    this.socket.emit("joinRoom", { 
      roomName: roomName.trim()
    });
}

  joinPrivateRoom() {
    const roomCode = this.elements.privateRoomCode?.value.trim();

    if (!roomCode) {
      this.showNotification("Por favor, digite o código da sala!", "error");
      return;
    }

    this.joinRoom(roomCode);

    if (this.elements.privateRoomCode) {
      this.elements.privateRoomCode.value = "";
    }
  }

  leaveCurrentRoom() {
    if (this.currentRoom && this.socket && this.socket.connected) {
      console.log("🚪 Saindo da sala:", this.currentRoom.name);
      this.socket.emit("leaveRoom", { roomName: this.currentRoom.name });
    } else {
      this.currentRoom = null;
      this.showRoomsScreen();
    }
  }

  requestAvailableRooms() {
    if (this.socket && this.socket.connected) {
      console.log("📋 Solicitando salas disponíveis...");
      this.socket.emit("getRooms");
    } else {
      console.log("❌ Não é possível solicitar salas - socket não conectado");
    }
  }

  // ===== UI UPDATE METHODS =====

  addRoomToList(room) {
    const roomElement = document.createElement("div");
    roomElement.className = `room-item ${
      this.currentRoom && this.currentRoom.name === room.name ? "active" : ""
    }`;
    roomElement.dataset.roomName = room.name;

    roomElement.innerHTML = `
            <div class="room-info">
                <div class="room-name">${this.escapeHtml(room.name)}</div>
                <div class="room-users">${room.userCount || 0} usuários</div>
            </div>
            <div class="room-type">${
              room.isPrivate ? "Privada" : "Pública"
            }</div>
        `;

    roomElement.addEventListener("click", () => {
      if (!this.currentRoom || this.currentRoom.name !== room.name) {
        this.joinRoomFromList(room.name);
      }
    });

    this.elements.roomsList.appendChild(roomElement);

    // Update existing room if it exists
    const existingRoom = this.elements.roomsList.querySelector(
      `[data-room-name="${room.name}"]`
    );
    if (existingRoom && existingRoom !== roomElement) {
      existingRoom.remove();
    }
  }

  updateCurrentRoom() {
    // Update active room in sidebar
    this.elements.roomsList.querySelectorAll(".room-item").forEach((item) => {
      item.classList.remove("active");
      if (this.currentRoom && item.dataset.roomName === this.currentRoom.name) {
        item.classList.add("active");
      }
    });

    // Update chat header and input state
    if (this.currentRoom) {
      this.elements.chatHeader.classList.remove("hidden");
      this.elements.noRoomSelected.classList.add("hidden");
      this.elements.messagesContainer.classList.remove("hidden");
      this.elements.inputContainer.classList.remove("hidden");

      this.elements.currentRoomName.textContent = this.currentRoom.name;
      this.elements.messageInput.disabled = false;
      this.elements.messageInput.placeholder = `Conversar em ${this.currentRoom.name}...`;
      this.validateMessageInput();

      // Focus input
      setTimeout(() => {
        this.elements.messageInput.focus();
      }, 100);
    } else {
      this.elements.chatHeader.classList.add("hidden");
      this.elements.noRoomSelected.classList.remove("hidden");
      this.elements.messagesContainer.classList.add("hidden");
      this.elements.inputContainer.classList.add("hidden");

      this.elements.messageInput.disabled = true;
      this.elements.messageInput.placeholder =
        "Selecione uma sala para conversar...";
    }
  }

  updateRoomUserCount(count) {
    this.elements.currentRoomUsers.textContent = `${count} usuário${
      count !== 1 ? "s" : ""
    } online`;

    // Update in room list as well
    if (this.currentRoom) {
      const roomElement = this.elements.roomsList.querySelector(
        `[data-room-name="${this.currentRoom.name}"]`
      );
      if (roomElement) {
        const usersElement = roomElement.querySelector(".room-users");
        if (usersElement) {
          usersElement.textContent = `${count} usuários`;
        }
      }
    }
  }

  // ===== MESSAGE METHODS =====

  sendMessage() {
    if (!this.currentRoom) {
      this.showNotification("Selecione uma sala primeiro", "error");
      return;
    }

    const text = this.elements.messageInput?.value.trim();

    if (!text) {
      this.showNotification("Digite uma mensagem", "error");
      return;
    }

    if (text.length > this.config.MAX_MESSAGE_LENGTH) {
      this.showNotification(
        `Mensagem muito longa (máx: ${this.config.MAX_MESSAGE_LENGTH} caracteres)`,
        "error"
      );
      return;
    }

    if (!this.socket || !this.socket.connected) {
      this.showNotification("Não conectado ao servidor", "error");
      return;
    }

    if (!this.canSendMessage()) {
      this.showNotification("Muitas mensagens. Aguarde um pouco.", "error");
      return;
    }

    console.log("📤 Enviando mensagem para sala:", this.currentRoom.name);

    this.socket.emit("roomMessage", {
      roomName: this.currentRoom.name,
      text: text,
      timestamp: Date.now(),
    });

    this.recordMessage();

    if (this.elements.messageInput) {
      this.elements.messageInput.value = "";
      this.elements.messageInput.focus();
    }

    this.validateMessageInput();
  }

  addMessage(data) {
    if (!this.elements.messages) return;

    const messageEl = document.createElement("div");
    messageEl.className = `message ${
      data.user.uid === this.currentUser.uid ? "own" : ""
    }`;

    const time = new Date(data.timestamp).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const escapedText = this.escapeHtml(data.text);
    const escapedName = this.escapeHtml(data.user.name);

    // CORRIGIR: Criar elementos DOM ao invés de innerHTML
    const avatarImg = document.createElement("img");
    avatarImg.className = "message-avatar";
    avatarImg.alt = escapedName;

    // CORRIGIR: Usar avatar ou gerar padrão
    if (data.user.avatar) {
      avatarImg.src = data.user.avatar;
      avatarImg.onerror = () => {
        avatarImg.src = this.generateDefaultAvatar({
          displayName: data.user.name,
          email: data.user.email || data.user.name + "@chat.com",
        });
      };
    } else {
      avatarImg.src = this.generateDefaultAvatar({
        displayName: data.user.name,
        email: data.user.email || data.user.name + "@chat.com",
      });
    }

    // CORRIGIR: Criar content div
    const contentDiv = document.createElement("div");
    contentDiv.className = "message-content";

    const authorDiv = document.createElement("div");
    authorDiv.className = "message-author";
    authorDiv.textContent = escapedName;

    const textDiv = document.createElement("div");
    textDiv.className = "message-text";
    textDiv.textContent = data.text; // Usar textContent ao invés de innerHTML

    const timeDiv = document.createElement("div");
    timeDiv.className = "message-time";
    timeDiv.textContent = time;

    // CORRIGIR: Montar a estrutura
    contentDiv.appendChild(authorDiv);
    contentDiv.appendChild(textDiv);
    contentDiv.appendChild(timeDiv);

    messageEl.appendChild(avatarImg);
    messageEl.appendChild(contentDiv);

    this.elements.messages.appendChild(messageEl);
    this.scrollToBottom();
  }

  addSystemMessage(text) {
    const messagesContainer = document.getElementById("messages");
    if (!messagesContainer) return;

    const messageEl = document.createElement("div");
    messageEl.className = "system-message";

    const textDiv = document.createElement("div");
    textDiv.style.cssText = `
        text-align: center; 
        color: #81c784; 
        font-style: italic; 
        padding: 8px 12px; 
        font-size: 13px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        display: inline-block;
        margin: 0 auto;
    `;
    textDiv.textContent = text; // USAR textContent ao invés de innerHTML

    messageEl.appendChild(textDiv);
    messagesContainer.appendChild(messageEl);
    this.scrollToBottom();
  }

  scrollToBottom() {
    const messagesContainer = document.getElementById("messages");
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  validateMessageInput() {
    const messageInput = document.getElementById("messageInput");
    const sendBtn = document.getElementById("sendBtn");

    if (!messageInput || !sendBtn) return;

    const text = messageInput.value.trim();
    const isValid =
      text.length > 0 &&
      text.length <= this.config.MAX_MESSAGE_LENGTH &&
      this.socket &&
      this.socket.connected &&
      this.currentRoom;

    sendBtn.disabled = !isValid;
  }

  handleTyping() {
    // Implementar indicador de digitação se necessário
  }

  // Rate limiting
  canSendMessage() {
    const now = Date.now();
    this.messageTimestamps = this.messageTimestamps.filter(
      (time) => now - time < 60000
    ); // 1 minuto
    return this.messageTimestamps.length < 10; // máximo 10 mensagens por minuto
  }

  recordMessage() {
    this.messageTimestamps.push(Date.now());
  }

  // ===== EMOJI SYSTEM =====

  setupEmojiSystem() {
    // Emoji categories
    this.emojiCategories = {
      smileys: {
        icon: "😀",
        emojis: [
          "😀",
          "😃",
          "😄",
          "😁",
          "😆",
          "😅",
          "🤣",
          "😂",
          "🙂",
          "🙃",
          "😉",
          "😊",
          "😇",
          "🥰",
          "😍",
          "🤩",
          "😘",
          "😗",
          "😚",
          "😙",
          "😋",
          "😛",
          "😜",
          "🤪",
          "😝",
          "🤑",
          "🤗",
          "🤭",
          "🤫",
          "🤔",
        ],
      },
      people: {
        icon: "👥",
        emojis: [
          "👋",
          "🤚",
          "🖐",
          "✋",
          "🖖",
          "👌",
          "🤏",
          "✌",
          "🤞",
          "🤟",
          "🤘",
          "🤙",
          "👈",
          "👉",
          "👆",
          "🖕",
          "👇",
          "☝",
          "👍",
          "👎",
          "👊",
          "✊",
          "🤛",
          "🤜",
          "👏",
          "🙌",
          "👐",
          "🤲",
          "🤝",
          "🙏",
        ],
      },
      nature: {
        icon: "🌿",
        emojis: [
          "🐶",
          "🐱",
          "🐭",
          "🐹",
          "🐰",
          "🦊",
          "🐻",
          "🐼",
          "🐨",
          "🐯",
          "🦁",
          "🐮",
          "🐷",
          "🐽",
          "🐸",
          "🐵",
          "🙈",
          "🙉",
          "🙊",
          "🐒",
          "🐔",
          "🐧",
          "🐦",
          "🐤",
          "🐣",
          "🐥",
          "🦆",
          "🦅",
          "🦉",
          "🦇",
        ],
      },
      food: {
        icon: "🍕",
        emojis: [
          "🍎",
          "🍐",
          "🍊",
          "🍋",
          "🍌",
          "🍉",
          "🍇",
          "🍓",
          "🫐",
          "🍈",
          "🍒",
          "🍑",
          "🥭",
          "🍍",
          "🥥",
          "🥝",
          "🍅",
          "🍆",
          "🥑",
          "🥦",
          "🥬",
          "🥒",
          "🌶",
          "🫑",
          "🌽",
          "🥕",
          "🫒",
          "🧄",
          "🧅",
          "🥔",
        ],
      },
      activities: {
        icon: "⚽",
        emojis: [
          "⚽",
          "🏀",
          "🏈",
          "⚾",
          "🥎",
          "🎾",
          "🏐",
          "🏉",
          "🥏",
          "🎱",
          "🪀",
          "🏓",
          "🏸",
          "🏒",
          "🏑",
          "🥍",
          "🏏",
          "🪃",
          "🥅",
          "⛳",
          "🪁",
          "🏹",
          "🎣",
          "🤿",
          "🥊",
          "🥋",
          "🎽",
          "🛹",
          "🛷",
          "⛸",
        ],
      },
      objects: {
        icon: "💡",
        emojis: [
          "⌚",
          "📱",
          "📲",
          "💻",
          "⌨",
          "🖥",
          "🖨",
          "🖱",
          "🖲",
          "🕹",
          "🗜",
          "💽",
          "💾",
          "💿",
          "📀",
          "📼",
          "📷",
          "📸",
          "📹",
          "🎥",
          "📽",
          "🎞",
          "📞",
          "☎",
          "📟",
          "📠",
          "📺",
          "📻",
          "🎙",
          "🎚",
        ],
      },
    };
  }

  setupEmojiPickerInChat() {
    if (
      !this.elements.messageInput ||
      document.getElementById("emojiToggleBtn")
    )
      return;

    const inputContainer = this.elements.messageInput.parentElement;
    const sendBtn = this.elements.sendBtn;

    // Create emoji toggle button
    const emojiToggleBtn = document.createElement("button");
    emojiToggleBtn.id = "emojiToggleBtn";
    emojiToggleBtn.className = "emoji-toggle-btn";
    emojiToggleBtn.innerHTML = "😀";
    emojiToggleBtn.title = "Adicionar emoji";
    emojiToggleBtn.type = "button";
    emojiToggleBtn.onclick = () => this.toggleEmojiPicker();

    // Insert before send button
    if (inputContainer && sendBtn) {
      inputContainer.insertBefore(emojiToggleBtn, sendBtn);
    }

    // Create emoji picker
    if (!document.getElementById("emojiPicker")) {
      const chatContainer = document.querySelector(".chat-container");
      if (chatContainer) {
        const emojiPicker = this.createEmojiPicker();
        chatContainer.appendChild(emojiPicker);
      }
    }
  }

  createEmojiPicker() {
    const emojiPicker = document.createElement("div");
    emojiPicker.id = "emojiPicker";
    emojiPicker.className = "emoji-picker hidden";

    emojiPicker.innerHTML = `
            <div class="emoji-picker-header">
                <div class="emoji-picker-title">Selecione um emoji</div>
                <button class="emoji-close-btn" onclick="window.chatApp.toggleEmojiPicker()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            
            <div class="emoji-categories">
                ${Object.entries(this.emojiCategories)
                  .map(
                    ([key, category]) => `
                    <button class="emoji-category-btn ${
                      key === this.currentEmojiCategory ? "active" : ""
                    }" 
                            onclick="window.chatApp.changeEmojiCategory('${key}')" 
                            title="${key}">
                        ${category.icon}
                    </button>
                `
                  )
                  .join("")}
            </div>
            
            <div class="emoji-grid" id="emojiGrid">
                ${this.renderEmojiGrid(this.currentEmojiCategory)}
            </div>
        `;

    return emojiPicker;
  }

  renderEmojiGrid(category) {
    return this.emojiCategories[category].emojis
      .map(
        (emoji) => `
            <button class="emoji-btn" onclick="window.chatApp.insertEmoji('${emoji}')" title="${emoji}">
                ${emoji}
            </button>
        `
      )
      .join("");
  }

  toggleEmojiPicker() {
    const emojiPicker = document.getElementById("emojiPicker");
    const emojiToggleBtn = document.getElementById("emojiToggleBtn");

    if (this.emojiPickerVisible) {
      if (emojiPicker) emojiPicker.classList.add("hidden");
      if (emojiToggleBtn) emojiToggleBtn.classList.remove("active");
      this.emojiPickerVisible = false;
    } else {
      if (emojiPicker) emojiPicker.classList.remove("hidden");
      if (emojiToggleBtn) emojiToggleBtn.classList.add("active");
      this.emojiPickerVisible = true;
    }
  }

  changeEmojiCategory(category) {
    this.currentEmojiCategory = category;

    // Update category buttons
    document.querySelectorAll(".emoji-category-btn").forEach((btn) => {
      btn.classList.remove("active");
    });
    event.target.classList.add("active");

    // Update emoji grid
    const emojiGrid = document.getElementById("emojiGrid");
    if (emojiGrid) {
      emojiGrid.innerHTML = this.renderEmojiGrid(category);
    }
  }

  insertEmoji(emoji) {
    if (!this.elements.messageInput) return;

    const cursorPos = this.elements.messageInput.selectionStart;
    const textBefore = this.elements.messageInput.value.substring(0, cursorPos);
    const textAfter = this.elements.messageInput.value.substring(cursorPos);

    this.elements.messageInput.value = textBefore + emoji + textAfter;

    // Add to recent emojis
    this.addToRecentEmojis(emoji);

    // Focus and set cursor position
    this.elements.messageInput.focus();
    this.elements.messageInput.setSelectionRange(
      cursorPos + emoji.length,
      cursorPos + emoji.length
    );

    // Close emoji picker
    this.toggleEmojiPicker();

    // Validate input
    this.validateMessageInput();
  }

  addToRecentEmojis(emoji) {
    this.recentEmojis = this.recentEmojis.filter((e) => e !== emoji);
    this.recentEmojis.unshift(emoji);

    if (this.recentEmojis.length > 24) {
      this.recentEmojis = this.recentEmojis.slice(0, 24);
    }

    localStorage.setItem("recentEmojis", JSON.stringify(this.recentEmojis));
  }

  // ===== UTILITY METHODS =====

  escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  updateConnectionStatus(text, status) {
    if (this.elements.connectionStatus) {
      this.elements.connectionStatus.textContent = text;
      this.elements.connectionStatus.className = `connection-status ${status}`;
    }
  }

  setLoginButtonState(loading, text) {
    if (!this.elements.loginBtn) return;

    this.elements.loginBtn.disabled = loading;
    this.elements.loginBtn.innerHTML = loading
      ? text
      : `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>Entrar com Google`;
  }

  setEmailAuthButtonState(loading, text, isSignup = false) {
    const btnId = isSignup ? "signupEmailAuthBtn" : "emailAuthBtn";
    const btn = document.getElementById(btnId);

    if (btn) {
      btn.disabled = loading;
      btn.textContent = text;
    }
  }

  showNotification(message, type = "info") {
    console.log(`[${type.toUpperCase()}] ${message}`);

    // Create notification element
    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${
              type === "success"
                ? "#4caf50"
                : type === "error"
                ? "#f44336"
                : type === "warning"
                ? "#ff9800"
                : "#2196f3"
            };
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 10000;
            font-size: 14px;
            max-width: 300px;
            animation: slideIn 0.3s ease;
        `;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.style.animation = "slideOut 0.3s ease";
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  debugSocketConnection() {
    console.log("🔍 DEBUG - Estado atual:", {
      socket: !!this.socket,
      connected: this.socket?.connected,
      socketId: this.socket?.id,
      currentUser: !!this.currentUser,
      userEmail: this.currentUser?.email,
      currentRoom: this.currentRoom,
    });
  }

  generateDefaultAvatar(user) {
    // Pegar primeira letra do email ou nome
    const letter = (user.displayName || user.email || "U")
      .charAt(0)
      .toUpperCase();

    // Cores para os avatares (baseadas na primeira letra)
    const colors = [
      "#667eea",
      "#764ba2",
      "#f093fb",
      "#f5576c",
      "#4facfe",
      "#00f2fe",
      "#43e97b",
      "#38f9d7",
      "#ffecd2",
      "#fcb69f",
      "#a8edea",
      "#fed6e3",
      "#d299c2",
      "#fef9d7",
      "#667eea",
      "#764ba2",
    ];

    const colorIndex = letter.charCodeAt(0) % colors.length;
    const backgroundColor = colors[colorIndex];

    // Criar SVG do avatar
    const svg = `
        <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
            <circle cx="20" cy="20" r="20" fill="${backgroundColor}"/>
            <text x="20" y="26" text-anchor="middle" fill="white" font-family="Inter, sans-serif" font-size="16" font-weight="600">
                ${letter}
            </text>
        </svg>
    `;

    // Converter SVG para data URL
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }

  // Método para obter avatar (real ou padrão)
  getUserAvatar(user) {
    if (user.photoURL) {
      return user.photoURL;
    }
    return this.generateDefaultAvatar(user);
  }
}

// Inicializar aplicação quando DOM estiver carregado
document.addEventListener("DOMContentLoaded", () => {
  window.chatApp = new ChatWithRoomsApp();
  DEBUG.log("Chat App com Salas inicializada");
});
