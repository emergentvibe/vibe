# Phase 10: Semantic Bookmark Search Implementation Plan

## Overview
This document outlines the implementation strategy for adding semantic bookmark search to the Vibe extension. This feature will allow users to semantically search their own bookmarks, with processing done entirely client-side using local embedding models to avoid API costs.

## Core Components

### 1. Bookmark Access System
- Access user's bookmarks through browser APIs
- Create a robust permission system for bookmark access
- Handle different browser bookmarking structures (Chrome, Arc, etc.)
- Implement bookmark addition and sync

### 2. Bookmark Embedding System
- Process bookmarks in the background to generate embeddings
- Store embeddings locally for fast retrieval
- Update embeddings when bookmarks are added
- Gracefully handle large bookmark collections

### 3. UI Enhancements
- Add toggle switch between "Web Search" and "Bookmark Search" within existing search interface
- Implement settings page for bookmark processing controls
- Design bookmark-specific result display
- Ensure seamless switching between search modes

### 4. Integration with Existing Search
- Modify Exa search function to check if query should use local bookmarks
- Implement fallback mechanisms if bookmark embeddings aren't available
- Preserve search history across both types of searches

## Implementation Strategy

### Bookmark API Access
```typescript
// Types for bookmark handling
interface BookmarkNode {
  id: string;
  title: string;
  url?: string;
  dateAdded?: number;
  children?: BookmarkNode[];
  parentId?: string;
}

interface ProcessedBookmark {
  id: string;
  title: string;
  url: string;
  dateAdded: number;
  embedding?: number[];
  processedAt?: number;
  excerpt?: string;
  tags?: string[];
}

// Accessing bookmarks from Chrome
async function getBookmarks(): Promise<BookmarkNode[]> {
  return new Promise((resolve) => {
    chrome.bookmarks.getTree((bookmarkTreeNodes) => {
      resolve(bookmarkTreeNodes);
    });
  });
}

// Flattening bookmark tree structure
function flattenBookmarks(bookmarkTreeNodes: BookmarkNode[]): ProcessedBookmark[] {
  const bookmarks: ProcessedBookmark[] = [];
  
  function traverse(nodes: BookmarkNode[]) {
    for (const node of nodes) {
      if (node.url) {
        bookmarks.push({
          id: node.id,
          title: node.title,
          url: node.url,
          dateAdded: node.dateAdded || Date.now(),
        });
      }
      
      if (node.children) {
        traverse(node.children);
      }
    }
  }
  
  traverse(bookmarkTreeNodes);
  return bookmarks;
}
```

### Bookmark Embedding and Storage
```typescript
// Local storage for bookmark embeddings
interface BookmarkEmbeddingData {
  version: number;
  lastUpdated: number;
  bookmarks: {
    [id: string]: {
      url: string;
      title: string;
      embedding: number[];
      processedAt: number;
      excerpt: string;
    }
  }
}

// Process bookmarks in batches
async function processBookmarks(options: { force?: boolean } = {}): Promise<void> {
  // Get all bookmarks
  const bookmarkTree = await getBookmarks();
  const bookmarks = flattenBookmarks(bookmarkTree);
  
  // Get existing embedding data
  const existingData = await getBookmarkEmbeddings() || {
    version: 1,
    lastUpdated: 0,
    bookmarks: {}
  };
  
  // Determine which bookmarks need processing
  const toProcess = bookmarks.filter(bookmark => {
    if (options.force) return true;
    const existing = existingData.bookmarks[bookmark.id];
    return !existing || (bookmark.dateAdded > existing.processedAt);
  });
  
  // Update progress in UI
  updateBookmarkProcessingStatus({
    total: toProcess.length,
    processed: 0,
    inProgress: true
  });
  
  // Process in batches of 5 to avoid blocking the UI
  const batchSize = 5;
  for (let i = 0; i < toProcess.length; i += batchSize) {
    const batch = toProcess.slice(i, i + batchSize);
    await processBookmarkBatch(batch, existingData);
    
    // Update progress
    updateBookmarkProcessingStatus({
      total: toProcess.length,
      processed: i + batch.length,
      inProgress: i + batch.length < toProcess.length
    });
    
    // Allow UI to update by deferring to next tick
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  // Save the updated data
  existingData.lastUpdated = Date.now();
  await saveBookmarkEmbeddings(existingData);
  
  // Final status update
  updateBookmarkProcessingStatus({
    total: toProcess.length,
    processed: toProcess.length,
    inProgress: false
  });
}

// Process a batch of bookmarks
async function processBookmarkBatch(
  bookmarks: ProcessedBookmark[],
  data: BookmarkEmbeddingData
): Promise<void> {
  // Process each bookmark in parallel
  await Promise.all(bookmarks.map(async (bookmark) => {
    try {
      // Fetch page content (if possible)
      const content = await fetchPageContent(bookmark.url);
      
      // Generate embedding using the local model (same as semantic search)
      const embedding = await generateEmbedding(content.text);
      
      // Extract excerpt
      const excerpt = extractExcerpt(content.text, 150);
      
      // Store in data structure
      data.bookmarks[bookmark.id] = {
        url: bookmark.url,
        title: bookmark.title,
        embedding,
        processedAt: Date.now(),
        excerpt
      };
    } catch (error) {
      console.error(`Error processing bookmark: ${bookmark.url}`, error);
      // Store minimal information on error
      data.bookmarks[bookmark.id] = {
        url: bookmark.url,
        title: bookmark.title,
        embedding: [],
        processedAt: Date.now(),
        excerpt: "Error processing bookmark content."
      };
    }
  }));
}
```

