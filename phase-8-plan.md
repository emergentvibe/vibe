# Phase 8: Semantic Control-F Implementation Plan

## Overview
This document outlines the implementation strategy for adding a semantic search capability to the Vibe extension. This feature will allow users to search for content that is semantically related to their query, not just exact text matches.

## Implementation Progress

### Completed Features
- ✅ Basic architecture and module structure setup
- ✅ Keyboard shortcut implementation (Option-F on Mac, Alt-F on Windows)
- ✅ Support for Mac-specific Option+F character "ƒ"
- ✅ Basic UI for search overlay with input field
- ✅ Text chunking utility to extract content from the page
- ✅ DOM traversal and text extraction
- ✅ Integration with content script and page lifecycle
- ✅ Results UI with navigation controls
- ✅ Loading state and status indicators
- ✅ Vector similarity comparison
- ✅ Smart text chunking with size limits and overlap
- ✅ Real semantic search with result ranking
- ✅ Enter key to trigger search (instead of searching while typing)
- ✅ "Press Enter to search" indicator when user types
- ✅ Immediate content processing on Alt-F press
- ✅ Detailed progress indicators for model loading
- ✅ Progressive embedding generation with percentage feedback
- ✅ Improved error handling and user feedback
- ✅ Shared embeddings across repeated searches
- ✅ Offscreen document implementation for persistent model loading
- ✅ Background to content script communication for embeddings
- ✅ Worker blocking solution for Hugging Face transformers.js

### Current Structure
```
src/
  semantic-search/
    services/
      embedding-service.ts
    utils/
      text-chunker.ts
    types.ts
    semantic-search.ts  # Main entry point
  background/
    index.ts            # Background script with messaging
  offscreen.ts          # Offscreen document for model hosting
```

### Embedding Strategy Update (Important)
After evaluating the cost-benefit tradeoffs, we've decided to replace the OpenAI API with a browser-based embedding solution using Hugging Face's transformers.js library. This change offers several advantages:

1. **No API Costs**: Eliminates ongoing expenses associated with API calls
2. **Privacy**: All text processing happens locally in the user's browser
3. **Offline Capability**: Can function without internet connection after initial model download
4. **Reduced Latency**: Avoids network requests for faster results

We'll be using the "Xenova/all-MiniLM-L6-v2" model, which is a lightweight but powerful embedding model optimized for semantic search applications. The model will be loaded asynchronously and cached for subsequent searches.

### Performance Improvement Plan
We've implemented several improvements to enhance the user experience:

#### 1. Immediate Processing on Alt-F
- ✅ Text extraction and processing starts as soon as Alt-F is pressed
- ✅ Three-phase process with clear feedback at each step:
  - Analysis of page content (extract text chunks)
  - Loading AI model (with percentage progress)
  - Generating embeddings (with percentage progress)

#### 2. Detailed Progress Feedback
- ✅ Progress percentage shown during model loading
- ✅ Progress percentage shown during embedding generation
- ✅ Specific status messages that accurately describe the current process
- ✅ Different visual states for loading, ready, and error conditions

#### 3. Robust Error Handling
- ✅ Better validation when search is attempted before ready
- ✅ Context-specific feedback based on current processing phase
- ✅ NaN progress handling for better user experience

#### 4. Memory Optimization
- ✅ Store chunks and embeddings for reuse across searches
- ✅ Only calculate new embeddings as needed

#### 5. Worker Blocking Solution
- ✅ Implemented early worker blocking in the offscreen document
- ✅ Created robust proxy object for model access patterns
- ✅ Added debugging and inspection tools for tracing issues
- ✅ Improved communication between content scripts and background

```typescript
// Early Worker Blocking Strategy
// In offscreen document HTML
<script>
  // CRITICAL: Block worker creation BEFORE any other scripts load
  window._originalWorker = window.Worker;
  window.Worker = function DummyWorker() { 
    console.log('Blocked attempt to create Worker');
    return { /* dummy object */ };
  };
</script>

// Robust Proxy for Model Access
function createModelProxy() {
  return new Proxy(function() {}, {
    get: function(target, prop) {
      // Handle various property access patterns
      // ...
    },
    apply: function(target, thisArg, args) {
      // Handle direct function calls
      return generateEmbeddingViaBackground(args[0]);
    }
  });
}
```

