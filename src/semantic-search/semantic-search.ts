/**
 * Semantic Search - Main Entry Point
 * 
 * This module is the entry point for the semantic search feature.
 * It handles keyboard shortcuts and initializes the UI components.
 */

// Import required modules at the top instead of dynamically
import { TextChunk, SearchResult, TextChunkOptions } from './types';
import { extractTextChunks } from './utils/text-chunker';
import { generateEmbedding, cosineSimilarity } from './services/embedding-service';

// Feature flag for gradual rollout or disabling in development
const SEMANTIC_SEARCH_ENABLED = true;

// Keyboard shortcut configuration
const isMac = navigator.platform.toLowerCase().includes('mac');
const KEYBOARD_SHORTCUT = {
  key: 'f',
  modifier: isMac ? 'Alt' : 'Alt', // Option key on Mac registers as Alt
  display: isMac ? 'Option-F' : 'Alt-F'
};

// Global variables for semantic search
let isInitialized = false;
let currentQuery = '';
let currentChunks: TextChunk[] = [];
let currentResults: SearchResult[] = [];
let currentResultIndex = -1;
let isProcessingContent = false;
let modelLoadingProgress = 0;
let embeddingGenerationProgress = 0;

// State
let isSearchVisible = false;
let searchOverlayElement: HTMLElement | null = null;
let isSearching = false;
let isEmbeddingReady = false; // Track if embeddings are ready for search
let pageChunks: TextChunk[] = []; // Store extracted chunks
let chunkEmbeddings: Record<string, number[]> = {}; // Store embeddings for chunks

// Process state tracking
let modelLoadStarted = false;
let modelLoadComplete = false;
let chunkExtractionComplete = false;

/**
 * Initialize the semantic search feature
 */
export function initSemanticSearch() {
  if (!SEMANTIC_SEARCH_ENABLED) {
    console.log('Semantic search is disabled via feature flag constant');
    return;
  }

  // Avoid double initialization
  if (isInitialized) {
    console.log('Semantic search already initialized');
    return;
  }
  
  console.log('Initializing semantic search');
  
  // Register the keyboard shortcut handler
  document.addEventListener('keydown', handleKeyDown);
  
  // Create the search overlay element (hidden initially)
  createOverlayElement();
  
  // Make sure the search is initially hidden
  isSearchVisible = false;
  if (searchOverlayElement) {
    searchOverlayElement.style.display = 'none';
  }
  
  // Add a global test function that can be called from console
  (window as any).testSemanticSearch = testSemanticSearch;
  
  isInitialized = true;
  console.log('Semantic search initialization complete');
}

/**
 * Handle keyboard events
 */
function handleKeyDown(event: KeyboardEvent) {
  // Check if the pressed key matches our shortcut
  // On Mac, Option+F produces "ƒ" character, so we need to check for both
  if ((event.key.toLowerCase() === KEYBOARD_SHORTCUT.key || (isMac && event.key === 'ƒ')) && event.altKey) {
    event.preventDefault(); // Prevent default browser behavior
    toggleSemanticSearch();
    return;
  }
  
  // Only handle other keys if search is visible
  if (!isSearchVisible) return;
  
  // Handle Escape key to close the search
  if (event.key === 'Escape') {
    event.preventDefault();
    hideSemanticSearch();
    return;
  }
  
  // Handle up/down keys and Tab/Shift+Tab to navigate between results
  if (currentResults.length > 0) {
    // ArrowDown or Tab to go to next result
    if (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey)) {
      event.preventDefault();
      // Move to next result if not at the end
      if (currentResultIndex < currentResults.length - 1) {
        console.log('handleKeyDown: navigating to next result');
        setActiveResult(currentResultIndex + 1);
      }
      return;
    } 
    // ArrowUp or Shift+Tab to go to previous result
    else if (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey)) {
      event.preventDefault();
      // Move to previous result if not at the beginning
      if (currentResultIndex > 0) {
        console.log('handleKeyDown: navigating to previous result');
        setActiveResult(currentResultIndex - 1);
      }
      return;
    }
  }
}

/**
 * Test function that can be called directly to verify the feature is working
 */
function testSemanticSearch() {
  toggleSemanticSearch();
  return "Semantic search test triggered. The search overlay should now be visible.";
}

/**
 * Toggle the semantic search overlay
 */
function toggleSemanticSearch() {
  if (isSearchVisible) {
    hideSemanticSearch();
  } else {
    showSemanticSearch();
  }
}

/**
 * Show the semantic search overlay and start processing immediately
 */
function showSemanticSearch() {
  // Reset process state tracking
  resetProcessState();

  isSearchVisible = true;
  
  // If the overlay doesn't exist, create it
  if (!searchOverlayElement) {
    createOverlayElement();
  }
  
  // Now check if it exists (it should have been created)
  if (searchOverlayElement) {
    // Use flex display when showing, not just 'block'
    searchOverlayElement.style.display = 'flex';
    
    // Focus the search input when shown
    const searchInput = searchOverlayElement.querySelector('input') as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
    }
    
    // Update status to show we're starting the process
    updateEmbeddingStatus('Loading model...', 'loading');
    
    // Start processing content immediately
    startProcessingContent();
  }
}

/**
 * Reset the processing state variables
 */
function resetProcessState() {
  isEmbeddingReady = false;
  modelLoadStarted = false;
  modelLoadComplete = false;
  chunkExtractionComplete = false;
  embeddingGenerationProgress = 0;
}

/**
 * Start processing content immediately on overlay show
 */
async function startProcessingContent() {
  try {
    console.log('Starting content processing pipeline');
    
    // Step 1: Start extracting text chunks immediately
    updateEmbeddingStatus('Analyzing page content...', 'loading');
    pageChunks = extractTextChunks();
    chunkExtractionComplete = true;
    console.log(`Extracted ${pageChunks.length} text chunks from page`);
    
    // Step 2: Load the embedding model
    updateEmbeddingStatus('Loading AI model (0%)...', 'loading');
    modelLoadStarted = true;
    
    try {
      const { getEmbeddingModel, registerModelLoadingProgressCallback } = await import('./services/embedding-service');
      
      // Register progress callback to update UI
      registerModelLoadingProgressCallback((progress) => {
        updateEmbeddingStatus(`Loading AI model (${progress}%)...`, 'loading');
      });
      
      // Load the model
      const model = await getEmbeddingModel();
      modelLoadComplete = true;
      console.log('Model loaded successfully:', model ? 'Success' : 'Failed');
      
      // Step 3: Start embedding chunks in batches
      if (pageChunks.length > 0) {
        await generateChunkEmbeddings(pageChunks);
      }
      
      // All processing complete
      isEmbeddingReady = true;
      updateEmbeddingStatus('Ready for search!', 'ready');
      
      // Show enter to search prompt if input has content
      const searchInput = searchOverlayElement?.querySelector('input') as HTMLInputElement;
      if (searchInput && searchInput.value.trim().length > 2) {
        const enterToSearchPrompt = searchOverlayElement?.querySelector('.vibe-semantic-search-enter-prompt') as HTMLElement;
        if (enterToSearchPrompt) {
          enterToSearchPrompt.style.display = 'block';
        }
      }
    } catch (modelError) {
      console.error('Error loading embedding model:', modelError);
      updateEmbeddingStatus('Error loading AI model', 'error');
    }
  } catch (error) {
    console.error('Error during content processing:', error);
    updateEmbeddingStatus('Error processing content', 'error');
  }
}

