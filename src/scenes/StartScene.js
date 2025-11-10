// src/scenes/StartScene.js - PANTALLA COMPLETA DE APUESTAS
import { BattleScene } from './BattleScene.js';

export class StartScene {
    constructor(changeScene, config = {}) {
        this.changeScene = changeScene;
        this.socketClient = config.socketClient;
        
        // Estado
        this.phase = 'WAITING';
        this.timeUntilBattle = null;
        this.wallets = { RYU: '', KEN: '' };
        this.pools = { RYU: 0, KEN: 0 };
        this.betCounts = { RYU: 0, KEN: 0 };
        this.countdown = 0;
        this.cycleNumber = 0;
        
        // Elementos visuales
        this.logoImage = document.getElementById('Logo');
        this.ryuImage = document.getElementById('RyuImage');
        this.kenImage = document.getElementById('KenImage');
        
        // Animaciones
        this.pulseAnimation = 0;
        this.glowAnimation = 0;
        this.copiedWallet = null;
        this.copiedTimer = 0;
        
        // Áreas clicables - AJUSTADAS a las coordenadas reales del canvas
        this.clickAreas = {
            RYU: { x: 25, y: 150, width: 140, height: 32 },  // Ajustado
            KEN: { x: 217, y: 150, width: 140, height: 32 }  // Ajustado
        };
        
        console.log('StartScene initialized');
        
        // Setup click handler
        this.setupClickHandler();
        
        if (this.socketClient) {
            this.setupSocketListeners();
        }
    }
    
    setupClickHandler() {
        const canvas = document.querySelector('canvas');
        if (!canvas) return;
        
        console.log('Click handler setup on canvas');
        
        // Click event
        canvas.addEventListener('click', (e) => {
            console.log('Canvas clicked, phase:', this.phase);
            
            if (this.phase !== 'BETTING') {
                console.log('Not in betting phase, ignoring click');
                return;
            }
            
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            
            const clickX = (e.clientX - rect.left) * scaleX;
            const clickY = (e.clientY - rect.top) * scaleY;
            
            console.log('Click at:', clickX, clickY);
            console.log('RYU area:', this.clickAreas.RYU);
            console.log('KEN area:', this.clickAreas.KEN);
            
            // Check RYU wallet
            if (this.isInArea(clickX, clickY, this.clickAreas.RYU)) {
                console.log('RYU wallet clicked!');
                this.copyWallet('RYU');
            }
            // Check KEN wallet
            else if (this.isInArea(clickX, clickY, this.clickAreas.KEN)) {
                console.log('KEN wallet clicked!');
                this.copyWallet('KEN');
            } else {
                console.log('Click outside wallet areas');
            }
        });
        
        // Hover cursor
        canvas.addEventListener('mousemove', (e) => {
            if (this.phase !== 'BETTING') {
                canvas.style.cursor = 'default';
                return;
            }
            
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            
            const mouseX = (e.clientX - rect.left) * scaleX;
            const mouseY = (e.clientY - rect.top) * scaleY;
            
            if (this.isInArea(mouseX, mouseY, this.clickAreas.RYU) ||
                this.isInArea(mouseX, mouseY, this.clickAreas.KEN)) {
                canvas.style.cursor = 'pointer';
            } else {
                canvas.style.cursor = 'default';
            }
        });
    }
    
    isInArea(x, y, area) {
        return x >= area.x && x <= area.x + area.width &&
               y >= area.y && y <= area.y + area.height;
    }
    
    copyWallet(fighter) {
        const wallet = this.wallets[fighter];
        if (!wallet) return;
        
        navigator.clipboard.writeText(wallet).then(() => {
            console.log(`✓ Copied ${fighter} wallet:`, wallet);
            this.copiedWallet = fighter;
            this.copiedTimer = 120;
            this.pulseAnimation = 30;
        }).catch(err => {
            console.error('Failed to copy:', err);
        });
    }
    
