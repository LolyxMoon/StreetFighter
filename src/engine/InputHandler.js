// src/engine/InputHandler.js - MODIFICADO PARA AI
import { CONTROLLER_DEADZONE, controls } from '../config/controls.js';
import { Control } from '../constants/controls.js';
import { FighterDirection } from '../constants/fighter.js';

const mappedButtons = new Set(
	controls.map(({ gamepad }) => Object.values(gamepad)).flat()
);
const heldGamepadButtons = [new Set(), new Set()];
const pressedGamepadButtons = [new Set(), new Set()];

const gamepadThumbstickAxes = [
	{
		x: 0,
		y: 0,
	},
	{
		x: 0,
		y: 0,
	},
];

const heldKeys = new Set();
const pressedKeys = new Set();
const pressedKeysControlHistory = [new Set(), new Set()];
const mappedKeys = controls
	.map(({ keyboard }) => Object.values(keyboard))
	.flat();

// NUEVO: Sistema de AI
let AI_MODE = false;
let aiControllers = [null, null];
const aiControls = [
	{
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
	},
	{
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
	}
];

// NUEVO: Activar/desactivar modo AI
export const setAIMode = (enabled) => {
	AI_MODE = enabled;
};

// NUEVO: Asignar controlador AI a un jugador
export const setAIController = (playerId, aiController) => {
	if (playerId >= 0 && playerId < 2) {
		aiControllers[playerId] = aiController;
	}
};

// NUEVO: Actualizar controles de AI
export const updateAIControls = (playerId, controls) => {
	if (playerId >= 0 && playerId < 2) {
		aiControls[playerId] = { ...controls };
	}
};

const isButtonPressed = (id, code) => {
	// MODIFICADO: Check AI mode first
	if (AI_MODE && aiControllers[id]) {
		return false; // AI no usa botones presionados, solo estados
	}
	
	if (
		heldGamepadButtons[id].has(code) &&
		!pressedGamepadButtons[id].has(code)
	) {
		pressedGamepadButtons[id].add(code);
		return true;
	}
	return false;
};

const isPressed = (code) => {
	// MODIFICADO: En modo AI, no usar teclado
	if (AI_MODE) return false;
	
	if (heldKeys.has(code) && !pressedKeys.has(code)) {
		pressedKeys.add(code);
		return true;
	}
	return false;
};

const isPressedControlHistory = (id, code) => {
	// MODIFICADO: Check AI mode
	if (AI_MODE && aiControllers[id]) {
		// Para AI, simular pressed basado en el cambio de estado
		const aiControl = getAIControlByCode(id, code);
		return aiControl; // Retornar el estado actual del control AI
	}
	
	const controlKeyId = controls[id].keyboard[code];
	const controlButtonId = controls[id].gamepad[code];
	if (
		heldKeys.has(controlKeyId) &&
		!pressedKeysControlHistory[id].has(controlKeyId)
	) {
		pressedKeysControlHistory[id].add(controlKeyId);
		return true;
	} else if (
		heldGamepadButtons[id].has(controlButtonId) &&
		!pressedKeysControlHistory[id].has(controlButtonId)
	) {
		pressedKeysControlHistory[id].add(controlButtonId);
		return true;
	}
	return false;
};

// NUEVO: Helper para obtener control AI por código
const getAIControlByCode = (id, code) => {
	if (!AI_MODE || !aiControllers[id]) return false;
	
	switch(code) {
		case Control.UP: return aiControls[id].up;
		case Control.DOWN: return aiControls[id].down;
		case Control.LEFT: return aiControls[id].left;
		case Control.RIGHT: return aiControls[id].right;
		case Control.LIGHT_PUNCH: return aiControls[id].lightPunch;
		case Control.MEDIUM_PUNCH: return aiControls[id].mediumPunch;
		case Control.HEAVY_PUNCH: return aiControls[id].heavyPunch;
		case Control.LIGHT_KICK: return aiControls[id].lightKick;
		case Control.MEDIUM_KICK: return aiControls[id].mediumKick;
		case Control.HEAVY_KICK: return aiControls[id].heavyKick;
		default: return false;
	}
};

const handleKeyDown = (event) => {
	// MODIFICADO: Desactivar en modo AI
	if (AI_MODE) return;
	
	if (!mappedKeys.includes(event.code)) return;
	event.preventDefault();
	if (!heldKeys.has(event.code)) {
		heldKeys.add(event.code);
	}
};

const handleKeyUp = (event) => {
	// MODIFICADO: Desactivar en modo AI
	if (AI_MODE) return;
	
	event.preventDefault();
	if (heldKeys.has(event.code)) {
		heldKeys.delete(event.code);
		pressedKeys.delete(event.code);
		if (Object.values(controls[0].keyboard).includes(event.code))
			pressedKeysControlHistory[0].delete(event.code);
		else pressedKeysControlHistory[1].delete(event.code);
	}
};

export const registerKeyboardEvents = () => {
	window.addEventListener('keydown', handleKeyDown);
	window.addEventListener('keyup', handleKeyUp);
};

const handleGamepadConnected = (event) => {
	// MODIFICADO: Desactivar en modo AI
	if (AI_MODE) return;
	
	const gamepad = event.gamepad;
	console.log(
		`gamepad named ${gamepad.id} connected for player ${gamepad.index + 1}`
	);
};

const handleGamepadDisconnected = (event) => {
	// MODIFICADO: Desactivar en modo AI
	if (AI_MODE) return;
	
	const gamepad = event.gamepad;
	console.log(
		`gamepad named ${gamepad.id} disconnected for player ${gamepad.index + 1}`
	);
};

