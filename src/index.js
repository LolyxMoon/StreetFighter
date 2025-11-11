// src/index.js - VERSIÓN SIMPLIFICADA
import { StreetFighterGame } from './StreetFighterGame.js';

console.log('📦 index.js loading...');

// Verificar que el DOM está listo
function initGame() {
	console.log('🎮 Initializing game...');
	
	// Verificar canvas
	const canvas = document.getElementById('game-canvas') || document.querySelector('canvas');
	
	if (!canvas) {
		console.error('❌ Canvas not found! Waiting 1 second...');
		setTimeout(initGame, 1000);
		return;
	}
	
	console.log('✅ Canvas ready:', canvas);
	
	// Crear e iniciar juego
	try {
		const game = new StreetFighterGame();
		game.start();
		
		console.log('✅ Game started successfully');
		console.log('Game object available as window.game');
		
	} catch (error) {
		console.error('❌ Failed to start game:', error);
		console.error('Stack:', error.stack);
	}
}

// Iniciar cuando esté listo
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initGame);
} else {
	initGame();
}