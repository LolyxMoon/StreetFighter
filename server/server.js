// server/server.js - VERSION CON SINCRONIZACIÓN EN TIEMPO REAL
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { Database } from './database.js';
import { BSCMonitor } from './bscMonitor.js';
import { PaymentSystem } from './paymentSystem.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const HOUSE_FEE = 0.05;

// Express app
const app = express();
const httpServer = createServer(app);

// Socket.IO
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Database
const db = new Database();

// BSC Monitor
const bscMonitor = new BSCMonitor();

// Payment System
const paymentSystem = new PaymentSystem();

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, '..')));
app.use(express.json());

// Rutas
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.get('/game', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'game.html'));
});

// Estado global del juego - COMPARTIDO POR TODOS
const gameState = {
    phase: 'BETTING', // BETTING, COUNTDOWN, BATTLE, PAYING
    bets: { RYU: [], KEN: [] },
    totalPools: { RYU: 0, KEN: 0 },
    winner: null,
    battleSeed: null,
    currentFrame: 0,
    cycleNumber: 0,
    nextBattleTime: Date.now() + 180000, // 3 minutos
    bettingDuration: 180000, // 3 minutos
    battleDuration: 99000, // 99 segundos
    payoutDuration: 10000 // 10 segundos
};

const WALLETS = {
    RYU: process.env.WALLET_RYU || '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb4',
    KEN: process.env.WALLET_KEN || '0x27045FF06a3240342bd9DaA28b59DB931b668364'
};

// ============================================
// CICLO DE BATALLA
// ============================================

function startBattleCycle() {
    console.log(`\n🎮 Starting battle cycle #${gameState.cycleNumber + 1}`);
    
    gameState.phase = 'BETTING';
    gameState.bets = { RYU: [], KEN: [] };
    gameState.totalPools = { RYU: 0, KEN: 0 };
    gameState.winner = null;
    gameState.cycleNumber++;
    gameState.nextBattleTime = Date.now() + gameState.bettingDuration;
    
    console.log(`💰 Betting phase started (${gameState.bettingDuration / 1000}s)`);
    
    // Emitir a TODOS los clientes
    io.emit('betting-phase-started', {
        duration: gameState.bettingDuration,
        cycleNumber: gameState.cycleNumber,
        nextBattleTime: gameState.nextBattleTime,
        wallets: WALLETS,
        minBet: 0.001,
        houseFee: HOUSE_FEE
    });
    
    setTimeout(() => startCountdown(), gameState.bettingDuration);
}

function startCountdown() {
    console.log('⏳ Countdown phase...');
    gameState.phase = 'COUNTDOWN';
    
    io.emit('betting-closed', { 
        totalPools: gameState.totalPools,
        totalBets: {
            RYU: gameState.bets.RYU.length,
            KEN: gameState.bets.KEN.length
        }
    });
    
    // Countdown de 5 segundos
    let countdown = 5;
    const countdownInterval = setInterval(() => {
        io.emit('battle-countdown', countdown);
        console.log(`Battle starts in ${countdown}...`);
        countdown--;
        
        if (countdown < 0) {
            clearInterval(countdownInterval);
            startBattle();
        }
    }, 1000);
}

function startBattle() {
    console.log('⚔️ Battle phase starting...');
    gameState.phase = 'BATTLE';
    gameState.battleSeed = Date.now();
    gameState.currentFrame = 0;
    
    console.log(`   Seed: ${gameState.battleSeed}`);
    console.log(`   RYU Pool: ${gameState.totalPools.RYU} BNB (${gameState.bets.RYU.length} bets)`);
    console.log(`   KEN Pool: ${gameState.totalPools.KEN} BNB (${gameState.bets.KEN.length} bets)`);
    
    // Emitir inicio de batalla a TODOS
    io.emit('battle-started', { 
        seed: gameState.battleSeed, 
        pools: gameState.totalPools 
    });
    
    setTimeout(() => {
        // Si no hay ganador después del tiempo, determinar por timeout
        if (!gameState.winner) {
            const winner = gameState.totalPools.RYU >= gameState.totalPools.KEN ? 'RYU' : 'KEN';
            handleBattleEnd(winner);
        }
    }, gameState.battleDuration);
}

