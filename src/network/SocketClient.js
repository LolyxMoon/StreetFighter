// src/network/SocketClient.js - VERSION SINCRONIZADA CON SERVIDOR
export class SocketClient {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.callbacks = new Map();
        this.battleState = null;
        this.bettingState = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
    }

    connect(serverUrl = 'http://localhost:3000') {
        console.log('Connecting to server:', serverUrl);
        
        if (typeof io === 'undefined') {
            console.error('Socket.io not loaded! Make sure to include the script in index.html');
            return false;
        }
        
        this.socket = io(serverUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: this.maxReconnectAttempts,
            timeout: 20000
        });

        this.setupEventListeners();
        return true;
    }

    setupEventListeners() {
        // ========== EVENTOS DE CONEXION ==========
        
        this.socket.on('connect', () => {
            console.log('✅ Connected to server!');
            this.connected = true;
            this.reconnectAttempts = 0;
            this.trigger('connected', { socketId: this.socket.id });
        });

        this.socket.on('disconnect', (reason) => {
            console.log('❌ Disconnected from server:', reason);
            this.connected = false;
            this.trigger('disconnected', { reason });
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.reconnectAttempts++;
            this.trigger('connection_error', { error, attempts: this.reconnectAttempts });
        });

        this.socket.on('reconnect', (attemptNumber) => {
            console.log('✅ Reconnected after', attemptNumber, 'attempts');
            this.reconnectAttempts = 0;
            this.trigger('reconnected', { attempts: attemptNumber });
        });

        this.socket.on('reconnecting', (attemptNumber) => {
            console.log('🔄 Reconnecting... attempt', attemptNumber);
            this.trigger('reconnecting', { attempts: attemptNumber });
        });

        this.socket.on('reconnect_failed', () => {
            console.error('❌ Reconnection failed after max attempts');
            this.trigger('reconnect_failed');
        });

        // ========== ESTADO ACTUAL DEL SERVIDOR ==========
        
        this.socket.on('current-state', (data) => {
            console.log('📊 Current server state:', data);
            this.handleCurrentState(data);
            this.trigger('current-state', data);
        });

        // ========== EVENTOS DE APUESTAS ==========
        
        // Fase de apuestas iniciada (CORREGIDO: antes era 'betting-started')
        this.socket.on('betting-phase-started', (data) => {
            console.log('🎰 Betting phase started:', data);
            this.bettingState = {
                active: true,
                nextBattleTime: data.nextBattleTime,
                wallets: data.wallets,
                minBet: data.minBet,
                houseFee: data.houseFee,
                cycleNumber: data.cycleNumber
            };
            this.trigger('betting-phase-started', data);
        });

        // Nueva apuesta recibida
        this.socket.on('new-bet', (data) => {
            console.log('💰 New bet:', data);
            this.trigger('new-bet', data);
        });

        // Apuestas cerradas
        this.socket.on('betting-closed', (data) => {
            console.log('🔒 Betting closed:', data);
            if (this.bettingState) {
                this.bettingState.active = false;
            }
            this.trigger('betting-closed', data);
        });

        // ========== EVENTOS DE COUNTDOWN ==========
        
        this.socket.on('battle-countdown', (seconds) => {
            this.trigger('battle-countdown', seconds);
        });

        // ========== EVENTOS DE BATALLA ==========
        
        // Batalla iniciada
        this.socket.on('battle-started', (data) => {
            console.log('⚔️ Battle started with seed:', data.seed);
            this.battleState = {
                seed: data.seed,
                inProgress: true,
                initialState: data.initialState,
                startTime: Date.now()
            };
            this.trigger('battle-started', data);
        });

        // Frame de batalla (recibido cada 3 frames del servidor)
        this.socket.on('battle-frame', (data) => {
            if (this.battleState) {
                this.battleState.currentFrame = data.frame;
                this.battleState.state = data.state;
            }
            this.trigger('battle-frame', data);
        });

        // Sincronizacion de batalla (para usuarios que se conectan tarde)
        this.socket.on('sync-battle', (data) => {
            console.log('🔄 Syncing with ongoing battle:', data);
            this.battleState = {
                ...data,
                inProgress: true,
                synced: true
            };
            this.trigger('sync-battle', data);
        });

        // Batalla terminada
        this.socket.on('battle-ended', (data) => {
            console.log('🏆 Battle ended! Winner:', data.winner);
            if (this.battleState) {
                this.battleState.inProgress = false;
                this.battleState.winner = data.winner;
                this.battleState.duration = data.duration;
            }
            this.trigger('battle-ended', data);
        });

        // ========== EVENTOS DE PAGOS ==========
        
        // Pago enviado a un ganador
        this.socket.on('payment-sent', (data) => {
            console.log('💸 Payment sent:', data);
            this.trigger('payment-sent', data);
        });

        // Todos los pagos completados
        this.socket.on('payments-completed', (data) => {
            console.log('✅ All payments completed:', data);
            this.trigger('payments-completed', data);
        });

        // Error en pagos
        this.socket.on('payment-error', (data) => {
            console.error('❌ Payment error:', data);
            this.trigger('payment-error', data);
        });
        // ========== EVENTOS DE PAGOS ==========

// Pago enviado a un ganador
this.socket.on('payment-sent', (data) => {
    console.log('💸 Payment sent:', data);
    this.trigger('payment-sent', data);
});

// Todos los pagos completados
this.socket.on('payments-completed', (data) => {
    console.log('✅ All payments completed:', data);
    this.trigger('payments-completed', data);
});

// Error en pagos
this.socket.on('payment-error', (data) => {
    console.error('❌ Payment error:', data);
    this.trigger('payment-error', data);
});

// NUEVO: Datos de resultados de la batalla
this.socket.on('results-data', (data) => {
    console.log('📊 Results data received:', data);
    this.trigger('results-data', data);
});

// ========== CHAT (OPCIONAL) ==========

        // ========== CHAT (OPCIONAL) ==========
        
        this.socket.on('chat-message', (data) => {
            this.trigger('chat-message', data);
        });
    }

    

    handleCurrentState(state) {
        // Actualizar estado local basado en estado del servidor
        
        // Estado de apuestas
        if (state.bettingPhase || state.phase === 'BETTING') {
            this.bettingState = {
                active: true,
                nextBattleTime: state.nextBattleTime,
                totalPools: state.totalPools,
                wallets: state.wallets,
                cycleNumber: state.cycleNumber
            };
        } else {
            if (this.bettingState) {
                this.bettingState.active = false;
            }
        }

        // Estado de batalla
        if (state.battleInProgress || state.phase === 'BATTLE') {
            this.battleState = {
                inProgress: true,
                seed: state.seed,
                currentFrame: state.currentFrame
            };
        } else if (this.battleState && this.battleState.inProgress) {
            this.battleState.inProgress = false;
        }

        // Ganador
        if (state.winner) {
            if (this.battleState) {
                this.battleState.winner = state.winner;
            }
        }
    }

    // ========== METODOS DE CALLBACK ==========
    
    on(event, callback) {
        if (!this.callbacks.has(event)) {
            this.callbacks.set(event, []);
        }
        this.callbacks.get(event).push(callback);
    }

    off(event, callback) {
        if (this.callbacks.has(event)) {
            const callbacks = this.callbacks.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    trigger(event, data) {
        if (this.callbacks.has(event)) {
            this.callbacks.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in callback for event ${event}:`, error);
                }
            });
        }
    }

    // ========== METODOS DE EMISION ==========
    
    emit(event, data) {
        if (this.connected && this.socket) {
            this.socket.emit(event, data);
            return true;
        } else {
            console.warn('Not connected to server, cannot emit:', event);
            return false;
        }
    }

    sendChatMessage(message) {
        return this.emit('chat-message', message);
    }

    // ========== GETTERS ==========
    
    getState() {
        return {
            connected: this.connected,
            battleState: this.battleState,
            bettingState: this.bettingState,
            socketId: this.socket?.id
        };
    }

    isConnected() {
        return this.connected;
    }

    isBettingActive() {
        return this.bettingState?.active || false;
    }

    isBattleInProgress() {
        return this.battleState?.inProgress || false;
    }

    getBattleSeed() {
        return this.battleState?.seed || null;
    }

    getWinner() {
        return this.battleState?.winner || null;
    }

    // ========== UTILIDADES ==========
    
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.connected = false;
            this.battleState = null;
            this.bettingState = null;
        }
    }

    reconnect() {
        if (this.socket) {
            this.socket.connect();
        }
    }

    // Obtener latencia
    async getPing() {
        return new Promise((resolve) => {
            const start = Date.now();
            this.socket.emit('ping', () => {
                resolve(Date.now() - start);
            });
            
            // Timeout si no responde
            setTimeout(() => resolve(-1), 5000);
        });
    }

    // Metodo de debug
    debugState() {
        console.log('=== SOCKET CLIENT DEBUG ===');
        console.log('Connected:', this.connected);
        console.log('Socket ID:', this.socket?.id);
        console.log('Betting State:', this.bettingState);
        console.log('Battle State:', this.battleState);
        console.log('Registered callbacks:', Array.from(this.callbacks.keys()));
        console.log('==========================');
    }
}

// Hacer disponible globalmente para debugging
if (typeof window !== 'undefined') {
    window.SocketClient = SocketClient;
}