// server/server.js - COMPLETO CON EXPRESS
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

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

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, '..')));
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));
app.use('/src', express.static(path.join(__dirname, '..', 'src')));

// Ruta principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Estado del juego
const gameState = {
    phase: 'BETTING',
    bets: { RYU: [], KEN: [] },
    totalPools: { RYU: 0, KEN: 0 },
    winner: null,
    battleSeed: null,
    currentFrame: 0,
    cycleNumber: 0,
    nextBattleTime: Date.now() + 30000,
    bettingDuration: 30000,
    battleDuration: 99000,
    payoutDuration: 10000
};

const WALLETS = {
    RYU: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb4',
    KEN: '0x27045FF06a3240342bd9DaA28b59DB931b668364'
};

function startBattleCycle() {
    console.log('\n🎮 Starting new battle cycle...');
    gameState.phase = 'BETTING';
    gameState.bets = { RYU: [], KEN: [] };
    gameState.totalPools = { RYU: 0, KEN: 0 };
    gameState.winner = null;
    gameState.cycleNumber++;
    gameState.nextBattleTime = Date.now() + gameState.bettingDuration;
    
    console.log(`💰 Betting phase started (${gameState.bettingDuration / 1000}s)`);
    io.emit('betting-phase-started', {
        duration: gameState.bettingDuration,
        cycleNumber: gameState.cycleNumber
    });
    
    setTimeout(() => startBattle(), gameState.bettingDuration);
}

function startBattle() {
    console.log('⚔️ Battle phase starting...');
    gameState.phase = 'BATTLE';
    gameState.battleSeed = Date.now();
    gameState.currentFrame = 0;
    
    console.log(`   Seed: ${gameState.battleSeed}`);
    console.log(`   RYU Pool: ${gameState.totalPools.RYU} BNB (${gameState.bets.RYU.length} bets)`);
    console.log(`   KEN Pool: ${gameState.totalPools.KEN} BNB (${gameState.bets.KEN.length} bets)`);
    
    io.emit('betting-closed', { totalPools: gameState.totalPools });
    io.emit('battle-started', { seed: gameState.battleSeed, pools: gameState.totalPools });
    
    setTimeout(() => startPayout(), gameState.battleDuration);
}

function startPayout() {
    console.log('💸 Payout phase...');
    gameState.phase = 'PAYING';
    
    if (gameState.winner) {
        console.log(`   Winner: ${gameState.winner}`);
        io.emit('battle-ended', { winner: gameState.winner, pools: gameState.totalPools });
    }
    
    setTimeout(() => startBattleCycle(), gameState.payoutDuration);
}

io.on('connection', (socket) => {
    console.log(`👤 Client connected: ${socket.id}`);
    
    socket.emit('current-state', {
        phase: gameState.phase,
        bettingPhase: gameState.phase === 'BETTING',
        battleInProgress: gameState.phase === 'BATTLE',
        nextBattleTime: gameState.nextBattleTime,
        totalPools: gameState.totalPools,
        winner: gameState.winner,
        wallets: WALLETS,
        cycleNumber: gameState.cycleNumber,
        seed: gameState.battleSeed
    });
    
    if (gameState.phase === 'BATTLE') {
        socket.emit('sync-battle', {
            seed: gameState.battleSeed,
            currentFrame: gameState.currentFrame
        });
    }
    
    socket.on('place-bet', (bet) => {
        if (gameState.phase !== 'BETTING') {
            socket.emit('bet-error', { message: 'Betting phase is closed' });
            return;
        }
        
        const { fighter, amount, address } = bet;
        
        if (!fighter || !amount || !address || (fighter !== 'RYU' && fighter !== 'KEN')) {
            socket.emit('bet-error', { message: 'Invalid bet data' });
            return;
        }
        
        gameState.bets[fighter].push({
            address: address,
            amount: parseFloat(amount),
            timestamp: Date.now()
        });
        
        gameState.totalPools[fighter] += parseFloat(amount);
        
        console.log(`💰 Bet: ${amount} BNB on ${fighter} by ${address.slice(0, 6)}...`);
        
        socket.emit('bet-confirmed', { fighter, amount, address });
        io.emit('pools-updated', { totalPools: gameState.totalPools });
    });
    
    socket.on('battle-result', ({ winner, seed }) => {
        if (seed === gameState.battleSeed && !gameState.winner) {
            gameState.winner = winner;
            console.log(`✓ Winner: ${winner}`);
        }
    });
    
    socket.on('get-results', ({ winner }) => {
        const winningBets = gameState.bets[winner] || [];
        const totalWinningPool = gameState.totalPools[winner] || 0;
        const totalLosingPool = gameState.totalPools[winner === 'RYU' ? 'KEN' : 'RYU'] || 0;
        
        if (winningBets.length === 0 || totalWinningPool === 0) {
            socket.emit('results-data', { winningBets: [], totalPayout: 0 });
            return;
        }
        
        const houseCut = totalLosingPool * HOUSE_FEE;
        const distributionPool = totalWinningPool + totalLosingPool - houseCut;
        
        const payouts = winningBets.map(bet => {
            const winnerShare = bet.amount / totalWinningPool;
            const totalReturn = winnerShare * distributionPool;
            
            return {
                wallet: bet.address,
                betAmount: bet.amount,
                payout: totalReturn - bet.amount,
                totalReturn: totalReturn
            };
        });
        
        socket.emit('results-data', {
            winner,
            winningBets: payouts,
            totalPayout: payouts.reduce((sum, p) => sum + p.payout, 0)
        });
    });
    
    socket.on('disconnect', () => {
        console.log(`👤 Client disconnected: ${socket.id}`);
    });
});

httpServer.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 Socket.IO ready\n`);
    startBattleCycle();
});