// Content script for audio bridge with virtual microphone functionality
console.log('Content script loaded.');

// Inject the virtual-microphone.js script into the page
function injectVirtualMicrophoneScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('virtual-microphone.js');
  script.onload = function() {
    console.log('Virtual microphone script injected successfully');
    this.remove(); // Remove the script element after it's loaded
  };
  (document.head || document.documentElement).appendChild(script);
}

// Inject the script as early as possible
injectVirtualMicrophoneScript();

// Handle messages directly from the side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message from side panel:', message.type);
  
  // Handle PCM data message
  if (message.type === 'PCM_DATA') {
    // Log chunk information
    if (message.chunkIndex !== undefined) {
      console.log(`Received PCM chunk ${message.chunkIndex + 1}/${message.totalChunks}, size: ${message.pcmData.length}`);
    }
    
    // Convert array back to Int16Array for processing
    const pcmData = new Int16Array(message.pcmData);
    
    // Forward PCM data to the page's virtual microphone
    window.postMessage({
      type: 'VIRTUAL_MIC_PCM_DATA',
      pcmData: pcmData,
      chunkIndex: message.chunkIndex,
      totalChunks: message.totalChunks,
      sampleRate: message.sampleRate,
      trackId: message.trackId
    }, '*');
    
    sendResponse({ success: true });
    return true;
  }
  
  // Handle virtual mic enabled/disabled message
  if (message.type === 'VIRTUAL_MIC_ENABLED') {
    console.log('Virtual microphone ' + (message.enabled ? 'enabled' : 'disabled'));
    // Forward mic state to the page
    window.postMessage({
      type: 'VIRTUAL_MIC_STATE',
      enabled: message.enabled
    }, '*');
    sendResponse({ success: true });
    return true;
  }
  
  return false;
});

// Listen for messages from the page
window.addEventListener('message', (event) => {
  // Only accept messages from the same frame
  if (event.source !== window) return;
  
  // Check if it's a message for the content script
  if (event.data.type === 'VIRTUAL_MIC_STATUS') {
    console.log('Virtual microphone status:', event.data.active);
    
    // Forward status to side panel if connected
    if (sidePanel) {
      sidePanel.postMessage({
        type: 'VIRTUAL_MIC_STATUS',
        active: event.data.active
      });
    }
  }
});

console.log('Virtual microphone bridge initialized');