    setupSocketListeners() {
        console.log('StartScene: Setting up socket listeners');
        
        // Estado actual
        this.socketClient.on('current-state', (state) => {
            console.log('StartScene received state:', state);
            
            this.phase = state.phase || 'WAITING';
            this.cycleNumber = state.cycleNumber || 0;
            
            // Si hay betting phase, quedarnos aquí y mostrar wallets
            if (state.bettingPhase || state.phase === 'BETTING') {
                this.phase = 'BETTING';
                this.wallets = state.wallets || { RYU: '', KEN: '' };
                this.pools = state.totalPools || { RYU: 0, KEN: 0 };
                this.timeUntilBattle = state.nextBattleTime ? new Date(state.nextBattleTime) : null;
                console.log('Staying in StartScene for betting');
                return;
            }
            
            // Si hay batalla en progreso, ir a BattleScene
            if (state.battleInProgress || state.phase === 'BATTLE') {
                console.log('Battle in progress, going to BattleScene');
                this.transitionToBattleScene({
                    bettingPhase: false,
                    battlePaused: false,
                    seed: state.seed
                });
            }
        });
        
        // Fase de apuestas iniciada
        this.socketClient.on('betting-phase-started', (data) => {
            console.log('Betting phase started!', data);
            this.phase = 'BETTING';
            this.wallets = data.wallets;
            this.pools = { RYU: 0, KEN: 0 };
            this.betCounts = { RYU: 0, KEN: 0 };
            this.timeUntilBattle = new Date(data.nextBattleTime);
            this.cycleNumber = data.cycleNumber;
        });
        
        // Nueva apuesta
        this.socketClient.on('new-bet', (data) => {
            this.pools[data.fighter] = data.total;
            this.betCounts[data.fighter] = data.betCount;
            this.pulseAnimation = 30;
        });
        
        // Apuestas cerradas
        this.socketClient.on('betting-closed', (data) => {
            console.log('Betting closed');
            this.phase = 'COUNTDOWN';
        });
        
        // Countdown
        this.socketClient.on('battle-countdown', (seconds) => {
            this.countdown = seconds;
        });
        
        // Batalla iniciando - IR A BATTLESCENE
        this.socketClient.on('battle-started', (data) => {
            console.log('Battle starting! Transitioning to BattleScene');
            this.transitionToBattleScene({
                bettingPhase: false,
                seed: data.seed,
                battlePaused: false
            });
        });
    }
    
    transitionToBattleScene(config) {
        console.log('Transitioning to BattleScene');
        this.changeScene(BattleScene, {
            socketClient: this.socketClient,
            isAIBattle: true,
            ...config
        });
    }
    
    update(time) {
        if (this.pulseAnimation > 0) this.pulseAnimation--;
        if (this.copiedTimer > 0) this.copiedTimer--;
        this.glowAnimation += 0.05;
    }
    
    draw(context) {
        context.fillStyle = '#000';
        context.fillRect(0, 0, 382, 224);
        
        switch(this.phase) {
            case 'BETTING':
                this.drawBettingScreen(context);
                break;
            case 'COUNTDOWN':
                this.drawCountdownScreen(context);
                break;
            default:
                this.drawWaitingScreen(context);
        }
        
        // Mensaje copiado
        if (this.copiedTimer > 0) {
            context.save();
            context.globalAlpha = this.copiedTimer / 120;
            context.fillStyle = '#00FF00';
            context.font = 'bold 14px Arial';
            context.textAlign = 'center';
            context.fillText(`✓ ${this.copiedWallet} WALLET COPIED!`, 191, 50);
            context.restore();
        }
    }
    
    drawBettingScreen(context) {
        // Gradiente de fondo
        const gradient = context.createLinearGradient(0, 0, 0, 224);
        gradient.addColorStop(0, '#0a001f');
        gradient.addColorStop(0.5, '#1a0033');
        gradient.addColorStop(1, '#000000');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 382, 224);
        
        // Título
        context.save();
        context.fillStyle = '#FFD700';
        context.strokeStyle = '#FF0000';
        context.lineWidth = 3;
        context.font = 'bold 20px Arial';
        context.textAlign = 'center';
        context.strokeText('PLACE YOUR BETS!', 191, 30);
        context.fillText('PLACE YOUR BETS!', 191, 30);
        context.restore();
        
        // Timer
        if (this.timeUntilBattle) {
            const timeLeft = Math.max(0, this.timeUntilBattle - Date.now());
            const minutes = Math.floor(timeLeft / 60000);
            const seconds = Math.floor((timeLeft % 60000) / 1000);
            
            context.fillStyle = 'rgba(0, 0, 0, 0.7)';
            context.fillRect(141, 45, 100, 25);
            
            context.fillStyle = '#FFFFFF';
            context.font = 'bold 14px monospace';
            context.textAlign = 'center';
            context.fillText(`${minutes}:${seconds.toString().padStart(2, '0')}`, 191, 62);
        }
        
        // Paneles de fighters
        this.drawFighterPanel(context, 'RYU', 20, 80);
        this.drawFighterPanel(context, 'KEN', 212, 80);
        
        // VS
        context.save();
        const glow = Math.sin(this.glowAnimation * 2) * 0.3 + 0.7;
        context.globalAlpha = glow;
        context.fillStyle = '#FFD700';
        context.strokeStyle = '#FFF';
        context.lineWidth = 2;
        context.font = 'bold 32px Arial';
        context.textAlign = 'center';
        context.strokeText('VS', 191, 155);
        context.fillText('VS', 191, 155);
        context.restore();
        
        // Footer
        context.fillStyle = 'rgba(0, 0, 0, 0.8)';
        context.fillRect(0, 195, 382, 29);
        
