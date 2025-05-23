import { loadAudio, playAudio, stopAudio, cleanup } from './wavtools-helper.js';

console.log('Sidepanel script loaded');

let isPlaying = false;
let audioBuffer = null;
let statusElement;
let playButton;
let backendPort = null;
let virtualMicEnabled = false;
let virtualMicToggle;

// Get the current active tab for sending messages
async function getCurrentTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) {
      throw new Error('No active tab found');
    }
    return tabs[0];
  } catch (error) {
    console.error('Error getting current tab:', error);
    updateStatus('Error getting current tab: ' + error.message, true);
    return null;
  }
}

// Send message to content script
async function sendMessageToContentScript(message) {
  try {
    const tab = await getCurrentTab();
    if (!tab) {
      throw new Error('No active tab to send message to');
    }
    
    chrome.tabs.sendMessage(tab.id, message, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending message to content script:', chrome.runtime.lastError);
        updateStatus('Error connecting to content script: ' + chrome.runtime.lastError.message, true);
        return;
      }
      
      if (response && response.success) {
        console.log('Message sent successfully to content script');
      }
    });
    
    return true;
  } catch (error) {
    console.error('Error sending message to content script:', error);
    updateStatus('Error sending message: ' + error.message, true);
    return false;
  }
}

// Handle playing the audio
async function handlePlayAudio() {
  try {
    updateStatus('Loading audio file...');
    
    // Load the audio file if not already loaded
    if (!audioBuffer) {
      audioBuffer = await loadAudio(chrome.runtime.getURL('test-tone.mp3'));
    }
    
    // Set up PCM data forwarding BEFORE playing audio if virtual mic is enabled
    if (virtualMicEnabled) {
      // First set up the event listener to catch ALL PCM data
      setupPCMForwarding();
      
      // Then send a message to content script to notify that virtual mic is enabled
      const connected = await sendMessageToContentScript({ 
        type: 'VIRTUAL_MIC_ENABLED',
        enabled: true
      });
      
      if (!connected) {
        updateStatus('Could not connect to content script', true);
        return;
      }
    }
    
    console.log('[Virtual Microphone] About to play audio, virtualMicEnabled:', virtualMicEnabled);
    
    // Play the audio - this will trigger PCM data events that our listener is now ready for
    const player = await playAudio(audioBuffer.buffer, audioBuffer.sampleRate);
    
    isPlaying = true;
    updatePlayButtonState();
    updateStatus('Playing audio' + (virtualMicEnabled ? ' through virtual microphone' : ''));
  } catch (error) {
    console.error('Error playing audio:', error);
    updateStatus('Error playing audio: ' + error.message, true);
  }
}

// Set up PCM data forwarding from the player to the virtual microphone
function setupPCMForwarding() {
  console.log('[Virtual Microphone] Setting up PCM data forwarding');
  
  // Remove any existing event listener to avoid duplicates
  window.removeEventListener('pcm-data-capture', handlePCMDataCapture);
  
  // Add event listener for the PCM data capture events
  window.addEventListener('pcm-data-capture', handlePCMDataCapture);
  
  console.log('[Virtual Microphone] PCM data forwarding set up successfully');
}

// Handler for PCM data capture events
function handlePCMDataCapture(event) {
  const { pcmData, sampleRate, trackId } = event.detail;
  
  console.log(`[Virtual Microphone] PCM data captured: ${pcmData.length} samples, trackId: ${trackId}`);
  
  // Only forward data if virtual mic is enabled
  if (virtualMicEnabled) {
    // Chunk size (number of samples per message)
    const CHUNK_SIZE = 16000; // About 1/3 second of audio at 48kHz
    
    // Break the PCM data into smaller chunks
    for (let i = 0; i < pcmData.length; i += CHUNK_SIZE) {
      // Get a slice of the PCM data
      const chunk = pcmData.slice(i, Math.min(i + CHUNK_SIZE, pcmData.length));
      
      // Send the chunk to the content script
      sendMessageToContentScript({
        type: 'PCM_DATA',
        pcmData: Array.from(chunk), // Convert to regular array for serialization
        chunkIndex: Math.floor(i / CHUNK_SIZE),
        totalChunks: Math.ceil(pcmData.length / CHUNK_SIZE),
        sampleRate: sampleRate,
        trackId: trackId
      }).catch(error => {
        console.error(`Error sending PCM chunk ${Math.floor(i / CHUNK_SIZE)}:`, error);
      });
    }
    
    console.log(`[Virtual Microphone] Sent PCM data in ${Math.ceil(pcmData.length / CHUNK_SIZE)} chunks`);
  }
}

