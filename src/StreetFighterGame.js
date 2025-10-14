// src/StreetFighterGame.js - MODIFICADO CON SOCKET.IO
import {
	registerGamepadEvents,
	registerKeyboardEvents,
	updateGamePads,
} from './engine/InputHandler.js';
import { getContext } from './utils/context.js';
import { BattleScene } from './scenes/BattleScene.js';
import { GAME_SPEED } from './constants/game.js';
import { StartScene } from './scenes/StartScene.js';
import { ContextHandler } from './engine/ContextHandler.js';
import { SocketClient } from './network/SocketClient.js';

export class StreetFighterGame {
	context = getContext();

	frameTime = {
		secondsPassed: 0,
		previous: 0,
	};

	timeStarted = 0;
	sceneStarted = false;
	nextScene = undefined;
	nextSceneConfig = {};

	contextHandler = new ContextHandler(this.context);
	
	// NUEVO: Cliente Socket.io
	socketClient = null;
	serverUrl = window.GAME_SERVER_URL || 'http://localhost:3000';

	changeScene = (SceneClass, config = {}) => {
		this.contextHandler.startDimDown();
		this.sceneStarted = false;
		this.nextScene = SceneClass;
		this.nextSceneConfig = config;
	};

	startScene = (SceneClass, config = {}) => {
		this.contextHandler.startGlowUp();
		
		// MODIFICADO: Pasar socketClient a todas las escenas
		const sceneConfig = {
			...config,
			socketClient: this.socketClient
		};
		
		this.scene = new SceneClass(this.changeScene, sceneConfig);
		this.sceneStarted = true;
	};

	constructor() {
		// Inicializar Socket.io
		this.initializeSocket();
		
		// Empezar con StartScene
		this.startScene(StartScene, { socketClient: this.socketClient });
		
		// DESPUÉS de inicializar todo, hacer global
		window.game = this;
		window.socketClient = this.socketClient;
	}
	
	// NUEVO: Inicializar conexión Socket.io
	initializeSocket() {
		console.log('Initializing Socket.io connection to:', this.serverUrl);
		
		this.socketClient = new SocketClient();
		this.socketClient.connect(this.serverUrl);
		
		// Configurar listeners globales
		this.setupSocketListeners();
	}
	
	// NUEVO: Configurar listeners del socket
	setupSocketListeners() {
		// IMPORTANTE: Listener para el estado inicial al conectar
this.socketClient.on('current-state', (state) => {
    console.log('Server state received:', state);
    
    // IMPORTANTE: Si hay apuestas O batalla, ir a BattleScene
    if ((state.bettingPhase || state.battleInProgress) && this.scene?.constructor.name !== 'BattleScene') {
        console.log('Creating BattleScene for betting/battle');
        this.changeScene(BattleScene, {
            bettingPhase: state.bettingPhase,
            battleInProgress: state.battleInProgress,
            wallets: state.wallets,
            nextBattleTime: state.nextBattleTime,
            isAIBattle: true,
            battlePaused: state.bettingPhase // Pausar si hay apuestas
        });
    }

			// Si hay batalla en progreso
			else if (state.battleInProgress && state.seed) {
				console.log('Battle in progress, syncing...');
				this.changeScene(BattleScene, {
					isAIBattle: true,
					seed: state.seed,
					isNetworked: true,
					battleState: state.battleState,
					bettingPhase: false,
					battlePaused: false
				});
			}
			// Si no hay nada activo, quedarse en StartScene
			else {
				console.log('No active phase, staying in StartScene');
			}
		});
		
		// Cuando conecta al servidor (actualizaciones generales)
		this.socketClient.on('state-update', (state) => {
			console.log('State update received:', state);
		});
		
		// Cuando empieza fase de apuestas (desde StartScene ir a BattleScene)
		this.socketClient.on('betting-phase-started', (data) => {
			console.log('Betting phase started!', data);
			
			// Cambiar directamente a BattleScene con fase de apuestas
			this.changeScene(BattleScene, {
				bettingPhase: true,
				wallets: data.wallets,
				nextBattleTime: data.nextBattleTime,
				minBet: data.minBet || 10,
				isAIBattle: true,
				battlePaused: true
			});
		});
		
		// Cuando empieza la batalla
		this.socketClient.on('battle-start', (data) => {
			console.log('Battle starting with seed:', data.seed);
			
			// Si no estamos en BattleScene, cambiar
			if (this.scene && this.scene.constructor.name !== 'BattleScene') {
				this.changeScene(BattleScene, {
					isAIBattle: true,
					seed: data.seed,
					isNetworked: true,
					bettingPhase: false,
					battlePaused: false
				});
			}
		});
		
		// Sincronización de batalla para usuarios que se conectan tarde
		this.socketClient.on('battle-sync', (data) => {
			console.log('Syncing with ongoing battle');
			
			// Cambiar a BattleScene con estado sincronizado
			if (this.scene && this.scene.constructor.name !== 'BattleScene') {
				this.changeScene(BattleScene, {
					isAIBattle: true,
					seed: data.seed,
					isNetworked: true,
					battleState: data.state,
					bettingPhase: false,
					battlePaused: false
				});
			}
		});
		
		// Cuando termina la batalla, volver a StartScene
		this.socketClient.on('battle-end', (data) => {
			console.log('Battle ended, winner:', data.winner);
			
			// Después de unos segundos, volver a StartScene
			setTimeout(() => {
				if (this.scene && this.scene.constructor.name === 'BattleScene') {
					this.changeScene(StartScene);
				}
			}, 8000); // 8 segundos para ver resultados y pagos
		});
		
		// Manejo de errores de conexión
		this.socketClient.on('connect_error', (error) => {
			console.error('Connection error:', error);
		});
		
		// Cuando se desconecta
		this.socketClient.on('disconnect', (reason) => {
			console.log('Disconnected from server:', reason);
		});
		
		// Cuando se reconecta
		this.socketClient.on('reconnect', (attemptNumber) => {
			console.log('Reconnected after', attemptNumber, 'attempts');
			// El servidor debería enviar 'current-state' automáticamente
		});
	}

	updateScenes = () => {
		// AGREGAR: Verificar que la escena existe
		if (!this.scene) {
			console.log('Scene not ready yet');
			return;
		}
		
		this.scene.draw(this.context);
		if (this.contextHandler.dimDown) return;
		if (!this.sceneStarted) {
			this.startScene(this.nextScene, this.nextSceneConfig);
		}
		this.scene.update(this.frameTime);
	};

	frame = (time) => {
		window.requestAnimationFrame(this.frame.bind(this));

		if (this.timeStarted === 0) {
			this.timeStarted = time;
		}
		time -= this.timeStarted;
		time = time * GAME_SPEED;

		this.frameTime = {
			secondsPassed: (time - this.frameTime.previous) / 1000,
			previous: time,
		};
		
		// Ya no necesitamos updateGamePads porque usamos AI
		// updateGamePads();
		
		this.contextHandler.update(this.frameTime);
		this.context.filter = `brightness(${this.contextHandler.brightness}) contrast(${this.contextHandler.contrast})`;
		this.updateScenes();
	};

	start() {
		// Ya no registramos eventos de teclado/gamepad
		// registerKeyboardEvents();
		// registerGamepadEvents();
		
		window.requestAnimationFrame(this.frame.bind(this));
	}
}

// Configuración global del servidor (puede ser sobreescrita)
window.GAME_SERVER_URL = window.location.hostname === 'localhost' 
	? 'http://localhost:3000' 
	: 'https://tu-dominio.com'; // Cambiar a tu dominio real