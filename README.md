# Side Panel Audio Bridge

A Chrome extension that implements audio bridging functionality between web pages and a side panel interface, enabling advanced audio processing and virtual microphone capabilities.

## 🎯 Core Features

### Audio Processing Pipeline
- **Virtual Microphone**: Creates a virtual audio input device that can be accessed by web applications
- **Audio Stream Bridge**: Establishes bidirectional audio communication between side panel and main page
- **Real-time Audio Processing**: Implements Web Audio API worklets for low-latency audio manipulation
- **WAV Stream Processing**: Handles WAV format audio streaming and recording

### Chrome Extension Architecture
- **Manifest V3 Compliance**: Built using the latest Chrome extension standards
- **Service Worker Background**: Persistent background processing with service worker
- **Content Script Injection**: Dynamic script injection into web pages at document start
- **Side Panel Integration**: Utilizes Chrome's Side Panel API for seamless UI integration

## 🌐 Web APIs & Web Audio APIs

### Core Web APIs

#### 1. MediaDevices API
```javascript
// Override native getUserMedia for virtual microphone
navigator.mediaDevices.getUserMedia = async function(constraints) {
  // Custom implementation for virtual microphone
  if (constraints.audio.deviceId === VIRTUAL_MIC_ID) {
    return virtualStream;
  }
  return originalGetUserMedia(constraints);
};

// Override device enumeration to include virtual microphone
navigator.mediaDevices.enumerateDevices = async function() {
  const devices = await originalEnumerateDevices();
  devices.push({
    deviceId: 'virtual-microphone-kizunaai',
    kind: 'audioinput',
    label: 'KizunaAI Virtual Microphone',
    groupId: ''
  });
  return devices;
};
```

#### 2. MediaStream API
- **MediaStreamTrackGenerator**: Creates synthetic audio tracks for virtual microphone
- **MediaStream**: Manages audio stream lifecycle and track composition
- **MediaStreamTrack**: Individual audio track management and control

```javascript
// Create virtual audio track using MediaStreamTrackGenerator
trackGenerator = new MediaStreamTrackGenerator({ kind: 'audio' });
audioWriter = trackGenerator.writable.getWriter();
virtualStream = new MediaStream([trackGenerator]);
```

#### 3. Insertable Streams API
- **WritableStream**: Handles real-time audio data injection
- **AudioData**: Represents raw audio frames for processing

```javascript
// Write audio data to virtual microphone stream
const audioData = new AudioData({
  format: 'f32',
  sampleRate: 44100,
  numberOfFrames: frameCount,
  numberOfChannels: 1,
  timestamp: timestampUs,
  data: floatAudioData
});

await audioWriter.write(audioData);
```

### Web Audio API Implementation

#### 1. AudioContext & Audio Processing
```javascript
// Audio format conversion and processing
function processAndWriteAudioData(pcmData, sampleRate) {
  // Convert Int16Array to Float32Array for Web Audio API
  const floatData = new Float32Array(pcmData.length);
  for (let i = 0; i < pcmData.length; i++) {
    floatData[i] = pcmData[i] / 32768.0; // Normalize to [-1.0, 1.0]
  }
  
  // Create AudioData for streaming
  const audioData = new AudioData({
    format: 'f32',
    sampleRate: sampleRate,
    numberOfFrames: floatData.length,
    numberOfChannels: 1,
    timestamp: performance.now() * 1000,
    data: floatData
  });
}
```

#### 2. Audio Worklets (Referenced in manifest)
- **AudioWorkletProcessor**: Custom audio processing nodes
- **Real-time Processing**: Low-latency audio manipulation
- **Worklet Registration**: Dynamic worklet loading and execution

```javascript
// Worklet files referenced in web_accessible_resources
"worklets/*"  // Custom audio worklet processors
"analysis/*"  // Audio analysis worklets
```

