// src/engine/FighterAI.js

import { Control } from '../constants/controls.js';
import { 
    FighterState, 
    FighterDirection,
    FighterAttackStrength 
} from '../constants/fighter.js';
import { SCENE_WIDTH, STAGE_MID_POINT } from '../constants/Stage.js';

// Sistema de random con seed para determinismo
class SeededRandom {
    constructor(seed) {
        this.seed = seed % 2147483647;
        if (this.seed <= 0) this.seed += 2147483646;
    }

    next() {
        this.seed = (this.seed * 16807) % 2147483647;
        return (this.seed - 1) / 2147483646;
    }

    nextInt(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }

    chance(probability) {
        return this.next() < probability;
    }
}

// Personalidades de los fighters
const AI_PERSONALITIES = {
    RYU: {
        name: 'RYU',
        aggressiveness: 0.55,        // Balanceado
        defensiveness: 0.45,          // Balanceado
        specialMoveFrequency: 0.25,   // Hadouken moderado
        comboTendency: 0.7,           // Buen timing para combos
        reactionTime: 8,              // Frames de reacción
        preferredDistance: 80,        // Distancia media
        jumpFrequency: 0.15,          // Salta poco
        blockingSkill: 0.7,           // Buen bloqueando
        counterAttackChance: 0.4,     // Contraataca moderadamente
        patternVariation: 0.6,        // Varía sus patrones
        staminaManagement: 0.8        // Buena gestión
    },
    KEN: {
        name: 'KEN',
        aggressiveness: 0.75,         // Más agresivo
        defensiveness: 0.25,          // Menos defensivo
        specialMoveFrequency: 0.35,   // Más Shoryuken
        comboTendency: 0.6,           // Buenos combos
        reactionTime: 6,              // Más rápido
        preferredDistance: 50,        // Combate cercano
        jumpFrequency: 0.25,          // Salta más
        blockingSkill: 0.5,           // Regular bloqueando
        counterAttackChance: 0.6,     // Contraataca más
        patternVariation: 0.7,        // Más impredecible
        staminaManagement: 0.6        // Gestión regular
    }
};

// Estados de comportamiento de la AI
const AIBehavior = {
    AGGRESSIVE: 'aggressive',
    DEFENSIVE: 'defensive',
    NEUTRAL: 'neutral',
    COMBO: 'combo',
    SPECIAL: 'special',
    EVASIVE: 'evasive',
    COUNTER: 'counter'
};

export class FighterAI {
    constructor(fighter, personality, seed = Date.now()) {
        this.fighter = fighter;
        this.personality = AI_PERSONALITIES[personality] || AI_PERSONALITIES.RYU;
        this.random = new SeededRandom(seed + this.fighter.playerId);
        
        // Estado interno de la AI
        this.currentBehavior = AIBehavior.NEUTRAL;
        this.behaviorTimer = 0;
        this.lastActionTime = 0;
        this.comboSequence = [];
        this.comboIndex = 0;
        this.targetDistance = this.personality.preferredDistance;
        
        // Memoria a corto plazo
        this.opponentLastState = null;
        this.opponentPatterns = [];
        this.dodgeTimer = 0;
        this.blockTimer = 0;
        
        // Control simulado
        this.simulatedControls = {
            up: false,
            down: false,
            left: false,
            right: false,
            lightPunch: false,
            mediumPunch: false,
            heavyPunch: false,
            lightKick: false,
            mediumKick: false,
            heavyKick: false
        };
        
        // Decisiones pendientes
        this.nextAction = null;
        this.actionCooldown = 0;
    }

    // Actualizar la AI cada frame
    update(time, opponent) {
        if (!opponent) return this.simulatedControls;
        
        // Reducir cooldowns
        if (this.actionCooldown > 0) {
            this.actionCooldown--;
            return this.simulatedControls;
        }
        
        // Analizar situación
        const situation = this.analyzeSituation(opponent);
        
        // Decidir comportamiento
        this.decideBehavior(situation, time);
        
        // Ejecutar comportamiento
        this.executeBehavior(situation, opponent);
        
        // Añadir variación aleatoria
        this.addRandomVariation();
        
        return this.simulatedControls;
    }

