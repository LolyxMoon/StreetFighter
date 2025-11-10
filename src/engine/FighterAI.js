// src/engine/FighterAI.js - VERSION CON ATAQUES QUE DURAN VARIOS FRAMES
import { FighterState } from '../constants/fighter.js';
import { STAGE_PADDING, STAGE_WIDTH, STAGE_MID_POINT } from '../constants/Stage.js';

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

// Límites REALES del escenario
const STAGE_LEFT = STAGE_PADDING + 60;
const STAGE_RIGHT = STAGE_PADDING + STAGE_WIDTH - 60;
const STAGE_CENTER = STAGE_PADDING + STAGE_MID_POINT;

export class FighterAI {
    constructor(fighter, personality, seed = Date.now()) {
        this.fighter = fighter;
        this.random = new SeededRandom(seed + this.fighter.playerId);
        
        // Timers
        this.decisionTimer = 0;      // Cuándo tomar nueva decisión
        this.actionDuration = 0;     // Cuánto dura la acción actual
        this.attackCooldown = 0;     // Cooldown entre ataques
        
        // Estado actual
        this.currentAction = 'idle';
        this.currentAttack = null;   // Guardar qué ataque hacer
        
        this.controls = {
            up: false, down: false, left: false, right: false,
            lightPunch: false, mediumPunch: false, heavyPunch: false,
            lightKick: false, mediumKick: false, heavyKick: false
        };
    }

    update(time, opponent) {
        if (!opponent) return this.controls;
        
        this.resetControls();
        
        // Decrementar timers
        if (this.decisionTimer > 0) this.decisionTimer--;
        if (this.actionDuration > 0) this.actionDuration--;
        if (this.attackCooldown > 0) this.attackCooldown--;
        
        const myX = this.fighter.position.x;
        const distance = Math.abs(opponent.position.x - myX);
        
        // PRIORIDAD: Evitar bordes
        if (myX < STAGE_LEFT + 20) {
            this.controls.right = true;
            this.decisionTimer = 10;
            return this.controls;
        }
        if (myX > STAGE_RIGHT - 20) {
            this.controls.left = true;
            this.decisionTimer = 10;
            return this.controls;
        }
        
        // Si hay acción activa, ejecutarla
        if (this.actionDuration > 0) {
            this.executeCurrentAction(opponent);
            return this.controls;
        }
        
        // Si aún está pensando, no hacer nada
        if (this.decisionTimer > 0) {
            return this.controls;
        }
        
        // Tomar nueva decisión
        this.makeDecision(distance, opponent);
        
        return this.controls;
    }

    makeDecision(distance, opponent) {
        const roll = this.random.next();
        
        // MUY CERCA (< 80px) - RANGO DE ATAQUE
        if (distance < 80) {
            if (this.attackCooldown === 0 && roll < 0.75) {
                // ATACAR - mantener presionado 3-5 frames
                this.currentAction = 'attack';
                this.selectAttack(); // Elegir qué ataque hacer
                this.actionDuration = this.random.nextInt(3, 5); // CRÍTICO: más frames
                this.attackCooldown = this.random.nextInt(30, 50);
                this.decisionTimer = this.random.nextInt(15, 30);
            } else {
                // RETROCEDER
                this.currentAction = 'retreat';
                this.actionDuration = this.random.nextInt(5, 10);
                this.decisionTimer = this.random.nextInt(20, 35);
            }
        }
        // DISTANCIA MEDIA (80-120px)
        else if (distance < 120) {
            if (roll < 0.60) {
                // AVANZAR
                this.currentAction = 'advance';
                this.actionDuration = this.random.nextInt(8, 15);
                this.decisionTimer = this.random.nextInt(15, 30);
            } else if (this.attackCooldown === 0 && roll < 0.85) {
                // ATACAR desde media distancia
                this.currentAction = 'attack';
                this.selectAttack();
                this.actionDuration = this.random.nextInt(3, 5);
                this.attackCooldown = this.random.nextInt(35, 60);
                this.decisionTimer = this.random.nextInt(20, 40);
            } else {
                // ESPERAR
                this.currentAction = 'idle';
                this.actionDuration = 0;
                this.decisionTimer = this.random.nextInt(25, 45);
            }
        }
        // LEJOS (> 120px)
        else {
            // AVANZAR
            this.currentAction = 'advance';
            this.actionDuration = this.random.nextInt(10, 20);
            this.decisionTimer = this.random.nextInt(20, 40);
        }
    }

    executeCurrentAction(opponent) {
        switch (this.currentAction) {
            case 'advance':
                this.moveTowards(opponent);
                break;
            case 'retreat':
                this.moveAway(opponent);
                break;
            case 'attack':
                // Mantener el ataque presionado durante actionDuration
                this.performAttack();
                break;
            case 'idle':
            default:
                break;
        }
    }

    moveTowards(opponent) {
        const myX = this.fighter.position.x;
        
        // Verificar bordes
        if (myX <= STAGE_LEFT && opponent.position.x < myX) return;
        if (myX >= STAGE_RIGHT && opponent.position.x > myX) return;
        
        if (opponent.position.x > myX) {
            this.controls.right = true;
        } else {
            this.controls.left = true;
        }
        
        // Salto MUY raro
        if (this.random.chance(0.01)) {
            this.controls.up = true;
        }
    }

    moveAway(opponent) {
        const myX = this.fighter.position.x;
        
        if (opponent.position.x > myX) {
            this.controls.left = true;
        } else {
            this.controls.right = true;
        }
    }

    selectAttack() {
        // Elegir qué ataque hacer y guardarlo
        const roll = this.random.next();
        
        if (roll < 0.25) {
            this.currentAttack = 'lightPunch';
        } else if (roll < 0.45) {
            this.currentAttack = 'lightKick';
        } else if (roll < 0.65) {
            this.currentAttack = 'mediumPunch';
        } else if (roll < 0.80) {
            this.currentAttack = 'mediumKick';
        } else if (roll < 0.92) {
            this.currentAttack = 'heavyPunch';
        } else {
            this.currentAttack = 'heavyKick';
        }
    }

    performAttack() {
        // Ejecutar el ataque guardado
        if (this.currentAttack) {
            this.controls[this.currentAttack] = true;
        }
    }

    attack() {
        // Método legacy - ahora usa selectAttack + performAttack
        this.selectAttack();
        this.performAttack();
    }

    resetControls() {
        Object.keys(this.controls).forEach(key => {
            this.controls[key] = false;
        });
    }

    getControls() {
        return this.controls;
    }

    reset(seed) {
        this.random = new SeededRandom(seed + this.fighter.playerId);
        this.decisionTimer = 0;
        this.actionDuration = 0;
        this.attackCooldown = 0;
        this.currentAction = 'idle';
        this.currentAttack = null;
        this.resetControls();
    }
}