import {
	SCENE_WIDTH,
	STAGE_MID_POINT,
	STAGE_PADDING,
} from '../constants/Stage.js';
import {
	FighterAttackBaseData,
	FighterAttackStrength,
	FighterId,
	FighterState,
	FighterStruckDelay,
} from '../constants/fighter.js';
import { FRAME_TIME, GAME_SPEED } from '../constants/game.js';
import { Camera } from '../engine/Camera.js';
import { EntityList } from '../engine/EntityList.js';
import { Ken, Ryu } from '../entitites/fighters/index.js';
import {
	HeavyHitSplash,
	LightHitSplash,
	MediumHitSplash,
	Shadow,
} from '../entitites/fighters/shared/index.js';
import { Fireball } from '../entitites/fighters/special/Fireball.js';
// import { FpsCounter } from '../entitites/overlays/FpsCounter.js'; // comentado
import { StatusBar } from '../entitites/overlays/StatusBar.js';
import { KenStage } from '../entitites/stage/KenStage.js';
import { gameState, resetGameState } from '../states/gameState.js';
import { StartScene } from './StartScene.js';
import { FighterAI } from '../engine/FighterAI.js';
import { setAIMode, setAIController, updateAI } from '../engine/InputHandler.js';
import { BettingOverlay } from '../entitites/overlays/BettingOverlay.js';

export class BattleScene {
	image = document.getElementById('Winner');
	fighters = [];
	camera = undefined;
	shadows = [];
	FighterDrawOrder = [0, 1];
	hurtTimer = 0;
	battleEnded = false;
	winnerId = undefined;
	
	// Propiedades para sistema de apuestas y AI
	socketClient = null;
	bettingOverlay = null;
	aiControllers = [];
	battleSeed = null;
	isAIBattle = true;
	isNetworked = false;
	bettingPhase = true;
	battlePaused = true;

	constructor(changeScene, config = {}) {
		this.changeScene = changeScene;
		
		// Configuración desde el servidor
		this.socketClient = config.socketClient || null;
		this.isNetworked = !!this.socketClient;
		this.bettingPhase = config.bettingPhase || false;
		this.battleSeed = config.seed || Date.now();
		this.isAIBattle = config.isAIBattle !== false; // Default true
		
		// AGREGAR: Inicializar cámara temporalmente con valores por defecto
		this.camera = {
			position: { x: 0, y: 16 }
		};
		
		this.stage = new KenStage();
		this.entities = new EntityList();
		
		// Inicializar overlays básicos
		this.overlays = [
			new StatusBar(this.fighters, this.onTimeEnd),
			// new FpsCounter(), // comentado
		];
		
		// VERIFICAR que esto esté:
		if (this.socketClient) {
			this.bettingOverlay = new BettingOverlay(this.socketClient);
			this.overlays.push(this.bettingOverlay);
			
			// IMPORTANTE: Si venimos con bettingPhase activo, activar el overlay
			if (config.bettingPhase && config.wallets) {
				console.log('Activating betting overlay with config:', config);
				this.bettingOverlay.bettingActive = true;
				this.bettingOverlay.wallets = config.wallets;
				this.bettingOverlay.nextBattleTime = config.nextBattleTime ? 
					new Date(config.nextBattleTime) : null;
				this.bettingOverlay.generateQRCodes();
			}
			
			console.log('BettingOverlay created:', this.bettingOverlay); // Para debug
		}
		
		resetGameState();
		
		// Si estamos en fase de apuestas, no iniciar la ronda todavía
		if (this.bettingPhase) {
			this.battlePaused = true;
			// AGREGAR: Inicializar fighters vacíos para evitar errores
			this.fighters = [];
			this.setupSocketListeners();
		} else {
			this.startRound();
			if (this.isAIBattle) {
				this.initializeAI();
			}
		}
	}
	
	// Configurar listeners del socket
	setupSocketListeners() {
		if (!this.socketClient) return;
		
		// Cuando termina la fase de apuestas
		this.socketClient.on('betting-closed', (data) => {
			console.log('Betting phase ended');
			this.bettingPhase = false;
		});
		
		// Cuando empieza la batalla
		this.socketClient.on('battle-started', (data) => {
			console.log('Battle starting with seed:', data.seed);
			this.battleSeed = data.seed;
			this.battlePaused = false;  // <-- CRÍTICO: Desactivar pausa
			
			if (!this.fighters || this.fighters.length === 0) {
				this.startRound();
			}
			
			this.initializeAI();
		});
		
		// Sincronización de frames (desde servidor)
		this.socketClient.on('battle-update', (data) => {
			if (this.isNetworked && data.state) {
				this.syncBattleState(data.state);
			}
		});
		
		// Batalla terminada
		this.socketClient.on('battle-end', (data) => {
			console.log('Battle ended! Winner:', data.winner);
			// El overlay mostrará el ganador
			if (this.bettingOverlay) {
				this.bettingOverlay.winner = data.winner;
			}
			// Después de 6 segundos, volver a StartScene
			this.goToStartScene();
		});
	}
	