        context.fillStyle = '#00FF00';
        context.font = 'bold 10px Arial';
        context.textAlign = 'center';
        context.fillText('CLICK WALLET TO COPY - SEND BNB TO BET!', 191, 207);
        context.fillText('MIN: 0.001 BNB | HOUSE FEE: 5%', 191, 218);
    }
    
    drawFighterPanel(context, fighter, x, y) {
        const color = fighter === 'RYU' ? '#FF0000' : '#FFD700';
        
        // Fondo
        context.fillStyle = 'rgba(0, 0, 0, 0.8)';
        context.fillRect(x, y, 150, 110);
        
        // Borde con pulso
        context.strokeStyle = color;
        context.lineWidth = 2;
        if (this.pulseAnimation > 0) {
            const pulse = Math.sin(this.pulseAnimation * 0.3) * 0.5 + 0.5;
            context.shadowColor = color;
            context.shadowBlur = pulse * 10;
        }
        context.strokeRect(x, y, 150, 110);
        context.shadowBlur = 0;
        
        // Nombre
        context.fillStyle = color;
        context.strokeStyle = '#000';
        context.lineWidth = 3;
        context.font = 'bold 18px Arial';
        context.textAlign = 'left';
        context.strokeText(fighter, x + 8, y + 22);
        context.fillText(fighter, x + 8, y + 22);
        
        // Pool
        context.fillStyle = '#FFFFFF';
        context.font = 'bold 16px Arial';
        context.fillText(`${this.pools[fighter].toFixed(3)} BNB`, x + 8, y + 45);
        
        // Bets
        context.font = '11px Arial';
        context.fillStyle = '#AAA';
        context.fillText(`${this.betCounts[fighter]} BETS`, x + 8, y + 60);
        
        // BOTÓN CLICKABLE - Coordenadas RELATIVAS al panel
        const btnX = x + 5;
        const btnY = y + 70;  // 70px desde el top del panel
        const btnW = 140;
        const btnH = 32;
        
        // Guardar coordenadas para click detection
        if (fighter === 'RYU') {
            this.clickAreas.RYU = { x: btnX, y: btnY, width: btnW, height: btnH };
        } else {
            this.clickAreas.KEN = { x: btnX, y: btnY, width: btnW, height: btnH };
        }
        
        // Fondo del botón
        context.fillStyle = color;
        context.fillRect(btnX, btnY, btnW, btnH);
        
        context.fillStyle = '#000';
        context.fillRect(btnX + 2, btnY + 2, btnW - 4, btnH - 4);
        
        context.fillStyle = color;
        context.fillRect(btnX + 4, btnY + 4, btnW - 8, btnH - 8);
        
        // Texto del botón
        context.fillStyle = '#000';
        context.font = 'bold 10px Arial';
        context.textAlign = 'center';
        context.fillText('CLICK TO COPY', x + 75, btnY + 14);
        context.fillText('WALLET', x + 75, btnY + 25);
        
        // Odds
        const totalPool = this.pools.RYU + this.pools.KEN;
        if (totalPool > 0 && this.pools[fighter] > 0) {
            const odds = ((totalPool - this.pools[fighter]) / this.pools[fighter] * 0.95).toFixed(2);
            context.fillStyle = '#00FF00';
            context.font = 'bold 10px Arial';
            context.textAlign = 'right';
            context.fillText(`x${odds}`, x + 142, y + 12);
        }
    }
    
    drawCountdownScreen(context) {
        context.fillStyle = 'rgba(0, 0, 0, 0.95)';
        context.fillRect(0, 0, 382, 224);
        
        if (this.countdown > 0) {
            context.fillStyle = this.countdown <= 5 ? '#FF0000' : '#FFFF00';
            context.strokeStyle = '#000';
            context.lineWidth = 5;
            context.font = 'bold 84px Arial';
            context.textAlign = 'center';
            context.strokeText(this.countdown, 191, 130);
            context.fillText(this.countdown, 191, 130);
        }
        
        context.fillStyle = '#FFFFFF';
        context.font = 'bold 24px Arial';
        context.fillText('GET READY!', 191, 70);
    }
    
    drawWaitingScreen(context) {
        context.fillStyle = '#000033';
        context.fillRect(0, 0, 382, 224);
        
        if (this.logoImage) {
            context.drawImage(this.logoImage, 100, 40, 182, 60);
        }
        
        context.fillStyle = '#FFFFFF';
        context.font = 'bold 14px Arial';
        context.textAlign = 'center';
        const pulse = Math.sin(Date.now() * 0.003) * 0.5 + 0.5;
        context.globalAlpha = 0.5 + pulse * 0.5;
        context.fillText('WAITING FOR NEXT ROUND...', 191, 120);
        context.globalAlpha = 1;
        
        context.font = '11px Arial';
        context.fillStyle = '#AAA';
        context.fillText('BATTLES EVERY 5 MINUTES', 191, 145);
        context.fillText('BSC NETWORK', 191, 165);
        
        if (this.socketClient && this.socketClient.connected) {
            context.fillStyle = '#00FF00';
            context.fillText('● ONLINE', 191, 195);
        } else {
            context.fillStyle = '#FF0000';
            context.fillText('● CONNECTING...', 191, 195);
        }
    }
    
    destroy() {
        // Cleanup
    }
}