### UI for Bookmark Search
```typescript
// Add bookmark toggle to existing search interface
function enhanceSearchWithBookmarkToggle(searchContainer: HTMLElement): void {
  // Create toggle for search type
  const searchToggle = document.createElement('div');
  searchToggle.className = 'vibe-search-toggle';
  searchToggle.innerHTML = `
    <div class="vibe-toggle-wrapper">
      <button class="vibe-toggle-btn active" data-search-type="web">
        Web
      </button>
      <button class="vibe-toggle-btn" data-search-type="bookmarks">
        Bookmarks
      </button>
    </div>
  `;
  
  // Insert toggle before the search input
  const searchInput = searchContainer.querySelector('.vibe-search-input-container');
  if (searchInput) {
    searchInput.parentNode?.insertBefore(searchToggle, searchInput);
  }
  
  // Add bookmark processing status indicator
  const processingStatus = document.createElement('div');
  processingStatus.className = 'vibe-bookmark-processing-status';
  processingStatus.style.display = 'none';
  searchContainer.appendChild(processingStatus);
  
  // Add event listeners for toggle switching
  const toggleButtons = searchToggle.querySelectorAll('.vibe-toggle-btn');
  toggleButtons.forEach(button => {
    button.addEventListener('click', () => {
      toggleButtons.forEach(b => b.classList.remove('active'));
      button.classList.add('active');
      const searchType = button.getAttribute('data-search-type');
      handleSearchTypeChange(searchType);
      
      // Update placeholder based on search type
      const input = searchContainer.querySelector('input');
      if (input) {
        input.placeholder = searchType === 'bookmarks' 
          ? 'Search your bookmarks...' 
          : 'Search the web...';
      }
    });
  });
}

// Handle search type change
function handleSearchTypeChange(searchType: string): void {
  // Store the current search type preference
  localStorage.setItem('vibe-search-type', searchType);
  
  // If switching to bookmarks, check if bookmarks are processed
  if (searchType === 'bookmarks') {
    checkBookmarkStatus();
  }
  
  // Clear current results to prepare for new search type
  const resultsContainer = document.querySelector('.vibe-results-container');
  if (resultsContainer) {
    resultsContainer.innerHTML = '';
  }
  
  // If there's a current query, re-run it with the new search type
  const searchInput = document.querySelector('.vibe-search-input') as HTMLInputElement;
  if (searchInput && searchInput.value.length >= 3) {
    performSidebarSearch(searchInput.value, searchType);
  }
}

// Settings page for bookmark processing
function createBookmarkSettingsPage(): HTMLElement {
  const settingsContainer = document.createElement('div');
  settingsContainer.className = 'vibe-settings-container';
  
  settingsContainer.innerHTML = `
    <h2>Bookmark Settings</h2>
    <div class="vibe-settings-section">
      <h3>Bookmark Processing</h3>
      <p>Process your bookmarks to enable semantic search.</p>
      
      <div class="vibe-bookmark-stats">
        <div>
          <span>Bookmarks processed:</span>
          <span id="vibe-bookmarks-processed-count">0</span>
        </div>
        <div>
          <span>Last updated:</span>
          <span id="vibe-bookmarks-last-updated">Never</span>
        </div>
      </div>
      
      <div class="vibe-settings-controls">
        <button id="vibe-process-bookmarks" class="vibe-button primary">
          Process All Bookmarks
        </button>
        <button id="vibe-clear-bookmarks" class="vibe-button secondary">
          Clear Bookmark Data
        </button>
      </div>
      
      <div id="vibe-bookmark-processing-progress" class="vibe-progress-container" style="display: none;">
        <div class="vibe-progress-bar">
          <div class="vibe-progress-fill" style="width: 0%;"></div>
        </div>
        <div class="vibe-progress-text">
          Processing 0 of 0 bookmarks...
        </div>
      </div>
    </div>
  `;
  
  // Add event listeners
  const processButton = settingsContainer.querySelector('#vibe-process-bookmarks');
  processButton?.addEventListener('click', () => {
    processBookmarks({ force: true });
  });
  
  const clearButton = settingsContainer.querySelector('#vibe-clear-bookmarks');
  clearButton?.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all bookmark data?')) {
      clearBookmarkData();
    }
  });
  
  // Update stats on load
  updateBookmarkStats(settingsContainer);
  
  return settingsContainer;
}
```

