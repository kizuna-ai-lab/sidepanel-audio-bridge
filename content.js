console.log('Content script loaded.');

// Inject the script that will override Web Audio APIs
function injectScript(filePath) {
  const script = document.createElement('script');
  script.setAttribute('type', 'text/javascript');
  script.setAttribute('src', filePath);
  (document.head || document.documentElement).appendChild(script);
  script.onload = () => {
    console.log('Inject script loaded:', filePath);
    // script.remove(); // Keep the script tag for easier debugging of inject-script itself, or remove if preferred
  };
  script.onerror = (e) => {
    console.error('Error injecting script:', filePath, e);
  };
}

injectScript(chrome.runtime.getURL('inject-script.js'));

// Listen for messages from the background script (originating from sidepanel.js)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // console.log("Content.js: Received message from background/popup:", message.type);
  if (message.type === 'AUDIO_DATA_FROM_BACKGROUND') {
    // Forward the message to the injected script
    window.postMessage(message, '*');
  }
  // No sendResponse needed here as this is a one-way message from background to inject
  return false; 
});

console.log('Content.js: Parameter negotiation logic removed.');