	// Sincronizar estado desde servidor
	syncBattleState(serverState) {
		if (!serverState.fighters) return;
		
		// Sincronizar posiciones y estados de los fighters
		serverState.fighters.forEach((fighterData, index) => {
			if (this.fighters[index]) {
				// Sincronizar solo lo esencial para evitar glitches
				this.fighters[index].position.x = fighterData.position.x;
				this.fighters[index].position.y = fighterData.position.y;
				
				// Actualizar HP desde gameState
				if (gameState.fighters[index]) {
					gameState.fighters[index].hitPoints = fighterData.hitPoints;
				}
			}
		});
		
		// Verificar ganador
		if (serverState.winner) {
			this.handleWinner(serverState.winner);
		}
	}
	
	// Manejar ganador
	handleWinner(winner) {
		if (winner === 'RYU') {
			this.winnerId = 0;
			this.fighters[0].victory = true;
			if (this.fighters[1]) {
				this.fighters[1].changeState(FighterState.KO, { previous: Date.now() });
			}
		} else {
			this.winnerId = 1;
			this.fighters[1].victory = true;
			if (this.fighters[0]) {
				this.fighters[0].changeState(FighterState.KO, { previous: Date.now() });
			}
		}
	}
	
	// Inicializar controladores AI
	initializeAI() {
		// Activar modo AI
		setAIMode(true);
		
		// Crear controladores AI con el seed del servidor
		this.aiControllers[0] = new FighterAI(
			this.fighters[0], 
			'RYU', 
			this.battleSeed
		);
		this.aiControllers[1] = new FighterAI(
			this.fighters[1], 
			'KEN', 
			this.battleSeed + 1000
		);
		
		// Registrar controladores
		setAIController(0, this.aiControllers[0]);
		setAIController(1, this.aiControllers[1]);
		
		console.log(`AI Battle initialized with seed: ${this.battleSeed}`);
	}

	getFighterClass = (id) => {
		switch (id) {
			case FighterId.KEN:
				return Ken;
			case FighterId.RYU:
				return Ryu;
			default:
				return new Error('Invalid Fighter Id');
		}
	};

	getFighterEntitiy = (id, index) => {
		const FighterClass = this.getFighterClass(id);
		return new FighterClass(index, this.handleAttackHit, this.entities);
	};

	getFighterEntities = () => {
		const fighterEntities = gameState.fighters.map(({ id }, index) => {
			const fighterEntity = this.getFighterEntitiy(id, index);
			gameState.fighters[index].instance = fighterEntity;
			return fighterEntity;
		});

		fighterEntities[0].opponent = fighterEntities[1];
		fighterEntities[1].opponent = fighterEntities[0];

		return fighterEntities;
	};

	updateFighters = (time, context) => {
		// No actualizar si la batalla está pausada
		if (this.battlePaused) return;
		
		// Actualizar AI
		if (this.isAIBattle && this.aiControllers.length > 0) {
			updateAI(time, this.fighters);
		}
		
		this.fighters.map((fighter) => {
			if (this.hurtTimer > time.previous) {
				fighter.updateHurtShake(time, this.hurtTimer);
			} else fighter.update(time, this.camera);
		});
	};

	getHitSplashClass = (strength) => {
		switch (strength) {
			case FighterAttackStrength.LIGHT:
				return LightHitSplash;
			case FighterAttackStrength.MEDIUM:
				return MediumHitSplash;
			case FighterAttackStrength.HEAVY:
				return HeavyHitSplash;
			default:
				return new Error('Invalid Strength Splash requested');
		}
	};

	handleAttackHit = (time, playerId, opponentId, position, strength) => {
		this.FighterDrawOrder = [opponentId, playerId];
		gameState.fighters[playerId].score += FighterAttackBaseData[strength].score;

		gameState.fighters[opponentId].hitPoints -=
			FighterAttackBaseData[strength].damage;

		const HitSplashClass = this.getHitSplashClass(strength);

		if (gameState.fighters[opponentId].hitPoints <= 0) {
			this.fighters[opponentId].changeState(FighterState.KO, time);
		}

		this.fighters[opponentId].direction =
			this.fighters[playerId].direction * -1;

		position &&
			this.entities.add(HitSplashClass, position.x, position.y, playerId);

		this.hurtTimer = time.previous + FighterStruckDelay * FRAME_TIME;
	};

	updateShadows = (time) => {
		this.shadows.map((shadow) => shadow.update(time));
	};

	startRound = () => {
		this.fighters = this.getFighterEntities();
		this.camera = new Camera(
			STAGE_PADDING + STAGE_MID_POINT - SCENE_WIDTH / 2,
			16,
			this.fighters
		);

		this.shadows = this.fighters.map((fighter) => new Shadow(fighter));
	};

