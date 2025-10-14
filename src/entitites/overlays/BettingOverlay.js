// src/overlays/BettingOverlay.js
import { drawFrame } from '../../utils/context.js';

export class BettingOverlay {
    constructor(socketClient) {
        this.socketClient = socketClient;
        
        // Estado de apuestas
        this.bettingActive = false;
        this.nextBattleTime = null;
        this.wallets = {
            RYU: '',
            KEN: ''
        };
        this.pools = {
            RYU: 0,
            KEN: 0
        };
        this.betCounts = {
            RYU: 0,
            KEN: 0
        };
        this.countdown = 0;
        this.winner = null;
        this.showPayments = false;
        this.recentPayments = [];
        
        // Animaciones
        this.pulseAnimation = 0;
        this.fadeAnimation = 1;
        this.slideAnimation = 0;
        
        // QR Codes (se generarán dinámicamente)
        this.qrCodes = {
            RYU: null,
            KEN: null
        };
        
        // Setup listeners
        this.setupSocketListeners();
    }

    setupSocketListeners() {
        // Fase de apuestas iniciada
        this.socketClient.on('betting-phase-started', (data) => {
            console.log('BettingOverlay: Betting phase started!', data);
            this.bettingActive = true;
            this.nextBattleTime = new Date(data.nextBattleTime);
            this.wallets = data.wallets;
            this.pools = { RYU: 0, KEN: 0 };
            this.betCounts = { RYU: 0, KEN: 0 };
            this.winner = null;
            this.generateQRCodes();
        });

        // Nueva apuesta
        this.socketClient.on('new-bet', (data) => {
            this.pools[data.fighter] = data.total;
            this.betCounts[data.fighter] = data.betCount;
            
            // Efecto visual de nueva apuesta
            this.triggerBetAnimation(data.fighter);
        });

        // Apuestas cerradas
        this.socketClient.on('betting-closed', (data) => {
            console.log('BettingOverlay: Betting closed', data);
            this.bettingActive = false;
            this.pools = data.totalPools;
        });

        // Countdown
        this.socketClient.on('battle-countdown', (seconds) => {
            this.countdown = seconds;
        });

        // Batalla terminada
        this.socketClient.on('battle-ended', (data) => {
            this.winner = data.winner;
            this.showWinnerAnimation();
        });

        // Pagos
        this.socketClient.on('payment', (data) => {
            this.recentPayments.push({
                address: data.address.substring(0, 6) + '...' + data.address.substring(38),
                amount: data.amount.toFixed(4),
                profit: data.profit.toFixed(4),
                timestamp: Date.now()
            });
            
            // Mantener solo últimos 5 pagos
            if (this.recentPayments.length > 5) {
                this.recentPayments.shift();
            }
        });

        // Estado actual
        this.socketClient.on('state-update', (state) => {
            if (state.totalPools) {
                this.pools = state.totalPools;
            }
            if (state.nextBattleTime) {
                this.nextBattleTime = new Date(state.nextBattleTime);
            }
        });
    }

    generateQRCodes() {
        // Generar QR codes para las wallets
        if (typeof QRCode !== 'undefined') {
            // Canvas temporal para QR de Ryu
            const canvasRyu = document.createElement('canvas');
            QRCode.toCanvas(canvasRyu, this.wallets.RYU, {
                width: 100,
                margin: 1,
                color: {
                    dark: '#FF0000',
                    light: '#FFFFFF'
                }
            }, (error) => {
                if (!error) this.qrCodes.RYU = canvasRyu;
            });

            // Canvas temporal para QR de Ken
            const canvasKen = document.createElement('canvas');
            QRCode.toCanvas(canvasKen, this.wallets.KEN, {
                width: 100,
                margin: 1,
                color: {
                    dark: '#FFD700',
                    light: '#FFFFFF'
                }
            }, (error) => {
                if (!error) this.qrCodes.KEN = canvasKen;
            });
        }
    }

    triggerBetAnimation(fighter) {
        // Activar animación de pulso para el fighter que recibió apuesta
        this.pulseAnimation = 30; // frames
    }

    showWinnerAnimation() {
        this.fadeAnimation = 0;
        this.slideAnimation = 0;
        this.showPayments = true;
    }