/**
 * Generate embeddings for extracted chunks
 */
async function generateChunkEmbeddings(chunks: TextChunk[]) {
  const { generateEmbedding } = await import('./services/embedding-service');
  const batchSize = 5;
  chunkEmbeddings = {};
  
  updateEmbeddingStatus(`Generating page embeddings (0%)...`, 'loading');
  
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    
    // Process batch in parallel
    await Promise.all(
      batch.map(async (chunk) => {
        try {
          const embedding = await generateEmbedding(chunk.text);
          chunkEmbeddings[chunk.id] = embedding;
          chunk.embedding = embedding;
        } catch (error) {
          console.error('Error generating embedding for chunk:', error);
        }
      })
    );
    
    // Update progress
    embeddingGenerationProgress = Math.min(100, Math.round((i + batch.length) / chunks.length * 100));
    updateEmbeddingStatus(`Generating page embeddings (${embeddingGenerationProgress}%)...`, 'loading');
    
    // Allow UI to update
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  
  console.log(`Generated embeddings for ${Object.keys(chunkEmbeddings).length}/${chunks.length} chunks`);
}

/**
 * Update the embedding status UI with detailed information
 */
function updateEmbeddingStatus(message: string, state: 'loading' | 'ready' | 'error') {
  if (!searchOverlayElement) return;
  
  const embeddingStatus = searchOverlayElement.querySelector('.vibe-semantic-search-embedding-status') as HTMLElement;
  const spinner = searchOverlayElement.querySelector('.spinner') as HTMLElement;
  const arrow = searchOverlayElement.querySelector('.arrow') as HTMLElement;
  
  if (embeddingStatus) {
    embeddingStatus.textContent = message;
    embeddingStatus.style.display = 'block';
    
    if (state === 'error') {
      embeddingStatus.style.color = '#ef4444';
    } else {
      embeddingStatus.style.color = '#4F46E5';
    }
    
    // Auto-hide the status after 2 seconds if ready
    if (state === 'ready') {
      setTimeout(() => {
        if (embeddingStatus) {
          embeddingStatus.style.display = 'none';
        }
      }, 2000);
    }
  }
  
  // Update spinner/arrow
  if (spinner && arrow) {
    spinner.style.display = state === 'loading' ? 'block' : 'none';
    arrow.style.display = state === 'ready' ? 'block' : 'none';
  }
}

/**
 * Hide the semantic search overlay
 */
function hideSemanticSearch() {
  isSearchVisible = false;
  
  if (searchOverlayElement) {
    searchOverlayElement.style.display = 'none';
  }
  
  // Clear results and remove all highlights when hiding
  clearResults();
  removeHighlights();
}

/**
 * Create the overlay element for the semantic search UI
 */
