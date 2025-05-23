/**
 * Helper module to properly set up the wavtools library
 * This ensures the AudioWorklet modules are loaded correctly
 */

// Import the necessary components from wavtools
import { WavStreamPlayer } from './index.js';

// Create a singleton instance for the audio player
let playerInstance = null;
let audioBuffer = null;

/**
 * Initialize the WavStreamPlayer
 * @param {number} sampleRate - The sample rate to use for the player
 * @returns {Promise<WavStreamPlayer>} - The initialized player
 */
export async function initializePlayer(sampleRate = 44100) {
  if (playerInstance) return playerInstance;
  
  // Create a new WavStreamPlayer
  playerInstance = new WavStreamPlayer({ sampleRate });
  
  try {
    // Connect the player to the audio output
    await playerInstance.connect();
    console.log('WavStreamPlayer initialized successfully');
    return playerInstance;
  } catch (error) {
    console.error('Error initializing WavStreamPlayer:', error);
    playerInstance = null;
    throw error;
  }
}

/**
 * Convert MP3 to PCM16 format that wavtools can handle
 * @param {string} mp3Url - URL to the MP3 file
 * @returns {Promise<{buffer: Int16Array, sampleRate: number}>} - The converted PCM16 data
 */
export async function convertMP3ToPCM16(mp3Url) {
  try {
    // Fetch the MP3 file
    const response = await fetch(mp3Url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // Get the ArrayBuffer from the response
    const arrayBuffer = await response.arrayBuffer();
    
    // Create a temporary AudioContext to decode the MP3
    const tempContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Decode the MP3 data
    const audioBuffer = await tempContext.decodeAudioData(arrayBuffer);
    
    // Get the audio data from the buffer
    const numberOfChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const sampleRate = audioBuffer.sampleRate;
    
    // Create a buffer for the PCM16 data (Int16Array)
    // We'll use the first channel if stereo, or mix down if needed
    const pcm16Data = new Int16Array(length);
    
    // Get the audio data from the first channel
    const channelData = audioBuffer.getChannelData(0);
    
    // Convert Float32Array to Int16Array (16-bit PCM)
    for (let i = 0; i < length; i++) {
      // Float32Array values are in range [-1, 1]
      // Convert to Int16Array range [-32768, 32767]
      pcm16Data[i] = Math.max(-32768, Math.min(32767, Math.floor(channelData[i] * 32767)));
    }
    
    // Close the temporary context
    await tempContext.close();
    
    console.log(`Converted MP3 to PCM16: ${length} samples, ${sampleRate}Hz, ${numberOfChannels} channels`);
    
    return {
      buffer: pcm16Data,
      sampleRate: sampleRate
    };
  } catch (error) {
    console.error('Error converting MP3 to PCM16:', error);
    throw error;
  }
}

/**
 * Load and cache the audio data
 * @param {string} mp3Url - URL to the MP3 file
 * @returns {Promise<{buffer: Int16Array, sampleRate: number}>} - The audio data
 */
export async function loadAudio(mp3Url) {
  if (audioBuffer) return audioBuffer;
  
  audioBuffer = await convertMP3ToPCM16(mp3Url);
  return audioBuffer;
}

/**
 * Play the audio
 * @param {Int16Array} buffer - The PCM16 audio buffer to play
 * @param {number} sampleRate - The sample rate of the audio
 * @returns {Promise<WavStreamPlayer>} - Returns the player instance
 */
export async function playAudio(buffer, sampleRate) {
  try {
    // Initialize the player with the correct sample rate
    const player = await initializePlayer(sampleRate);
    
    // Create a modified version of add16BitPCM to capture PCM data before it's sent
    const originalAdd16BitPCM = player.add16BitPCM.bind(player);
    
    // Override the add16BitPCM method to capture data
    player.add16BitPCM = function(arrayBuffer, trackId = 'default') {
      console.log(`[Virtual Microphone] Adding PCM data, length: ${arrayBuffer.length || arrayBuffer.byteLength}, trackId: ${trackId}`);
      
      // This custom event allows external code to subscribe to PCM data
      const pcmDataCaptureEvent = new CustomEvent('pcm-data-capture', {
        detail: {
          pcmData: arrayBuffer instanceof Int16Array ? arrayBuffer : new Int16Array(arrayBuffer),
          sampleRate: sampleRate,
          trackId: trackId
        }
      });
      
      // Dispatch the event with the PCM data
      window.dispatchEvent(pcmDataCaptureEvent);
      
      // Call the original method to actually play the audio
      return originalAdd16BitPCM(arrayBuffer, trackId);
    };
    
    // Add the PCM16 data to the player
    player.add16BitPCM(buffer);
    
    return player;
  } catch (error) {
    console.error('Error playing audio:', error);
    throw error;
  }
}

/**
 * Stop the audio
 * @returns {Promise<void>}
 */
export async function stopAudio() {
  if (!playerInstance) return;
  
  try {
    // Interrupt the current track
    await playerInstance.interrupt();
    
    // Reset the player instance to allow it to be reused
    const sampleRate = playerInstance.sampleRate;
    playerInstance = null;
    
    // Re-initialize with the same sample rate
    await initializePlayer(sampleRate);
  } catch (error) {
    console.error('Error stopping audio:', error);
    playerInstance = null;
    throw error;
  }
}

/**
 * Clean up resources
 */
export function cleanup() {
  if (playerInstance) {
    stopAudio().catch(e => console.error('Error stopping audio during cleanup:', e));
    playerInstance = null;
  }
  
  audioBuffer = null;
}
