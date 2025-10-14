// src/network/SocketClient.js
export class SocketClient {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.callbacks = new Map();
        this.battleState = null;
        this.bettingState = null;
    }

    connect(serverUrl = 'http://localhost:3000') {
        console.log('Connecting to server:', serverUrl);
        
        // Verificar que Socket.io esté cargado
        if (typeof io === 'undefined') {
            console.error('Socket.io not loaded! Make sure to include the script in index.html');
            return;
        }
        
        this.socket = io(serverUrl, {
            transports: ['websocket'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5
        });

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Conexión establecida
        this.socket.on('connect', () => {
            console.log('Connected to server!');
            this.connected = true;
            this.emit('client-ready', { type: 'viewer' });
        });

        // Desconexión
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.connected = false;
        });

        // Estado actual del servidor
        this.socket.on('current-state', (data) => {
            console.log('Current server state:', data);
            this.handleCurrentState(data);
        });

        // ========== EVENTOS DE APUESTAS ==========
        
        // Fase de apuestas iniciada
        this.socket.on('betting-phase-started', (data) => {
            console.log('Betting phase started:', data);
            this.bettingState = {
                active: true,
                nextBattleTime: data.nextBattleTime,
                wallets: data.wallets,
                minBet: data.minBet,
                houseFee: data.houseFee
            };
            this.trigger('betting-started', data);
        });

        // Nueva apuesta recibida
        this.socket.on('new-bet', (data) => {
            console.log('New bet:', data);
            this.trigger('bet-update', data);
        });

        // Apuestas cerradas
        this.socket.on('betting-closed', (data) => {
            console.log('Betting closed:', data);
            if (this.bettingState) {
                this.bettingState.active = false;
            }
            this.trigger('betting-ended', data);
        });

        // Countdown para batalla
        this.socket.on('battle-countdown', (seconds) => {
            this.trigger('countdown', seconds);
        });

        // ========== EVENTOS DE BATALLA ==========
        
        // Batalla iniciada
        this.socket.on('battle-started', (data) => {
            console.log('Battle started with seed:', data.seed);
            this.battleState = {
                seed: data.seed,
                inProgress: true,
                initialState: data.initialState
            };
            this.trigger('battle-start', data);
        });

        // Frame de batalla
        this.socket.on('battle-frame', (data) => {
            if (this.battleState) {
                this.battleState.currentFrame = data.frame;
                this.battleState.state = data.state;
            }
            this.trigger('battle-update', data);
        });

        // Sincronización de batalla (para usuarios que se conectan tarde)
        this.socket.on('sync-battle', (data) => {
            console.log('Syncing battle:', data);
            this.battleState = data;
            this.trigger('battle-sync', data);
        });

        // Batalla terminada
        this.socket.on('battle-ended', (data) => {
            console.log('Battle ended! Winner:', data.winner);
            if (this.battleState) {
                this.battleState.inProgress = false;
                this.battleState.winner = data.winner;
            }
            this.trigger('battle-end', data);
        });

        // ========== EVENTOS DE PAGOS ==========
        
        // Pago enviado
        this.socket.on('payment-sent', (data) => {
            console.log('Payment sent:', data);
            this.trigger('payment', data);
        });

        // Pagos completados
        this.socket.on('payments-completed', (data) => {
            console.log('All payments completed:', data);
            this.trigger('payments-done', data);
        });

        // Error de pago
        this.socket.on('payment-error', (data) => {
            console.error('Payment error:', data);
            this.trigger('payment-error', data);
        });

        // ========== CHAT (OPCIONAL) ==========
        
        this.socket.on('chat-message', (data) => {
            this.trigger('chat', data);
        });
    }

    handleCurrentState(state) {
        // Actualizar estado local basado en estado del servidor
        if (state.bettingPhase) {
            this.bettingState = {
                active: true,
                nextBattleTime: state.nextBattleTime,
                totalPools: state.totalPools,
                wallets: state.wallets
            };
        }

        if (state.battleInProgress) {
            // Solicitar sincronización de batalla
            this.socket.emit('request-sync');
        }

        this.trigger('state-update', state);
    }

    // Registrar callback para evento
    on(event, callback) {
        if (!this.callbacks.has(event)) {
            this.callbacks.set(event, []);
        }
        this.callbacks.get(event).push(callback);
    }

    // Remover callback
    off(event, callback) {
        if (this.callbacks.has(event)) {
            const callbacks = this.callbacks.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    // Disparar evento
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

    // Enviar mensaje al servidor
    emit(event, data) {
        if (this.connected && this.socket) {
            this.socket.emit(event, data);
        } else {
            console.warn('Not connected to server, cannot emit:', event);
        }
    }

    // Enviar mensaje de chat
    sendChatMessage(message) {
        this.emit('chat-message', message);
    }

    // Obtener estado actual
    getState() {
        return {
            connected: this.connected,
            battleState: this.battleState,
            bettingState: this.bettingState
        };
    }

    // Desconectar
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.connected = false;
        }
    }
    
    // Simular apuesta (para testing)
    testBet(fighter, amount) {
        console.log(`Sending test bet: ${fighter} - ${amount} BNB`);
        this.emit('test-bet', { fighter, amount });
    }
}

// Hacer disponible globalmente para testing
if (typeof window !== 'undefined') {
    window.SocketClient = SocketClient;
}