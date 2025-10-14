// server/gameEngine.js
// Motor del juego determinístico en el servidor

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

// Estados simplificados del fighter
const FighterState = {
    IDLE: 'idle',
    WALKING: 'walking',
    ATTACKING: 'attacking',
    HURT: 'hurt',
    JUMPING: 'jumping',
    BLOCKING: 'blocking',
    KO: 'ko'
};

// Personalidades simplificadas
const AI_PROFILES = {
    RYU: {
        aggressiveness: 0.55,
        defensiveness: 0.45,
        specialFreq: 0.25,
        speed: 1.0
    },
    KEN: {
        aggressiveness: 0.75,
        defensiveness: 0.25,
        specialFreq: 0.35,
        speed: 1.1
    }
};

export class GameEngine {
    constructor() {
        this.reset();
    }

    reset() {
        this.fighters = [
            {
                id: 'RYU',
                position: { x: 100, y: 200 },
                hitPoints: 100,
                state: FighterState.IDLE,
                direction: 1,
                combo: 0,
                blocking: false
            },
            {
                id: 'KEN',
                position: { x: 280, y: 200 },
                hitPoints: 100,
                state: FighterState.IDLE,
                direction: -1,
                combo: 0,
                blocking: false
            }
        ];
        
        this.frameCount = 0;
        this.winner = null;
        this.random = null;
        this.aiDecisions = [null, null];
        this.lastAction = [0, 0];
    }

    initializeBattle(seed) {
        this.reset();
        this.random = new SeededRandom(seed);
        
        console.log(`Game engine initialized with seed: ${seed}`);
        
        return this.getCurrentState();
    }

    updateFrame() {
        if (this.winner) return this.getCurrentState();
        
        this.frameCount++;
        
        // Actualizar AI cada 10 frames
        if (this.frameCount % 10 === 0) {
            this.updateAIDecisions();
        }
        
        // Ejecutar acciones
        for (let i = 0; i < 2; i++) {
            this.updateFighter(i);
        }
        
        // Verificar colisiones
        this.checkCollisions();
        
        // Verificar ganador
        this.checkWinner();
        
        return this.getCurrentState();
    }

    updateAIDecisions() {
        for (let i = 0; i < 2; i++) {
            const fighter = this.fighters[i];
            const opponent = this.fighters[1 - i];
            const profile = AI_PROFILES[fighter.id];
            
            // Cooldown entre acciones
            if (this.frameCount - this.lastAction[i] < 30) continue;
            
            const distance = Math.abs(fighter.position.x - opponent.position.x);
            const rand = this.random.next();
            
            // Decidir acción basada en situación
            if (fighter.state === FighterState.HURT) {
                this.aiDecisions[i] = 'recover';
            } else if (distance < 50 && rand < profile.aggressiveness) {
                // Ataque cercano
                this.aiDecisions[i] = this.selectAttack(profile);
                this.lastAction[i] = this.frameCount;
            } else if (distance < 50 && rand < profile.defensiveness) {
                // Bloquear
                this.aiDecisions[i] = 'block';
            } else if (distance > 100) {
                // Acercarse
                this.aiDecisions[i] = 'approach';
            } else if (rand < profile.specialFreq && distance > 80) {
                // Movimiento especial
                this.aiDecisions[i] = 'special';
                this.lastAction[i] = this.frameCount;
            } else {
                // Neutral
                this.aiDecisions[i] = 'neutral';
            }
        }
    }

    selectAttack(profile) {
        const rand = this.random.next();
        if (rand < 0.4) return 'light_attack';
        if (rand < 0.7) return 'medium_attack';
        if (rand < 0.9) return 'heavy_attack';
        return 'special';
    }