	goToStartScene = () => {
		// Desactivar AI
		if (this.isAIBattle) {
			setAIMode(false);
		}
		
		setTimeout(() => {
			// Pasar socketClient a StartScene
			this.changeScene(StartScene, { socketClient: this.socketClient });
		}, 6000);
	};

	drawWinnerText = (context, id) => {
		context.drawImage(this.image, 0, 11 * id, 70, 9, 120, 60, 140, 30);
	};

	onTimeEnd = (time) => {
		if (gameState.fighters[0].hitPoints >= gameState.fighters[1].hitPoints) {
			this.fighters[0].victory = true;
			this.fighters[1].changeState(FighterState.KO, time);
			this.winnerId = 0;
		} else {
			this.fighters[1].victory = true;
			this.fighters[0].changeState(FighterState.KO, time);
			this.winnerId = 1;
		}
		this.goToStartScene();
	};

	updateOverlays = (time) => {
		this.overlays.map((overlay) => overlay.update(time));
	};

	updateFighterHP = (time) => {
		gameState.fighters.map((fighter, index) => {
			if (fighter.hitPoints <= 0 && !this.battleEnded) {
				this.fighters[index].opponent.victory = true;
				this.winnerId = 1 - index;
				this.battleEnded = true;
				this.goToStartScene();
			}
		});
	};

	update = (time) => {
		// No actualizar fighters si está pausado
		if (!this.battlePaused) {
			this.updateFighters(time);
			this.updateShadows(time);
			this.entities.update(time, this.camera);
			this.camera.update(time);
			this.updateFighterHP(time);
		}
		
		// Siempre actualizar stage y overlays
		this.stage.update(time);
		this.updateOverlays(time);
	};

	drawFighters(context) {
		this.FighterDrawOrder.map((id) =>
			this.fighters[id].draw(context, this.camera)
		);
	}

	drawShadows(context) {
		this.shadows.map((shadow) => shadow.draw(context, this.camera));
	}

	drawOverlays(context) {
		this.overlays.map((overlay) => {
			// StatusBar necesita camera, BettingOverlay no
			if (overlay instanceof StatusBar) {
				overlay.draw(context, this.camera);
			} else {
				overlay.draw(context);
			}
		});
		
		// Dibujar texto de ganador solo si no hay betting overlay
		if (this.winnerId !== undefined && !this.bettingOverlay) {
			this.drawWinnerText(context, this.winnerId);
		}
	}

	draw = (context) => {
		// Si estamos en fase de apuestas, fondo oscurecido
		if (this.bettingPhase) {
			// Dibujar stage pero oscurecido
			this.stage.drawBackground(context, this.camera);
			
			// Overlay oscuro
			context.fillStyle = 'rgba(0, 0, 0, 0.5)';
			context.fillRect(0, 0, 382, 224);
			
			// Dibujar fighters estáticos
			if (this.shadows) this.drawShadows(context);
			if (this.fighters.length > 0) this.drawFighters(context);
		} else {
			// Dibujo normal
			this.stage.drawBackground(context, this.camera);
			if (this.shadows) this.drawShadows(context);
			if (this.fighters.length > 0) this.drawFighters(context);
			this.entities.draw(context, this.camera);
			this.stage.drawForeground(context, this.camera);
		}
		
		// Siempre dibujar overlays
		this.drawOverlays(context);
	};
	
	// Método para obtener estado de la batalla (para sincronización)
	getBattleState() {
		return {
			seed: this.battleSeed,
			fighters: this.fighters.map(fighter => ({
				position: fighter.position,
				state: fighter.currentState,
				hitPoints: fighter.hitPoints,
				direction: fighter.direction,
				animationFrame: fighter.animationFrame
			})),
			time: this.overlays[0].time, // Timer del StatusBar
			winnerId: this.winnerId
		};
	}
	
	// Método para configurar batalla desde estado externo
	setBattleState(state) {
		// Este método será usado cuando recibamos estado del servidor
		this.battleSeed = state.seed;
		
		// Actualizar posiciones y estados de fighters
		state.fighters.forEach((fighterState, index) => {
			this.fighters[index].position = fighterState.position;
			this.fighters[index].currentState = fighterState.state;
			this.fighters[index].direction = fighterState.direction;
			this.fighters[index].animationFrame = fighterState.animationFrame;
		});
		
		// Actualizar timer
		if (this.overlays[0]) {
			this.overlays[0].time = state.time;
		}
	}
}

// EJEMPLOS DE USO:
// Para batalla local AI vs AI:
// new BattleScene(changeScene, { isAIBattle: true, seed: 12345 });

// Para batalla con sistema de apuestas (conectada al servidor):
// new BattleScene(changeScene, { 
//   socketClient: socketClient, 
//   bettingPhase: true,
//   seed: serverSeed 
// });

// Para batalla normal sin AI:
// new BattleScene(changeScene, { isAIBattle: false });