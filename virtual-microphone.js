/**
 * Virtual Microphone implementation
 * This script overrides the mediaDevices API to provide a virtual microphone
 * that can receive PCM data from the side panel.
 */

(function() {
  console.log('[Virtual Microphone] Script loaded');

  // Store original mediaDevices methods
  const originalEnumerateDevices = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
  const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

  // Virtual device info
  const VIRTUAL_MIC_ID = 'virtual-microphone-kizunaai';
  const VIRTUAL_MIC_LABEL = 'KizunaAI Virtual Microphone';
  
  // Audio configuration
  const SAMPLE_RATE = 44100;
  const CHANNEL_COUNT = 1;
  
  // Create MediaStreamTrackGenerator for audio (requires Chrome 98+)
  let trackGenerator = null;
  let audioWriter = null;
  let virtualStream = null;
  let isActive = false;
  
  // Initialize the track generator
  function initializeTrackGenerator() {
    if (trackGenerator) return;

    try {
      // Create the track generator
      trackGenerator = new MediaStreamTrackGenerator({ kind: 'audio' });
      
      // Create a writer for the track
      audioWriter = trackGenerator.writable.getWriter();
      
      // Create a MediaStream with the generator track
      virtualStream = new MediaStream([trackGenerator]);
      
      isActive = true;
      console.log('[Virtual Microphone] Track generator initialized');
    } catch (error) {
      console.error('[Virtual Microphone] Error initializing track generator:', error);
    }
  }

  // Process PCM data and write to the track
  async function processPCMData(pcmData, metadata = {}) {
    if (!isActive || !audioWriter) return;
    
    try {
      // Log chunk information if available
      if (metadata.chunkIndex !== undefined) {
        console.log(`[Virtual Microphone] Processing chunk ${metadata.chunkIndex + 1}/${metadata.totalChunks}, size: ${pcmData.length}`);
      }
      
      // Convert Int16Array to Float32Array (expected by Web Audio API)
      const floatData = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) {
        // Convert from Int16 range (-32768 to 32767) to Float32 range (-1 to 1)
        floatData[i] = pcmData[i] / 32768;
      }

      // Create an AudioData object
      const audioData = new AudioData({
        format: 'f32',
        sampleRate: metadata.sampleRate || SAMPLE_RATE,
        numberOfFrames: floatData.length,
        numberOfChannels: CHANNEL_COUNT,
        timestamp: performance.now() * 1000, // Convert to microseconds
        data: floatData
      });

      console.log('[Virtual Microphone] Writing audio data to track');
      // Write the audio data to the track
      await audioWriter.write(audioData);
    } catch (error) {
      console.error('[Virtual Microphone] Error processing PCM data:', error);
    }
  }

  // Override enumerateDevices to include our virtual microphone
  navigator.mediaDevices.enumerateDevices = async function() {
    // Get real devices
    const devices = await originalEnumerateDevices();
    
    // Check if our virtual device is already in the list
    const virtualDeviceExists = devices.some(device => 
      device.deviceId === VIRTUAL_MIC_ID && device.kind === 'audioinput'
    );
    
    // If not, add our virtual microphone
    if (!virtualDeviceExists) {
      devices.push({
        deviceId: VIRTUAL_MIC_ID,
        kind: 'audioinput',
        label: VIRTUAL_MIC_LABEL,
        groupId: ''
      });
    }
    
    return devices;
  };

  // Override getUserMedia to intercept requests for our virtual microphone
  navigator.mediaDevices.getUserMedia = async function(constraints) {
    // If no audio constraints or explicitly not requesting our virtual mic, use original method
    if (!constraints.audio || 
        (constraints.audio.deviceId && 
         constraints.audio.deviceId.exact !== VIRTUAL_MIC_ID &&
         constraints.audio.deviceId !== VIRTUAL_MIC_ID)) {
      return originalGetUserMedia(constraints);
    }
    
    // If constraints specifically request our virtual microphone
    if (constraints.audio && 
        ((constraints.audio.deviceId && 
          (constraints.audio.deviceId.exact === VIRTUAL_MIC_ID || 
           constraints.audio.deviceId === VIRTUAL_MIC_ID)) || 
         constraints.audio === true)) {
      
      // Initialize our virtual microphone if not already done
      initializeTrackGenerator();
      
      // Return our virtual stream
      console.log('[Virtual Microphone] Returning virtual microphone stream');
      return virtualStream;
    }
    
    // For any other case, use the original getUserMedia
    return originalGetUserMedia(constraints);
  };

  // Listen for messages from content script
  window.addEventListener('message', function(event) {
    // Verify that the message is from our extension
    if (event.data && event.data.type === 'VIRTUAL_MIC_PCM_DATA') {
      // Process the PCM data with metadata
      processPCMData(event.data.pcmData, {
        chunkIndex: event.data.chunkIndex,
        totalChunks: event.data.totalChunks,
        sampleRate: event.data.sampleRate,
        trackId: event.data.trackId
      });
    }
    
    // Handle state change messages
    if (event.data && event.data.type === 'VIRTUAL_MIC_STATE') {
      if (event.data.enabled) {
        // Initialize our virtual microphone if not already done
        if (!isActive) {
          initializeTrackGenerator();
        }
        console.log('[Virtual Microphone] Enabled');
      } else {
        // Optionally handle disabling
        console.log('[Virtual Microphone] Disabled');
      }
    }
  });

  // Expose methods for debugging
  window.__virtualMicrophoneDebug = {
    isActive: () => isActive,
    getTrackGenerator: () => trackGenerator,
    getVirtualStream: () => virtualStream
  };

  console.log('[Virtual Microphone] Successfully initialized');
})();