### Next Steps (Updated)
1. ✅ **Browser Startup Model Loading**
   - ✅ Implement model initialization in offscreen document
   - ✅ Create detailed message passing between content scripts and background
   - ✅ Implement robust proxy for model access
   - ✅ Add worker blocking solution for Chrome extension environment

2. **Website Embedding Cache**
   - Implement persistent storage for website embeddings
   - Add URL hashing and timestamp mechanisms
   - Create LRU cache for managing storage limits
   - Integrate with the semantic search flow

3. **UI and Interaction Improvements**
   - Highlight matched content in the page
   - Scroll to results in the page when selected
   - Add keyboard shortcuts for navigating results

## Persistent Model Loading Plan

### Offscreen Document Approach (Implemented)
We've successfully implemented a persistent model using Chrome's offscreen document API:

1. **Offscreen Document Implementation** ✅
   - Created an offscreen document that loads once and persists
   - Implemented early Worker blocking to prevent errors
   - Added robust error handling and debugging

2. **Message Passing System** ✅
   ```typescript
   // In background.ts
   chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
     if (request.type === 'GENERATE_EMBEDDING') {
       // Forward to offscreen document
       chrome.runtime.sendMessage(request)
         .then(response => sendResponse(response))
         .catch(error => sendResponse({ error: error.message }));
       
       return true; // Indicates async response
     }
   });
   
   // In offscreen.ts
   chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
     if (message.type === 'GENERATE_EMBEDDING') {
       generateEmbedding(message.text)
         .then(embedding => sendResponse({ embedding }))
         .catch(error => sendResponse({ error: error.message }));
       
       return true; // Indicates async response
     }
   });
   ```

3. **Content Script Integration** ✅
   ```typescript
   // In embedding-service.ts
   async function generateEmbeddingViaBackground(text: string): Promise<number[]> {
     return new Promise((resolve, reject) => {
       chrome.runtime.sendMessage(
         { type: 'GENERATE_EMBEDDING', text },
         (response) => {
           if (chrome.runtime.lastError) {
             reject(new Error(chrome.runtime.lastError.message));
           } else if (response.error) {
             reject(new Error(response.error));
           } else {
             resolve(response.embedding);
           }
         }
       );
     });
   }
   ```

### Worker Blocking Solution
We encountered and solved a critical issue with Web Workers in Chrome Extensions:

1. **Problem**: Transformers.js attempts to create Web Workers, which face restrictions in Chrome Extensions and cause errors.

2. **Solution Components**:
   - ✅ Early worker blocking by replacing the Worker constructor before any scripts load
   - ✅ Robust proxy object for model access that handles various access patterns
   - ✅ Detailed debugging to trace message flow and identify issues
   - ✅ Improved communication with error handling between contexts

3. **Results**:
   - Successful embedding generation for hundreds of text chunks
   - Consistent performance across different websites
   - Graceful handling of worker creation attempts
   - Reliable communication between content scripts and offscreen document

## Original Plan

## Step 1: Design & Architecture

### 1.1 Keyboard Shortcut Implementation ✅
- Register keyboard shortcuts: Option-F (Mac) and Alt-F (Windows)
- Implement event listeners in content script
- Handle platform detection (Mac vs Windows)
- Ensure no conflict with existing browser shortcuts
- Provide fallback mechanism if shortcut is already in use

```typescript
// Keyboard shortcut registration
const isMac = navigator.platform.toLowerCase().includes('mac');
const KEYBOARD_SHORTCUT = {
  key: 'f',
  modifier: isMac ? 'Alt' : 'Alt', // Option key on Mac registers as Alt
  display: isMac ? 'Option-F' : 'Alt-F'
};

// Event listener
document.addEventListener('keydown', (e) => {
  // On Mac, Option+F produces "ƒ" character, so we need to check for both
  if ((e.key.toLowerCase() === KEYBOARD_SHORTCUT.key || (isMac && e.key === 'ƒ')) && e.altKey) {
    e.preventDefault(); // Prevent default browser behavior
    toggleSemanticSearch();
  }
});
```

### 1.2 UI Design for Semantic Search ✅
- ✅ Create floating search input that appears on shortcut press
- ✅ Design results overlay that shows matching content
- ✅ Style UI elements with clean, minimal design
- ✅ Create navigation controls between results
- ✅ Add "Press Enter to search" indicator for better UX