    analyzeSituation(opponent) {
        const dx = opponent.position.x - this.fighter.position.x;
        const dy = opponent.position.y - this.fighter.position.y;
        const distance = Math.abs(dx);
        const verticalDistance = Math.abs(dy);
        
        return {
            distance,
            verticalDistance,
            direction: dx > 0 ? 1 : -1,
            isClose: distance < 50,
            isMedium: distance >= 50 && distance < 100,
            isFar: distance >= 100,
            opponentAirborne: opponent.position.y < 200,
            selfAirborne: this.fighter.position.y < 200,
            opponentAttacking: this.isOpponentAttacking(opponent),
            opponentVulnerable: this.isOpponentVulnerable(opponent),
            healthAdvantage: (this.fighter.hitPoints || 100) - (opponent.hitPoints || 100),
            nearWall: this.isNearWall(),
            canCombo: this.canStartCombo(),
            shouldBlock: this.shouldBlock(opponent)
        };
    }

    decideBehavior(situation, time) {
        // Cambiar comportamiento basado en la situación
        if (this.behaviorTimer <= 0) {
            const rand = this.random.next();
            
            // Prioridades basadas en situación
            if (situation.shouldBlock && this.personality.blockingSkill > rand) {
                this.currentBehavior = AIBehavior.DEFENSIVE;
                this.behaviorTimer = this.random.nextInt(10, 30);
            } else if (situation.opponentVulnerable && this.personality.aggressiveness > rand) {
                this.currentBehavior = AIBehavior.AGGRESSIVE;
                this.behaviorTimer = this.random.nextInt(20, 40);
            } else if (situation.canCombo && this.personality.comboTendency > rand) {
                this.currentBehavior = AIBehavior.COMBO;
                this.setupCombo(situation);
                this.behaviorTimer = this.random.nextInt(30, 50);
            } else if (situation.healthAdvantage < -30 && this.personality.defensiveness > rand) {
                this.currentBehavior = AIBehavior.DEFENSIVE;
                this.behaviorTimer = this.random.nextInt(20, 40);
            } else if (this.random.chance(this.personality.specialMoveFrequency)) {
                this.currentBehavior = AIBehavior.SPECIAL;
                this.behaviorTimer = this.random.nextInt(10, 20);
            } else {
                // Comportamiento basado en personalidad
                if (this.personality.aggressiveness > this.personality.defensiveness) {
                    this.currentBehavior = this.random.chance(0.7) ? 
                        AIBehavior.AGGRESSIVE : AIBehavior.NEUTRAL;
                } else {
                    this.currentBehavior = this.random.chance(0.7) ? 
                        AIBehavior.DEFENSIVE : AIBehavior.NEUTRAL;
                }
                this.behaviorTimer = this.random.nextInt(15, 35);
            }
        } else {
            this.behaviorTimer--;
        }
    }

    executeBehavior(situation, opponent) {
        // Resetear controles
        this.resetControls();
        
        switch (this.currentBehavior) {
            case AIBehavior.AGGRESSIVE:
                this.executeAggressive(situation);
                break;
            case AIBehavior.DEFENSIVE:
                this.executeDefensive(situation);
                break;
            case AIBehavior.COMBO:
                this.executeCombo(situation);
                break;
            case AIBehavior.SPECIAL:
                this.executeSpecial(situation);
                break;
            case AIBehavior.COUNTER:
                this.executeCounter(situation);
                break;
            case AIBehavior.EVASIVE:
                this.executeEvasive(situation);
                break;
            default:
                this.executeNeutral(situation);
        }
        
        // Ajustar posición según distancia preferida
        this.adjustPosition(situation);
    }

    executeAggressive(situation) {
        if (situation.isClose) {
            // Ataque cercano
            const attackRoll = this.random.next();
            if (attackRoll < 0.3) {
                this.simulatedControls.lightPunch = true;
            } else if (attackRoll < 0.5) {
                this.simulatedControls.mediumPunch = true;
            } else if (attackRoll < 0.7) {
                this.simulatedControls.lightKick = true;
            } else if (attackRoll < 0.85) {
                this.simulatedControls.mediumKick = true;
            } else {
                // Heavy attack
                if (this.random.chance(0.5)) {
                    this.simulatedControls.heavyPunch = true;
                } else {
                    this.simulatedControls.heavyKick = true;
                }
            }
            this.actionCooldown = this.personality.reactionTime;
        } else {
            // Acercarse
            if (situation.direction > 0) {
                this.simulatedControls.right = true;
            } else {
                this.simulatedControls.left = true;
            }
            
            // Saltar ocasionalmente
            if (this.random.chance(this.personality.jumpFrequency)) {
                this.simulatedControls.up = true;
            }
        }
    }

