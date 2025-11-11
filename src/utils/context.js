// src/utils/context.js - VERSIÓN DEFINITIVA

export const drawFrame = (context, image, dimensions, x, y, direction = 1) => {
	// VALIDACIONES
	if (!context) return;
	if (!image) return;
	if (!(image instanceof HTMLImageElement)) return;
	if (!image.complete) return;
	if (!image.naturalWidth || !image.naturalHeight) return;
	if (!dimensions || dimensions.length < 4) return;

	const [sourceX, sourceY, sourceWidth, sourceHeight] = dimensions;
	if (isNaN(sourceX) || isNaN(sourceY) || isNaN(sourceWidth) || isNaN(sourceHeight)) return;

	try {
		context.scale(direction, 1);
		context.drawImage(
			image,
			sourceX,
			sourceY,
			sourceWidth,
			sourceHeight,
			x * direction,
			y,
			sourceWidth,
			sourceHeight
		);
		context.setTransform(1, 0, 0, 1, 0, 0);
	} catch (error) {
		console.error('drawFrame error:', error.message);
		context.setTransform(1, 0, 0, 1, 0, 0);
	}
};

export const getContext = () => {
	// Método 1: Buscar por ID específico
	let canvasEL = document.getElementById('game-canvas');
	
	// Método 2: Buscar cualquier canvas
	if (!canvasEL) {
		console.warn('Canvas with id="game-canvas" not found, trying querySelector...');
		canvasEL = document.querySelector('canvas');
	}
	
	// Si no existe, error crítico
	if (!canvasEL) {
		console.error('❌ CRITICAL ERROR: No canvas element found in DOM!');
		console.error('Available elements:', document.body.innerHTML.substring(0, 500));
		
		// Intentar crear uno de emergencia (NO RECOMENDADO pero mejor que nada)
		console.warn('⚠️ Attempting to create emergency canvas...');
		canvasEL = document.createElement('canvas');
		canvasEL.id = 'game-canvas';
		canvasEL.width = 382;
		canvasEL.height = 224;
		document.body.appendChild(canvasEL);
		console.log('✅ Emergency canvas created');
	}
	
	console.log('✅ Canvas found:', {
		id: canvasEL.id,
		width: canvasEL.width,
		height: canvasEL.height,
		element: canvasEL
	});
	
	const context = canvasEL.getContext('2d');
	if (!context) {
		console.error('❌ CRITICAL: Could not get 2D context from canvas!');
		return null;
	}
	
	context.imageSmoothingEnabled = false;
	return context;
};

console.log('✅ context.js (DEFINITIVE VERSION) loaded');