#### 3. Audio Buffer Management
- **Chunked Processing**: Handles large audio buffers efficiently
- **Timestamp Synchronization**: Maintains audio timing accuracy
- **Buffer Optimization**: Prevents audio dropouts and glitches

```javascript
// Chunked audio processing for smooth playback
const framesPerChunk = sampleRate * 1; // 1 second chunks
const chunkDurationUs = (numberOfFrames / sampleRate) * 1000000;
setTimeout(writeNextChunk, chunkDurationUs / 1000);
```

### Advanced Audio Features

#### 1. PCM Data Processing
```javascript
// PCM data capture and forwarding
window.addEventListener('pcm-data-capture', (event) => {
  const { pcmData, sampleRate, trackId } = event.detail;
  
  // Chunk large PCM data for efficient transmission
  const CHUNK_SIZE = 16000; // ~1/3 second at 48kHz
  for (let i = 0; i < pcmData.length; i += CHUNK_SIZE) {
    const chunk = pcmData.slice(i, Math.min(i + CHUNK_SIZE, pcmData.length));
    sendPCMChunk(chunk, i / CHUNK_SIZE, Math.ceil(pcmData.length / CHUNK_SIZE));
  }
});
```

#### 2. Audio Format Support
- **Sample Rates**: 8kHz - 48kHz support
- **Bit Depths**: 16-bit PCM to 32-bit float conversion
- **Channel Configuration**: Mono and stereo audio processing
- **Format Conversion**: Real-time PCM to Float32 conversion

#### 3. Timing and Synchronization
```javascript
// Precise audio timing for virtual microphone
let currentTimestampUs = performance.now() * 1000;
const chunkDurationUs = (numberOfFrames / sampleRate) * 1000000;
currentTimestampUs += chunkDurationUs;
```

### Browser Compatibility Requirements

#### Chrome Extension APIs
- **Minimum Chrome Version**: 114+ (Side Panel API)
- **Manifest V3**: Service Worker architecture
- **Scripting API**: Dynamic script injection
- **Tabs API**: Cross-tab communication

#### Web Audio API Requirements
- **MediaStreamTrackGenerator**: Chrome 98+
- **Insertable Streams**: Chrome 94+
- **AudioWorklet**: Chrome 66+
- **Web Audio API**: Full implementation required

#### Security Considerations
- **Content Security Policy**: Allows `'wasm-unsafe-eval'` for audio processing
- **Cross-Origin Isolation**: Required for SharedArrayBuffer (if used)
- **Secure Context**: HTTPS required for MediaDevices API

```json
// CSP configuration in manifest.json
"content_security_policy": {
  "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
}
```

## 🏗️ Technical Architecture

### Extension Components

#### 1. Service Worker (`background.js`)
- Manages extension lifecycle and state
- Handles inter-component message routing
- Coordinates side panel and content script communication

#### 2. Content Script (`content.js`)
- Injects at `document_start` for early DOM access
- Bridges communication between web page and extension
- Manages script injection into page context

#### 3. Injected Scripts (`inject-script.js`)
- Runs in page context with full DOM access
- Implements virtual microphone functionality
- Handles Web Audio API integration

#### 4. Side Panel Interface (`sidepanel.html` + `sidepanel.js`)
- Provides user interface for audio control
- Manages audio stream configuration
- Real-time audio processing controls

### Audio Processing Components

#### Virtual Microphone (`virtual-microphone.js`)
```javascript
// Creates virtual audio input device
class VirtualMicrophone {
  // Implements MediaStream API
  // Provides getUserMedia() override
  // Manages audio routing
}
```

#### WAV Stream Player (`wav_stream_player.js`)
- Real-time WAV audio streaming
- Buffer management for low-latency playback
- Audio format conversion and processing

#### Audio Worklets (`worklets/`)
- Custom AudioWorkletProcessor implementations
- Real-time audio analysis and manipulation
- Low-latency audio processing pipeline

## 🔧 Implementation Details

