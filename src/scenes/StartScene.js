// src/scenes/StartScene.js - MODIFICADO PARA SISTEMA DE APUESTAS
import { SCENE_WIDTH } from '../constants/Stage.js';
import { LOGO_FLASH_DELAY } from '../constants/battle.js';
import { BattleScene } from './BattleScene.js';

export class StartScene {
	logoImg = document.getElementById('Logo');
	
	logoFlash = false;
	flashTimer = 0;
	
	// Nuevo: Estado de conexión y apuestas
	connected = false;
	bettingState = null;
	nextBattleTime = null;
	serverMessage = 'CONNECTING TO SERVER...';
	
	constructor(changeScene, config = {}) {
		this.changeScene = changeScene;
		this.socketClient = config.socketClient || null;
		
		// AGREGAR VERIFICACIÓN:
		if (this.socketClient && typeof this.socketClient.on === 'function') {
			this.setupSocketListeners();
		} else {
			console.log('SocketClient not ready yet');
			// Intentar de nuevo en un momento
			setTimeout(() => {
				if (this.socketClient && typeof this.socketClient.on === 'function') {
					this.setupSocketListeners();
				}
			}, 100);
		}
	}
	
	setupSocketListeners() {
		// Cuando recibe el estado inicial
		this.socketClient.on('current-state', (state) => {
			this.connected = true;
			
			if (state.bettingPhase) {
				this.serverMessage = 'BETTING PHASE ACTIVE';
				
				// AGREGAR: Cambiar inmediatamente a BattleScene
				this.changeScene(BattleScene, {
					socketClient: this.socketClient,
					bettingPhase: true,
					wallets: state.wallets,
					nextBattleTime: state.nextBattleTime,
					minBet: state.minBet
				});
			} else if (state.battleInProgress) {
				this.serverMessage = 'BATTLE IN PROGRESS';
				// Si hay batalla en progreso, cambiar a BattleScene
				this.changeScene(BattleScene, {
					socketClient: this.socketClient,
					syncBattle: true,
					battleState: state.battleState,
					seed: state.seed
				});
			} else {
				this.serverMessage = 'CONNECTED - WAITING FOR NEXT ROUND';
				if (state.nextBattleTime) {
					this.nextBattleTime = new Date(state.nextBattleTime);
				}
			}
		});
		
		// Conexión establecida
		this.socketClient.on('state-update', (state) => {
			this.connected = true;
			this.serverMessage = 'CONNECTED - WAITING FOR NEXT ROUND';
			
			if (state.nextBattleTime) {
				this.nextBattleTime = new Date(state.nextBattleTime);
			}
			
			if (state.bettingPhase) {
				this.serverMessage = 'BETTING PHASE ACTIVE';
			} else if (state.battleInProgress) {
				// Si hay batalla en progreso, cambiar a BattleScene
				this.changeScene(BattleScene, {
					socketClient: this.socketClient,
					syncBattle: true
				});
			}
		});
		
		// Cuando empieza fase de apuestas
		this.socketClient.on('betting-phase-started', (data) => {
			this.serverMessage = 'BETTING PHASE STARTED!';
			// Cambiar a BattleScene que mostrará el overlay de apuestas
			setTimeout(() => {
				this.changeScene(BattleScene, {
					socketClient: this.socketClient,
					bettingPhase: true,
					wallets: data.wallets,
					nextBattleTime: data.nextBattleTime,
					minBet: data.minBet
				});
			}, 1000);
		});
		
		// Si hay batalla en progreso al conectar
		this.socketClient.on('battle-sync', (data) => {
			this.changeScene(BattleScene, {
				socketClient: this.socketClient,
				battleState: data
			});
		});
	}

	updateLogo = (time) => {
		if (this.flashTimer > time.previous) return;
		this.flashTimer = time.previous + LOGO_FLASH_DELAY[Number(!this.logoFlash)];
		this.logoFlash = !this.logoFlash;
	};

	update = (time) => {
		this.updateLogo(time);
	};
	
	drawLogo = (context) => {
		if (this.logoFlash) {
			context.fillStyle = 'black';
			context.fillRect(112, 22, 170, 80);
			return;
		}
		context.drawImage(
			this.logoImg,
			0,
			0,
			this.logoImg.width,
			this.logoImg.height,
			112,
			22,
			170,
			80
		);
	};
	
	drawWaitingScreen(context) {
		// Fondo negro
		context.fillStyle = 'black';
		context.fillRect(0, 0, 382, 224);
		
		// Logo
		this.drawLogo(context);
		
		// Título del juego
		context.fillStyle = '#FFD700';
		context.font = 'bold 16px Arial';
		context.textAlign = 'center';
		context.fillText('STREET FIGHTER BSC', 191, 120);
		
		// Subtítulo
		context.fillStyle = '#FFFFFF';
		context.font = '12px Arial';
		context.fillText('BETTING SYSTEM', 191, 135);
		
		// Estado del servidor
		context.fillStyle = this.connected ? '#00FF00' : '#FFFF00';
		context.font = '10px Arial';
		context.fillText(this.serverMessage, 191, 160);
		
		// Timer hasta próxima batalla
		if (this.nextBattleTime) {
			const now = Date.now();
			const timeLeft = Math.max(0, this.nextBattleTime - now);
			const seconds = Math.floor(timeLeft / 1000) % 60;
			const minutes = Math.floor(timeLeft / 60000);
			
			context.fillStyle = '#FFFFFF';
			context.font = '12px Arial';
			const timeStr = `Next battle in: ${minutes}:${seconds.toString().padStart(2, '0')}`;
			context.fillText(timeStr, 191, 180);
		}
		
		// Instrucciones
		context.fillStyle = '#888888';
		context.font = '8px Arial';
		context.fillText('Battles run every 5 minutes', 191, 200);
		context.fillText('Send BNB to fighter wallets to bet', 191, 210);
	}

	draw = (context) => {
		this.drawWaitingScreen(context);
	};
}