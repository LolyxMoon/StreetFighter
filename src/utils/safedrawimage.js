// src/utils/safeDrawImage.js
// Helper universal para evitar crashes de drawImage

/**
 * Dibuja una imagen de forma segura, validando primero que esté cargada
 * @param {CanvasRenderingContext2D} context - Contexto del canvas
 * @param {HTMLImageElement} image - Imagen a dibujar
 * @param {...number} args - Argumentos de drawImage (sx, sy, sw, sh, dx, dy, dw, dh)
 * @returns {boolean} - true si se dibujó exitosamente, false si no
 */
export const safeDrawImage = (context, image, ...args) => {
	// Validación 1: context existe
	if (!context) {
		console.warn('safeDrawImage: context is null');
		return false;
	}

	// Validación 2: image existe
	if (!image) {
		// console.warn('safeDrawImage: image is null');
		return false;
	}

	// Validación 3: image es HTMLImageElement
	if (!(image instanceof HTMLImageElement)) {
		console.warn('safeDrawImage: image is not an HTMLImageElement');
		return false;
	}

	// Validación 4: image está cargada
	if (!image.complete) {
		// console.warn('safeDrawImage: image not loaded yet');
		return false;
	}

	// Validación 5: image tiene dimensiones
	if (!image.naturalWidth || !image.naturalHeight) {
		console.warn('safeDrawImage: image has no dimensions');
		return false;
	}

	// Validación 6: args tiene valores válidos
	if (args.some(arg => isNaN(arg))) {
		console.warn('safeDrawImage: invalid arguments', args);
		return false;
	}

	try {
		context.drawImage(image, ...args);
		return true;
	} catch (error) {
		console.error('safeDrawImage error:', error.message);
		return false;
	}
};

/**
 * Verifica si una imagen está lista para ser dibujada
 * @param {HTMLImageElement} image - Imagen a verificar
 * @returns {boolean} - true si la imagen está lista
 */
export const isImageReady = (image) => {
	if (!image) return false;
	if (!(image instanceof HTMLImageElement)) return false;
	if (!image.complete) return false;
	if (!image.naturalWidth || !image.naturalHeight) return false;
	return true;
};

console.log('✅ safeDrawImage helper loaded');