    executeDefensive(situation) {
        if (situation.opponentAttacking && situation.isClose) {
            // Bloquear
            if (situation.direction > 0) {
                this.simulatedControls.left = true;
            } else {
                this.simulatedControls.right = true;
            }
            
            // Agacharse para bloquear bajos
            if (this.random.chance(0.3)) {
                this.simulatedControls.down = true;
            }
        } else {
            // Mantener distancia
            if (situation.isClose) {
                // Alejarse
                if (situation.direction > 0) {
                    this.simulatedControls.left = true;
                } else {
                    this.simulatedControls.right = true;
                }
                
                // Salto hacia atrás ocasional
                if (this.random.chance(0.2)) {
                    this.simulatedControls.up = true;
                }
            }
        }
        
        // Contraataque ocasional
        if (situation.opponentVulnerable && this.random.chance(this.personality.counterAttackChance)) {
            this.currentBehavior = AIBehavior.COUNTER;
        }
    }

    executeNeutral(situation) {
        // Comportamiento equilibrado
        if (situation.distance > this.targetDistance + 20) {
            // Acercarse
            if (situation.direction > 0) {
                this.simulatedControls.right = true;
            } else {
                this.simulatedControls.left = true;
            }
        } else if (situation.distance < this.targetDistance - 20) {
            // Alejarse
            if (situation.direction > 0) {
                this.simulatedControls.left = true;
            } else {
                this.simulatedControls.right = true;
            }
        } else {
            // Distancia óptima - atacar ocasionalmente
            if (this.random.chance(0.3)) {
                const attacks = ['lightPunch', 'lightKick', 'mediumPunch', 'mediumKick'];
                const chosenAttack = attacks[this.random.nextInt(0, attacks.length - 1)];
                this.simulatedControls[chosenAttack] = true;
                this.actionCooldown = this.personality.reactionTime;
            }
        }
    }

    executeCombo(situation) {
        if (!this.comboSequence.length) {
            this.setupCombo(situation);
        }
        
        if (this.comboIndex < this.comboSequence.length) {
            const action = this.comboSequence[this.comboIndex];
            
            // Ejecutar acción del combo
            if (action.control) {
                this.simulatedControls[action.control] = true;
            }
            if (action.direction) {
                this.simulatedControls[action.direction] = true;
            }
            
            this.comboIndex++;
            this.actionCooldown = action.delay || 3;
        } else {
            // Combo terminado
            this.comboSequence = [];
            this.comboIndex = 0;
            this.currentBehavior = AIBehavior.NEUTRAL;
        }
    }

    executeSpecial(situation) {
        // Hadouken/Shoryuken simulado
        if (this.personality.name === 'RYU') {
            // Hadouken
            if (situation.isMedium || situation.isFar) {
                // Secuencia: ↓ ↘ → + Punch
                this.simulatedControls.down = true;
                setTimeout(() => {
                    this.simulatedControls.down = false;
                    this.simulatedControls.right = true;
                    this.simulatedControls.mediumPunch = true;
                }, 100);
            }
        } else if (this.personality.name === 'KEN') {
            // Shoryuken
            if (situation.isClose) {
                // Secuencia: → ↓ ↘ + Punch  
                this.simulatedControls.right = true;
                setTimeout(() => {
                    this.simulatedControls.right = false;
                    this.simulatedControls.down = true;
                    this.simulatedControls.heavyPunch = true;
                }, 100);
            }
        }
        
        this.actionCooldown = 20;
        this.currentBehavior = AIBehavior.NEUTRAL;
    }

    executeCounter(situation) {
        if (situation.opponentVulnerable && situation.isClose) {
            // Contraataque rápido
            if (this.random.chance(0.6)) {
                this.simulatedControls.mediumPunch = true;
            } else {
                this.simulatedControls.mediumKick = true;
            }
            this.actionCooldown = this.personality.reactionTime / 2;
        }
        this.currentBehavior = AIBehavior.NEUTRAL;
    }

    executeEvasive(situation) {
        // Esquivar
        if (situation.opponentAttacking) {
            if (this.random.chance(0.5)) {
                // Salto hacia atrás
                this.simulatedControls.up = true;
                if (situation.direction > 0) {
                    this.simulatedControls.left = true;
                } else {
                    this.simulatedControls.right = true;
                }
            } else {
                // Dash hacia atrás
                if (situation.direction > 0) {
                    this.simulatedControls.left = true;
                } else {
                    this.simulatedControls.right = true;
                }
            }
        }
        this.actionCooldown = 10;
    }

