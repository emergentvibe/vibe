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
```

### Embedding Strategy Update (Important)
After evaluating the cost-benefit tradeoffs, we've decided to replace the OpenAI API with a browser-based embedding solution using Hugging Face's transformers.js library. This change offers several advantages:

1. **No API Costs**: Eliminates ongoing expenses associated with API calls
2. **Privacy**: All text processing happens locally in the user's browser
3. **Offline Capability**: Can function without internet connection after initial model download
4. **Reduced Latency**: Avoids network requests for faster results

We'll be using the "Xenova/all-MiniLM-L6-v2" model, which is a lightweight but powerful embedding model optimized for semantic search applications. The model will be loaded asynchronously and cached for subsequent searches.

### Next Steps
- Implement Hugging Face transformers.js for client-side embeddings
- Highlight matched content in the page
- Scroll to result in the page when selected
- Cache system for storing embeddings across page visits
- Performance optimizations

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
- ⬜ Integrate transformers.js from Hugging Face
- ⬜ Implement model caching and lazy loading
- ⬜ Add batched processing for efficient embedding generation

**Updated Implementation Plan for `embedding-service.ts`:**
```typescript
// Updated design using transformers.js
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
      'Xenova/bge-small-en-v1.5'
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

### 1.5 Data Flow Architecture ✅
- ✅ Process content in batches to handle large pages
- ✅ Implement dynamic imports for performance
- ✅ Create vector similarity search functionality
- ✅ Handle search state and result navigation

**Implemented search flow:**
```typescript
// Search implementation
async function performSearch(query: string) {
  // Extract content chunks from the page
  const chunks = extractTextChunks();
  
  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);
  
  // Process chunks in batches with progress updates
  for (each batch of chunks) {
    // Generate embeddings for each chunk
    // Calculate similarity to query
    // Store results above threshold
  }
  
  // Sort results by similarity
  // Display top matches in the UI
}
```

### 1.6 Integration Strategy ✅
- ✅ Create new module structure to encapsulate functionality
- ✅ Define clear interfaces between existing code and new feature
- ✅ Implement feature flags for gradual rollout
- ⬜ Use Shadow DOM for UI components to prevent style conflicts

## Next Development Focus

### 1. Browser-Based Embedding Implementation
- Integrate transformers.js library from Hugging Face
- Implement model loading and caching mechanism
- Set up error handling and fallbacks
- Add progress feedback for model download

### 2. Result Highlighting
- Highlight matched content in the page
- Scroll to and focus on selected result
- Add visual indicators for matching sections

### 3. Performance Optimization
- Implement persistent caching mechanism for embeddings
- Add background processing for large pages
- Optimize chunking for different content types
- Add progress indicators for search operation