function createOverlayElement() {
  // Check if it already exists
  if (searchOverlayElement) {
    return;
  }
  
  // Create the overlay container
  searchOverlayElement = document.createElement('div');
  searchOverlayElement.id = 'vibe-semantic-search-overlay';
  
  // Ensure it's hidden by default (critical)
  searchOverlayElement.style.display = 'none';
  isSearchVisible = false;
  
  // Basic styles for the overlay
  Object.assign(searchOverlayElement.style, {
    position: 'fixed',
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '10000',
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    padding: '16px',
    width: '500px',
    maxWidth: '90vw',
    display: 'none', // Explicit hidden style (redundant but safer)
    flexDirection: 'column',
    gap: '10px'
  });
  
  // Create search input container with icon
  const searchInputContainer = document.createElement('div');
  Object.assign(searchInputContainer.style, {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    position: 'relative'
  });
  
  // Create search icon
  const searchIcon = document.createElement('div');
  searchIcon.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7.33333 12.6667C10.2789 12.6667 12.6667 10.2789 12.6667 7.33333C12.6667 4.38781 10.2789 2 7.33333 2C4.38781 2 2 4.38781 2 7.33333C2 10.2789 4.38781 12.6667 7.33333 12.6667Z" stroke="#666" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M14 14L11.1 11.1" stroke="#666" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  Object.assign(searchIcon.style, {
    position: 'absolute',
    left: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  });
  
  // Create search input
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Semantic search...';
  
  // Style the search input
  Object.assign(searchInput.style, {
    width: '100%',
    padding: '8px 12px 8px 36px',
    border: '1px solid #ccc',
    borderRadius: '6px',
    fontSize: '15px',
    color: '#333',
    boxSizing: 'border-box'
  });
  
  // Create embedding status indicator (spinner/arrow)
  const embeddingIndicator = document.createElement('div');
  embeddingIndicator.className = 'vibe-semantic-search-embedding-indicator';
  embeddingIndicator.innerHTML = `
    <div class="spinner">
      <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/>
        <path d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z">
          <animateTransform attributeName="transform" type="rotate" dur="0.75s" values="0 12 12;360 12 12" repeatCount="indefinite"/>
        </path>
      </svg>
    </div>
    <div class="arrow" style="display: none;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="#4F46E5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
  `;
  
  Object.assign(embeddingIndicator.style, {
    position: 'absolute',
    right: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer'
  });
  
  // Position the input and indicator in the container
  searchInputContainer.appendChild(searchIcon);
  searchInputContainer.appendChild(searchInput);
  searchInputContainer.appendChild(embeddingIndicator);
  
  // Create embedding status message
  const embeddingStatus = document.createElement('div');
  embeddingStatus.className = 'vibe-semantic-search-embedding-status';
  embeddingStatus.textContent = 'Embedding website...';
  Object.assign(embeddingStatus.style, {
    fontSize: '13px',
    color: '#4F46E5',
    marginTop: '4px',
    marginBottom: '4px',
    display: 'block', // Show by default when opening
    fontStyle: 'italic'
  });
  
  // Create enter to search prompt
  const enterToSearchPrompt = document.createElement('div');
  enterToSearchPrompt.className = 'vibe-semantic-search-enter-prompt';
  enterToSearchPrompt.textContent = 'Press Enter to search';
  Object.assign(enterToSearchPrompt.style, {
    fontSize: '13px',
    color: '#4F46E5',
    marginTop: '4px',
    marginBottom: '4px',
    display: 'none', // Hidden by default
    fontStyle: 'italic'
  });
  
  // Create status indicator
  const statusIndicator = document.createElement('div');
  statusIndicator.className = 'vibe-semantic-search-status';
  Object.assign(statusIndicator.style, {
    fontSize: '13px',
    color: '#666',
    marginTop: '4px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  });
  
  // Create loading spinner
  const loadingSpinner = document.createElement('div');
  loadingSpinner.className = 'vibe-semantic-search-spinner';
  loadingSpinner.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/>
      <path d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z">
        <animateTransform attributeName="transform" type="rotate" dur="0.75s" values="0 12 12;360 12 12" repeatCount="indefinite"/>
      </path>
    </svg>
  `;
  Object.assign(loadingSpinner.style, {
    display: 'none'
  });
  
  // Create the results container
  const resultsContainer = document.createElement('div');
  resultsContainer.className = 'vibe-semantic-search-results';
  Object.assign(resultsContainer.style, {
    maxHeight: '300px',
    overflowY: 'auto',
    display: 'none',
    flexDirection: 'column',
    gap: '8px',
    paddingTop: '8px'
  });
  
  // Create navigation controls
  const navigationControls = document.createElement('div');
  navigationControls.className = 'vibe-semantic-search-navigation';
  Object.assign(navigationControls.style, {
    display: 'none',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: '1px solid #eee',
    paddingTop: '10px',
    marginTop: '5px'
  });
  
  // Create previous button
  const prevButton = document.createElement('button');
  prevButton.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 12L6 8L10 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    Previous
  `;
  prevButton.className = 'vibe-semantic-search-prev';
  Object.assign(prevButton.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 10px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: '#f0f0f0',
    color: '#333',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '13px'
  });
  prevButton.addEventListener('click', () => navigateResults('previous'));
  
  // Create next button
  const nextButton = document.createElement('button');
  nextButton.innerHTML = `
    Next
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 12L10 8L6 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  nextButton.className = 'vibe-semantic-search-next';
  Object.assign(nextButton.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 10px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: '#f0f0f0',
    color: '#333',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '13px'
  });
  nextButton.addEventListener('click', () => navigateResults('next'));
  
  // Create counter
  const counter = document.createElement('div');
  counter.className = 'vibe-semantic-search-counter';
  Object.assign(counter.style, {
    fontSize: '13px',
    color: '#666'
  });
  
  // Assemble the UI
  navigationControls.appendChild(prevButton);
  navigationControls.appendChild(counter);
  navigationControls.appendChild(nextButton);
  
  statusIndicator.appendChild(document.createElement('span')); // Status text
  statusIndicator.appendChild(loadingSpinner);
  
  // Put everything together in the overlay
  searchOverlayElement.appendChild(searchInputContainer);
  searchOverlayElement.appendChild(embeddingStatus); // Add the embedding status
  searchOverlayElement.appendChild(enterToSearchPrompt); // Add the enter prompt
  searchOverlayElement.appendChild(statusIndicator);
  searchOverlayElement.appendChild(resultsContainer);
  searchOverlayElement.appendChild(navigationControls);
  
  // Handle input events
  searchInput.addEventListener('input', (e) => {
    const query = (e.target as HTMLInputElement).value;
    
    // Show or hide the enter prompt based on input length and embedding status
    const enterToSearchPrompt = searchOverlayElement?.querySelector('.vibe-semantic-search-enter-prompt') as HTMLElement;
    if (enterToSearchPrompt) {
      if (query.trim().length > 2 && isEmbeddingReady) {
        enterToSearchPrompt.style.display = 'block';
      } else {
        enterToSearchPrompt.style.display = 'none';
      }
    }
    
    // Show the current processing status if embeddings are not ready
    if (!isEmbeddingReady) {
      const statusMessage = chunkExtractionComplete ? 
        (modelLoadComplete ? `Generating page embeddings (${embeddingGenerationProgress}%)...` : 'Loading AI model...') : 
        'Analyzing page content...';
      
      updateEmbeddingStatus(statusMessage, 'loading');
    }

    // Only clear results when input is empty, don't search automatically
    if (query.trim().length === 0) {
      clearResults();
    }
  });
  
  // Handle keyboard enter
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const query = (e.target as HTMLInputElement).value;
      
      if (query.trim().length < 3) {
        // Query too short
        updateStatusIndicator('Enter at least 3 characters to search', false);
        return;
      }
      
      if (!isEmbeddingReady) {
        // Embeddings not ready yet
        const progressMessage = chunkExtractionComplete ? 
          (modelLoadComplete ? `Still generating page embeddings (${embeddingGenerationProgress}%)` : 'Model still loading') : 
          'Still analyzing page';
        
        updateStatusIndicator(`Please wait, ${progressMessage.toLowerCase()}...`, false);
        return;
      }
      
      // All checks passed, perform the search
      performSearch();
      
      // Hide the prompt when search is triggered
      const enterToSearchPrompt = searchOverlayElement?.querySelector('.vibe-semantic-search-enter-prompt') as HTMLElement;
      if (enterToSearchPrompt) {
        enterToSearchPrompt.style.display = 'none';
      }
    }
  });
  
  // Add the embedding ready handler to the arrow
  const arrow = embeddingIndicator.querySelector('.arrow');
  if (arrow) {
    arrow.addEventListener('click', () => {
      const query = searchInput.value;
      
      if (query.trim().length < 3) {
        // Query too short
        updateStatusIndicator('Enter at least 3 characters to search', false);
        return;
      }
      
      if (!isEmbeddingReady) {
        // Embeddings not ready yet
        const progressMessage = chunkExtractionComplete ? 
          (modelLoadComplete ? `Still generating page embeddings (${embeddingGenerationProgress}%)` : 'Model still loading') : 
          'Still analyzing page';
        
        updateStatusIndicator(`Please wait, ${progressMessage.toLowerCase()}...`, false);
        return;
      }
      
      // All checks passed, perform the search
      performSearch();
      
      // Hide the prompt when search is triggered
      const enterToSearchPrompt = searchOverlayElement?.querySelector('.vibe-semantic-search-enter-prompt') as HTMLElement;
      if (enterToSearchPrompt) {
        enterToSearchPrompt.style.display = 'none';
      }
    });
  }
  
  // Handle keydown for Escape to close
  document.addEventListener('keydown', (e) => {
    // Only handle Escape if search is visible
    if (e.key === 'Escape' && isSearchVisible) {
      e.preventDefault();
      hideSemanticSearch();
    }
  });
  
  // Add the overlay to the document
  document.body.appendChild(searchOverlayElement);
}

/**
 * Perform semantic search with the current query
 */
function performSearch(): void {
  if (!searchOverlayElement) return;
  
  // Get query from input
  const searchInput = searchOverlayElement.querySelector('input') as HTMLInputElement;
  if (!searchInput) return;
  
  const query = searchInput.value.trim();
  
  // Validate query
  if (query.length === 0) {
    updateStatusIndicator('Please enter a search query', false);
    return;
  }
  
  if (query.length < 3) {
    updateStatusIndicator('Enter at least 3 characters to search', false);
    return;
  }
  
  if (!isEmbeddingReady) {
    updateStatusIndicator('Embeddings not ready yet, please wait', false);
    return;
  }
  
  // Clear previous results and highlights before starting a new search
  clearResults(false);
  removeHighlights();
  
  // Set loading state
  isSearching = true;
  updateStatusIndicator('Searching...', true);
  
  // Store current query
  currentQuery = query;
  
  // Perform semantic search using the embeddings
  performSemanticSearch(currentQuery)
    .then(results => {
      // Update UI with results
      currentResults = results;
      currentResultIndex = results.length > 0 ? 0 : -1;
      displaySearchResults(results);
      
      // Highlight and scroll to first result if available
      if (results.length > 0) {
        setActiveResult(0);
      }
      
      isSearching = false;
      updateStatusIndicator(
        results.length > 0 ? `${results.length} results found` : 'No results found', 
        false
      );
    })
    .catch(error => {
      console.error('Error in semantic search:', error);
      isSearching = false;
      updateStatusIndicator('Error: ' + (error instanceof Error ? error.message : String(error)), false);
    });
}

/**
 * Display search results in the UI
 */
function displaySearchResults(results: SearchResult[]): void {
  console.log('displaySearchResults called with', results.length, 'results');
  
  // Find the container by class name rather than ID
  const resultsContainer = searchOverlayElement?.querySelector('.vibe-semantic-search-results');
  if (!resultsContainer) {
    console.error('Results container not found');
    return;
  }

  // Ensure container is visible
  (resultsContainer as HTMLElement).style.display = 'flex';

  if (results.length === 0) {
    console.log('No results to display');
    resultsContainer.innerHTML = '<div class="no-results">No results found</div>';
    const navigationControls = searchOverlayElement?.querySelector('.vibe-semantic-search-navigation');
    if (navigationControls) {
      (navigationControls as HTMLElement).style.display = 'none';
    }
    return;
  }

  // Clear previous results
  resultsContainer.innerHTML = '';
  
  // Create a container for our results
  const resultsListEl = document.createElement('div');
  resultsListEl.className = 'results-list';
  Object.assign(resultsListEl.style, {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: '100%'
  });
  
  // Add each result item with its proper index
  results.forEach((result, index) => {
    const resultEl = document.createElement('div');
    resultEl.className = 'result-item';
    resultEl.dataset.resultIndex = index.toString();
    
    // Style the result item
    Object.assign(resultEl.style, {
      display: 'flex',
      padding: '8px',
      borderRadius: '4px',
      cursor: 'pointer',
      backgroundColor: index === currentResultIndex ? '#f0f0f0' : 'transparent'
    });
    
    if (index === currentResultIndex) {
      resultEl.classList.add('active');
    }
    
    // Create result number element (index + 1 for human readability)
    const resultNum = document.createElement('div');
    resultNum.className = 'result-num';
    resultNum.textContent = `${index + 1}`;
    Object.assign(resultNum.style, {
      marginRight: '8px',
      minWidth: '20px',
      fontWeight: 'bold'
    });
    
    // Create result text element
    const resultText = document.createElement('div');
    resultText.className = 'result-text';
    
    // Truncate text if too long
    const displayText = result.chunk.text.length > 150 
      ? result.chunk.text.substring(0, 150) + '...' 
      : result.chunk.text;
    
    resultText.textContent = displayText;
    
    // Add click handler to select this result
    resultEl.addEventListener('click', () => {
      // Update UI
      document.querySelectorAll('.result-item').forEach(el => {
        el.classList.remove('active');
        (el as HTMLElement).style.backgroundColor = 'transparent';
      });
      resultEl.classList.add('active');
      resultEl.style.backgroundColor = '#f0f0f0';
      
      // Set as active result (will trigger highlight and scroll)
      setActiveResult(index);
    });
    
    // Assemble result item
    resultEl.appendChild(resultNum);
    resultEl.appendChild(resultText);
    
    resultsListEl.appendChild(resultEl);
  });
  
  resultsContainer.appendChild(resultsListEl);
  
  // Show navigation controls if we have results
  const navigationControls = searchOverlayElement?.querySelector('.vibe-semantic-search-navigation');
  if (navigationControls) {
    (navigationControls as HTMLElement).style.display = 'flex';
    
    // Update navigation controls initial state
    updateNavigationControls();
  }
}

/**
 * Update the status indicator
 */
function updateStatusIndicator(text: string, isLoading: boolean) {
  if (!searchOverlayElement) return;
  
  const statusIndicator = searchOverlayElement.querySelector('.vibe-semantic-search-status') as HTMLElement;
  const spinner = statusIndicator?.querySelector('.vibe-semantic-search-spinner') as HTMLElement;
  const textElement = statusIndicator?.querySelector('span');
  
  if (textElement && spinner) {
    textElement.textContent = text;
    spinner.style.display = isLoading ? 'block' : 'none';
  }
}

/**
 * Update the results counter
 */
function updateCounter() {
  if (!searchOverlayElement || currentResults.length === 0) return;
  
  const counter = searchOverlayElement.querySelector('.vibe-semantic-search-counter') as HTMLElement;
  
  if (counter) {
    counter.textContent = `${currentResultIndex + 1} of ${currentResults.length}`;
  }
}

/**
 * Navigate between results
 */
function navigateResults(direction: 'next' | 'previous'): void {
  if (!currentResults.length) return;
  
  let newIndex = currentResultIndex;
  
  if (direction === 'next') {
    // Move to next result (with bounds check)
    newIndex = Math.min(currentResults.length - 1, currentResultIndex + 1);
  } else if (direction === 'previous') {
    // Move to previous result (with bounds check)
    newIndex = Math.max(0, currentResultIndex - 1);
  }
  
  // Only update if the index actually changed
  if (newIndex !== currentResultIndex) {
    setActiveResult(newIndex);
  }
}

/**
 * Navigate to a specific result
 */
function navigateToResult(index: number) {
  if (!searchOverlayElement || currentResults.length === 0) return;
  
  // Update current index
  currentResultIndex = index;
  
  // Update counter
  updateCounter();
  
  // Update UI to show which result is active
  const resultsContainer = searchOverlayElement.querySelector('.vibe-semantic-search-results') as HTMLElement;
  const resultElements = resultsContainer?.querySelectorAll('.result-item');
  
  if (resultElements) {
    resultElements.forEach((el, i) => {
      const element = el as HTMLElement;
      if (i === index) {
        element.classList.add('active');
        // Scroll the result into view in the results list
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        element.classList.remove('active');
      }
    });
  }
  
  // Update the highlight and scroll to the element in the page
  updateActiveHighlight();
  scrollToActiveResult();
}

/**
 * Clear all search results
 */
function clearResults(resetStatus = true) {
  if (!searchOverlayElement) return;
  
  const resultsContainer = searchOverlayElement.querySelector('.vibe-semantic-search-results') as HTMLElement;
  const navigationControls = searchOverlayElement.querySelector('.vibe-semantic-search-navigation') as HTMLElement;
  
  if (resultsContainer && navigationControls) {
    resultsContainer.innerHTML = '';
    resultsContainer.style.display = 'none';
    navigationControls.style.display = 'none';
  }
  
  if (resetStatus) {
    updateStatusIndicator('', false);
  }
  
  // Remove all highlights
  removeHighlights();
  
  // Reset state
  currentResults = [];
  currentResultIndex = -1;
}

/**
 * Clean up resources when the feature is disabled or the page is unloaded
 */
export function cleanupSemanticSearch() {
  // Remove event listeners
  document.removeEventListener('keydown', handleKeyDown);
  
  // Remove UI elements
  if (searchOverlayElement) {
    document.body.removeChild(searchOverlayElement);
    searchOverlayElement = null;
  }
  
  isInitialized = false;
}

/**
 * Handle result selection
 */
function setActiveResult(index: number): void {
  if (!currentResults.length || index < 0 || index >= currentResults.length) {
    return;
  }
  
  console.log(`Setting active result to index ${index} (from ${currentResultIndex})`);
  currentResultIndex = index;
  
  // Update navigation UI
  updateNavigationControls();
  
  // Clear and reapply all highlights with new active result
  applyHighlights(currentResults);
  
  // Scroll to the active result
  scrollToActiveResult();
  
  // Update result items in the UI
  const resultItems = document.querySelectorAll('.result-item');
  resultItems.forEach((item, i) => {
    item.classList.toggle('active', i === currentResultIndex);
  });
}

/**
 * Highlight all results on the page
 */
function highlightAllResults(): void {
  console.log('highlightAllResults called with', currentResults.length, 'results');
  
  // First, remove any existing highlights
  removeHighlights();
  
  if (!currentResults.length) {
    console.log('No results to highlight');
    return;
  }
  
  // Create highlight styles if they don't exist
  ensureHighlightStyles();
  
  // Find the text content in the DOM and highlight it
  highlightContentBasedOnText();
}

/**
 * Highlight content based on the text rather than relying on stored elements
 */
function highlightContentBasedOnText(): void {
  console.log('HIGHLIGHT: Starting text-based element search');
  
  // We'll create a map of all text elements in the document, excluding our search overlay
  const textElements = Array.from(document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div, span, li, td, th'))
    .filter(el => !el.closest('#vibe-semantic-search-overlay')); // Exclude our overlay and its children
    
  console.log(`HIGHLIGHT: Found ${textElements.length} potential text elements to search (excluding search overlay)`);
  
  let highlightedCount = 0;
  
  // For each result, find matching elements in the DOM
  currentResults.forEach((result, index) => {
    const resultText = result.chunk.text.trim();
    console.log(`HIGHLIGHT: Searching for text match for result ${index}: "${resultText.substring(0, 30)}..."`);
    
    // Try to find exact matches first - use a more focused approach with shortest text
    // to increase chances of finding the right element
    const searchText = resultText.length > 50 ? resultText.substring(0, 50) : resultText;
    
    // Use [textContent*="..."] to find elements containing the text as a substring
    try {
      // Try a direct selector approach first using the text content
      // Escape special characters in the search text for use in selector
      const escapedSearchText = searchText
        .replace(/"/g, '\\"')
        .replace(/'/g, "\\'")
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '');
      
      const selector = `p:contains("${escapedSearchText}"), div:contains("${escapedSearchText}"), span:contains("${escapedSearchText}")`;
      console.log(`HIGHLIGHT: Using custom jQuery-like selector approach`);
      
      // Since :contains is not standard, we'll use our text filtering approach
      let matches = textElements.filter(el => {
        const elText = el.textContent?.trim() || '';
        return elText.includes(searchText);
      });
      
      console.log(`HIGHLIGHT: Found ${matches.length} potential matches for result ${index}`);
      
      if (matches.length > 0) {
        // Use the first match (most specific match if multiple)
        const bestMatch = findBestMatch(matches, resultText);
        console.log(`HIGHLIGHT: Best match for result ${index}: ${bestMatch?.tagName || 'None'} with text length ${bestMatch?.textContent?.length || 0}`);
        
        if (bestMatch) {
          try {
            // Store the element reference in the result for future use
            result.element = bestMatch;
            
            // Store vertical position for sorting
            result.verticalPosition = bestMatch.getBoundingClientRect().top + window.scrollY;
            
            // Add highlight class - with extra check to ensure it works
            bestMatch.classList.add('vibe-semantic-highlight');
            
            // Attempt to force the highlight with !important inline style as backup
            try {
              bestMatch.style.setProperty('background-color', 'rgba(255, 255, 100, 0.4)', 'important');
            } catch (styleError) {
              console.error(`HIGHLIGHT: Error setting inline style:`, styleError);
            }
            
            highlightedCount++;
            
            // If this is the active result, add the active highlight class
            if (index === currentResultIndex) {
              bestMatch.classList.add('vibe-semantic-highlight-active');
              
              // Force active style too
              try {
                bestMatch.style.setProperty('background-color', 'rgba(255, 215, 0, 0.7)', 'important');
              } catch (styleError) {
                console.error(`HIGHLIGHT: Error setting active style:`, styleError);
              }
            }
          } catch (error) {
            console.error(`HIGHLIGHT: Error highlighting element ${index}:`, error);
          }
        } else {
          console.warn(`HIGHLIGHT: No suitable match found for result ${index}`);
        }
      } else {
        console.warn(`HIGHLIGHT: No matches found for result ${index}`);
      }
    } catch (selectorError) {
      console.error(`HIGHLIGHT: Error with selector:`, selectorError);
    }
  });
  
  console.log(`HIGHLIGHT: Successfully highlighted ${highlightedCount}/${currentResults.length} elements`);
}

/**
 * Find the best matching element for the text content
 */
function findBestMatch(elements: Element[], targetText: string): HTMLElement | null {
  console.log(`Finding best match for: "${targetText.substring(0, 30)}..." among ${elements.length} elements`);
  
  // First pass: filter elements to good candidates
  const goodCandidates = elements.filter(el => 
    isGoodHighlightCandidate(el as HTMLElement, targetText)
  );
  
  console.log(`Found ${goodCandidates.length} good candidates after filtering`);
  
  // If we have good candidates, use them, otherwise fallback to all elements
  const workingElements = goodCandidates.length > 0 ? goodCandidates : elements;
  
  // Second pass: sort by relevance
  const sortedElements = workingElements.sort((a, b) => {
    const aText = a.textContent?.trim() || '';
    const bText = b.textContent?.trim() || '';
    
    // Calculate how close the length is to our target (smaller difference is better)
    const aLengthDiff = Math.abs(aText.length - targetText.length);
    const bLengthDiff = Math.abs(bText.length - targetText.length);
    
    // Calculate specificity (more specific elements are better)
    const aSpecificity = getElementDepth(a);
    const bSpecificity = getElementDepth(b);
    
    // Prefer elements that more closely match the target length
    if (aLengthDiff !== bLengthDiff) {
      return aLengthDiff - bLengthDiff;
    }
    
    // If length difference is the same, prefer more specific elements
    return bSpecificity - aSpecificity;
  });
  
  // Return the best match or null if none found
  return sortedElements.length > 0 ? sortedElements[0] as HTMLElement : null;
}

/**
 * Get the nesting depth of an element in the DOM
 */
function getElementDepth(element: Element): number {
  let depth = 0;
  let current = element;
  
  while (current.parentElement) {
    depth++;
    current = current.parentElement;
  }
  
  return depth;
}

/**
 * Update the active highlight
 */
function updateActiveHighlight(): void {
  console.log(`updateActiveHighlight called with activeIndex: ${currentResultIndex}`);
  
  // Remove active class from all elements
  const previousActive = document.querySelectorAll('.vibe-semantic-highlight-active');
  console.log(`Removing active class from ${previousActive.length} elements`);
  previousActive.forEach(el => {
    el.classList.remove('vibe-semantic-highlight-active');
    
    // Also reset the inline style to original yellow
    try {
      (el as HTMLElement).style.removeProperty('background-color');
    } catch (e) {
      console.error('Error resetting highlight style:', e);
    }
  });
  
  if (!currentResults.length || currentResultIndex < 0) {
    console.log('No active result to highlight');
    return;
  }
  
  const activeResult = currentResults[currentResultIndex];
  if (!activeResult) {
    console.log('No active result found at index', currentResultIndex);
    return;
  }
  
  // If element reference is missing or not connected, try to find it again
  if (!activeResult.element || !activeResult.element.isConnected) {
    console.log('Active result element missing or disconnected, finding again');
    
    // Try to find the element in the DOM based on text
    const resultText = activeResult.chunk.text.trim();
    
    // Get text elements, excluding our search overlay
    const textElements = Array.from(document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div, span, li, td, th'))
      .filter(el => !el.closest('#vibe-semantic-search-overlay'));
    
    const matches = textElements.filter(el => {
      const elText = el.textContent?.trim() || '';
      return elText === resultText || elText.includes(resultText);
    });
    
    if (matches.length > 0) {
      const bestMatch = findBestMatch(matches, resultText);
      activeResult.element = bestMatch;
      console.log('Found new element reference for active result');
    } else {
      console.warn('Could not find element for active result');
      return;
    }
  }
  
  // Check again if we have a valid element after the find attempt
  if (!activeResult.element) {
    console.warn('Failed to get a valid element reference for active result');
    return;
  }
  
  // Add active class to the current element
  console.log('Adding active highlight to element:', activeResult.element.tagName);
  activeResult.element.classList.add('vibe-semantic-highlight-active');
  
  // Set active style with important flag
  try {
    activeResult.element.style.setProperty('background-color', 'rgba(255, 215, 0, 0.7)', 'important');
  } catch (e) {
    console.error('Error setting active highlight:', e);
  }
}

/**
 * Remove all highlights from the page
 */
function removeHighlights(): void {
  console.log('Removing all highlights from page');
  
  // Count how many elements we process for debugging
  let removedSpans = 0;
  let removedClasses = 0;

  // First approach: Find and remove highlight spans
  const highlightSpans = document.querySelectorAll('.vibe-semantic-highlight, .vibe-semantic-highlight-active');
  console.log(`DEBUG: Found ${highlightSpans.length} highlight spans to remove`);
  
  highlightSpans.forEach(span => {
    // Only process spans that aren't in our search UI
    if (!span.closest('#vibe-semantic-search-overlay')) {
      try {
        // Replace the span with its text content
        const parent = span.parentNode;
        if (parent) {
          // Create a document fragment with the HTML content (preserves formatting)
          const fragment = document.createRange().createContextualFragment(span.innerHTML);
          parent.replaceChild(fragment, span);
          removedSpans++;
        }
      } catch (error) {
        console.error('Error removing highlight span:', error);
      }
    }
  });
  
  // Second approach: Remove classes from elements that were directly highlighted
  const classHighlights = document.querySelectorAll('[data-vibe-highlighted], [data-vibe-highlight-attempted]');
  console.log(`DEBUG: Found ${classHighlights.length} elements with highlight attributes to clean`);
  
  classHighlights.forEach(el => {
    // Skip our search UI elements
    if (!el.closest('#vibe-semantic-search-overlay')) {
      try {
        // Remove highlight classes
        el.classList.remove('vibe-semantic-highlight');
        el.classList.remove('vibe-semantic-highlight-active');
        
        // Remove our data attributes
        (el as HTMLElement).removeAttribute('data-vibe-highlighted');
        (el as HTMLElement).removeAttribute('data-vibe-highlight-attempted');
        
        // Remove any inline styles
        (el as HTMLElement).style.removeProperty('background-color');
        
        removedClasses++;
      } catch (e) {
        console.error('Error removing highlight classes:', e);
      }
    }
  });
  
  // Also clear any highlight-specific style tags we added
  const highlightStyles = document.querySelectorAll('style[id^="vibe-highlight-style"]');
  console.log(`DEBUG: Removing ${highlightStyles.length} highlight style tags`);
  
  highlightStyles.forEach(style => {
    document.head.removeChild(style);
  });
  
  console.log(`DEBUG: Removed highlights from ${removedSpans} spans and ${removedClasses} elements`);
}

/**
 * Ensure highlight styles are added to the page
 */
function ensureHighlightStyles(): void {
  if (document.getElementById('vibe-semantic-highlight-styles')) {
    console.log('Highlight styles already exist');
    return;
  }
  
  console.log('Creating highlight styles');
  const styleEl = document.createElement('style');
  styleEl.id = 'vibe-semantic-highlight-styles';
  styleEl.textContent = `
    .vibe-semantic-highlight {
      background-color: rgba(255, 255, 100, 0.4) !important;
      border-radius: 2px !important;
    }
    
    .vibe-semantic-highlight-active {
      background-color: rgba(255, 215, 0, 0.7) !important;
      border-radius: 2px !important;
      box-shadow: 0 0 2px rgba(255, 180, 0, 0.6) !important;
    }
  `;
  document.head.appendChild(styleEl);
  console.log('Highlight styles added to document');
}

/**
 * Scroll to the active result in the page
 */
function scrollToActiveResult(): void {
  console.log('scrollToActiveResult called');
  
  if (!currentResults.length || currentResultIndex < 0) {
    console.log('No active result to scroll to');
    return;
  }
  
  const activeResult = currentResults[currentResultIndex];
  if (!activeResult) {
    console.log('Active result not found at index', currentResultIndex);
    return;
  }
  
  // If element reference is missing or not connected, try to find it again
  if (!activeResult.element || !activeResult.element.isConnected) {
    console.log('Active result element missing or disconnected, finding again');
    
    // Try to find the element in the DOM based on text
    const resultText = activeResult.chunk.text.trim();
    
    // Get text elements, excluding our search overlay
    const textElements = Array.from(document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div, span, li, td, th'))
      .filter(el => !el.closest('#vibe-semantic-search-overlay'));
    
    const matches = textElements.filter(el => {
      const elText = el.textContent?.trim() || '';
      return elText === resultText || elText.includes(resultText);
    });
    
    if (matches.length > 0) {
      const bestMatch = findBestMatch(matches, resultText);
      activeResult.element = bestMatch;
      console.log('Found new element reference for active result');
    } else {
      console.warn('Could not find element for active result');
      return;
    }
  }
  
  // Check again if we have a valid element after the find attempt
  if (!activeResult.element) {
    console.warn('Failed to get a valid element reference for active result');
    return;
  }
  
  console.log('Scrolling to element:', activeResult.element.tagName);
  
  // Scroll the element into view with smooth behavior
  activeResult.element.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  });
  
  console.log('Scroll complete');
}

/**
 * Update navigation controls to reflect current result state
 */
function updateNavigationControls(): void {
  const navigationControls = searchOverlayElement?.querySelector('.vibe-semantic-search-navigation');
  if (!navigationControls) return;
  
  const resultCounterEl = navigationControls.querySelector('.vibe-semantic-search-counter');
  if (resultCounterEl && currentResults.length > 0) {
    resultCounterEl.textContent = `${currentResultIndex + 1} of ${currentResults.length}`;
  }
  
  // Update previous button state
  const prevButton = navigationControls.querySelector('.vibe-semantic-search-prev');
  if (prevButton) {
    if (currentResultIndex <= 0) {
      prevButton.classList.add('disabled');
    } else {
      prevButton.classList.remove('disabled');
    }
  }
  
  // Update next button state
  const nextButton = navigationControls.querySelector('.vibe-semantic-search-next');
  if (nextButton) {
    if (currentResultIndex >= currentResults.length - 1) {
      nextButton.classList.add('disabled');
    } else {
      nextButton.classList.remove('disabled');
    }
  }
}

/**
 * Perform semantic search using the current embeddings
 */
async function performSemanticSearch(query: string): Promise<SearchResult[]> {
  if (!isEmbeddingReady) {
    throw new Error('Embeddings not ready yet');
  }
  
  // Validate query isn't empty
  if (!query || query.trim().length === 0) {
    throw new Error('Search query cannot be empty');
  }
  
  console.log(`Performing semantic search for query: "${query}" with ${pageChunks.length} chunks`);
  
  try {
    // Generate embedding for the query
    const { generateEmbedding } = await import('./services/embedding-service');
    const queryEmbedding = await generateEmbedding(query);
    
    console.log('Query embedding generated:', queryEmbedding ? 'Success' : 'Failed',
                queryEmbedding ? `(${queryEmbedding.length} dimensions)` : '');
    
    // Use pre-calculated embeddings to find matches
    const results: SearchResult[] = [];
    const similarityThreshold = 0.3; // 30% threshold
    
    // Calculate similarity for all chunks
    for (const chunk of pageChunks) {
      const embedding = chunkEmbeddings[chunk.id];
      if (!embedding) continue;
      
      try {
        const similarity = cosineSimilarity(queryEmbedding, embedding);
        
        // Only include results above the threshold
        if (similarity > similarityThreshold) {
          results.push({
            chunk,
            element: null, // We'll find the element later
            score: similarity,
            highlightedText: chunk.text,
            verticalPosition: 0, // Will be updated later
            visible: false // Will be updated later
          });
        }
      } catch (error) {
        console.error('Error calculating similarity:', error instanceof Error ? error.message : String(error));
      }
    }
    
    // Get all potential matches ordered by similarity score
    const potentialMatches = results.sort((a, b) => b.score - a.score);
    
    // Find and validate elements for top 30 matches (candidates)
    // Using more candidates to ensure we get enough valid results
    const candidates = potentialMatches.slice(0, 30);
    await findAndValidateElements(candidates);
    
    // Filter to only visible, valid elements with valid vertical positions
    const validMatches = candidates.filter(result => 
      result.element !== null && 
      result.visible === true
    );
    
    console.log(`Found ${validMatches.length} valid matches out of ${candidates.length} candidates`);
    
    // FIXED: Make sure we have accurate vertical positions for all valid matches
    // This will ensure consistent top-to-bottom ordering
    validMatches.forEach(result => {
      if (result.element) {
        const rect = result.element.getBoundingClientRect();
        // Use precise calculation - adding scroll position to get absolute document position
        result.verticalPosition = rect.top + window.scrollY;
      }
    });
    
    // Sort by vertical position for a natural reading order (top to bottom)
    const sortedByPosition = validMatches.sort((a, b) => {
      // Ensure we're comparing valid positions (non-zero) and handle edge cases
      const posA = a.verticalPosition || 0;
      const posB = b.verticalPosition || 0;
      return posA - posB;
    });
    
    // Take only the top 10 results
    const finalResults = sortedByPosition.slice(0, 10);
    
    // Important: Create a NEW array with consecutive indices
    // This ensures that when we navigate between results, we don't skip any
    const consecutiveResults = finalResults.map((result, index) => ({
      ...result,
      originalIndex: index // Store original index if needed
    }));
    
    console.log(`Final result count: ${consecutiveResults.length}`);
    
    // Apply initial highlights to the final results
    applyHighlights(consecutiveResults);
    
    return consecutiveResults;
  } catch (error) {
    console.error('Error performing semantic search:', error instanceof Error ? error.message : String(error));
    throw new Error('Failed to perform search');
  }
}

/**
 * Find and validate elements for search results
 */
async function findAndValidateElements(results: SearchResult[]): Promise<void> {
  // Clear previous highlights
  removeHighlights();
  
  // Get all potential text elements once, excluding our search overlay
  const allElements = Array.from(document.querySelectorAll('body *')).filter(el => {
    // Exclude our search overlay and all its children
    return !el.closest('#vibe-semantic-search-overlay');
  });
  
  const textElements = allElements.filter(el => {
    const text = el.textContent?.trim() || '';
    return text.length > 0;
  });
  
  console.log(`Found ${textElements.length} potential text elements on page (excluding search overlay)`);
  
  // Process each result
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const resultText = result.chunk.text.trim();
    
    // Find elements containing this text
    const matches = textElements.filter(el => {
      const elText = el.textContent?.trim() || '';
      return elText.includes(resultText.substring(0, Math.min(100, resultText.length)));
    });
    
    if (matches.length > 0) {
      console.log(`Found ${matches.length} matches for result ${i+1}`);
      
      // Find the best match
      const bestMatch = findBestMatch(matches, resultText);
      
      if (bestMatch) {
        // Check if element is visible
        const visible = isElementVisible(bestMatch);
        
        // Store element info
        result.element = bestMatch;
        result.visible = visible;
        
        // Calculate vertical position using consistent method
        // This calculation will be refreshed later before sorting
        if (visible) {
          const rect = bestMatch.getBoundingClientRect();
          result.verticalPosition = rect.top + window.scrollY;
        } else {
          result.verticalPosition = 0; // Set to 0 for invisible elements
        }
        
        console.log(`Result ${i+1}: Found element, visible=${visible}, position=${result.verticalPosition}`);
      } else {
        console.log(`Result ${i+1}: No suitable element found among matches`);
      }
    } else {
      console.log(`Result ${i+1}: No matches found`);
    }
  }
  
  return Promise.resolve();
}

/**
 * Apply highlights to elements
 */
function applyHighlights(results: SearchResult[]): void {
  // First remove any existing highlights
  removeHighlights();
  
  console.log(`Applying highlights to ${results.length} results`);
  
  // Create styles if they don't exist
  ensureHighlightStyles();
  
  // Apply highlights to all results
  results.forEach((result, index) => {
    if (result.element && result.visible) {
      highlightElement(result.element, result.chunk.text, index === currentResultIndex);
    }
  });
}

/**
 * Simplified approach to highlighting an element's text
 */
function highlightElement(element: HTMLElement, textToHighlight: string, isActive: boolean): void {
  // Skip if element is part of our search UI
  if (element.closest('#vibe-semantic-search-overlay')) {
    return;
  }

  // Add debug attribute to help identify which elements we're trying to highlight
  element.dataset.vibeHighlightAttempted = "true";

  // Set colors based on active state
  const highlightColor = isActive ? 'rgba(255, 215, 0, 0.7)' : 'rgba(255, 255, 100, 0.4)';
  const highlightClass = isActive ? 'vibe-semantic-highlight-active' : 'vibe-semantic-highlight';
  
  // Normalize the target text
  const normalizedHighlight = textToHighlight.replace(/\s+/g, ' ').trim();
  if (!normalizedHighlight) return;

  // Get the element content
  const elementText = element.textContent || '';
  const normalizedText = elementText.replace(/\s+/g, ' ');
  
  // Log detailed debugging info for elements that are being processed
  console.log(`DEBUG: Attempting to highlight element:`, {
    tagName: element.tagName,
    id: element.id,
    className: element.className,
    textLength: elementText.length,
    highlightLength: textToHighlight.length,
    textContainsHighlight: normalizedText.includes(normalizedHighlight),
    hasChildElements: element.children.length > 0,
    containsLinks: element.querySelectorAll('a').length > 0,
    fullText: elementText,
    normalizedText,
    normalizedHighlight
  });

  try {
    // Find the text position in the normalized text
    const textIndex = normalizedText.indexOf(normalizedHighlight);
    if (textIndex === -1) {
      console.log(`DEBUG: Text not found in element, skipping highlight`);
      return;
    }

    // Create a range that covers the entire text, including any HTML elements
    const range = document.createRange();
    
    // Find the first text node that contains our text
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null
    );
    
    let currentNode = walker.nextNode();
    let currentPos = 0;
    let startNode = null;
    let startOffset = 0;
    
    // Find the starting position
    while (currentNode) {
      const nodeText = currentNode.textContent || '';
      const nextPos = currentPos + nodeText.length;
      
      if (currentPos <= textIndex && textIndex < nextPos) {
        startNode = currentNode;
        startOffset = textIndex - currentPos;
        break;
      }
      
      currentPos = nextPos;
      currentNode = walker.nextNode();
    }
    
    if (!startNode) {
      console.log(`DEBUG: Could not find starting node`);
      return;
    }
    
    // Set the start of our range
    range.setStart(startNode, startOffset);
    
    // Find the end position
    let endNode = startNode;
    let endOffset = startOffset + normalizedHighlight.length;
    let remainingLength = normalizedHighlight.length;
    
    // If the text doesn't fit in the first node, find the end node
    if (endOffset > startNode.textContent!.length) {
      remainingLength -= (startNode.textContent!.length - startOffset);
      currentNode = walker.nextNode();
      
      while (currentNode && remainingLength > 0) {
        const nodeText = currentNode.textContent || '';
        const nodeLength = nodeText.length;
        
        if (remainingLength <= nodeLength) {
          endNode = currentNode;
          endOffset = remainingLength;
          break;
        }
        
        remainingLength -= nodeLength;
        currentNode = walker.nextNode();
      }
    }
    
    // Set the end of our range
    range.setEnd(endNode, endOffset);
    
    // Create and apply the highlight span
    const highlightSpan = document.createElement('span');
    highlightSpan.className = highlightClass;
    highlightSpan.style.backgroundColor = highlightColor;
    highlightSpan.style.borderRadius = '2px';
    
    // Apply more specific ID-based style
    const highlightId = `vibe-highlight-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    highlightSpan.id = highlightId;
    
    try {
      // Surround the range with our highlight span
      range.surroundContents(highlightSpan);
      
      // Add stronger style through stylesheet for maximum specificity
      const styleEl = document.createElement('style');
      styleEl.textContent = `#${highlightId} { background-color: ${highlightColor} !important; }`;
      document.head.appendChild(styleEl);
      
      console.log(`DEBUG: Successfully created highlight span with ID ${highlightId}`);
    } catch (rangeError) {
      console.error('Range surroundContents error:', rangeError);
    }
  } catch (error) {
    console.error('Error during highlighting:', error);
  }
}

