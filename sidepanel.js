console.log('Sidepanel script loaded');

let audioContext;
let mp3SourceNode;
let scriptProcessor;
let gainNode;
let audioDataPort = null;

const BUFFER_SIZE = 1024;

function connectToBackground() {
  if (audioDataPort) {
    try {
      audioDataPort.disconnect();
    } catch (e) { /* ignore */ }
    audioDataPort = null;
  }
  audioDataPort = chrome.runtime.connect({name: "audioBridge"});
  console.log("Sidepanel: Attempted to connect to background on 'audioBridge' port.");
  
  audioDataPort.onDisconnect.addListener(() => {
    console.warn("Sidepanel: 'audioBridge' port disconnected.");
    audioDataPort = null; 
    // setTimeout(connectToBackground, 1000); // Optional: Simple reconnect after 1s
  });
}

async function loadAndPlayMP3(audioCtx, destinationNode) {
  try {
    const response = await fetch(chrome.runtime.getURL('test-tone.mp3'));
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status} for test-tone.mp3`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    mp3SourceNode = audioCtx.createBufferSource();
    mp3SourceNode.buffer = audioBuffer;
    mp3SourceNode.loop = true; // Loop the MP3
    mp3SourceNode.connect(destinationNode); // Connect to the next node in the chain (e.g., gainNode)
    mp3SourceNode.start();
    console.log('Sidepanel: test-tone.mp3 loaded and playing.');
  } catch (error) {
    console.error('Sidepanel: Error loading or playing test-tone.mp3:', error);
    const errorP = document.createElement('p');
    errorP.style.color = 'red';
    errorP.textContent = 'Error loading MP3: ' + error.message;
    document.body.appendChild(errorP);
  }
}

async function setupAudio() { 
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const destinationChannelCount = audioContext.destination.channelCount;
    console.log(`Sidepanel AudioContext initialized. Sample rate: ${audioContext.sampleRate}, Destination Channels: ${destinationChannelCount}`);

    gainNode = audioContext.createGain();
    gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);

    scriptProcessor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
      const inputBuffer = audioProcessingEvent.inputBuffer;
      const pcmData = inputBuffer.getChannelData(0); 
      const dataToSend = new Float32Array(pcmData); 

      if (audioDataPort) {
        try {
          audioDataPort.postMessage({
            type: "AUDIO_DATA_FROM_SIDEPANEL",
            audioData: {
              buffer: Array.from(dataToSend),
              sampleRate: audioContext.sampleRate, 
              channelCount: 1 
            }
          });
        } catch (error) {
          if (error.message && error.message.includes("disconnected port")) {
            console.warn("Sidepanel: Port disconnected while sending audio. Attempting to reconnect.");
            audioDataPort = null;
            connectToBackground(); 
          } 
        }
      } 
    };

    gainNode.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination); 

    await loadAndPlayMP3(audioContext, gainNode);
    console.log('Audio pipeline set up for MP3 playback in sidepanel.');

  } catch (e) {
    console.error('Error setting up audio in sidepanel:', e);
    const errorP = document.createElement('p');
    errorP.style.color = 'red';
    errorP.textContent = 'Error initializing Web Audio: ' + e.message;
    document.body.appendChild(errorP);
  }
}

function cleanupAudio() {
  console.log('Cleaning up audio resources in sidepanel.');
  if (audioDataPort) {
    try {
      audioDataPort.disconnect();
    } catch(e) { console.warn("Error disconnecting port:", e); }
    audioDataPort = null;
  }
  if (mp3SourceNode) { 
    try {
      mp3SourceNode.stop();
    } catch(e) { /* might have already stopped */ }
    mp3SourceNode.disconnect();
    mp3SourceNode = null;
  }
  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor.onaudioprocess = null;
    scriptProcessor = null;
  }
  if (gainNode) {
    gainNode.disconnect();
    gainNode = null;
  }
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close().catch(e => console.error("Error closing AudioContext:", e));
    audioContext = null;
  }
}

console.log('Sidepanel.js: Parameter negotiation logic removed.');

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', async () => { 
    await setupAudio(); 
    connectToBackground(); 
  });
} else {
  (async () => { 
    await setupAudio(); 
    connectToBackground(); 
  })();
}

window.addEventListener('unload', cleanupAudio);