**Current Implementation:**
```typescript
// UI Components
- searchOverlayElement: Main container with search and results
- searchInputContainer: Container for search input and icon
- statusIndicator: Shows search status and loading state
- resultsContainer: Lists the search results
- navigationControls: Buttons for navigating between results
- enterToSearchPrompt: Indicator showing "Press Enter to search" when typing

// Navigation Controls
- Previous/Next buttons for result navigation
- Result counter showing current position (e.g., "2 of 5")
- Keyboard navigation with arrow keys

// Result Items
- Each result shows the text and similarity score
- Results highlight on selection
- Clicking a result activates it

// Search Behavior
- Search only triggers on Enter key press for more controlled experience
- Input changes don't automatically trigger search
- Clear indicator to users when search is ready
```

### 1.3 Content Processing Architecture ✅
- ✅ Define chunking strategies (paragraph-based, semantic-based)
- ✅ Create DOM traversal utility to extract content
- ✅ Define chunk size limits and overlapping strategy
- ✅ Text chunk extraction and normalization

**Implemented in `text-chunker.ts`:**
```typescript
export function extractTextChunks(options = DEFAULT_OPTIONS): TextChunk[] {
  // Get all text-containing elements
  const textNodes = getTextNodes(options.excludeSelectors);
  
  // Extract raw text from each element
  const rawChunks = extractRawChunks(textNodes);
  
  // Process raw chunks into semantic chunks
  const chunks = processChunks(rawChunks, options);
  
  return chunks;
}
```

### 1.4 Embedding Generation Architecture (Updated) ⏳
- ✅ Design embedding service interface
- ✅ Integrate transformers.js from Hugging Face
- ⬜ Implement model caching and lazy loading
- ⬜ Add batched processing for efficient embedding generation

**Current Implementation in `embedding-service.ts`:**
```typescript
// Using transformers.js
import { pipeline } from '@xenova/transformers';

// Model caching
let embeddingModel: any = null;

// Result caching
const embeddingCache: Record<string, number[]> = {};

// Get or initialize the model
async function getEmbeddingModel() {
  if (!embeddingModel) {
    embeddingModel = await pipeline(
      'feature-extraction', 
      'Xenova/all-MiniLM-L6-v2'
    );
  }
  return embeddingModel;
}

// Generate embeddings
export async function generateEmbedding(text: string): Promise<number[]> {
  // Check cache first
  const cacheKey = getCacheKey(text);
  if (embeddingCache[cacheKey]) {
    return embeddingCache[cacheKey];
  }
  
  // Get model and generate embedding
  const model = await getEmbeddingModel();
  const output = await model(text, { pooling: 'mean', normalize: true });
  const embedding = Array.from(output.data);
  
  // Cache and return
  embeddingCache[cacheKey] = embedding;
  return embedding;
}
```

### 1.5 Planned Cache Implementation
```typescript
// In embedding-cache.ts
interface CachedPage {
  url: string;
  timestamp: number;
  chunks: TextChunk[];
  embeddings: Record<string, number[]>;
}

// LRU Cache for pages
const MAX_CACHED_PAGES = 50;
const pageCache: Map<string, CachedPage> = new Map();

// Store page in cache
export async function cachePage(url: string, chunks: TextChunk[], embeddings: Record<string, number[]>) {
  const urlHash = hashUrl(url);
  
  // Create cache entry
  const cacheEntry: CachedPage = {
    url,
    timestamp: Date.now(),
    chunks,
    embeddings
  };
  
  // Add to cache
  pageCache.set(urlHash, cacheEntry);
  
  // Trim cache if needed
  if (pageCache.size > MAX_CACHED_PAGES) {
    // Remove oldest entry
    const oldestKey = [...pageCache.keys()]
      .sort((a, b) => pageCache.get(a)!.timestamp - pageCache.get(b)!.timestamp)[0];
    pageCache.delete(oldestKey);
  }
  
  // Persist to storage
  await persistCacheToStorage();
}

// Check if page is in cache
export function getPageFromCache(url: string): CachedPage | null {
  const urlHash = hashUrl(url);
  const cachedPage = pageCache.get(urlHash);
  
  if (cachedPage) {
    // Update timestamp (mark as recently used)
    cachedPage.timestamp = Date.now();
    return cachedPage;
  }
  
  return null;
}
```