### Semantic Bookmark Search Implementation
```typescript
// Search bookmarks semantically
async function searchBookmarks(query: string): Promise<ProcessedBookmark[]> {
  if (query.length < 3) return [];
  
  // Get bookmark embeddings
  const bookmarkData = await getBookmarkEmbeddings();
  if (!bookmarkData || Object.keys(bookmarkData.bookmarks).length === 0) {
    return []; // No bookmarks processed yet
  }
  
  // Get query embedding using local model
  const queryEmbedding = await generateEmbedding(query);
  
  // Calculate similarity with bookmark embeddings
  const similarities: Array<{
    bookmark: ProcessedBookmark;
    similarity: number;
  }> = [];
  
  for (const [id, data] of Object.entries(bookmarkData.bookmarks)) {
    if (!data.embedding || data.embedding.length === 0) continue;
    
    const similarity = calculateCosineSimilarity(queryEmbedding, data.embedding);
    
    // Only include results above similarity threshold
    if (similarity > 0.6) {
      similarities.push({
        bookmark: {
          id,
          title: data.title,
          url: data.url,
          dateAdded: data.processedAt,
          excerpt: data.excerpt
        },
        similarity
      });
    }
  }
  
  // Sort by similarity (descending)
  similarities.sort((a, b) => b.similarity - a.similarity);
  
  // Return top results
  return similarities.slice(0, 10).map(item => ({
    ...item.bookmark,
    score: Math.round(item.similarity * 100) / 100
  }));
}

// Display bookmark search results
function displayBookmarkResults(
  results: ProcessedBookmark[],
  container: HTMLElement
): void {
  // Clear previous results
  container.innerHTML = '';
  
  if (results.length === 0) {
    container.innerHTML = `
      <div class="vibe-empty-results">
        <p>No matching bookmarks found.</p>
      </div>
    `;
    return;
  }
  
  // Create result list
  const resultsList = document.createElement('ul');
  resultsList.className = 'vibe-bookmark-results-list';
  
  // Add each result
  results.forEach(bookmark => {
    const listItem = document.createElement('li');
    listItem.className = 'vibe-bookmark-result-item';
    
    listItem.innerHTML = `
      <a href="${bookmark.url}" target="_blank" class="vibe-bookmark-result-link">
        <div class="vibe-bookmark-result-title">${bookmark.title}</div>
        <div class="vibe-bookmark-result-url">${formatUrl(bookmark.url)}</div>
        <div class="vibe-bookmark-result-excerpt">${bookmark.excerpt}</div>
      </a>
    `;
    
    resultsList.appendChild(listItem);
  });
  
  container.appendChild(resultsList);
}
```

