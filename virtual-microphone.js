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
  
  // Audio chunk buffering system
  const chunkBuffers = new Map(); // Map of trackId -> Map of chunkIndex -> chunk data
  
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

  // Add a chunk to the buffer and process if all chunks are received
  function addChunkToBuffer(pcmData, metadata) {
    if (!isActive || !audioWriter) return;
    
    const { trackId = 'default', chunkIndex, totalChunks, sampleRate } = metadata;
    
    // Single chunk - process immediately if no chunk info
    if (chunkIndex === undefined || totalChunks === undefined) {
      console.log('[Virtual Microphone] Processing single chunk directly');
      processAndWriteAudioData(pcmData, sampleRate || SAMPLE_RATE);
      return;
    }
    
    console.log(`[Virtual Microphone] Buffering chunk ${chunkIndex + 1}/${totalChunks} for track ${trackId}`);
    
    // Get or create track buffer
    if (!chunkBuffers.has(trackId)) {
      chunkBuffers.set(trackId, new Map());
    }
    const trackBuffer = chunkBuffers.get(trackId);
    
    // Store this chunk
    trackBuffer.set(chunkIndex, {
      data: pcmData,
      sampleRate: sampleRate || SAMPLE_RATE
    });
    
    // Check if we have all chunks for this track
    if (trackBuffer.size === totalChunks) {
      console.log(`[Virtual Microphone] All ${totalChunks} chunks received for track ${trackId}, processing...`);
      processCompleteTrack(trackId, totalChunks);
    } else {
      console.log(`[Virtual Microphone] Waiting for more chunks: ${trackBuffer.size}/${totalChunks} received`);
    }
  }
  
  // Process a complete track when all chunks are received
  function processCompleteTrack(trackId, totalChunks) {
    const trackBuffer = chunkBuffers.get(trackId);
    if (!trackBuffer || trackBuffer.size < totalChunks) {
      console.error(`[Virtual Microphone] Cannot process incomplete track: ${trackBuffer?.size || 0}/${totalChunks}`);
      return;
    }
    
    // Determine total length of all chunks
    let totalLength = 0;
    for (let i = 0; i < totalChunks; i++) {
      if (!trackBuffer.has(i)) {
        console.error(`[Virtual Microphone] Missing chunk ${i} for track ${trackId}`);
        return;
      }
      totalLength += trackBuffer.get(i).data.length;
    }
    
    // Create a single combined buffer
    const combinedData = new Int16Array(totalLength);
    let offset = 0;
    
    // Fill the combined buffer with all chunks in order
    for (let i = 0; i < totalChunks; i++) {
      const chunk = trackBuffer.get(i);
      combinedData.set(chunk.data, offset);
      offset += chunk.data.length;
    }
    
    // Use sample rate from first chunk
    const sampleRate = trackBuffer.get(0).sampleRate;
    
    // Process the combined data
    console.log(`[Virtual Microphone] Processing combined data: ${totalLength} samples`);
    processAndWriteAudioData(combinedData, sampleRate);
    
    // Clear the buffer for this track
    chunkBuffers.delete(trackId);
  }
  
  // Process PCM data and write to the track
  async function processAndWriteAudioData(pcmData, sampleRate) {
    if (!isActive || !audioWriter) return;

    try {
        // Convert Int16Array to Float32Array (expected by Web Audio API)
        const floatData = new Float32Array(pcmData.length);
        for (let i = 0; i < pcmData.length; i++) {
            floatData[i] = pcmData[i] / 32768.0; // Ensure floating point division
        }

        // --- BEGIN DIAGNOSTIC LOGS ---
        let minVal = floatData.length > 0 ? floatData[0] : 0;
        let maxVal = floatData.length > 0 ? floatData[0] : 0;
        let hasNaN = false;
        let nanIndex = -1;
        for (let k = 0; k < floatData.length; k++) {
            if (isNaN(floatData[k])) {
                hasNaN = true;
                nanIndex = k;
                break;
            }
            if (floatData[k] < minVal) minVal = floatData[k];
            if (floatData[k] > maxVal) maxVal = floatData[k];
        }
        console.log(`[Virtual Microphone] floatData stats: length=${floatData.length}, min=${minVal}, max=${maxVal}, hasNaN=${hasNaN}${hasNaN ? ` at index ${nanIndex} (pcmData[${nanIndex}]=${pcmData[nanIndex]})` : ''}`);
        
        if (hasNaN) {
            console.error("[Virtual Microphone] FATAL: floatData contains NaN values! Aborting write.");
            return; // Do not attempt to write if NaN
        }
        // Strict check for range. Values exactly -1.0 or 1.0 are fine.
        if (maxVal > 1.0 || minVal < -1.0) {
            console.warn(`[Virtual Microphone] WARNING: floatData values (min: ${minVal}, max: ${maxVal}) are outside strict [-1.0, 1.0] range!`);
        }
        console.log('[Virtual Microphone] Creating AudioData with sampleRate:', sampleRate);
        // --- END DIAGNOSTIC LOGS ---

        const framesPerChunk = sampleRate * 1; // 1 second of audio per chunk
        let currentTimestampUs = performance.now() * 1000; // Initial timestamp in microseconds

        console.log(`[Virtual Microphone] Starting to write ${floatData.length} frames in chunks of ${framesPerChunk} frames using setTimeout.`);

        let currentFrameIndex = 0;
        let chunkCount = 0;

        function writeNextChunk() {
            if (currentFrameIndex >= floatData.length) {
                console.log('[Virtual Microphone] All audio data chunks written successfully via setTimeout.');
                return;
            }

            const chunkEnd = Math.min(currentFrameIndex + framesPerChunk, floatData.length);
            const chunkFloatData = floatData.slice(currentFrameIndex, chunkEnd);
            const numberOfFramesInChunk = chunkFloatData.length;

            if (numberOfFramesInChunk === 0) {
                console.log('[Virtual Microphone] Skipping empty chunk in setTimeout.');
                currentFrameIndex += framesPerChunk; // Advance index even if chunk was empty
                writeNextChunk(); // Immediately try next chunk
                return;
            }

            const audioDataChunk = new AudioData({
                format: 'f32',
                sampleRate: sampleRate,
                numberOfFrames: numberOfFramesInChunk,
                numberOfChannels: CHANNEL_COUNT,
                timestamp: currentTimestampUs,
                data: chunkFloatData
            });

            chunkCount++;
            console.log(`[Virtual Microphone] Writing chunk ${chunkCount}: ${numberOfFramesInChunk} frames, timestamp: ${currentTimestampUs / 1000} ms`);
            
            audioWriter.write(audioDataChunk).then(() => {
                console.log(`[Virtual Microphone] Successfully wrote chunk ${chunkCount}.`);
                
                const chunkDurationUs = (numberOfFramesInChunk / sampleRate) * 1000000;
                currentTimestampUs += chunkDurationUs;
                currentFrameIndex += numberOfFramesInChunk; // More precise advancement

                const delayMs = chunkDurationUs / 1000;
                setTimeout(writeNextChunk, delayMs);
            }).catch(error => {
                console.error(`[Virtual Microphone] Error writing chunk ${chunkCount}:`, error);
                // Optionally, decide if you want to stop or try to continue
            });
        }

        writeNextChunk(); // Start the process

    } catch (error) {
        console.error('[Virtual Microphone] Error in processAndWriteAudioData:', error);
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
      // Add chunk to buffer instead of processing directly
      addChunkToBuffer(event.data.pcmData, {
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