async function handleBattleEnd(winner) {
    if (gameState.winner) return; // Ya procesado
    
    console.log(`🏆 Battle ended! Winner: ${winner}`);
    gameState.winner = winner;
    gameState.phase = 'PAYING';
    
    // Guardar resultado
    await db.saveBattleResult({
        cycleNumber: gameState.cycleNumber,
        seed: gameState.battleSeed,
        winner: winner,
        duration: (gameState.battleDuration / 1000).toFixed(1),
        frames: gameState.currentFrame,
        totalPools: gameState.totalPools,
        bets: gameState.bets
    });
    
    // Emitir a TODOS
    io.emit('battle-ended', { 
        winner: winner, 
        totalPools: gameState.totalPools 
    });
    
    // Procesar pagos
    await processPayments(winner);
    
    // Próximo ciclo
    setTimeout(() => startBattleCycle(), gameState.payoutDuration);
}

async function processPayments(winner) {
    console.log('💸 Processing payments...');
    
    const winningBets = gameState.bets[winner] || [];
    const losingBets = gameState.bets[winner === 'RYU' ? 'KEN' : 'RYU'] || [];
    
    const totalWinningPool = gameState.totalPools[winner] || 0;
    const totalLosingPool = gameState.totalPools[winner === 'RYU' ? 'KEN' : 'RYU'] || 0;
    
    if (winningBets.length === 0 || totalWinningPool === 0) {
        console.log('No winners to pay');
        io.emit('payments-completed', { message: 'No winners' });
        return;
    }
    
    // Calcular house fee
    const houseCut = totalLosingPool * HOUSE_FEE;
    const distributionPool = totalWinningPool + totalLosingPool - houseCut;
    
    console.log(`💰 Distribution: ${distributionPool.toFixed(4)} BNB to ${winningBets.length} winners`);
    console.log(`🏦 House fee: ${houseCut.toFixed(4)} BNB`);
    
    // Pagar house fee
    if (houseCut > 0) {
        const housePayment = await paymentSystem.sendPayment(
            process.env.HOUSE_WALLET || WALLETS[winner],
            houseCut
        );
        await db.savePayment({
            type: 'house_fee',
            amount: houseCut,
            cycleNumber: gameState.cycleNumber,
            ...housePayment
        });
    }
    
    // Pagar a ganadores
    for (const bet of winningBets) {
        const winnerShare = bet.amount / totalWinningPool;
        const payout = winnerShare * distributionPool;
        const profit = payout - bet.amount;
        
        console.log(`   Paying ${payout.toFixed(4)} BNB to ${bet.address.slice(0, 6)}...`);
        
        const payment = await paymentSystem.sendPayment(bet.address, payout);
        
        await db.savePayment({
            type: 'winner_payout',
            cycleNumber: gameState.cycleNumber,
            address: bet.address,
            originalBet: bet.amount,
            payout: payout,
            profit: profit,
            ...payment
        });
        
        // Emitir pago individual
        io.emit('payment-sent', {
            address: bet.address,
            amount: payout,
            profit: profit
        });
    }
    
    io.emit('payments-completed', { 
        winner, 
        totalPaid: distributionPool,
        recipients: winningBets.length
    });
}

// ============================================
// SOCKET.IO - SINCRONIZACIÓN EN TIEMPO REAL
// ============================================

