// src/scenes/BattleScene.js - VERSION SINCRONIZADA
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
import { ResultsScene } from './ResultsScene.js';
import {
	HeavyHitSplash,
	LightHitSplash,
	MediumHitSplash,
	Shadow,
} from '../entitites/fighters/shared/index.js';
import { StatusBar } from '../entitites/overlays/StatusBar.js';
import { KenStage } from '../entitites/stage/KenStage.js';
import { gameState, resetGameState } from '../states/gameState.js';
import { StartScene } from './StartScene.js';
import { FighterAI } from '../engine/FighterAI.js';
import { setAIMode, setAIController, updateAI } from '../engine/InputHandler.js';

export class BattleScene {
	image = document.getElementById('Winner');
	fighters = [];
	camera = undefined;
	shadows = [];
	FighterDrawOrder = [0, 1];
	hurtTimer = 0;
	battleEnded = false;
	winnerId = undefined;
	
	// Sistema de AI y networking
	socketClient = null;
	aiControllers = [];
	battleSeed = null;
	isAIBattle = true;
	isNetworked = false;
	bettingPhase = false;
	battlePaused = true;
	battleStarted = false;

	constructor(changeScene, config = {}) {
		this.changeScene = changeScene;
		
		// Configuración desde el servidor
		this.socketClient = config.socketClient || null;
		this.isNetworked = !!this.socketClient;
		this.bettingPhase = config.bettingPhase || false;
		this.battleSeed = config.seed || Date.now();
		this.isAIBattle = config.isAIBattle !== false;
		this.battlePaused = config.battlePaused !== false;
		
		console.log('BattleScene initialized with config:', {
			bettingPhase: this.bettingPhase,
			battlePaused: this.battlePaused,
			seed: this.battleSeed,
			hasSocket: !!this.socketClient
		});
		
		// Inicializar camera temporalmente
		this.camera = {
			position: { x: 0, y: 16 }
		};
		
		this.stage = new KenStage();
		this.entities = new EntityList();
		
		// Inicializar overlays básicos
		this.overlays = [
			new StatusBar(this.fighters, this.onTimeEnd),
		];
		
		// YA NO USAR BETTING OVERLAY - StartScene maneja las apuestas
		// this.bettingOverlay = null;
		
		resetGameState();
		
		// Si estamos en fase de apuestas, NO iniciar ronda todavía
		if (this.bettingPhase) {
			this.battlePaused = true;
			this.fighters = [];
			console.log('Waiting for betting phase to end...');
		} else {
			// IMPORTANTE: Iniciar batalla inmediatamente
			console.log('Battle mode - starting round now');
			this.battlePaused = false;
			this.battleStarted = true; // AGREGAR ESTA LÍNEA
			this.startRound();
			
			// Pequeño delay para asegurar que fighters estén listos
			setTimeout(() => {
				if (this.isAIBattle && this.fighters.length === 2) {
					console.log('Initializing AI for fighters');
					this.initializeAI();
				}
			}, 100);
		}
		
		// Setup socket listeners
		if (this.socketClient) {
			this.setupSocketListeners();
		}
	}
	
	// ========== SOCKET LISTENERS ==========
	