// Handle stopping the audio
async function handleStopAudio() {
  try {
    // Stop the audio
    await stopAudio();
    
    isPlaying = false;
    updatePlayButtonState();
    updateStatus('Audio stopped');
  } catch (error) {
    console.error('Error stopping audio:', error);
    updateStatus('Error stopping audio: ' + error.message, true);
  }
}

// Toggle play/stop
async function toggleAudio() {
  if (isPlaying) {
    await handleStopAudio();
  } else {
    await handlePlayAudio();
  }
}

// Update the play button appearance
function updatePlayButtonState() {
  if (!playButton) return;
  
  if (isPlaying) {
    playButton.textContent = 'STOP';
    playButton.classList.add('playing');
  } else {
    playButton.textContent = 'PLAY';
    playButton.classList.remove('playing');
  }
}

// Update the virtual microphone toggle appearance
function updateVirtualMicState() {
  if (!virtualMicToggle) return;
  
  if (virtualMicEnabled) {
    virtualMicToggle.textContent = 'DISABLE VIRTUAL MIC';
    virtualMicToggle.classList.add('active');
  } else {
    virtualMicToggle.textContent = 'ENABLE VIRTUAL MIC';
    virtualMicToggle.classList.remove('active');
  }
}

// Update the virtual microphone status based on feedback from the web page
function updateVirtualMicStatus(active) {
  const statusMessage = active ? 'Virtual microphone active in page' : 'Virtual microphone inactive in page';
  updateStatus(statusMessage);
}

// Toggle the virtual microphone functionality
async function toggleVirtualMic() {
  virtualMicEnabled = !virtualMicEnabled;
  updateVirtualMicState();
  
  try {
    // Send message to content script about virtual mic state
    await sendMessageToContentScript({
      type: 'VIRTUAL_MIC_ENABLED',
      enabled: virtualMicEnabled
    });
    
    updateStatus(virtualMicEnabled ? 'Virtual microphone enabled' : 'Virtual microphone disabled');
  } catch (error) {
    console.error('Error toggling virtual microphone:', error);
    updateStatus('Error toggling virtual microphone: ' + error.message, true);
  }
}

// Update the status message
function updateStatus(message, isError = false) {
  if (!statusElement) return;
  
  statusElement.textContent = message;
  statusElement.style.color = isError ? 'red' : '#666';
  console.log('Status:', message);
}

// Clean up resources
function handleCleanup() {
  // Use the imported cleanup function to clean up wavtools resources
  cleanup();
  
  // Notify content script that we're disconnecting (if virtual mic was enabled)
  if (virtualMicEnabled) {
    sendMessageToContentScript({
      type: 'VIRTUAL_MIC_ENABLED',
      enabled: false
    }).catch(e => console.warn("Error notifying content script:", e));
    
    virtualMicEnabled = false;
    updateVirtualMicState();
  }
  
  isPlaying = false;
  updatePlayButtonState();
  updateStatus('Resources cleaned up');
}

// Initialize the UI and event listeners
function initUI() {
  playButton = document.getElementById('play-button');
  virtualMicToggle = document.getElementById('virtual-mic-toggle');
  statusElement = document.getElementById('status');
  
  if (playButton) {
    playButton.addEventListener('click', toggleAudio);
  }
  
  if (virtualMicToggle) {
    virtualMicToggle.addEventListener('click', toggleVirtualMic);
    updateVirtualMicState();
  } else {
    // Create virtual mic toggle if it doesn't exist
    createVirtualMicToggle();
  }
  
  updateStatus('Ready to play');
  updatePlayButtonState();
}

// Create the virtual microphone toggle button if it doesn't exist in HTML
function createVirtualMicToggle() {
  if (document.getElementById('virtual-mic-toggle')) return;
  
  const container = document.querySelector('.controls') || document.body;
  
  if (container) {
    virtualMicToggle = document.createElement('button');
    virtualMicToggle.id = 'virtual-mic-toggle';
    virtualMicToggle.className = 'control-button';
    virtualMicToggle.textContent = 'ENABLE VIRTUAL MIC';
    virtualMicToggle.style.marginTop = '10px';
    
    virtualMicToggle.addEventListener('click', toggleVirtualMic);
    container.appendChild(virtualMicToggle);
    
    updateVirtualMicState();
  }
}

// Initialize when the DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initUI();
  });
} else {
  initUI();
}

// Clean up when the page is unloaded
window.addEventListener('unload', handleCleanup);