    update(time) {
        // Actualizar animaciones
        if (this.pulseAnimation > 0) {
            this.pulseAnimation--;
        }

        if (this.fadeAnimation < 1) {
            this.fadeAnimation += 0.05;
        }

        if (this.slideAnimation < 1) {
            this.slideAnimation += 0.03;
        }

        // Limpiar pagos antiguos (más de 10 segundos)
        const now = Date.now();
        this.recentPayments = this.recentPayments.filter(p => 
            now - p.timestamp < 10000
        );
    }

    draw(context) {
        console.log('BettingOverlay.draw called, active:', this.bettingActive);
        
        // AGREGAR: Dibujar algo siempre para verificar
        context.fillStyle = 'yellow';
        context.fillRect(0, 0, 200, 20);
        context.fillStyle = 'black';
        context.font = '12px Arial';
        context.fillText(`Betting: ${this.bettingActive ? 'ACTIVE' : 'INACTIVE'}`, 5, 15);
        
        // Guardar estado del context
        context.save();

        if (this.bettingActive) {
            this.drawBettingPhase(context);
        } else if (this.countdown > 0) {
            this.drawCountdown(context);
        } else if (this.winner) {
            this.drawWinner(context);
        }

        if (this.showPayments && this.recentPayments.length > 0) {
            this.drawPayments(context);
        }

        // Restaurar estado
        context.restore();
    }

    drawBettingPhase(context) {
        // Fondo semi-transparente para los paneles
        context.fillStyle = 'rgba(0, 0, 0, 0.8)';
        
        // Panel Ryu (izquierda)
        this.drawBettingPanel(context, 'RYU', 10, 40, '#FF0000');
        
        // Panel Ken (derecha)
        this.drawBettingPanel(context, 'KEN', 272, 40, '#FFD700');
        
        // Timer central
        this.drawTimer(context);
        
        // Título
        context.fillStyle = '#FFFFFF';
        context.font = 'bold 12px Arial';
        context.textAlign = 'center';
        context.fillText('PLACE YOUR BETS!', 191, 20);
        
        // Instrucciones
        context.font = '8px Arial';
        context.fillText('Send BNB to wallet address', 191, 30);
    }

    drawBettingPanel(context, fighter, x, y, color) {
        // Fondo del panel
        context.fillStyle = 'rgba(0, 0, 0, 0.7)';
        context.fillRect(x, y, 100, 140);
        
        // Borde coloreado
        context.strokeStyle = color;
        context.lineWidth = 2;
        if (this.pulseAnimation > 0 && this.pools[fighter] > 0) {
            // Efecto pulso
            const pulse = Math.sin(this.pulseAnimation * 0.3) * 0.5 + 0.5;
            context.globalAlpha = 0.5 + pulse * 0.5;
        }
        context.strokeRect(x, y, 100, 140);
        context.globalAlpha = 1;
        
        // Nombre del fighter
        context.fillStyle = color;
        context.font = 'bold 14px Arial';
        context.textAlign = 'center';
        context.fillText(fighter, x + 50, y + 20);
        
        // Pool total
        context.fillStyle = '#FFFFFF';
        context.font = '10px Arial';
        context.fillText('Pool:', x + 50, y + 35);
        context.font = 'bold 12px Arial';
        context.fillText(`${this.pools[fighter].toFixed(3)} BNB`, x + 50, y + 48);
        
        // Número de apuestas
        context.font = '9px Arial';
        context.fillText(`${this.betCounts[fighter]} bets`, x + 50, y + 60);
        
        // QR Code (si existe)
        if (this.qrCodes[fighter]) {
            context.drawImage(this.qrCodes[fighter], x + 15, y + 65, 70, 70);
        } else {
            // Mostrar dirección en texto si no hay QR
            context.font = '7px monospace';
            context.fillStyle = '#00FF00';
            const addr = this.wallets[fighter];
            if (addr) {
                context.fillText(addr.substring(0, 21), x + 50, y + 90);
                context.fillText(addr.substring(21), x + 50, y + 100);
            }
        }
        
        // Odds
        const totalPool = this.pools.RYU + this.pools.KEN;
        if (totalPool > 0) {
            const odds = totalPool > 0 ? 
                ((totalPool - this.pools[fighter]) / this.pools[fighter] * 0.95).toFixed(2) : 
                '0.00';
            context.fillStyle = '#00FF00';
            context.font = 'bold 10px Arial';
            context.fillText(`Odds: ${odds}x`, x + 50, y + 130);
        }
    }

