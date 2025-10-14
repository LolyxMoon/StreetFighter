// server/server.js
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { GameEngine } from './gameEngine.js';
import { BSCMonitor } from './bscMonitor.js';
import { Database } from './database.js';
import { PaymentSystem } from './paymentSystem.js';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URL || "http://localhost:8080",
        methods: ["GET", "POST"]
    }
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static('../client'));

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
    winner: null,
    battleHistory: []
};

// Instancias de servicios
const db = new Database();
const gameEngine = new GameEngine();
const bscMonitor = new BSCMonitor();
const paymentSystem = new PaymentSystem();

// Configuración de wallets
const WALLETS = {
    RYU: process.env.RYU_WALLET || '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
    KEN: process.env.KEN_WALLET || '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2',
    HOUSE: process.env.HOUSE_WALLET || '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3'
};

const HOUSE_FEE = parseFloat(process.env.HOUSE_FEE) || 0.05; // 5% para la casa
const MIN_BET = parseFloat(process.env.MIN_BET) || 0.001; // 0.001 BNB mínimo

// ============================================
// FASES DEL JUEGO
// ============================================

// Fase 1: Período de Apuestas (3 minutos)
async function startBettingPhase() {
    console.log('🎰 Starting betting phase...');
    
    gameState.bettingPhase = true;
    gameState.battleInProgress = false;
    gameState.winner = null;
    gameState.bets = { RYU: [], KEN: [] };
    gameState.totalPools = { RYU: 0, KEN: 0 };
    gameState.currentSeed = Math.floor(Math.random() * 1000000);
    
    // Calcular próxima batalla
    const now = new Date();
    gameState.nextBattleTime = new Date(now.getTime() + 3 * 60 * 1000); // 3 minutos
    
    // Notificar a todos los clientes
    io.emit('betting-phase-started', {
        nextBattleTime: gameState.nextBattleTime,
        wallets: {
            RYU: WALLETS.RYU,
            KEN: WALLETS.KEN
        },
        minBet: MIN_BET,
        houseFee: HOUSE_FEE
    });
    
    // Iniciar monitoreo de wallets
    startWalletMonitoring();
    
    // Timer para cerrar apuestas
    setTimeout(() => {
        endBettingPhase();
    }, 3 * 60 * 1000); // 3 minutos
}

// Monitorear transacciones entrantes
function startWalletMonitoring() {
    // Monitorear wallet de Ryu
    bscMonitor.watchWallet(WALLETS.RYU, async (tx) => {
        if (tx.value >= MIN_BET) {
            const bet = {
                address: tx.from,
                amount: tx.value,
                fighter: 'RYU',
                timestamp: new Date(),
                txHash: tx.hash
            };
            
            gameState.bets.RYU.push(bet);
            gameState.totalPools.RYU += tx.value;
            
            await db.saveBet(bet);
            
            io.emit('new-bet', {
                fighter: 'RYU',
                amount: tx.value,
                total: gameState.totalPools.RYU,
                betCount: gameState.bets.RYU.length
            });
            
            console.log(`💰 New bet on RYU: ${tx.value} BNB from ${tx.from}`);
        }
    });
    
    // Monitorear wallet de Ken
    bscMonitor.watchWallet(WALLETS.KEN, async (tx) => {
        if (tx.value >= MIN_BET) {
            const bet = {
                address: tx.from,
                amount: tx.value,
                fighter: 'KEN',
                timestamp: new Date(),
                txHash: tx.hash
            };
            
            gameState.bets.KEN.push(bet);
            gameState.totalPools.KEN += tx.value;
            
            await db.saveBet(bet);
            
            io.emit('new-bet', {
                fighter: 'KEN',
                amount: tx.value,
                total: gameState.totalPools.KEN,
                betCount: gameState.bets.KEN.length
            });
            
            console.log(`💰 New bet on KEN: ${tx.value} BNB from ${tx.from}`);
        }
    });
}