    setupCombo(situation) {
        const combos = [
            // Combo básico 1: Light Punch -> Medium Punch -> Heavy Kick
            [
                { control: 'lightPunch', delay: 4 },
                { control: 'mediumPunch', delay: 5 },
                { control: 'heavyKick', delay: 6 }
            ],
            // Combo básico 2: Light Kick -> Medium Kick  
            [
                { control: 'lightKick', delay: 4 },
                { control: 'mediumKick', delay: 5 }
            ],
            // Combo con movimiento: Jump -> Heavy Kick
            [
                { control: 'up', direction: situation.direction > 0 ? 'right' : 'left', delay: 8 },
                { control: 'heavyKick', delay: 4 }
            ],
            // Combo agresivo: Medium Punch -> Heavy Punch
            [
                { control: 'mediumPunch', delay: 5 },
                { control: 'heavyPunch', delay: 6 }
            ]
        ];
        
        this.comboSequence = combos[this.random.nextInt(0, combos.length - 1)];
        this.comboIndex = 0;
    }

    adjustPosition(situation) {
        // Ajuste fino de posición basado en personalidad
        const targetDist = this.personality.preferredDistance + 
            this.random.nextInt(-20, 20) * this.personality.patternVariation;
        
        if (Math.abs(situation.distance - targetDist) > 30) {
            if (situation.distance > targetDist) {
                if (situation.direction > 0) {
                    this.simulatedControls.right = true;
                } else {
                    this.simulatedControls.left = true;
                }
            } else {
                if (situation.direction > 0) {
                    this.simulatedControls.left = true;
                } else {
                    this.simulatedControls.right = true;
                }
            }
        }
    }

    addRandomVariation() {
        // Añadir variación aleatoria para que no sea predecible
        if (this.random.chance(0.05 * this.personality.patternVariation)) {
            // Acción aleatoria ocasional
            const randomActions = Object.keys(this.simulatedControls);
            const randomAction = randomActions[this.random.nextInt(0, randomActions.length - 1)];
            this.simulatedControls[randomAction] = this.random.chance(0.5);
        }
        
        // Cambio de target distance ocasional
        if (this.random.chance(0.02)) {
            this.targetDistance = this.personality.preferredDistance + 
                this.random.nextInt(-30, 30);
        }
    }

    isOpponentAttacking(opponent) {
        const attackStates = [
            FighterState.LIGHT_PUNCH, FighterState.MEDIUM_PUNCH, FighterState.HEAVY_PUNCH,
            FighterState.LIGHT_KICK, FighterState.MEDIUM_KICK, FighterState.HEAVY_KICK
        ];
        return attackStates.includes(opponent.currentState);
    }

    isOpponentVulnerable(opponent) {
        const vulnerableStates = [
            FighterState.HURT_HEAD_LIGHT, FighterState.HURT_HEAD_MEDIUM, FighterState.HURT_HEAD_HEAVY,
            FighterState.HURT_BODY_LIGHT, FighterState.HURT_BODY_MEDIUM, FighterState.HURT_BODY_HEAVY,
            FighterState.JUMP_LAND
        ];
        return vulnerableStates.includes(opponent.currentState);
    }

    shouldBlock(opponent) {
        return this.isOpponentAttacking(opponent) && 
               Math.abs(opponent.position.x - this.fighter.position.x) < 60;
    }

    canStartCombo() {
        return this.fighter.currentState === FighterState.IDLE ||
               this.fighter.currentState === FighterState.WALK_FORWARD;
    }

    isNearWall() {
        return this.fighter.position.x < 50 || 
               this.fighter.position.x > SCENE_WIDTH - 50;
    }

    resetControls() {
        Object.keys(this.simulatedControls).forEach(key => {
            this.simulatedControls[key] = false;
        });
    }

    // Obtener los controles simulados para el InputHandler
    getControls() {
        return this.simulatedControls;
    }

    // Resetear la AI (para nueva ronda)
    reset(seed) {
        this.random = new SeededRandom(seed + this.fighter.playerId);
        this.currentBehavior = AIBehavior.NEUTRAL;
        this.behaviorTimer = 0;
        this.comboSequence = [];
        this.comboIndex = 0;
        this.actionCooldown = 0;
        this.resetControls();
    }
}