// server/database.js
import { MongoClient } from 'mongodb';

export class Database {
    constructor() {
        this.client = null;
        this.db = null;
    }

    async connect() {
        try {
            const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
            this.client = new MongoClient(uri);
            await this.client.connect();
            this.db = this.client.db('streetfighter-bsc');
            
            // Crear índices
            await this.createIndexes();
            
            console.log('Connected to MongoDB');
            return true;
        } catch (error) {
            console.error('MongoDB connection error:', error);
            // En lugar de lanzar error, simular base de datos
            console.log('⚠️ Running without MongoDB - data will not persist');
            this.db = null;
            return false;
        }
    }

    async createIndexes() {
        if (!this.db) return;
        
        try {
            await this.db.collection('bets').createIndex({ timestamp: -1 });
            await this.db.collection('bets').createIndex({ fighter: 1 });
            await this.db.collection('bets').createIndex({ address: 1 });
            await this.db.collection('battles').createIndex({ timestamp: -1 });
            await this.db.collection('battles').createIndex({ winner: 1 });
            await this.db.collection('payments').createIndex({ timestamp: -1 });
        } catch (error) {
            console.error('Error creating indexes:', error);
        }
    }

    // Guardar apuesta
    async saveBet(bet) {
        if (!this.db) {
            console.log('Bet saved (simulated):', bet);
            return 'simulated_' + Date.now();
        }
        
        try {
            const result = await this.db.collection('bets').insertOne({
                ...bet,
                timestamp: new Date()
            });
            return result.insertedId;
        } catch (error) {
            console.error('Error saving bet:', error);
            throw error;
        }
    }

    // Guardar resultado de batalla
    async saveBattleResult(battle) {
        if (!this.db) {
            console.log('Battle result saved (simulated):', battle);
            return 'simulated_' + Date.now();
        }
        
        try {
            const result = await this.db.collection('battles').insertOne({
                ...battle,
                timestamp: new Date()
            });
            return result.insertedId;
        } catch (error) {
            console.error('Error saving battle:', error);
            throw error;
        }
    }

    // Guardar pago
    async savePayment(payment) {
        if (!this.db) {
            console.log('Payment saved (simulated):', payment);
            return 'simulated_' + Date.now();
        }
        
        try {
            const result = await this.db.collection('payments').insertOne({
                ...payment,
                timestamp: new Date()
            });
            return result.insertedId;
        } catch (error) {
            console.error('Error saving payment:', error);
            throw error;
        }
    }

    // Obtener historial de batallas
    async getBattleHistory(limit = 20) {
        if (!this.db) return [];
        
        try {
            return await this.db.collection('battles')
                .find({})
                .sort({ timestamp: -1 })
                .limit(limit)
                .toArray();
        } catch (error) {
            console.error('Error getting battle history:', error);
            return [];
        }
    }

    // Obtener estadísticas
    async getStats() {
        if (!this.db) {
            return {
                totalBets: 0,
                totalBattles: 0,
                ryuWins: 0,
                kenWins: 0,
                ryuWinRate: 0.5,
                kenWinRate: 0.5,
                totalVolume: 0,
                topBettor: null
            };
        }
        
        try {
            const totalBets = await this.db.collection('bets').countDocuments();
            const totalBattles = await this.db.collection('battles').countDocuments();
            
            const ryuWins = await this.db.collection('battles')
                .countDocuments({ winner: 'RYU' });
            const kenWins = await this.db.collection('battles')
                .countDocuments({ winner: 'KEN' });
            
            const totalVolume = await this.db.collection('bets')
                .aggregate([
                    { $group: { _id: null, total: { $sum: '$amount' } } }
                ]).toArray();
            
            const topBettor = await this.db.collection('bets')
                .aggregate([
                    { $group: { 
                        _id: '$address', 
                        totalBets: { $sum: '$amount' },
                        count: { $sum: 1 }
                    }},
                    { $sort: { totalBets: -1 } },
                    { $limit: 1 }
                ]).toArray();
            
            return {
                totalBets,
                totalBattles,
                ryuWins,
                kenWins,
                ryuWinRate: totalBattles > 0 ? ryuWins / totalBattles : 0,
                kenWinRate: totalBattles > 0 ? kenWins / totalBattles : 0,
                totalVolume: totalVolume[0]?.total || 0,
                topBettor: topBettor[0] || null
            };
        } catch (error) {
            console.error('Error getting stats:', error);
            return {};
        }
    }

    // Obtener apuestas de una dirección
    async getUserBets(address) {
        if (!this.db) return [];
        
        try {
            return await this.db.collection('bets')
                .find({ address })
                .sort({ timestamp: -1 })
                .toArray();
        } catch (error) {
            console.error('Error getting user bets:', error);
            return [];
        }
    }

    // Cerrar conexión
    async close() {
        if (this.client) {
            await this.client.close();
        }
    }
}