// Fase 2: Cerrar apuestas y preparar batalla
async function endBettingPhase() {
    console.log('🔒 Closing bets...');
    
    gameState.bettingPhase = false;
    bscMonitor.stopWatching();
    
    io.emit('betting-closed', {
        totalPools: gameState.totalPools,
        totalBets: {
            RYU: gameState.bets.RYU.length,
            KEN: gameState.bets.KEN.length
        },
        startingIn: 30 // segundos
    });
    
    // Countdown de 30 segundos
    for (let i = 30; i > 0; i--) {
        io.emit('battle-countdown', i);
        await sleep(1000);
    }
    
    startBattle();
}

// Fase 3: Batalla AI vs AI
async function startBattle() {
    console.log('⚔️ Starting battle with seed:', gameState.currentSeed);
    
    gameState.battleInProgress = true;
    
    // Inicializar motor de juego con seed
    const battleData = gameEngine.initializeBattle(gameState.currentSeed);
    
    io.emit('battle-started', {
        seed: gameState.currentSeed,
        initialState: battleData
    });
    
    // Simular batalla frame por frame
    const FRAME_RATE = 60;
    const FRAME_DELAY = 1000 / FRAME_RATE;
    let frameCount = 0;
    const maxFrames = 90 * FRAME_RATE; // 90 segundos máximo
    
    const battleInterval = setInterval(() => {
        frameCount++;
        
        // Actualizar estado del juego
        const frameData = gameEngine.updateFrame();
        
        // Enviar cada 3 frames para reducir bandwidth
        if (frameCount % 3 === 0) {
            io.emit('battle-frame', {
                frame: frameCount,
                state: frameData
            });
        }
        
        // Verificar si hay ganador o tiempo límite
        if (frameData.winner || frameCount >= maxFrames) {
            clearInterval(battleInterval);
            endBattle(frameData.winner || determineWinnerByHealth(frameData));
        }
    }, FRAME_DELAY);
}

// Fase 4: Finalizar batalla y pagar
async function endBattle(winner) {
    console.log(`🏆 Battle ended! Winner: ${winner}`);
    
    gameState.battleInProgress = false;
    gameState.winner = winner;
    
    // Guardar resultado en base de datos
    const battleResult = {
        seed: gameState.currentSeed,
        winner: winner,
        totalPools: gameState.totalPools,
        bets: gameState.bets,
        timestamp: new Date()
    };
    
    await db.saveBattleResult(battleResult);
    gameState.battleHistory.push(battleResult);
    
    // Anunciar ganador
    io.emit('battle-ended', {
        winner: winner,
        totalPools: gameState.totalPools
    });
    
    // Calcular y ejecutar pagos
    await processPayments(winner);
    
    // Esperar 1 minuto antes de siguiente ronda
    setTimeout(() => {
        startBettingPhase();
    }, 60 * 1000);
}

// Sistema de pagos
async function processPayments(winner) {
    console.log('💳 Processing payments...');
    
    const winningBets = gameState.bets[winner];
    const totalWinningPool = gameState.totalPools[winner];
    const totalLosingPool = gameState.totalPools[winner === 'RYU' ? 'KEN' : 'RYU'];
    
    if (winningBets.length === 0 || totalWinningPool === 0) {
        console.log('No winners to pay');
        io.emit('payments-completed', { message: 'No bets on winning side' });
        return;
    }
    
    // Calcular distribución
    const houseCut = totalLosingPool * HOUSE_FEE;
    const distributionPool = totalWinningPool + totalLosingPool - houseCut;
    
    const payments = [];
    
    for (const bet of winningBets) {
        const winnerShare = bet.amount / totalWinningPool;
        const payout = winnerShare * distributionPool;
        const profit = payout - bet.amount;
        
        payments.push({
            address: bet.address,
            originalBet: bet.amount,
            payout: payout,
            profit: profit
        });
    }
    
    // Ejecutar pagos
    try {
        // Enviar fee a la casa
        if (houseCut > 0) {
            await paymentSystem.sendPayment(WALLETS.HOUSE, houseCut);
            console.log(`House fee sent: ${houseCut} BNB`);
        }
        
        // Pagar a ganadores
        for (const payment of payments) {
            await paymentSystem.sendPayment(payment.address, payment.payout);
            console.log(`Paid ${payment.payout} BNB to ${payment.address}`);
            
            io.emit('payment-sent', {
                address: payment.address,
                amount: payment.payout,
                profit: payment.profit
            });
        }
        
        io.emit('payments-completed', {
            totalPaid: payments.reduce((sum, p) => sum + p.payout, 0),
            winnersCount: payments.length,
            houseFee: houseCut
        });
        
    } catch (error) {
        console.error('Payment error:', error);
        io.emit('payment-error', { message: 'Payment processing failed' });
    }
}

