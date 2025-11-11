import {
	STAGE_MID_POINT,
	STAGE_PADDING,
	STAGE_WIDTH,
} from "../../../constants/Stage.js";

export class SkewedFloor {
	constructor(image, dimensions) {
		this.image = image;
		this.dimensions = dimensions;
	}

	draw = (context, camera, y) => {
		// VALIDACIÓN 1: image existe
		if (!this.image) {
			return;
		}

		// VALIDACIÓN 2: image es HTMLImageElement
		if (!(this.image instanceof HTMLImageElement)) {
			return;
		}

		// VALIDACIÓN 3: image está cargada
		if (!this.image.complete) {
			return;
		}

		// VALIDACIÓN 4: image tiene dimensiones
		if (!this.image.naturalWidth || !this.image.naturalHeight) {
			return;
		}

		// VALIDACIÓN 5: dimensions es válido
		if (!this.dimensions || this.dimensions.length < 4) {
			return;
		}

		const [sourceX, sourceY, width, height] = this.dimensions;

		// VALIDACIÓN 6: valores numéricos válidos
		if (isNaN(sourceX) || isNaN(sourceY) || isNaN(width) || isNaN(height)) {
			return;
		}

		try {
			context.save();
			context.setTransform(
				1,
				0,
				-5.15 - (camera.position.x - (STAGE_WIDTH + STAGE_PADDING)) / 112,
				1,
				32 - camera.position.x / 1.55,
				y - camera.position.y
			);

			context.drawImage(
				this.image,
				sourceX,
				sourceY,
				width,
				height,
				0,
				0,
				width,
				height
			);

			context.restore();
		} catch (error) {
			console.error('SkewedFloor.draw error:', error.message);
			context.restore(); // Restaurar incluso si hay error
		}
	};
}