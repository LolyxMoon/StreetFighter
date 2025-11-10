// server/database.js
// Versión simple usando archivo JSON para empezar rápido
// Luego puedes migrar a MongoDB

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class Database {
    constructor() {
        this.dataFile = path.join(__dirname, 'data.json');
        this.data = {
            bets: [],
            battles: [],
            payments: [],
            stats: {
                totalBattles: 0,
                ryuWins: 0,
                kenWins: 0,
                totalVolume: 0,
                totalPlayers: new Set(),
                lastBattle: null
            }
        };
        this.loadData();
    }

    loadData() {
        try {
            if (fs.existsSync(this.dataFile)) {
                const rawData = fs.readFileSync(this.dataFile, 'utf8');
                const loaded = JSON.parse(rawData);
                this.data = {
                    ...loaded,
                    stats: {
                        ...loaded.stats,
                        totalPlayers: new Set(loaded.stats.totalPlayers || [])
                    }
                };
                console.log('📊 Database loaded from file');
            }
        } catch (error) {
            console.error('Error loading database:', error);
        }
    }

    saveData() {
        try {
            const toSave = {
                ...this.data,
                stats: {
                    ...this.data.stats,
                    totalPlayers: Array.from(this.data.stats.totalPlayers)
                }
            };
            fs.writeFileSync(this.dataFile, JSON.stringify(toSave, null, 2));
        } catch (error) {
            console.error('Error saving database:', error);
        }
    }

    async connect() {
        console.log('📊 Using local JSON database');
        return true;
    }

    async saveBet(bet) {
        this.data.bets.push({
            ...bet,
            timestamp: bet.timestamp || new Date()
        });
        
        // Actualizar stats
        this.data.stats.totalVolume += bet.amount;
        this.data.stats.totalPlayers.add(bet.address);
        
        this.saveData();
        return true;
    }

    async saveBattleResult(result) {
        this.data.battles.push({
            ...result,
            timestamp: result.timestamp || new Date()
        });
        
        // Actualizar stats
        this.data.stats.totalBattles++;
        if (result.winner === 'RYU') {
            this.data.stats.ryuWins++;
        } else {
            this.data.stats.kenWins++;
        }
        this.data.stats.lastBattle = new Date();
        
        this.saveData();
        return true;
    }

    async savePayment(payment) {
        this.data.payments.push({
            ...payment,
            timestamp: payment.timestamp || new Date()
        });
        this.saveData();
        return true;
    }

    async getStats() {
        const totalPlayers = this.data.stats.totalPlayers.size;
        const winRate = this.data.stats.totalBattles > 0 
            ? {
                ryu: (this.data.stats.ryuWins / this.data.stats.totalBattles * 100).toFixed(1),
                ken: (this.data.stats.kenWins / this.data.stats.totalBattles * 100).toFixed(1)
            }
            : { ryu: 0, ken: 0 };

        return {
            totalBattles: this.data.stats.totalBattles,
            ryuWins: this.data.stats.ryuWins,
            kenWins: this.data.stats.kenWins,
            winRate,
            totalVolume: this.data.stats.totalVolume.toFixed(4),
            totalPlayers,
            lastBattle: this.data.stats.lastBattle,
            last24hVolume: this.getLast24hVolume()
        };
    }

    async getBattleHistory(limit = 20) {
        return this.data.battles
            .slice(-limit)
            .reverse()
            .map(battle => ({
                ...battle,
                totalPool: (battle.totalPools.RYU + battle.totalPools.KEN).toFixed(4)
            }));
    }

    getLast24hVolume() {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return this.data.bets
            .filter(bet => new Date(bet.timestamp) > oneDayAgo)
            .reduce((sum, bet) => sum + bet.amount, 0)
            .toFixed(4);
    }

    // Limpiar datos antiguos (opcional, para mantener el archivo pequeño)
    async cleanOldData(daysToKeep = 30) {
        const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
        
        this.data.bets = this.data.bets.filter(
            bet => new Date(bet.timestamp) > cutoffDate
        );
        this.data.battles = this.data.battles.filter(
            battle => new Date(battle.timestamp) > cutoffDate
        );
        this.data.payments = this.data.payments.filter(
            payment => new Date(payment.timestamp) > cutoffDate
        );
        
        this.saveData();
        console.log(`🧹 Cleaned data older than ${daysToKeep} days`);
    }
}