// src/scenes/StartScene.js - VERSIÓN MEJORADA CON DIBUJO GARANTIZADO
import { BattleScene } from './BattleScene.js';

export class StartScene {
    constructor(changeScene, config = {}) {
        this.changeScene = changeScene;
        this.socketClient = config.socketClient;
        
        this.phase = 'WAITING';
        this.connectionStatus = 'CONNECTING';
        this.logoImage = document.getElementById('Logo');
        this.pulseAnimation = 0;
        this.countdown = null;
        
        console.log('✅ StartScene initialized');
        
        if (this.socketClient) {
            this.setupSocketListeners();
        }
    }
    
    setupSocketListeners() {
        console.log('StartScene: Setting up socket listeners');
        
        this.socketClient.on('connected', () => {
            this.connectionStatus = 'CONNECTED';
            console.log('✅ Socket connected');
        });

        this.socketClient.on('disconnected', () => {
            this.connectionStatus = 'DISCONNECTED';
            console.log('❌ Socket disconnected');
        });
        
        this.socketClient.on('current-state', (state) => {
            console.log('StartScene received state:', state);
            
            this.phase = state.phase || 'WAITING';
            
            if (state.battleInProgress || state.phase === 'BATTLE') {
                console.log('Battle in progress, transitioning to BattleScene');
                this.transitionToBattleScene({
                    bettingPhase: false,
                    battlePaused: false,
                    seed: state.seed || Date.now()
                });
            } else if (state.bettingPhase || state.phase === 'BETTING') {
                this.phase = 'BETTING';
                console.log('Betting phase active');
            }
        });
        
        this.socketClient.on('betting-phase-started', (data) => {
            console.log('Betting phase started');
            this.phase = 'BETTING';
        });
        
        this.socketClient.on('betting-closed', (data) => {
            console.log('Betting closed');
            this.phase = 'COUNTDOWN';
        });
        
        this.socketClient.on('battle-countdown', (seconds) => {
            this.countdown = seconds;
        });
        
        this.socketClient.on('battle-started', (data) => {
            console.log('🎮 Battle starting! Seed:', data.seed);
            this.transitionToBattleScene({
                bettingPhase: false,
                seed: data.seed,
                battlePaused: false
            });
        });

        this.socketClient.on('sync-battle', (data) => {
            console.log('Syncing with ongoing battle');
            this.transitionToBattleScene({
                bettingPhase: false,
                seed: data.seed,
                battlePaused: false,
                battleState: data.state
            });
        });
    }
    
    transitionToBattleScene(config) {
        console.log('Transitioning to BattleScene with config:', config);
        this.changeScene(BattleScene, {
            socketClient: this.socketClient,
            isAIBattle: true,
            ...config
        });
    }
    
    update(time) {
        this.pulseAnimation += 0.05;
    }
    
    draw(context) {
        // SIEMPRE dibujar algo visible
        try {
            // Fondo negro
            context.fillStyle = '#000';
            context.fillRect(0, 0, 382, 224);
            
            // Borde para debug (confirmar que estamos dibujando)
            context.strokeStyle = '#00FF00';
            context.lineWidth = 2;
            context.strokeRect(1, 1, 380, 222);
            
            // Logo si existe
            if (this.logoImage && this.logoImage.complete && this.logoImage.naturalWidth > 0) {
                try {
                    context.drawImage(this.logoImage, 92, 40, 198, 84);
                } catch (e) {
                    console.warn('Could not draw logo:', e.message);
                }
            } else {
                // Texto fallback si no hay logo
                context.fillStyle = '#FFD700';
                context.font = 'bold 24px Arial';
                context.textAlign = 'center';
                context.fillText('STREET FIGHTER', 191, 80);
            }
            
            // Estado
            context.fillStyle = '#FFFFFF';
            context.font = 'bold 14px Arial';
            context.textAlign = 'center';
            
            const pulse = Math.sin(this.pulseAnimation) * 0.3 + 0.7;
            context.globalAlpha = pulse;
            
            let message = '';
            let subMessage = '';
            
            switch(this.phase) {
                case 'BETTING':
                    message = 'BETTING OPEN';
                    subMessage = 'Place your bets!';
                    context.fillStyle = '#00FF00';
                    break;
                case 'COUNTDOWN':
                    message = 'BATTLE STARTING';
                    subMessage = this.countdown ? `${this.countdown}...` : 'Get ready!';
                    context.fillStyle = '#FFFF00';
                    break;
                case 'BATTLE':
                    message = 'BATTLE IN PROGRESS';
                    subMessage = 'Loading...';
                    context.fillStyle = '#FF0000';
                    break;
                default:
                    message = 'WAITING FOR NEXT ROUND';
                    subMessage = 'Stand by...';
                    context.fillStyle = '#FFD700';
            }
            
            context.fillText(message, 191, 130);
            
            context.globalAlpha = pulse * 0.7;
            context.font = '12px Arial';
            context.fillStyle = '#FFFFFF';
            context.fillText(subMessage, 191, 150);
            
            context.globalAlpha = 1;
            
            // Indicador de conexión
            const connectionY = 200;
            context.font = '10px Arial';
            
            if (this.socketClient && this.socketClient.connected) {
                context.fillStyle = '#00FF00';
                context.fillText('● CONNECTED', 191, connectionY);
            } else if (this.connectionStatus === 'CONNECTING') {
                context.fillStyle = '#FFFF00';
                context.fillText('● CONNECTING...', 191, connectionY);
            } else {
                context.fillStyle = '#FF0000';
                context.fillText('● DISCONNECTED', 191, connectionY);
            }
            
            // Info adicional
            context.font = '8px Arial';
            context.fillStyle = '#666';
            context.fillText('BNB SMART CHAIN', 191, 215);
            
        } catch (error) {
            console.error('❌ Error in StartScene.draw:', error);
            
            // Dibujo de emergencia
            context.fillStyle = 'red';
            context.fillRect(0, 0, 382, 224);
            context.fillStyle = 'white';
            context.font = '12px Arial';
            context.textAlign = 'center';
            context.fillText('ERROR IN DRAW', 191, 112);
        }
    }
    
    destroy() {
        console.log('StartScene destroyed');
    }
}