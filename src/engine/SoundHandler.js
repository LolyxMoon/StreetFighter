// src/engine/SoundHandler.js - CLEAN VERSION (sin warnings molestos)

export function playSound(soundId, options = {}) {
    // Si recibe un objeto en vez de string, obtener el ID
    let audioId = soundId;
    let audio = null;
    
    // Caso 1: soundId es un string (ID del elemento)
    if (typeof soundId === 'string') {
        audio = document.getElementById(soundId);
        audioId = soundId;
    }
    // Caso 2: soundId es un HTMLAudioElement directamente
    else if (soundId instanceof HTMLAudioElement) {
        audio = soundId;
        audioId = soundId.id || 'unknown-audio';
    }
    // Caso 3: null o undefined
    else if (!soundId) {
        // Silencioso - es normal que algunos sonidos no existan
        return null;
    }
    
    // Verificar que el elemento existe
    if (!audio) {
        // Silencioso para evitar spam en console
        // console.warn(`Audio element not found: ${audioId}`);
        return null;
    }

    const { volume = 0.3, loop = false } = options;

    try {
        audio.volume = volume;
        audio.loop = loop;
        audio.currentTime = 0;
        
        const playPromise = audio.play();
        
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                // Silencioso - navegador puede bloquear autoplay
                // console.warn(`Could not play audio ${audioId}:`, error.message);
            });
        }
        
        return audio;
    } catch (error) {
        // console.warn(`Error playing audio ${audioId}:`, error.message);
        return null;
    }
}

export function stopSound(soundId) {
    let audio = null;
    
    if (typeof soundId === 'string') {
        audio = document.getElementById(soundId);
    } else if (soundId instanceof HTMLAudioElement) {
        audio = soundId;
    }
    
    if (!audio) {
        return;
    }

    try {
        audio.pause();
        audio.currentTime = 0;
    } catch (error) {
        // Silencioso
    }
}

export function setSoundVolume(soundId, volume) {
    let audio = null;
    
    if (typeof soundId === 'string') {
        audio = document.getElementById(soundId);
    } else if (soundId instanceof HTMLAudioElement) {
        audio = soundId;
    }
    
    if (!audio) {
        return;
    }

    try {
        audio.volume = Math.max(0, Math.min(1, volume));
    } catch (error) {
        // Silencioso
    }
}

console.log('✅ SoundHandler.js (CLEAN VERSION) loaded');