const updateGamepadButtons = (gamePadIndex, gamePad) => {
	// MODIFICADO: Desactivar en modo AI
	if (AI_MODE) return;
	
	if (!gamePad) return;
	gamePad.buttons.forEach((button, index) => {
		if (!mappedButtons.has(index)) return;
		if (button.pressed) {
			heldGamepadButtons[gamePadIndex].add(index);
		} else {
			heldGamepadButtons[gamePadIndex].delete(index);
			pressedGamepadButtons[gamePadIndex].delete(index);
			pressedKeysControlHistory[gamePadIndex].delete(index);
		}
	});
};

const updateGamepadAxes = (gamePadIndex, gamePad) => {
	// MODIFICADO: Desactivar en modo AI
	if (AI_MODE) return;
	
	if (!gamePad) return;
	gamepadThumbstickAxes[gamePadIndex].x = gamePad.axes[0];
	gamepadThumbstickAxes[gamePadIndex].y = gamePad.axes[1];
};

export const updateGamePads = () => {
	// MODIFICADO: Desactivar en modo AI
	if (AI_MODE) return;
	
	const gamepadList = navigator.getGamepads();

	for (const [gamePadIndex, gamePad] of gamepadList.entries()) {
		updateGamepadButtons(gamePadIndex, gamePad);
		updateGamepadAxes(gamePadIndex, gamePad);
	}
};

export const registerGamepadEvents = () => {
	window.addEventListener('gamepadconnected', handleGamepadConnected);
	window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);
};

// MODIFICADO: Todas las funciones de control ahora chequean modo AI
export const isLeft = (id) => {
	if (AI_MODE && aiControllers[id]) {
		return aiControls[id].left;
	}
	
	if (gamepadThumbstickAxes[id].x < -1 * CONTROLLER_DEADZONE) return true;
	return (
		heldKeys.has(controls[id].keyboard[Control.LEFT]) ||
		heldGamepadButtons[id].has(controls[id].gamepad[Control.LEFT])
	);
};

export const isUp = (id) => {
	if (AI_MODE && aiControllers[id]) {
		return aiControls[id].up;
	}
	
	if (gamepadThumbstickAxes[id].y < -1 * CONTROLLER_DEADZONE) return true;

	return (
		heldKeys.has(controls[id].keyboard[Control.UP]) ||
		heldGamepadButtons[id].has(controls[id].gamepad[Control.UP])
	);
};

export const isRight = (id) => {
	if (AI_MODE && aiControllers[id]) {
		return aiControls[id].right;
	}
	
	if (gamepadThumbstickAxes[id].x > CONTROLLER_DEADZONE) return true;

	return (
		heldKeys.has(controls[id].keyboard[Control.RIGHT]) ||
		heldGamepadButtons[id].has(controls[id].gamepad[Control.RIGHT])
	);
};

export const isDown = (id) => {
	if (AI_MODE && aiControllers[id]) {
		return aiControls[id].down;
	}
	
	if (gamepadThumbstickAxes[id].y > CONTROLLER_DEADZONE) return true;

	return (
		heldKeys.has(controls[id].keyboard[Control.DOWN]) ||
		heldGamepadButtons[id].has(controls[id].gamepad[Control.DOWN])
	);
};

export const isForward = (id, direction) => {
	return direction === FighterDirection.RIGHT ? isRight(id) : isLeft(id);
};

export const isBackward = (id, direction) => {
	return direction === FighterDirection.RIGHT ? isLeft(id) : isRight(id);
};

export const isIdle = (id) =>
	isUp(id) || isDown(id) || isLeft(id) || isRight(id);

export const isKeyPressed = (id, code, forControlHistory) => {
	if (AI_MODE && aiControllers[id]) {
		return getAIControlByCode(id, code);
	}
	
	if (forControlHistory) return isPressedControlHistory(id, code);

	return (
		isButtonPressed(id, controls[id].gamepad[code]) ||
		isPressed(controls[id].keyboard[code])
	);
};

// CORREGIDO: Eliminar setTimeout que causaba problemas
export const isLightPunch = (id, forControlHistory = false) => {
	if (AI_MODE && aiControllers[id]) {
		return aiControls[id].lightPunch;
	}
	return isKeyPressed(id, Control.LIGHT_PUNCH, forControlHistory);
};

export const isMediumPunch = (id, forControlHistory = false) => {
	if (AI_MODE && aiControllers[id]) {
		return aiControls[id].mediumPunch;
	}
	return isKeyPressed(id, Control.MEDIUM_PUNCH, forControlHistory);
};

export const isHeavyPunch = (id, forControlHistory = false) => {
	if (AI_MODE && aiControllers[id]) {
		return aiControls[id].heavyPunch;
	}
	return isKeyPressed(id, Control.HEAVY_PUNCH, forControlHistory);
};

export const isLightKick = (id, forControlHistory = false) => {
	if (AI_MODE && aiControllers[id]) {
		return aiControls[id].lightKick;
	}
	return isKeyPressed(id, Control.LIGHT_KICK, forControlHistory);
};

export const isMediumKick = (id, forControlHistory = false) => {
	if (AI_MODE && aiControllers[id]) {
		return aiControls[id].mediumKick;
	}
	return isKeyPressed(id, Control.MEDIUM_KICK, forControlHistory);
};

export const isHeavyKick = (id, forControlHistory = false) => {
	if (AI_MODE && aiControllers[id]) {
		return aiControls[id].heavyKick;
	}
	return isKeyPressed(id, Control.HEAVY_KICK, forControlHistory);
};

// NUEVO: Función para actualizar AI cada frame
export const updateAI = (time, fighters) => {
	if (!AI_MODE) return;
	
	for (let i = 0; i < 2; i++) {
		if (aiControllers[i] && fighters[i]) {
			const opponent = fighters[1 - i];
			const newControls = aiControllers[i].update(time, opponent);
			updateAIControls(i, newControls);
		}
	}
};