	setupSocketListeners() {
		if (!this.socketClient) return;
		
		console.log('Setting up BattleScene socket listeners...');
		
		// NOTA: Esta implementación usa IA LOCAL en cada cliente.
		// Los listeners de 'battle-frame' y 'sync-battle' están desactivados
		// para evitar conflictos entre la IA del servidor y la IA local.
		// Cada cliente simula la batalla de forma independiente usando el mismo seed.
		//
		// FLUJO DE BATALLA:
		// 1. Servidor envía 'battle-started' con seed
		// 2. Cada cliente simula batalla completa con ese seed
		// 3. Cliente detecta ganador localmente (HP=0 o timeout)
		// 4. Cliente envía 'battle-result' al servidor
		// 5. Cliente solicita 'get-results' y muestra ResultsScene
		// 6. Servidor procesa pagos y opcionalmente envía 'battle-ended'
		
		// Apuestas cerradas (no hacer nada, StartScene lo maneja)
		this.socketClient.on('betting-closed', (data) => {
			console.log('BattleScene: Betting closed');
			this.bettingPhase = false;
		});
		
		// Batalla iniciada
		this.socketClient.on('battle-started', (data) => {
			console.log('BattleScene: Battle starting with seed:', data.seed);
			
			this.battleSeed = data.seed;
			this.bettingPhase = false;
			this.battlePaused = false;
			this.battleStarted = true;
			
			// Iniciar ronda si no hay fighters
			if (!this.fighters || this.fighters.length === 0) {
				console.log('Starting round...');
				this.startRound();
			}
			
			// Inicializar AI
			if (!this.aiControllers || this.aiControllers.length === 0) {
				console.log('Initializing AI...');
				this.initializeAI();
			}
		});
		
		// Frame updates del servidor
		this.socketClient.on('battle-frame', (data) => {
			// DESACTIVADO: No sincronizar cuando hay IA local
			// La IA local controla completamente la batalla
			return;
			
			/* CÓDIGO VIEJO COMENTADO - Causaba conflicto con IA local
			if (!this.battleStarted) return;
			
			if (data.state && data.state.fighters && this.fighters.length > 0) {
				// Sincronizar posiciones desde el servidor
				data.state.fighters.forEach((fighterData, index) => {
					if (this.fighters[index]) {
						// Actualizar posición con interpolación suave
						const targetX = fighterData.position.x;
						const currentX = this.fighters[index].position.x;
						const diff = targetX - currentX;
						
						// Solo sincronizar si hay diferencia significativa (> 5px)
						if (Math.abs(diff) > 5) {
							this.fighters[index].position.x += diff * 0.3; // Interpolación
						}
						
						// Actualizar HP
						if (gameState.fighters[index]) {
							gameState.fighters[index].hitPoints = fighterData.hitPoints;
						}
						
						// Actualizar estado si cambió
						if (fighterData.state !== this.fighters[index].currentState) {
							// Solo actualizar estados importantes (KO, HURT)
							if (fighterData.state === FighterState.KO || 
								fighterData.state.includes('HURT')) {
								this.fighters[index].changeState(fighterData.state);
							}
						}
					}
				});
			}
			*/
		});
		
		// Sincronización para late joiners
		this.socketClient.on('sync-battle', (data) => {
			// DESACTIVADO: Cada cliente corre su propia IA local
			return;
			
			/* CÓDIGO VIEJO COMENTADO - No necesario con IA local
			console.log('BattleScene: Syncing with ongoing battle');
			
			this.battleSeed = data.seed;
			this.bettingPhase = false;
			this.battlePaused = false;
			this.battleStarted = true;
			
			if (!this.fighters || this.fighters.length === 0) {
				this.startRound();
			}
			
			if (!this.aiControllers || this.aiControllers.length === 0) {
				this.initializeAI();
			}
			
			// Sincronizar estado
			if (data.state) {
				this.syncBattleState(data.state);
			}
			*/
		});
		
		// Batalla terminada (del servidor)
		this.socketClient.on('battle-ended', (data) => {
			console.log('BattleScene: Server confirmed battle ended! Winner:', data.winner);
			
			this.battleStarted = false;
			
			// Solo actualizar UI si no lo hemos hecho ya localmente
			if (!this.battleEnded) {
				this.handleWinner(data.winner);
			}
		});
	}
	
	// ========== SINCRONIZACION ==========
	
	// NOTA: Este método no se usa actualmente porque cada cliente
	// corre su propia IA local en lugar de sincronizar con el servidor
	syncBattleState(serverState) {
		if (!serverState.fighters || this.fighters.length === 0) return;
		
		serverState.fighters.forEach((fighterData, index) => {
			if (this.fighters[index]) {
				this.fighters[index].position.x = fighterData.position.x;
				this.fighters[index].position.y = fighterData.position.y;
				
				if (gameState.fighters[index]) {
					gameState.fighters[index].hitPoints = fighterData.hitPoints;
				}
			}
		});
		
		if (serverState.winner) {
			this.handleWinner(serverState.winner);
		}
	}
	
