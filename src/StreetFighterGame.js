// src/StreetFighterGame.js - VERSIÓN CON DIBUJO GARANTIZADO
import { BattleScene } from './scenes/BattleScene.js';
import { GAME_SPEED } from './constants/game.js';
import { StartScene } from './scenes/StartScene.js';
import { ContextHandler } from './engine/ContextHandler.js';
import { SocketClient } from './network/SocketClient.js';

export class StreetFighterGame {
	context = null;
	canvas = null;
	frameTime = { secondsPassed: 0, previous: 0 };
	timeStarted = 0;
	sceneStarted = false;
	nextScene = undefined;
	nextSceneConfig = {};
	contextHandler = null;
	socketClient = null;
	serverUrl = window.GAME_SERVER_URL || 'http://localhost:3000';
	frameCount = 0;

	constructor() {
		console.log('🎮 StreetFighterGame initializing...');
		
		// Obtener canvas
		this.canvas = document.getElementById('game-canvas') || document.querySelector('canvas');
		
		if (!this.canvas) {
			console.error('❌ CRITICAL: Canvas not found!');
			this.createEmergencyCanvas();
		}
		
		console.log('✅ Canvas found:', this.canvas);
		console.log('Canvas dimensions:', this.canvas.width, 'x', this.canvas.height);
		
		// Obtener context
		this.context = this.canvas.getContext('2d');
		this.context.imageSmoothingEnabled = false;
		
		// Test inicial - dibujar algo para confirmar que funciona
		this.context.fillStyle = 'green';
		this.context.fillRect(0, 0, 50, 50);
		console.log('✅ Test draw successful (green square)');
		
		// Limpiar después de test
		setTimeout(() => {
			this.context.fillStyle = 'black';
			this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
		}, 1000);
		
		// Inicializar ContextHandler
		this.contextHandler = new ContextHandler(this.context);
		
		// Inicializar Socket
		this.initializeSocket();
		
		// Iniciar con StartScene
		this.startScene(StartScene, { socketClient: this.socketClient });
		
		// Hacer global
		window.game = this;
		window.socketClient = this.socketClient;
		
		console.log('✅ Game initialized completely');
	}
	
	createEmergencyCanvas() {
		console.warn('⚠️ Creating emergency canvas...');
		this.canvas = document.createElement('canvas');
		this.canvas.id = 'game-canvas';
		this.canvas.width = 382;
		this.canvas.height = 224;
		this.canvas.style.cssText = 'width: 100%; height: auto; display: block;';
		document.body.appendChild(this.canvas);
	}
	
	initializeSocket() {
		console.log('Initializing Socket.io:', this.serverUrl);
		this.socketClient = new SocketClient();
		this.socketClient.connect(this.serverUrl);
		this.setupSocketListeners();
	}
	
	setupSocketListeners() {
		this.socketClient.on('current-state', (state) => {
			console.log('📊 Current state received:', state);
			
			if (state.bettingPhase || state.phase === 'BETTING') {
				console.log('Betting phase active');
				return;
			}
			
			if ((state.battleInProgress || state.phase === 'BATTLE') && 
				this.scene?.constructor.name !== 'BattleScene') {
				console.log('Battle in progress, transitioning...');
				this.changeScene(BattleScene, {
					isAIBattle: true,
					seed: state.seed,
					isNetworked: true,
					bettingPhase: false,
					battlePaused: false
				});
			}
		});
		
		this.socketClient.on('battle-started', (data) => {
			console.log('🎮 Battle starting! Seed:', data.seed);
			
			if (this.scene?.constructor.name !== 'BattleScene') {
				this.changeScene(BattleScene, {
					isAIBattle: true,
					seed: data.seed,
					isNetworked: true,
					bettingPhase: false,
					battlePaused: false
				});
			}
		});
	}
	
	changeScene = (SceneClass, config = {}) => {
		console.log('🔄 Changing scene to:', SceneClass.name);
		this.contextHandler.startDimDown();
		this.sceneStarted = false;
		this.nextScene = SceneClass;
		this.nextSceneConfig = config;
	};

	startScene = (SceneClass, config = {}) => {
		console.log('🎬 Starting scene:', SceneClass.name);
		this.contextHandler.startGlowUp();
		
		const sceneConfig = {
			...config,
			socketClient: this.socketClient
		};
		
		this.scene = new SceneClass(this.changeScene, sceneConfig);
		this.sceneStarted = true;
		
		console.log('✅ Scene started:', this.scene.constructor.name);
	};

	updateScenes = () => {
		if (!this.scene) {
			console.warn('No scene to update');
			return;
		}
		
		// CRÍTICO: Asegurar que context existe
		if (!this.context || !this.context.canvas) {
			console.error('❌ Context lost!');
			return;
		}
		
		try {
			// Dibujar escena
			this.scene.draw(this.context);
			
			// Log cada 60 frames (1 segundo)
			if (this.frameCount % 60 === 0) {
				console.log('🎮 Frame', this.frameCount, 'Scene:', this.scene.constructor.name);
			}
			
			// Context handler
			if (this.contextHandler.dimDown) return;
			
			// Cambio de escena
			if (!this.sceneStarted) {
				this.startScene(this.nextScene, this.nextSceneConfig);
			}
			
			// Actualizar escena
			this.scene.update(this.frameTime);
			
		} catch (error) {
			console.error('❌ Error in updateScenes:', error);
		}
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
		
		this.frameCount++;
		
		this.contextHandler.update(this.frameTime);
		this.context.filter = `brightness(${this.contextHandler.brightness}) contrast(${this.contextHandler.contrast})`;
		this.updateScenes();
	};

	start() {
		console.log('🚀 Starting game loop...');
		window.requestAnimationFrame(this.frame.bind(this));
	}
}