### Integration with Exa API Search
```typescript
// Modified search method for the sidebar
async function performSidebarSearch(query: string, searchType?: string): Promise<SearchResult[]> {
  // Get current search type from the active toggle or parameter
  if (!searchType) {
    const activeToggle = document.querySelector('.vibe-toggle-btn.active');
    searchType = activeToggle?.getAttribute('data-search-type') || 'web';
  }
  
  // Determine which search to use based on searchType
  if (searchType === 'bookmarks') {
    const bookmarkResults = await searchBookmarks(query);
    return bookmarkResults.map(bookmark => ({
      title: bookmark.title,
      url: bookmark.url,
      snippet: bookmark.excerpt || '',
      score: bookmark.score || 0,
      source: 'bookmark'
    }));
  } else {
    // Use existing Exa API search for web results
    return searchWithExaApi(query);
  }
}

// Update existing search handler to respect toggle
function enhanceExistingSearchHandler(): void {
  // Find the existing search input
  const searchInput = document.querySelector('.vibe-search-input');
  if (!searchInput) return;
  
  // Replace or enhance the existing event listener
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const query = (e.target as HTMLInputElement).value;
      if (query.length < 3) return;
      
      const searchType = document.querySelector('.vibe-toggle-btn.active')
        ?.getAttribute('data-search-type') || 'web';
      
      performSidebarSearch(query, searchType).then(results => {
        displaySearchResults(results, searchType);
      });
    }
  });
}
```

### Event Handling for Bookmark Changes
We need to listen for bookmark changes to keep our embeddings up to date:

```typescript
// Setup bookmark change listeners
function setupBookmarkListeners() {
  // Listen for bookmark creation
  chrome.bookmarks.onCreated.addListener((id, bookmark) => {
    processNewBookmark(id, bookmark);
  });
  
  // Listen for bookmark updates
  chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
    updateBookmarkEmbedding(id, changeInfo);
  });
  
  // Listen for bookmark removals
  chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
    removeBookmarkEmbedding(id);
  });
}

// Process a newly added bookmark
async function processNewBookmark(id: string, bookmark: chrome.bookmarks.BookmarkTreeNode) {
  if (!bookmark.url) return; // Folder, not a bookmark
  
  const bookmarkData = await getBookmarkEmbeddings() || {
    version: 1,
    lastUpdated: Date.now(),
    bookmarks: {}
  };
  
  // Process the single bookmark
  await processBookmarkBatch([{
    id,
    title: bookmark.title,
    url: bookmark.url,
    dateAdded: Date.now()
  }], bookmarkData);
  
  // Save updated data
  bookmarkData.lastUpdated = Date.now();
  await saveBookmarkEmbeddings(bookmarkData);
}
```

## Permission Requirements
The extension will need the following permissions added to the manifest:
```json
{
  "permissions": [
    "bookmarks",
    "storage"
  ]
}
```

## Development Phases

### Phase 10.1: Bookmark Access and Storage
- Implement bookmark API access
- Create storage system for bookmark embeddings
- Build bookmark processing pipeline
- Add settings page for bookmark management

### Phase 10.2: Embedding Integration
- Integrate local embedding model with bookmark processor
- Create background processing system for bookmarks
- Implement progress tracking and user feedback
- Add event listeners for bookmark changes

### Phase 10.3: UI and Search Integration
- Add toggle between web and bookmark search to existing interface
- Enhance existing search to work with both search types
- Create bookmark-specific result display
- Integrate with existing search system

### Phase 10.4: Performance Optimization
- Optimize embedding storage for large bookmark collections
- Implement lazy loading for bookmark results
- Add caching for frequent searches
- Create batch processing for initial bookmark import

## Technical Considerations

### Performance
- Efficiently handle large bookmark collections (1000+)
- Process bookmarks in background to avoid UI freezing
- Use IndexedDB for larger storage needs
- Implement progressive loading of bookmark search results

### Privacy
- Keep all bookmark data and embeddings local to the user's device
- Do not send bookmark information to remote services
- Provide clear controls for users to clear their bookmark data
- Respect bookmark access permissions and prompt appropriately

### Browser Compatibility
- Handle differences between Chrome and Arc bookmark APIs
- Use feature detection to adapt to browser capabilities
- Provide graceful fallbacks for unsupported features
- Test across multiple browser versions

## Next Steps

1. Implement bookmark API access and permissions handling
2. Create storage system for bookmark embeddings
3. Build UI for bookmark search tab and settings
4. Integrate local embedding model with bookmark processing
5. Implement semantic search for bookmarks
6. Add background processing and change detection
7. Test with large bookmark collections
8. Optimize performance and user experience 