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
	serverUrl = window.GAME_SERVER_URL || 'https://streetfighterbet.ngrok.dev';

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
		// CORREGIDO: Listener para el estado inicial al conectar
		this.socketClient.on('current-state', (state) => {
			console.log('Server state received:', state);
			
			// Si hay betting phase, StartScene se encarga
			if (state.bettingPhase || state.phase === 'BETTING') {
				console.log('Betting phase active - StartScene will handle it');
				// NO cambiar de escena, StartScene ya está manejando esto
				return;
			}
			
			// Si hay batalla en progreso Y no estamos en BattleScene
			if ((state.battleInProgress || state.phase === 'BATTLE') && 
				this.scene?.constructor.name !== 'BattleScene') {
				console.log('Battle in progress, syncing to BattleScene');
				this.changeScene(BattleScene, {
					isAIBattle: true,
					seed: state.seed,
					isNetworked: true,
					battleState: state.battleState,
					bettingPhase: false,
					battlePaused: false
				});
			}
		});
		
		// Cuando conecta al servidor (actualizaciones generales)
		this.socketClient.on('state-update', (state) => {
			console.log('State update received:', state);
		});
		
		// Cuando empieza fase de apuestas
		this.socketClient.on('betting-phase-started', (data) => {
			console.log('Betting phase started!', data);
			// NO hacer nada - StartScene ya está activo y lo maneja
		});
		
		// Cuando empieza la batalla
		this.socketClient.on('battle-started', (data) => {
			console.log('Battle starting with seed:', data.seed);
			
			// Cambiar a BattleScene SOLO si no estamos ya ahí
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
		this.socketClient.on('sync-battle', (data) => {
			console.log('Syncing with ongoing battle');
			
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
		this.socketClient.on('battle-ended', (data) => {
			console.log('Battle ended, winner:', data.winner);
			
			setTimeout(() => {
				if (this.scene && this.scene.constructor.name === 'BattleScene') {
					this.changeScene(StartScene);
				}
			}, 6000);
		});
		
		// Manejo de errores de conexión
		this.socketClient.on('connect_error', (error) => {
			console.error('Connection error:', error);
		});
		
		this.socketClient.on('disconnect', (reason) => {
			console.log('Disconnected from server:', reason);
		});
		
		this.socketClient.on('reconnect', (attemptNumber) => {
			console.log('Reconnected after', attemptNumber, 'attempts');
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
window.GAME_SERVER_URL = window.location.hostname === 'https://streetfighterbet.ngrok.dev' 
	? 'http://localhost:3000' 
	: 'https://streetfighterbet.ngrok.dev'; // Cambiar a tu dominio real