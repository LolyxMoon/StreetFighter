// src/scenes/ResultsScene.js - PANTALLA DE RESULTADOS
import { StartScene } from './StartScene.js';

export class ResultsScene {
    constructor(changeScene, config = {}) {
        this.changeScene = changeScene;
        this.socketClient = config.socketClient;
        
        this.winner = config.winner || 'RYU';
        this.winningBets = config.winningBets || [];
        this.totalPayout = config.totalPayout || 0;
        
        this.timer = 0;
        this.maxTime = 700; // 5 segundos (60 fps * 5)
        this.scrollOffset = 0;
        this.scrollSpeed = 0.5;
        
        console.log('ResultsScene:', { 
            winner: this.winner, 
            bets: this.winningBets.length, 
            payout: this.totalPayout 
        });
    }
    
    update(time) {
        this.timer++;
        
        // Auto scroll si hay muchas wallets
        if (this.winningBets.length > 5) {
            this.scrollOffset += this.scrollSpeed;
            if (this.scrollOffset > this.winningBets.length * 25) {
                this.scrollOffset = 0;
            }
        }
        
        // Volver a StartScene después de 5 segundos
        if (this.timer >= this.maxTime) {
            this.changeScene(StartScene, { socketClient: this.socketClient });
        }
    }
    
    draw(context) {
        // Fondo oscuro
        context.fillStyle = 'rgba(0, 0, 0, 0.95)';
        context.fillRect(0, 0, 382, 224);
        
        // Título
        context.fillStyle = '#FFD700';
        context.strokeStyle = '#000';
        context.lineWidth = 3;
        context.font = 'bold 24px Arial';
        context.textAlign = 'center';
        context.strokeText(`${this.winner} WINS!`, 191, 30);
        context.fillText(`${this.winner} WINS!`, 191, 30);
        
        // Subtítulo
        context.fillStyle = '#FFFFFF';
        context.font = 'bold 14px Arial';
        context.fillText('WINNING BETS', 191, 55);
        
        // Total Payout
        context.fillStyle = '#00FF00';
        context.font = 'bold 16px Arial';
        context.fillText(`Total Paid: ${this.totalPayout.toFixed(4)} BNB`, 191, 75);
        
        // Lista de ganadores
        if (this.winningBets.length === 0) {
            context.fillStyle = '#999';
            context.font = '12px Arial';
            context.fillText('No winning bets', 191, 110);
        } else {
            // Área de scroll
            const startY = 95;
            const maxVisible = 5;
            const lineHeight = 24;
            
            // Recortar área visible
            context.save();
            context.beginPath();
            context.rect(10, startY, 362, maxVisible * lineHeight);
            context.clip();
            
            this.winningBets.forEach((bet, index) => {
                const y = startY + (index * lineHeight) - this.scrollOffset;
                
                if (y > startY - lineHeight && y < startY + (maxVisible * lineHeight)) {
                    // Fondo alternado
                    if (index % 2 === 0) {
                        context.fillStyle = 'rgba(255, 255, 255, 0.05)';
                        context.fillRect(15, y, 352, lineHeight - 2);
                    }
                    
                    // Wallet (acortada)
                    context.fillStyle = '#AAA';
                    context.font = '10px monospace';
                    context.textAlign = 'left';
                    const shortWallet = `${bet.wallet.slice(0, 6)}...${bet.wallet.slice(-4)}`;
                    context.fillText(shortWallet, 20, y + 15);
                    
                    // Cantidad ganada
                    context.fillStyle = '#00FF00';
                    context.font = 'bold 11px Arial';
                    context.textAlign = 'right';
                    context.fillText(`+${bet.payout.toFixed(4)} BNB`, 360, y + 15);
                }
            });
            
            context.restore();
            
            // Indicador de scroll
            if (this.winningBets.length > maxVisible) {
                context.fillStyle = 'rgba(255, 255, 255, 0.3)';
                context.fillRect(370, startY, 2, maxVisible * lineHeight);
                
                const scrollBarHeight = (maxVisible / this.winningBets.length) * (maxVisible * lineHeight);
                const scrollBarY = (this.scrollOffset / (this.winningBets.length * lineHeight)) * (maxVisible * lineHeight);
                
                context.fillStyle = '#FFD700';
                context.fillRect(370, startY + scrollBarY, 2, scrollBarHeight);
            }
        }
        
        // Footer
        context.fillStyle = 'rgba(0, 0, 0, 0.8)';
        context.fillRect(0, 200, 382, 24);
        
        context.fillStyle = '#AAA';
        context.font = '10px Arial';
        context.textAlign = 'center';
        const timeLeft = Math.ceil((this.maxTime - this.timer) / 60);
        context.fillText(`Next round in ${timeLeft}s...`, 191, 214);
    }
    
    destroy() {
        // Cleanup
    }
}