/**
 * Find the best substring match position, even if it's not an exact match
 * Returns the index of the best match, or -1 if no good match found
 */
function findBestSubstringMatch(fullText: string, searchText: string): number {
  // Try exact match first
  const exactMatch = fullText.indexOf(searchText);
  if (exactMatch !== -1) {
    return exactMatch;
  }
  
  // If search text is too long, try to find the longest substring that exists in both
  if (searchText.length > 30) {
    // Try with increasingly shorter substrings
    for (let length = searchText.length - 1; length >= 20; length--) {
      // Try multiple positions to start from
      for (let startPos = 0; startPos <= searchText.length - length; startPos += 5) {
        const substring = searchText.substring(startPos, startPos + length);
        if (substring.length >= 20) { // Only try reasonably long substrings
          const substringIndex = fullText.indexOf(substring);
          if (substringIndex !== -1) {
            return substringIndex;
          }
        }
      }
    }
  }
  
  // If still not found, try to match just the beginning part
  const beginning = searchText.substring(0, Math.min(20, searchText.length));
  if (beginning.length >= 5) {
    const beginningIndex = fullText.indexOf(beginning);
    if (beginningIndex !== -1) {
      return beginningIndex;
    }
  }
  
  // No good match found
  return -1;
}

/**
 * Is element visible in the viewport
 */
function isElementVisible(element: HTMLElement): boolean {
  // Check if element exists in DOM
  if (!element || !element.isConnected) {
    return false;
  }

  // Get element rect
  const rect = element.getBoundingClientRect();
  
  // Element has no size
  if (rect.width === 0 || rect.height === 0) {
    return false;
  }
  
  // Element is not in viewport
  if (
    rect.bottom < 0 ||
    rect.top > window.innerHeight ||
    rect.right < 0 ||
    rect.left > window.innerWidth
  ) {
    // Element is outside viewport, but we still consider it valid for navigation
    // We'll just scroll to it when selected
    return true;
  }
  
  // Check if element or its ancestors have display:none, visibility:hidden, etc.
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  
  return true;
}

/**
 * Check if an element is a good candidate for highlighting
 */
function isGoodHighlightCandidate(element: HTMLElement, targetText: string): boolean {
  // Only filter out elements that are part of our search UI
  if (element.closest('#vibe-semantic-search-overlay')) {
    return false;
  }
  
  // Accept everything else
  return true;
} 