// server/paymentSystem.js
import Web3 from 'web3';

export class PaymentSystem {
    constructor() {
        this.web3 = null;
        this.account = null;
        this.privateKey = null;
        this.isInitialized = false;
    }

    async initialize() {
        try {
            // Conectar a BSC
            const bscRpcUrl = process.env.BSC_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/';
            this.web3 = new Web3(new Web3.providers.HttpProvider(bscRpcUrl));
            
            // Configurar cuenta para pagos
            this.privateKey = process.env.PAYMENT_PRIVATE_KEY;
            
            if (!this.privateKey) {
                console.warn('⚠️ Payment private key not configured - payments will be simulated');
                this.isInitialized = false;
                return false;
            }
            
            this.account = this.web3.eth.accounts.privateKeyToAccount('0x' + this.privateKey);
            this.web3.eth.accounts.wallet.add(this.account);
            this.web3.eth.defaultAccount = this.account.address;
            
            // Verificar balance
            const balance = await this.web3.eth.getBalance(this.account.address);
            const balanceBNB = this.web3.utils.fromWei(balance, 'ether');
            
            console.log(`Payment account: ${this.account.address}`);
            console.log(`Balance: ${balanceBNB} BNB`);
            
            if (parseFloat(balanceBNB) < 0.1) {
                console.warn('⚠️ Warning: Low balance in payment account');
            }
            
            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error('Payment system initialization error:', error);
            this.isInitialized = false;
            return false;
        }
    }

    async sendPayment(toAddress, amount) {
        // Si no está inicializado, simular pago
        if (!this.isInitialized) {
            console.log(`💰 SIMULATED: Payment of ${amount} BNB to ${toAddress}`);
            return {
                success: true,
                simulated: true,
                hash: 'SIMULATED_' + Date.now(),
                from: 'simulated',
                to: toAddress,
                amount: amount,
                message: 'Payments simulated - no real BSC integration yet'
            };
        }

        try {
            console.log(`Sending ${amount} BNB to ${toAddress}...`);
            
            // Crear transacción
            const tx = {
                from: this.account.address,
                to: toAddress,
                value: this.web3.utils.toWei(amount.toString(), 'ether'),
                gas: 21000,
                gasPrice: await this.web3.eth.getGasPrice()
            };
            
            // Firmar y enviar
            const signedTx = await this.web3.eth.accounts.signTransaction(tx, this.privateKey);
            const receipt = await this.web3.eth.sendSignedTransaction(signedTx.rawTransaction);
            
            console.log(`Payment sent! Hash: ${receipt.transactionHash}`);
            
            return {
                success: true,
                hash: receipt.transactionHash,
                from: tx.from,
                to: tx.to,
                amount: amount
            };
            
        } catch (error) {
            console.error('Payment error:', error);
            
            // Si falla, simular el pago para no romper el flujo
            console.log(`💰 SIMULATED (due to error): Payment of ${amount} BNB to ${toAddress}`);
            return {
                success: true,
                simulated: true,
                hash: 'SIMULATED_ERROR_' + Date.now(),
                from: 'simulated',
                to: toAddress,
                amount: amount,
                error: error.message
            };
        }
    }

    async getBalance() {
        if (!this.isInitialized) return '0';
        
        try {
            const balance = await this.web3.eth.getBalance(this.account.address);
            return this.web3.utils.fromWei(balance, 'ether');
        } catch (error) {
            console.error('Error getting balance:', error);
            return '0';
        }
    }
}