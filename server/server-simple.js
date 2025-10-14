// server/server-simple.js - VERSIÓN SIN DEPENDENCIAS EXTERNAS
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Permitir todo para testing
        methods: ["GET", "POST"]
    }
});

// Middlewares
app.use(cors());
app.use(express.json());

// Servir archivos estáticos del juego
app.use(express.static(path.join(__dirname, '../')));

// Estado global del juego
const gameState = {
    currentBattle: null,
    bettingPhase: true,
    battleInProgress: false,
    nextBattleTime: null,
    bets: {
        RYU: [],
        KEN: []
    },
    totalPools: {
        RYU: 0,
        KEN: 0
    },
    currentSeed: null,
    winner: null
};

// Configuración de wallets (TEMPORAL - sin BSC real)
const WALLETS = {
    RYU: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
    KEN: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2'
};

// ============================================
// GAME ENGINE SIMPLE
// ============================================
class SimpleGameEngine {
    constructor() {
        this.fighters = [
            { id: 'RYU', hitPoints: 100 },
            { id: 'KEN', hitPoints: 100 }
        ];
        this.frameCount = 0;
        this.winner = null;
    }

    initializeBattle(seed) {
        this.fighters = [
            { id: 'RYU', hitPoints: 100, position: { x: 100, y: 200 } },
            { id: 'KEN', hitPoints: 100, position: { x: 280, y: 200 } }
        ];
        this.frameCount = 0;
        this.winner = null;
        return this.getCurrentState();
    }

    updateFrame() {
        this.frameCount++;
        
        // Simulación simple de daño cada 30 frames
        if (this.frameCount % 30 === 0 && !this.winner) {
            const damage = Math.floor(Math.random() * 10) + 5;
            const target = Math.random() > 0.5 ? 0 : 1;
            this.fighters[target].hitPoints -= damage;
            
            console.log(`Frame ${this.frameCount}: ${this.fighters[target].id} takes ${damage} damage (HP: ${this.fighters[target].hitPoints})`);
            
            // Verificar ganador
            if (this.fighters[0].hitPoints <= 0) {
                this.winner = 'KEN';
            } else if (this.fighters[1].hitPoints <= 0) {
                this.winner = 'RYU';
            }
        }
        
        return this.getCurrentState();
    }

    getCurrentState() {
        return {
            fighters: this.fighters,
            frameCount: this.frameCount,
            winner: this.winner
        };
    }
}

const gameEngine = new SimpleGameEngine();

// ============================================
// FASES DEL JUEGO
// ============================================

async function startBettingPhase() {
    console.log('🎰 Starting betting phase...');
    
    gameState.bettingPhase = true;
    gameState.battleInProgress = false;
    gameState.winner = null;
    gameState.bets = { RYU: [], KEN: [] };
    gameState.totalPools = { RYU: 0, KEN: 0 };
    gameState.currentSeed = Math.floor(Math.random() * 1000000);
    
    // Próxima batalla en 30 segundos (para testing rápido)
    const now = new Date();
    gameState.nextBattleTime = new Date(now.getTime() + 30 * 1000); // 30 segundos
    
    io.emit('betting-phase-started', {
        nextBattleTime: gameState.nextBattleTime,
        wallets: WALLETS,
        minBet: 0.001,
        houseFee: 0.05
    });
    
    console.log('Betting phase will end in 30 seconds...');
    
    // Timer para cerrar apuestas
    setTimeout(() => {
        endBettingPhase();
    }, 30 * 1000); // 30 segundos para testing
}

async function endBettingPhase() {
    console.log('🔒 Closing bets...');
    
    gameState.bettingPhase = false;
    
    io.emit('betting-closed', {
        totalPools: gameState.totalPools,
        totalBets: {
            RYU: gameState.bets.RYU.length,
            KEN: gameState.bets.KEN.length
        },
        startingIn: 5 // segundos
    });
    
    // Countdown de 5 segundos
    for (let i = 5; i > 0; i--) {
        io.emit('battle-countdown', i);
        console.log(`Battle starts in ${i}...`);
        await sleep(1000);
    }
    
    startBattle();
}

