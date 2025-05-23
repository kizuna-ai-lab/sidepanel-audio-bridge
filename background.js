// Background script for sidepanel functionality
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Error setting panel behavior:', error));

console.log('Background script loaded');

// The side panel will communicate directly with content scripts
// No need for the background script to act as a message broker

// Note: The chrome.sidePanel.onShown and chrome.sidePanel.onHidden events
// are not fully supported in the current Chrome extensions API version.
// We'll use the basic sidePanel functionality without event listeners.
