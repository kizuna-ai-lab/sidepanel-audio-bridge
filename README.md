# Side Panel Audio Bridge Chrome Extension

## Description

This Chrome extension is a **sample project** demonstrating how to capture audio from a source within its side panel (currently an MP3 file) and makes it available as a virtual microphone input to the main web page. This allows web applications on the main page to use the audio originating from the side panel as if it were a standard microphone.

## Features

- **Audio Piping**: Relays audio from the Chrome side panel to the active tab.
- **Virtual Microphone**: Overrides `navigator.mediaDevices.getUserMedia` and `navigator.mediaDevices.enumerateDevices` on the main page to present the side panel's audio as a selectable microphone source named "Side Panel Audio Output".
- **Fixed Audio Parameters**: The virtual microphone provides audio at a fixed sample rate of 48000 Hz and a single (mono) channel, simplifying audio handling.
- **MP3 Audio Source**: Currently uses a `test-tone.mp3` file as the audio source in the side panel, playing in a loop.

## How It Works

The extension consists of several components:

1.  **Side Panel (`sidepanel.html`, `sidepanel.js`)**: 
    *   Loads and plays an audio source (e.g., `test-tone.mp3`).
    *   Uses the Web Audio API to capture this audio.
    *   Connects to `background.js` via a long-lived port (`audioBridge`) to stream the captured audio data.

2.  **Background Script (`background.js`)**: 
    *   Manages the opening of the side panel.
    *   Listens for connections on the `audioBridge` port from `sidepanel.js`.
    *   Receives audio data chunks from the side panel and forwards them to the content script of the active tab.

3.  **Content Script (`content.js`)**: 
    *   Injects `inject-script.js` into the main web page.
    *   Listens for audio data messages from `background.js` and posts them to `inject-script.js` using `window.postMessage()`.

4.  **Inject Script (`inject-script.js`)**: 
    *   Runs in the context of the main web page.
    *   Overrides `navigator.mediaDevices.getUserMedia` and `navigator.mediaDevices.enumerateDevices`.
    *   When `getUserMedia` is called for the virtual device, it creates an `AudioContext` with fixed parameters (48kHz, mono) and an `AudioBufferSourceNode` that is fed by a queue.
    *   Listens for `AUDIO_DATA_FROM_BACKGROUND` messages (forwarded by `content.js`) containing audio chunks from the side panel.
    *   Buffers these chunks and plays them back through the `ScriptProcessorNode` (or an `AudioWorkletNode` in future versions) that acts as the virtual microphone's audio stream.

## Setup and Installation

1.  **Clone the Repository (if you haven't already)**:
    ```bash
    git clone <your-repository-url>
    cd sidepanel-audio-bridge
    ```

2.  **Place Audio File**: 
    *   Ensure you have an MP3 file named `test-tone.mp3` in the root directory of the extension (`/home/jiangzhuo/Desktop/kizunaai/sidepanel-audio-bridge/test-tone.mp3`).

3.  **Load the Extension in Chrome**:
    *   Open Chrome and navigate to `chrome://extensions`.
    *   Enable "Developer mode" (usually a toggle in the top right).
    *   Click on "Load unpacked".
    *   Select the directory where you cloned/downloaded the extension files (e.g., `/home/jiangzhuo/Desktop/kizunaai/sidepanel-audio-bridge`).

## Usage

1.  Navigate to any web page where you want to use the virtual microphone.
2.  Click the extension icon in the Chrome toolbar to open the side panel. The audio from `test-tone.mp3` should start playing within the side panel's context.
3.  On the main web page, if the site attempts to access microphone devices (e.g., via a "select microphone" dropdown or by calling `navigator.mediaDevices.getUserMedia`), you should see "Side Panel Audio Output" as an option.
4.  Selecting this virtual microphone will allow the main page to receive the audio originating from the side panel.

## Key Files

-   `manifest.json`: Defines the extension's properties, permissions, and components.
-   `sidepanel.html`: The HTML structure for the side panel.
-   `sidepanel.js`: Manages audio playback and capture within the side panel.
-   `background.js`: Handles communication between the side panel and content scripts, and manages the side panel itself.
-   `content.js`: Injects the `inject-script.js` and acts as a message bridge for audio data.
-   `inject-script.js`: Runs in the main page's context, overrides Web Audio API methods, and reconstructs the audio stream.
-   `test-tone.mp3`: The audio file used as the source in the side panel (you need to provide this).

## Development Notes

-   The `inject-script.js` currently uses a fixed sample rate of 48000 Hz and 1 channel (mono) for its `AudioContext`. The audio data from the side panel is expected to be in this format or will be effectively resampled/processed by the browser's Web Audio API internals.
-   The use of `ScriptProcessorNode` in `inject-script.js` is for simplicity in this version. For more robust and performant audio processing, especially to avoid potential audio glitches under heavy load, future versions should consider migrating to `AudioWorkletNode`.