async function startBattle() {
    console.log('⚔️ Starting battle with seed:', gameState.currentSeed);
    
    gameState.battleInProgress = true;
    const battleData = gameEngine.initializeBattle(gameState.currentSeed);
    
    io.emit('battle-started', {
        seed: gameState.currentSeed,
        initialState: battleData
    });
    
    // Simular batalla (máximo 10 segundos para testing)
    const FRAME_RATE = 60;
    const FRAME_DELAY = 1000 / FRAME_RATE;
    const maxFrames = 10 * FRAME_RATE; // 10 segundos
    
    const battleInterval = setInterval(() => {
        const frameData = gameEngine.updateFrame();
        
        // Enviar update cada 3 frames
        if (gameEngine.frameCount % 3 === 0) {
            io.emit('battle-frame', {
                frame: gameEngine.frameCount,
                state: frameData
            });
        }
        
        // Si hay ganador o timeout
        if (frameData.winner || gameEngine.frameCount >= maxFrames) {
            clearInterval(battleInterval);
            const winner = frameData.winner || determineWinnerByHealth(frameData);
            endBattle(winner);
        }
    }, FRAME_DELAY);
}

async function endBattle(winner) {
    console.log(`🏆 Battle ended! Winner: ${winner}`);
    
    gameState.battleInProgress = false;
    gameState.winner = winner;
    
    io.emit('battle-ended', {
        winner: winner,
        totalPools: gameState.totalPools
    });
    
    // Simular pagos
    console.log('💳 Processing payments (simulated)...');
    io.emit('payments-completed', {
        message: 'Payments simulated - no real BSC integration yet',
        winner: winner
    });
    
    // Esperar 10 segundos antes de siguiente ronda
    console.log('Next round in 10 seconds...');
    setTimeout(() => {
        startBettingPhase();
    }, 10 * 1000);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function determineWinnerByHealth(frameData) {
    if (frameData.fighters[0].hitPoints > frameData.fighters[1].hitPoints) {
        return 'RYU';
    } else if (frameData.fighters[1].hitPoints > frameData.fighters[0].hitPoints) {
        return 'KEN';
    }
    return Math.random() > 0.5 ? 'RYU' : 'KEN';
}

// ============================================
// SOCKET.IO EVENTOS
// ============================================

io.on('connection', (socket) => {
    console.log('👤 New user connected:', socket.id);
    
    // Enviar estado actual
    socket.emit('current-state', {
        bettingPhase: gameState.bettingPhase,
        battleInProgress: gameState.battleInProgress,
        nextBattleTime: gameState.nextBattleTime,
        totalPools: gameState.totalPools,
        winner: gameState.winner,
        wallets: WALLETS
    });
    
    // Si hay batalla en progreso, sincronizar
    if (gameState.battleInProgress) {
        socket.emit('sync-battle', {
            seed: gameState.currentSeed,
            state: gameEngine.getCurrentState()
        });
    }
    
    socket.on('disconnect', () => {
        console.log('👤 User disconnected:', socket.id);
    });
    
    // Simular apuesta (para testing sin BSC real)
    socket.on('test-bet', (data) => {
        console.log('Test bet received:', data);
        
        if (gameState.bettingPhase && data.fighter && data.amount) {
            gameState.bets[data.fighter].push({
                address: '0x' + Math.random().toString(16).substr(2, 40),
                amount: data.amount
            });
            gameState.totalPools[data.fighter] += data.amount;
            
            io.emit('new-bet', {
                fighter: data.fighter,
                amount: data.amount,
                total: gameState.totalPools[data.fighter],
                betCount: gameState.bets[data.fighter].length
            });
        }
    });
});

// ============================================
// API ENDPOINTS
// ============================================

app.get('/api/state', (req, res) => {
    res.json({
        ...gameState,
        serverTime: new Date()
    });
});

// ============================================
// INICIALIZACIÓN
// ============================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🎮 Street Fighter BSC Betting System (TEST MODE)`);
    console.log(`📌 Open http://localhost:${PORT} in your browser`);
    console.log('');
    console.log('⚡ Quick test commands (run in browser console):');
    console.log('  window.socketClient.emit("test-bet", { fighter: "RYU", amount: 0.5 });');
    console.log('  window.socketClient.emit("test-bet", { fighter: "KEN", amount: 0.3 });');
    console.log('');
    
    // Iniciar primera ronda
    startBettingPhase();
});