    updateFighter(index) {
        const fighter = this.fighters[index];
        const opponent = this.fighters[1 - index];
        const decision = this.aiDecisions[index];
        const profile = AI_PROFILES[fighter.id];
        
        // Reset estado si necesario
        if (fighter.state === FighterState.HURT && this.frameCount % 20 === 0) {
            fighter.state = FighterState.IDLE;
        }
        
        // Ejecutar decisión
        switch (decision) {
            case 'approach':
                if (fighter.position.x < opponent.position.x) {
                    fighter.position.x += 2 * profile.speed;
                    fighter.direction = 1;
                } else {
                    fighter.position.x -= 2 * profile.speed;
                    fighter.direction = -1;
                }
                fighter.state = FighterState.WALKING;
                fighter.blocking = false;
                break;
                
            case 'light_attack':
                if (fighter.state === FighterState.IDLE) {
                    fighter.state = FighterState.ATTACKING;
                    this.executeAttack(index, 5, 0.9);
                }
                fighter.blocking = false;
                break;
                
            case 'medium_attack':
                if (fighter.state === FighterState.IDLE) {
                    fighter.state = FighterState.ATTACKING;
                    this.executeAttack(index, 8, 0.8);
                }
                fighter.blocking = false;
                break;
                
            case 'heavy_attack':
                if (fighter.state === FighterState.IDLE) {
                    fighter.state = FighterState.ATTACKING;
                    this.executeAttack(index, 12, 0.7);
                }
                fighter.blocking = false;
                break;
                
            case 'special':
                if (fighter.state === FighterState.IDLE) {
                    fighter.state = FighterState.ATTACKING;
                    this.executeAttack(index, 15, 0.6);
                    // Efectos especiales
                    fighter.combo++;
                }
                fighter.blocking = false;
                break;
                
            case 'block':
                fighter.blocking = true;
                fighter.state = FighterState.BLOCKING;
                break;
                
            case 'neutral':
                fighter.state = FighterState.IDLE;
                fighter.blocking = false;
                break;
                
            default:
                if (fighter.state !== FighterState.HURT) {
                    fighter.state = FighterState.IDLE;
                }
                break;
        }
        
        // Limitar posición
        fighter.position.x = Math.max(20, Math.min(362, fighter.position.x));
    }

    executeAttack(attackerIndex, damage, hitChance) {
        const attacker = this.fighters[attackerIndex];
        const defender = this.fighters[1 - attackerIndex];
        
        const distance = Math.abs(attacker.position.x - defender.position.x);
        
        // Verificar si el ataque conecta
        if (distance < 60) {
            const hit = this.random.next() < hitChance;
            
            if (hit) {
                if (defender.blocking) {
                    // Daño reducido si está bloqueando
                    defender.hitPoints -= Math.floor(damage * 0.3);
                } else {
                    // Daño completo
                    defender.hitPoints -= damage;
                    defender.state = FighterState.HURT;
                    
                    // Knockback
                    if (attacker.position.x < defender.position.x) {
                        defender.position.x += 10;
                    } else {
                        defender.position.x -= 10;
                    }
                    
                    // Combo
                    if (attacker.combo > 0) {
                        defender.hitPoints -= 2; // Daño extra por combo
                    }
                    attacker.combo++;
                    
                    // Reset combo si pasa mucho tiempo
                    setTimeout(() => {
                        attacker.combo = 0;
                    }, 1000);
                }
                
                defender.hitPoints = Math.max(0, defender.hitPoints);
            }
        }
        
        // Reset estado de ataque
        setTimeout(() => {
            attacker.state = FighterState.IDLE;
        }, 300);
    }

    checkCollisions() {
        const dist = Math.abs(this.fighters[0].position.x - this.fighters[1].position.x);
        
        // Empuje si están muy cerca
        if (dist < 40) {
            if (this.fighters[0].position.x < this.fighters[1].position.x) {
                this.fighters[0].position.x -= 2;
                this.fighters[1].position.x += 2;
            } else {
                this.fighters[0].position.x += 2;
                this.fighters[1].position.x -= 2;
            }
        }
    }

    checkWinner() {
        // Victoria por KO
        if (this.fighters[0].hitPoints <= 0) {
            this.winner = 'KEN';
            this.fighters[0].state = FighterState.KO;
        } else if (this.fighters[1].hitPoints <= 0) {
            this.winner = 'RYU';
            this.fighters[1].state = FighterState.KO;
        }
        
        // Victoria por tiempo (90 segundos = 5400 frames a 60fps)
        if (this.frameCount >= 5400) {
            if (this.fighters[0].hitPoints > this.fighters[1].hitPoints) {
                this.winner = 'RYU';
            } else if (this.fighters[1].hitPoints > this.fighters[0].hitPoints) {
                this.winner = 'KEN';
            } else {
                // Empate - random
                this.winner = this.random.chance(0.5) ? 'RYU' : 'KEN';
            }
        }
    }

    getCurrentState() {
        return {
            fighters: this.fighters.map(f => ({
                id: f.id,
                position: { ...f.position },
                hitPoints: f.hitPoints,
                state: f.state,
                direction: f.direction,
                blocking: f.blocking,
                combo: f.combo
            })),
            frameCount: this.frameCount,
            winner: this.winner
        };
    }

    getCurrentFrame() {
        return this.frameCount;
    }
}