	handleWinner(winner) {
    this.battleEnded = true;
    
    if (winner === 'RYU') {
        this.winnerId = 0;
        if (this.fighters[0]) this.fighters[0].victory = true;
        if (this.fighters[1]) this.fighters[1].changeState(FighterState.KO, { previous: Date.now() });
    } else {
        this.winnerId = 1;
        if (this.fighters[1]) this.fighters[1].victory = true;
        if (this.fighters[0]) this.fighters[0].changeState(FighterState.KO, { previous: Date.now() });
    }
    
    // Esperar 3 segundos y luego mostrar resultados
    setTimeout(() => {
        if (this.socketClient) {
            // Crear listener temporal
            const resultsHandler = (data) => {
                // Remover listener después de recibir
                this.socketClient.off('results-data', resultsHandler);
                this.goToResultsScene(winner, data);
            };
            
            // Registrar listener
            this.socketClient.on('results-data', resultsHandler);
            
            // Pedir resultados
            this.socketClient.emit('get-results', { winner });
            
            // Timeout por si el servidor no responde
            setTimeout(() => {
                this.socketClient.off('results-data', resultsHandler);
                this.goToResultsScene(winner, { winningBets: [], totalPayout: 0 });
            }, 2000);
        } else {
            this.goToResultsScene(winner, { winningBets: [], totalPayout: 0 });
        }
    }, 3000);
}
	
	goToResultsScene = (winner, resultsData) => {
		if (this.isAIBattle) {
			setAIMode(false);
		}
		
		this.changeScene(ResultsScene, {
			socketClient: this.socketClient,
			winner: winner,
			winningBets: resultsData.winningBets || [],
			totalPayout: resultsData.totalPayout || 0
		});
	};
	
	// ========== AI ==========
	
	initializeAI() {
		if (!this.fighters || this.fighters.length < 2) {
			console.error('Cannot initialize AI: fighters not ready');
			return;
		}
		
		setAIMode(true);
		
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
		
		setAIController(0, this.aiControllers[0]);
		setAIController(1, this.aiControllers[1]);
		
		console.log(`AI Battle initialized with seed: ${this.battleSeed}`);
	}

	// ========== FIGHTERS ==========

