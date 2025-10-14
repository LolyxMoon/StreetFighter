// server/bscMonitor.js
import Web3 from 'web3';
import EventEmitter from 'events';

export class BSCMonitor extends EventEmitter {
    constructor() {
        super();
        this.web3 = null;
        this.watchingWalletscheckWalletTransactions  = new Map();
        this.intervals = new Map();
        this.lastBlockChecked = 0;
    }

    async initialize() {
        // Conectar a BSC
        const bscRpcUrl = process.env.BSC_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/';
        this.web3 = new Web3(new Web3.providers.HttpProvider(bscRpcUrl));
        
        // Verificar conexión
        try {
            const blockNumber = await this.web3.eth.getBlockNumber();
            this.lastBlockChecked = blockNumber;
            console.log(`Connected to BSC. Current block: ${blockNumber}`);
            return true;
        } catch (error) {
            console.error('Failed to connect to BSC:', error);
            throw error;
        }
    }

    // Monitorear una wallet
    watchWallet(address, callback) {
        if (this.watchingWallets.has(address)) {
            console.log(`Already watching wallet: ${address}`);
            return;
        }

        console.log(`Starting to watch wallet: ${address}`);
        this.watchingWallets.set(address, callback);

        // Chequear cada 3 segundos
        const interval = setInterval(async () => {
            await this.checkWalletTransactions(address, callback);
        }, 3000);

        this.intervals.set(address, interval);
    }

    // Dejar de monitorear todas las wallets
    stopWatching() {
        for (const [address, interval] of this.intervals) {
            clearInterval(interval);
            console.log(`Stopped watching wallet: ${address}`);
        }
        this.intervals.clear();
        this.watchingWallets.clear();
    }

async checkWalletTransactions(address, callback) {
        try {
            const currentBlock = await this.web3.eth.getBlockNumber();
            
            // Convertir a Number si es BigInt
            const currentBlockNum = typeof currentBlock === 'bigint' ? Number(currentBlock) : currentBlock;
            const lastBlockNum = typeof this.lastBlockChecked === 'bigint' ? Number(this.lastBlockChecked) : this.lastBlockChecked;
            
            // Obtener transacciones de los últimos bloques
            for (let i = lastBlockNum + 1; i <= currentBlockNum; i++) {
                const block = await this.web3.eth.getBlock(i, true);
                
                if (block && block.transactions) {
                    for (const tx of block.transactions) {
                        // Verificar si la transacción es hacia nuestra wallet
                        if (tx.to && tx.to.toLowerCase() === address.toLowerCase()) {
                            // Convertir value a string si es BigInt antes de usar fromWei
                            const valueStr = typeof tx.value === 'bigint' ? tx.value.toString() : tx.value;
                            const value = this.web3.utils.fromWei(valueStr, 'ether');
                            
                            console.log(`New transaction detected to ${address}:`);
                            console.log(`  From: ${tx.from}`);
                            console.log(`  Amount: ${value} BNB`);
                            console.log(`  Hash: ${tx.hash}`);
                            
                            // Llamar callback con la info de la transacción
                            callback({
                                from: tx.from,
                                to: tx.to,
                                value: parseFloat(value),
                                hash: tx.hash,
                                blockNumber: typeof tx.blockNumber === 'bigint' ? Number(tx.blockNumber) : tx.blockNumber,
                                timestamp: new Date()
                            });
                        }
                    }
                }
            }
            
            this.lastBlockChecked = currentBlockNum;
            
        } catch (error) {
            console.error('Error checking wallet transactions:', error);
        }
    }

    // Obtener balance de una wallet
    async getBalance(address) {
        try {
            const balance = await this.web3.eth.getBalance(address);
            return this.web3.utils.fromWei(balance, 'ether');
        } catch (error) {
            console.error('Error getting balance:', error);
            return '0';
        }
    }

    // Verificar una transacción específica
    async verifyTransaction(txHash) {
        try {
            const tx = await this.web3.eth.getTransaction(txHash);
            const receipt = await this.web3.eth.getTransactionReceipt(txHash);
            
            if (receipt && receipt.status) {
                return {
                    success: true,
                    from: tx.from,
                    to: tx.to,
                    value: this.web3.utils.fromWei(tx.value, 'ether'),
                    hash: tx.hash
                };
            }
            
            return { success: false };
        } catch (error) {
            console.error('Error verifying transaction:', error);
            return { success: false, error: error.message };
        }
    }

    // Estimar gas para una transacción
    async estimateGas(from, to, value) {
        try {
            const gasEstimate = await this.web3.eth.estimateGas({
                from,
                to,
                value: this.web3.utils.toWei(value.toString(), 'ether')
            });
            
            const gasPrice = await this.web3.eth.getGasPrice();
            // Convertir todo a BigInt primero, luego a string
            const gasCostWei = (BigInt(gasEstimate) * BigInt(gasPrice)).toString();
            const gasCost = this.web3.utils.fromWei(gasCostWei, 'ether');
            
            return {
                gasLimit: gasEstimate.toString(),
                gasPrice: this.web3.utils.fromWei(gasPrice.toString(), 'gwei'),
                totalCost: gasCost
            };
        } catch (error) {
            console.error('Error estimating gas:', error);
            return null;
        }
    }
}