io.on('connection', (socket) => {
    console.log(`👤 Client connected: ${socket.id}`);
    
    // CRÍTICO: Enviar estado actual inmediatamente
    socket.emit('current-state', {
        phase: gameState.phase,
        bettingPhase: gameState.phase === 'BETTING',
        battleInProgress: gameState.phase === 'BATTLE',
        nextBattleTime: gameState.nextBattleTime,
        totalPools: gameState.totalPools,
        bets: gameState.bets,
        winner: gameState.winner,
        wallets: WALLETS,
        cycleNumber: gameState.cycleNumber,
        seed: gameState.battleSeed,
        serverTime: Date.now()
    });
    
    // Si hay batalla en progreso, enviar sync
    if (gameState.phase === 'BATTLE') {
        socket.emit('sync-battle', {
            seed: gameState.battleSeed,
            currentFrame: gameState.currentFrame
        });
    }
    
    // Recibir apuestas (simuladas para testing)
    socket.on('place-bet', async (bet) => {
        if (gameState.phase !== 'BETTING') {
            socket.emit('bet-error', { message: 'Betting phase is closed' });
            return;
        }
        
        const { fighter, amount, address, txHash } = bet;
        
        if (!fighter || !amount || !address || (fighter !== 'RYU' && fighter !== 'KEN')) {
            socket.emit('bet-error', { message: 'Invalid bet data' });
            return;
        }
        
        const betData = {
            address: address,
            amount: parseFloat(amount),
            fighter: fighter,
            timestamp: new Date(),
            txHash: txHash || 'SIMULATED_' + Date.now(),
            cycleNumber: gameState.cycleNumber
        };
        
        gameState.bets[fighter].push(betData);
        gameState.totalPools[fighter] += parseFloat(amount);
        
        // Guardar en DB
        await db.saveBet(betData);
        
        console.log(`💰 Bet: ${amount} BNB on ${fighter} by ${address.slice(0, 6)}...`);
        
        // Confirmar al apostador
        socket.emit('bet-confirmed', betData);
        
        // Emitir a TODOS los clientes
        io.emit('new-bet', {
            fighter: fighter,
            amount: amount,
            address: address,
            total: gameState.totalPools[fighter],
            betCount: gameState.bets[fighter].length
        });
        
        io.emit('pools-updated', { totalPools: gameState.totalPools });
    });
    
    // Resultado de batalla del cliente
    socket.on('battle-result', async ({ winner, seed }) => {
        if (seed === gameState.battleSeed && !gameState.winner) {
            console.log(`✓ Battle result received: ${winner}`);
            await handleBattleEnd(winner);
        }
    });
    
    // Solicitar estado actual
    socket.on('request-state', () => {
        socket.emit('current-state', {
            phase: gameState.phase,
            bettingPhase: gameState.phase === 'BETTING',
            battleInProgress: gameState.phase === 'BATTLE',
            nextBattleTime: gameState.nextBattleTime,
            totalPools: gameState.totalPools,
            bets: gameState.bets,
            winner: gameState.winner,
            wallets: WALLETS,
            cycleNumber: gameState.cycleNumber,
            seed: gameState.battleSeed,
            serverTime: Date.now()
        });
    });
    
    socket.on('disconnect', () => {
        console.log(`👤 Client disconnected: ${socket.id}`);
    });
});

// ============================================
// ESTADO EN TIEMPO REAL - Broadcast cada segundo
// ============================================

setInterval(() => {
    io.emit('state-update', {
        phase: gameState.phase,
        totalPools: gameState.totalPools,
        nextBattleTime: gameState.nextBattleTime,
        serverTime: Date.now()
    });
}, 1000);

// ============================================
// INICIALIZACIÓN
// ============================================

async function initialize() {
    console.log('\n🚀 Initializing Street Fighter Betting Server...\n');
    
    // Database
    await db.connect();
    
    // BSC Monitor (opcional)
    try {
        await bscMonitor.initialize();
        
        // Monitorear wallets
        bscMonitor.watchWallet(WALLETS.RYU, async (tx) => {
            console.log(`💰 Bet detected for RYU: ${tx.value} BNB from ${tx.from}`);
            
            if (gameState.phase === 'BETTING') {
                const betData = {
                    address: tx.from,
                    amount: tx.value,
                    fighter: 'RYU',
                    timestamp: new Date(),
                    txHash: tx.hash,
                    cycleNumber: gameState.cycleNumber
                };
                
                gameState.bets.RYU.push(betData);
                gameState.totalPools.RYU += tx.value;
                
                await db.saveBet(betData);
                
                io.emit('new-bet', {
                    fighter: 'RYU',
                    amount: tx.value,
                    address: tx.from,
                    total: gameState.totalPools.RYU,
                    betCount: gameState.bets.RYU.length
                });
                
                io.emit('pools-updated', { totalPools: gameState.totalPools });
            }
        });
        
        bscMonitor.watchWallet(WALLETS.KEN, async (tx) => {
            console.log(`💰 Bet detected for KEN: ${tx.value} BNB from ${tx.from}`);
            
            if (gameState.phase === 'BETTING') {
                const betData = {
                    address: tx.from,
                    amount: tx.value,
                    fighter: 'KEN',
                    timestamp: new Date(),
                    txHash: tx.hash,
                    cycleNumber: gameState.cycleNumber
                };
                
                gameState.bets.KEN.push(betData);
                gameState.totalPools.KEN += tx.value;
                
                await db.saveBet(betData);
                
                io.emit('new-bet', {
                    fighter: 'KEN',
                    amount: tx.value,
                    address: tx.from,
                    total: gameState.totalPools.KEN,
                    betCount: gameState.bets.KEN.length
                });
                
                io.emit('pools-updated', { totalPools: gameState.totalPools });
            }
        });
    } catch (error) {
        console.warn('⚠️ BSC Monitor not available - using simulated bets only');
    }
    
    // Payment System
    await paymentSystem.initialize();
    
    httpServer.listen(PORT, () => {
        console.log(`\n✅ Server running on http://localhost:${PORT}`);
        console.log(`📡 Socket.IO ready\n`);
        
        // Iniciar primer ciclo
        startBattleCycle();
    });
}

initialize();