	getFighterClass = (id) => {
		switch (id) {
			case FighterId.KEN:
				return Ken;
			case FighterId.RYU:
				return Ryu;
			default:
				throw new Error('Invalid Fighter Id');
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
		if (this.battlePaused || !this.battleStarted) return;
		
		// Actualizar AI
		if (this.isAIBattle && this.aiControllers.length > 0) {
			updateAI(time, this.fighters);
		}
		
		this.fighters.forEach((fighter) => {
			if (this.hurtTimer > time.previous) {
				fighter.updateHurtShake(time, this.hurtTimer);
			} else {
				fighter.update(time, this.camera);
			}
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
				throw new Error('Invalid Strength Splash requested');
		}
	};

	handleAttackHit = (time, playerId, opponentId, position, strength) => {
		this.FighterDrawOrder = [opponentId, playerId];
		gameState.fighters[playerId].score += FighterAttackBaseData[strength].score;
		gameState.fighters[opponentId].hitPoints -= FighterAttackBaseData[strength].damage;

		const HitSplashClass = this.getHitSplashClass(strength);

		if (gameState.fighters[opponentId].hitPoints <= 0) {
			this.fighters[opponentId].changeState(FighterState.KO, time);
		}

		this.fighters[opponentId].direction = this.fighters[playerId].direction * -1;

		if (position) {
			this.entities.add(HitSplashClass, position.x, position.y, playerId);
		}

		this.hurtTimer = time.previous + FighterStruckDelay * FRAME_TIME;
	};

	updateShadows = (time) => {
		if (this.shadows.length > 0) {
			this.shadows.forEach((shadow) => shadow.update(time));
		}
	};

	startRound = () => {
		console.log('Starting round...');
		
		this.fighters = this.getFighterEntities();
		this.camera = new Camera(
			STAGE_PADDING + STAGE_MID_POINT - SCENE_WIDTH / 2,
			16,
			this.fighters
		);

		this.shadows = this.fighters.map((fighter) => new Shadow(fighter));
		
		console.log('Round started with', this.fighters.length, 'fighters');
	};

	goToStartScene = () => {
		if (this.isAIBattle) {
			setAIMode(false);
		}
		
		// Limpiar listeners específicos de BattleScene
		if (this.socketClient) {
			// No desconectar el socket, solo limpiar callbacks locales si es necesario
		}
		
		this.changeScene(StartScene, { socketClient: this.socketClient });
	};

	drawWinnerText = (context, id) => {
		context.drawImage(this.image, 0, 11 * id, 70, 9, 120, 60, 140, 30);
	};

	onTimeEnd = (time) => {
		// VALIDAR que los fighters existen
		if (!this.fighters || this.fighters.length < 2) {
			console.warn('onTimeEnd called but fighters not ready');
			return;
		}
		
		// VALIDAR que la batalla está activa
		if (this.battlePaused || !this.battleStarted) {
			console.warn('onTimeEnd called but battle not active');
			return;
		}
		
		if (this.battleEnded) return; // Ya terminó
		
		let winner;
		if (gameState.fighters[0].hitPoints >= gameState.fighters[1].hitPoints) {
			winner = 'RYU';
		} else {
			winner = 'KEN';
		}
		
		console.log('Battle ended by timeout, winner:', winner);
		
		// Notificar al servidor
		if (this.socketClient) {
			this.socketClient.emit('battle-result', {
				winner: winner,
				seed: this.battleSeed
			});
		}
		
		// Manejar ganador (esto también mostrará ResultsScene)
		this.handleWinner(winner);
	};

	updateOverlays = (time) => {
		this.overlays.forEach((overlay) => overlay.update(time));
	};

	updateFighterHP = (time) => {
		if (this.battleEnded) return;
		
		gameState.fighters.forEach((fighter, index) => {
			if (fighter.hitPoints <= 0 && !this.battleEnded) {
				if (this.fighters[index] && this.fighters[index].opponent) {
					this.fighters[index].opponent.victory = true;
				}
				
				// NUEVO: Determinar ganador y notificar
				const winner = (1 - index) === 0 ? 'RYU' : 'KEN';
				console.log('Local battle ended by KO, winner:', winner);
				
				if (this.socketClient) {
					this.socketClient.emit('battle-result', {
						winner: winner,
						seed: this.battleSeed
					});
				}
				
				// Manejar ganador (esto también mostrará ResultsScene)
				this.handleWinner(winner);
			}
		});
	};

	// ========== UPDATE & DRAW ==========

	update = (time) => {
		// Siempre actualizar stage y overlays
		this.stage.update(time);
		this.updateOverlays(time);
		
		// Solo actualizar fighters si la batalla está activa
		if (!this.battlePaused && this.battleStarted) {
			this.updateFighters(time);
			this.updateShadows(time);
			this.entities.update(time, this.camera);
			if (this.camera && this.camera.update) {
				this.camera.update(time);
			}
			this.updateFighterHP(time);
		}
	};

	drawFighters(context) {
		if (this.fighters.length > 0) {
			this.FighterDrawOrder.forEach((id) => {
				if (this.fighters[id]) {
					this.fighters[id].draw(context, this.camera);
				}
			});
		}
	}

	drawShadows(context) {
		if (this.shadows.length > 0) {
			this.shadows.forEach((shadow) => shadow.draw(context, this.camera));
		}
	}

	drawOverlays(context) {
		this.overlays.forEach((overlay) => {
			if (overlay instanceof StatusBar) {
				overlay.draw(context, this.camera);
			} else {
				overlay.draw(context);
			}
		});
		
		// Dibujar texto de ganador
		if (this.winnerId !== undefined) {
			this.drawWinnerText(context, this.winnerId);
		}
	}

	draw = (context) => {
		// Dibujar stage
		this.stage.drawBackground(context, this.camera);
		
		// Dibujo normal de batalla
		this.drawShadows(context);
		this.drawFighters(context);
		this.entities.draw(context, this.camera);
		this.stage.drawForeground(context, this.camera);
		
		// Dibujar overlays
		this.drawOverlays(context);
	};
}