    drawTimer(context) {
        if (!this.nextBattleTime) return;
        
        const now = Date.now();
        const timeLeft = Math.max(0, this.nextBattleTime - now);
        const seconds = Math.floor(timeLeft / 1000) % 60;
        const minutes = Math.floor(timeLeft / 60000);
        
        // Fondo del timer
        context.fillStyle = 'rgba(0, 0, 0, 0.8)';
        context.fillRect(156, 50, 70, 30);
        
        // Texto del timer
        context.fillStyle = '#FFFFFF';
        context.font = 'bold 16px Arial';
        context.textAlign = 'center';
        const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        context.fillText(timeStr, 191, 70);
        
        // Label
        context.font = '8px Arial';
        context.fillText('Next Battle', 191, 78);
    }

    drawCountdown(context) {
        // Fondo dramático
        context.fillStyle = 'rgba(0, 0, 0, 0.6)';
        context.fillRect(0, 0, 382, 224);
        
        // Countdown número grande
        context.fillStyle = '#FFFF00';
        context.font = 'bold 48px Arial';
        context.textAlign = 'center';
        context.shadowColor = '#FF0000';
        context.shadowBlur = 10;
        context.fillText(this.countdown, 191, 112);
        context.shadowBlur = 0;
        
        // Texto
        context.fillStyle = '#FFFFFF';
        context.font = 'bold 16px Arial';
        context.fillText('BATTLE STARTS IN', 191, 80);
        
        // Mostrar pools finales
        context.font = '12px Arial';
        const totalPool = this.pools.RYU + this.pools.KEN;
        context.fillText(`Total Pool: ${totalPool.toFixed(3)} BNB`, 191, 140);
        
        // Favorito
        if (this.pools.RYU > this.pools.KEN) {
            context.fillStyle = '#FF0000';
            context.fillText('RYU FAVORED', 191, 155);
        } else if (this.pools.KEN > this.pools.RYU) {
            context.fillStyle = '#FFD700';
            context.fillText('KEN FAVORED', 191, 155);
        } else {
            context.fillStyle = '#FFFFFF';
            context.fillText('EVEN ODDS', 191, 155);
        }
    }

    drawWinner(context) {
        if (this.fadeAnimation < 1) return;
        
        // Panel de victoria
        const slideY = 60 + (1 - this.slideAnimation) * 50;
        
        context.globalAlpha = this.fadeAnimation;
        context.fillStyle = 'rgba(0, 0, 0, 0.9)';
        context.fillRect(91, slideY, 200, 80);
        
        // Borde dorado
        context.strokeStyle = '#FFD700';
        context.lineWidth = 3;
        context.strokeRect(91, slideY, 200, 80);
        
        // Texto de victoria
        context.fillStyle = this.winner === 'RYU' ? '#FF0000' : '#FFD700';
        context.font = 'bold 24px Arial';
        context.textAlign = 'center';
        context.fillText(`${this.winner} WINS!`, 191, slideY + 35);
        
        // Información de pagos
        context.fillStyle = '#FFFFFF';
        context.font = '10px Arial';
        const totalPaid = this.pools[this.winner];
        const totalWon = this.pools[this.winner === 'RYU' ? 'KEN' : 'RYU'] * 0.95;
        context.fillText(`Winners share: ${totalWon.toFixed(3)} BNB`, 191, slideY + 55);
        context.fillText('Payments processing...', 191, slideY + 70);
        
        context.globalAlpha = 1;
    }

    drawPayments(context) {
        // Lista de pagos recientes
        context.fillStyle = 'rgba(0, 0, 0, 0.7)';
        context.fillRect(10, 140, 150, 70);
        
        context.strokeStyle = '#00FF00';
        context.lineWidth = 1;
        context.strokeRect(10, 140, 150, 70);
        
        context.fillStyle = '#00FF00';
        context.font = 'bold 9px Arial';
        context.textAlign = 'left';
        context.fillText('PAYMENTS SENT:', 15, 152);
        
        context.font = '8px monospace';
        context.fillStyle = '#FFFFFF';
        this.recentPayments.forEach((payment, index) => {
            const y = 165 + index * 10;
            const opacity = 1 - ((Date.now() - payment.timestamp) / 10000);
            context.globalAlpha = opacity;
            context.fillText(
                `${payment.address}: +${payment.profit} BNB`,
                15, y
            );
        });
        context.globalAlpha = 1;
    }
}