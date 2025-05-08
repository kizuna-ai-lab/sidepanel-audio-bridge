console.log('Inject script executing.');

(() => {
  const VIRTUAL_DEVICE_ID = 'sidepanel-audio-input';
  const VIRTUAL_DEVICE_LABEL = 'Side Panel Virtual Audio Input';
  const FIXED_SAMPLE_RATE = 48000;
  const FIXED_CHANNEL_COUNT = 1;

  let audioBufferQueue = [];

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || !event.data.type) {
      return;
    }
    const message = event.data;

    if (message.type === 'AUDIO_DATA_FROM_BACKGROUND') {
      if (message.audioData && message.audioData.buffer) {
        audioBufferQueue.push(...message.audioData.buffer);
      }
    }
  });

  const originalEnumerateDevices = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
  navigator.mediaDevices.enumerateDevices = async function () {
    const devices = await originalEnumerateDevices();
    devices.push({
      deviceId: VIRTUAL_DEVICE_ID,
      kind: 'audioinput',
      label: VIRTUAL_DEVICE_LABEL,
      groupId: 'default'
    });
    return devices;
  };

  const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async function (constraints) {
    const audioConstraint = constraints && constraints.audio;
    let isRequestingOurDevice = false;
    if (audioConstraint) {
        if (typeof audioConstraint === 'boolean' && audioConstraint === true) {
        } else if (audioConstraint.deviceId) {
            const did = audioConstraint.deviceId;
            if (did === VIRTUAL_DEVICE_ID || (did.exact && did.exact === VIRTUAL_DEVICE_ID)) {
                isRequestingOurDevice = true;
            }
        }
    }

    if (!isRequestingOurDevice) {
        return originalGetUserMedia(constraints);
    }
    
    console.log('Inject.js: Attempting to provide virtual audio stream with fixed parameters.');

    try {
      console.log(`Inject.js: Using fixed parameters for virtual stream: SR=${FIXED_SAMPLE_RATE}, CH=${FIXED_CHANNEL_COUNT}`);

      const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: FIXED_SAMPLE_RATE });
      const bufferSize = 1024; 
      
      const scriptProcessor = audioContext.createScriptProcessor(bufferSize, FIXED_CHANNEL_COUNT, FIXED_CHANNEL_COUNT);

      scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
        const outputBuffer = audioProcessingEvent.outputBuffer;
        for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
          const outputData = outputBuffer.getChannelData(channel);
          for (let i = 0; i < outputBuffer.length; i++) {
            if (audioBufferQueue.length > 0) {
              outputData[i] = audioBufferQueue.shift();
            } else {
              outputData[i] = 0; 
            }
          }
        }
      };

      const mediaStreamDestination = audioContext.createMediaStreamDestination();
      scriptProcessor.connect(mediaStreamDestination);
      
      (window._virtualAudioContexts = window._virtualAudioContexts || []).push(audioContext);
      if (window._virtualAudioContexts.length > 5) {
        const oldCtx = window._virtualAudioContexts.shift();
        oldCtx.close().catch(e => console.warn("Inject.js: Error closing old virtual AudioContext:", e));
      }

      console.log('Inject.js: Virtual audio stream created.');
      return mediaStreamDestination.stream;

    } catch (error) {
      console.error('Inject.js: Error in overridden getUserMedia:', error);
      return Promise.reject(typeof error === 'string' ? new Error(error) : error);
    }
  };

  console.log('Inject script: Web Audio API overrides applied (with fixed audio parameters).');
})();
