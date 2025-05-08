chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Error setting panel behavior:',error));

chrome.runtime.onConnect.addListener(function(port) {
  if (port.name === "audioBridge") {
    console.log("Background: Sidepanel connected on 'audioBridge' port.");
    port.onMessage.addListener(function(msg) {
      if (msg.type === "AUDIO_DATA_FROM_SIDEPANEL") {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          if (tabs.length > 0 && tabs[0] && tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: "AUDIO_DATA_FROM_BACKGROUND",
              audioData: msg.audioData
            }).catch(error => {
              // This can happen if the content script is not ready or the tab is closed.
              // console.warn(`Background: Failed to send audio data to tab ${tabs[0].id}: ${error.message}`);
            });
          }
        });
      }
    });
    port.onDisconnect.addListener(() => {
      console.log("Background: 'audioBridge' port disconnected.");
      // Handle potential cleanup or reconnection logic if necessary
    });
  }
});

// Removed chrome.runtime.onMessage listener for parameter requests
// as inject-script.js now uses fixed parameters.
console.log('Background.js: Parameter negotiation logic removed.');