### Manifest Configuration
```json
{
  "manifest_version": 3,
  "permissions": [
    "activeTab",      // Access to current tab
    "scripting",      // Script injection capabilities
    "sidePanel"       // Side panel API access
  ],
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content.js"],
    "run_at": "document_start"
  }],
  "web_accessible_resources": [
    "inject-script.js",
    "virtual-microphone.js",
    "wav_stream_player.js",
    "worklets/*",
    "analysis/*"
  ]
}
```

### Content Security Policy
- Allows `'wasm-unsafe-eval'` for WebAssembly audio processing
- Restricts script sources to extension context
- Enables secure audio worklet execution

### Message Passing Architecture
```javascript
// Background ↔ Content Script
chrome.runtime.sendMessage({
  type: 'AUDIO_BRIDGE_COMMAND',
  payload: audioData
});

// Content Script ↔ Injected Script
window.postMessage({
  source: 'AUDIO_BRIDGE',
  data: streamData
}, '*');
```

## 🎵 Audio Features

### Virtual Microphone Implementation
- **MediaStream Override**: Replaces native `getUserMedia()` with virtual implementation
- **Audio Routing**: Routes audio from side panel to web applications
- **Format Support**: Handles multiple audio formats and sample rates
- **Latency Optimization**: Minimizes audio delay through efficient buffering

### Real-time Processing
- **Web Audio Worklets**: Custom audio processors for real-time manipulation
- **Stream Analysis**: Audio level monitoring and frequency analysis
- **Buffer Management**: Efficient audio buffer handling for smooth playback

### Cross-Origin Audio Handling
- **CORS Compliance**: Handles cross-origin audio resource access
- **Security Context**: Maintains secure audio processing boundaries
- **Resource Management**: Efficient cleanup of audio resources

## 🔍 Development Architecture

### File Structure
```
sidepanel-audio-bridge/
├── manifest.json              # Extension manifest
├── background.js              # Service worker
├── content.js                 # Content script
├── sidepanel.html            # Side panel UI
├── sidepanel.js              # Side panel logic
├── inject-script.js          # Page context injection
├── virtual-microphone.js     # Virtual mic implementation
├── wav_stream_player.js      # Audio streaming
├── index.js                  # Main entry point
├── worklets/                 # Audio worklet processors
├── analysis/                 # Audio analysis modules
└── lib/                      # Utility libraries
```

### Key Technical Components

#### 1. Audio Bridge Protocol
- Custom message protocol for audio data transfer
- Efficient binary data handling
- Real-time synchronization mechanisms

#### 2. Virtual Device Management
- Dynamic virtual microphone creation
- Device enumeration and selection
- Audio constraint handling

#### 3. Stream Processing Pipeline
- Input audio capture from side panel
- Real-time processing and effects
- Output routing to web applications

## 🛠️ Browser Compatibility

### Chrome Requirements
- **Minimum Version**: Chrome 114+ (for Side Panel API)
- **Required APIs**: Web Audio API, MediaStream API, AudioWorklet
- **Extension APIs**: Manifest V3, Service Workers, Content Scripts

### Audio API Support
- **Web Audio API**: Full implementation required
- **MediaStream API**: getUserMedia() override capability
- **AudioWorklet**: Real-time audio processing support

## 🔧 Installation & Setup

### Development Installation
1. Clone the repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the project directory
5. The extension will be loaded and ready for use

### Usage
1. Click the extension icon to open the side panel
2. Configure audio settings in the side panel interface
3. Navigate to web applications that request microphone access
4. The virtual microphone will be available as an audio input option

## 🎛️ Configuration Options

### Audio Settings
- Sample rate configuration (8kHz - 48kHz)
- Buffer size optimization
- Audio quality settings
- Latency compensation

### Virtual Device Settings
- Device name customization
- Audio constraints configuration
- Stream format selection

---

**Note**: This extension requires Chrome 114+ for Side Panel API support and full Web Audio API compatibility.