// ============================================
// SOCKET.IO EVENTOS
// ============================================

io.on('connection', (socket) => {
    console.log('👤 New user connected:', socket.id);
    
    // Enviar estado actual al nuevo usuario
    socket.emit('current-state', {
        bettingPhase: gameState.bettingPhase,
        battleInProgress: gameState.battleInProgress,
        nextBattleTime: gameState.nextBattleTime,
        totalPools: gameState.totalPools,
        winner: gameState.winner,
        wallets: {
            RYU: WALLETS.RYU,
            KEN: WALLETS.KEN
        }
    });
    
    // Si hay batalla en progreso, sincronizar
    if (gameState.battleInProgress && gameState.currentBattle) {
        socket.emit('sync-battle', {
            seed: gameState.currentSeed,
            currentFrame: gameEngine.getCurrentFrame(),
            state: gameEngine.getCurrentState()
        });
    }
    
    socket.on('disconnect', () => {
        console.log('👤 User disconnected:', socket.id);
    });
    
    // Chat opcional
    socket.on('chat-message', (message) => {
        io.emit('chat-message', {
            user: socket.id.substring(0, 6),
            message: message,
            timestamp: new Date()
        });
    });
});

// ============================================
// API ENDPOINTS
// ============================================

// Estadísticas
app.get('/api/stats', async (req, res) => {
    const stats = await db.getStats();
    res.json(stats);
});

// Historial de batallas
app.get('/api/history', async (req, res) => {
    const history = await db.getBattleHistory(20); // Últimas 20 batallas
    res.json(history);
});

// Estado actual
app.get('/api/state', (req, res) => {
    res.json({
        ...gameState,
        serverTime: new Date()
    });
});

// ============================================
// CRON JOBS
// ============================================

// Iniciar batalla cada 5 minutos
cron.schedule('*/5 * * * *', () => {
    if (!gameState.battleInProgress && !gameState.bettingPhase) {
        startBettingPhase();
    }
});

// ============================================
// HELPERS
// ============================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function determineWinnerByHealth(frameData) {
    if (frameData.fighters[0].hitPoints > frameData.fighters[1].hitPoints) {
        return 'RYU';
    } else if (frameData.fighters[1].hitPoints > frameData.fighters[0].hitPoints) {
        return 'KEN';
    }
    // Empate - random
    return Math.random() > 0.5 ? 'RYU' : 'KEN';
}

// ============================================
// INICIALIZACIÓN
// ============================================

async function initialize() {
    try {
        // Conectar base de datos
        await db.connect();
        console.log('📊 Database connected');
        
        // Inicializar BSC Monitor
        await bscMonitor.initialize();
        console.log('🔗 BSC Monitor initialized');
        
        // Inicializar sistema de pagos
        await paymentSystem.initialize();
        console.log('💰 Payment system ready');
        
        // Iniciar servidor
        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`🎮 Street Fighter BSC Betting System Ready!`);
            
            // Iniciar primera ronda
            startBettingPhase();
        });
        
    } catch (error) {
        console.error('Initialization error:', error);
        process.exit(1);
    }
}

// Manejo de errores
process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});

// Iniciar aplicación
initialize();