/**
 * Semantic Search - Main Entry Point
 * 
 * This module is the entry point for the semantic search feature.
 * It handles keyboard shortcuts and initializes the UI components.
 */

// Import required modules at the top instead of dynamically
import { TextChunk } from './types';
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

// State
let isSearchVisible = false;
let searchOverlayElement: HTMLElement | null = null;
let isInitialized = false;
let currentResults: any[] = [];
let currentResultIndex = -1;
let isSearching = false;
let isEmbeddingReady = false; // Track if embeddings are ready for search

/**
 * Initialize the semantic search feature
 */
export function initSemanticSearch() {
  if (!SEMANTIC_SEARCH_ENABLED) {
    return;
  }

  // Avoid double initialization
  if (isInitialized) {
    return;
  }
  
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
  
  // Handle Escape key to close the search
  if (event.key === 'Escape' && isSearchVisible) {
    hideSemanticSearch();
  }
  
  // Handle up/down keys to navigate between results when search is visible
  if (isSearchVisible && currentResults.length > 0) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      navigateResults('next');
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      navigateResults('previous');
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
 * Show the semantic search overlay
 */
function showSemanticSearch() {
  isSearchVisible = true;
  isEmbeddingReady = false; // Reset embedding state
  
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
    
    // Show embedding status and spinner
    const embeddingStatus = searchOverlayElement.querySelector('.vibe-semantic-search-embedding-status') as HTMLElement;
    if (embeddingStatus) {
      embeddingStatus.style.display = 'block';
      embeddingStatus.textContent = 'Embedding website...';
    }
    
    // Show spinner, hide arrow
    const spinner = searchOverlayElement.querySelector('.spinner') as HTMLElement;
    const arrow = searchOverlayElement.querySelector('.arrow') as HTMLElement;
    if (spinner && arrow) {
      spinner.style.display = 'block';
      arrow.style.display = 'none';
    }
    
    // Start embedding process
    startEmbeddingProcess();
  }
}

/**
 * Start the embedding process for the page
 */
async function startEmbeddingProcess() {
  try {
    // Reset state
    isEmbeddingReady = false;
    
    // Get the model ready and extract page content
    const { extractTextChunks } = await import('./utils/text-chunker');
    const { getEmbeddingModel } = await import('./services/embedding-service');
    
    // Extract chunks first, as this is faster than loading the model
    const chunks = extractTextChunks();
    console.log(`Extracted ${chunks.length} text chunks from page`);
    
    // Initialize the embedding model
    // This is the slow part that needs to download the model first time
    await getEmbeddingModel();
    
    // Update UI to show embedding is ready
    isEmbeddingReady = true;
    
    if (searchOverlayElement) {
      // Update embedding status
      const embeddingStatus = searchOverlayElement.querySelector('.vibe-semantic-search-embedding-status') as HTMLElement;
      if (embeddingStatus) {
        embeddingStatus.textContent = 'Ready to search...';
        
        // Auto-hide the status after 2 seconds
        setTimeout(() => {
          if (embeddingStatus) {
            embeddingStatus.style.display = 'none';
          }
        }, 2000);
      }
      
      // Show arrow, hide spinner
      const spinner = searchOverlayElement.querySelector('.spinner') as HTMLElement;
      const arrow = searchOverlayElement.querySelector('.arrow') as HTMLElement;
      if (spinner && arrow) {
        spinner.style.display = 'none';
        arrow.style.display = 'block';
      }
    }
  } catch (error) {
    console.error('Error during embedding initialization:', error);
    
    // Update UI to show error
    if (searchOverlayElement) {
      const embeddingStatus = searchOverlayElement.querySelector('.vibe-semantic-search-embedding-status') as HTMLElement;
      if (embeddingStatus) {
        embeddingStatus.textContent = 'Error loading embedding model';
        embeddingStatus.style.color = '#ef4444';
      }
    }
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
  
  // Clear results when hiding
  clearResults();
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
    // Show or hide the enter prompt based on input length
    if (query.trim().length > 2 && isEmbeddingReady) {
      enterToSearchPrompt.style.display = 'block';
    } else {
      enterToSearchPrompt.style.display = 'none';
    }

    // Only clear results when input is empty, don't search automatically
    if (query.trim().length === 0) {
      clearResults();
    }
  });
  
  // Handle keyboard enter
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && isEmbeddingReady && searchInput.value.trim().length > 2) {
      performSearch(searchInput.value);
      // Hide the prompt when search is triggered
      enterToSearchPrompt.style.display = 'none';
    }
  });
  
  // Add the embedding ready handler to the arrow
  const arrow = embeddingIndicator.querySelector('.arrow');
  if (arrow) {
    arrow.addEventListener('click', () => {
      if (isEmbeddingReady && searchInput.value.trim().length > 2) {
        performSearch(searchInput.value);
        // Hide the prompt when search is triggered
        enterToSearchPrompt.style.display = 'none';
      }
    });
  }
  
  // Add the overlay to the document
  document.body.appendChild(searchOverlayElement);
}

/**
 * Perform a semantic search with the given query
 */
async function performSearch(query: string) {
  if (!searchOverlayElement) return;
  
  try {
    // Set loading state
    isSearching = true;
    updateStatusIndicator('Searching...', true);
    
    // Clear previous results
    clearResults(false);
    
    // Extract text chunks from the current page
    const chunks = extractTextChunks();
    
    // If no chunks were found, show a message
    if (chunks.length === 0) {
      updateStatusIndicator('No content found to search', false);
      return;
    }
    
    console.log(`Processing semantic search for query: "${query}" with ${chunks.length} chunks`);
    updateStatusIndicator(`Analyzing ${chunks.length} content sections...`, true);
    
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);
    console.log('Query embedding generated:', queryEmbedding ? 'Success' : 'Failed', 
                queryEmbedding ? `(${queryEmbedding.length} dimensions)` : '');
    
    // Process chunks in batches to avoid overwhelming the API
    const results: Array<{
      id: string;
      text: string;
      domPath: string;
      element: Element | null;
      startOffset: number;
      endOffset: number;
      embedding?: number[];
      similarity: number;
    }> = [];
    
    // Debug: Store all similarity scores to analyze later
    const allSimilarityScores: {text: string, score: number}[] = [];
    
    // Lower the threshold for debugging (was 0.6 or 60%)
    const similarityThreshold = 0.3; // 30% for testing
    console.log(`Using similarity threshold: ${similarityThreshold} (30%)`);
    
    const batchSize = 20;
    
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      
      // Generate embeddings for each chunk
      const embeddings = await Promise.all(
        batch.map(async (chunk) => {
          try {
            // If the chunk already has an embedding, use it
            if (chunk.embedding) {
              return chunk.embedding;
            }
            
            // Otherwise, generate a new embedding
            const embedding = await generateEmbedding(chunk.text);
            chunk.embedding = embedding;
            return embedding;
          } catch (error: any) {
            console.error('Error generating embedding for chunk:', error);
            return null;
          }
        })
      );
      
      console.log(`Generated ${embeddings.filter(e => e !== null).length}/${batch.length} embeddings for batch ${Math.floor(i/batchSize) + 1}`);
      
      // Calculate similarity scores
      batch.forEach((chunk, index) => {
        const embedding = embeddings[index];
        
        if (embedding) {
          try {
            const similarity = cosineSimilarity(queryEmbedding, embedding);
            
            // Store all scores for debugging
            allSimilarityScores.push({
              text: chunk.text.length > 60 ? chunk.text.substring(0, 60) + '...' : chunk.text,
              score: similarity
            });
            
            // Only include results above the threshold
            if (similarity > similarityThreshold) {
              results.push({
                ...chunk,
                similarity,
                text: chunk.text
              });
            }
          } catch (error) {
            console.error('Error calculating similarity:', error);
          }
        }
      });
      
      // Update status for long-running searches
      updateStatusIndicator(`Processed ${Math.min(i + batchSize, chunks.length)} of ${chunks.length} sections...`, true);
    }
    
    // Debug: Log all similarity scores for analysis
    console.log('All similarity scores:', allSimilarityScores.sort((a, b) => b.score - a.score));
    console.log(`Top 5 scores:`, allSimilarityScores.slice(0, 5));
    console.log(`Results above threshold (${similarityThreshold}):`, results.length);
    
    // Sort results by similarity (highest first)
    const sortedResults = results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 10); // Only show top 10 results
    
    // Display results
    displayResults(sortedResults);
    
    // Update status
    isSearching = false;
    updateStatusIndicator(
      sortedResults.length > 0 
        ? `${sortedResults.length} results found` 
        : 'No matching content found',
      false
    );
    
  } catch (error) {
    console.error('Error performing semantic search:', error);
    isSearching = false;
    updateStatusIndicator('Error performing search', false);
  }
}

/**
 * Display search results
 */
function displayResults(results: any[]) {
  if (!searchOverlayElement) return;
  
  const resultsContainer = searchOverlayElement.querySelector('.vibe-semantic-search-results') as HTMLElement;
  const navigationControls = searchOverlayElement.querySelector('.vibe-semantic-search-navigation') as HTMLElement;
  
  if (resultsContainer && navigationControls) {
    // Store results globally
    currentResults = results;
    currentResultIndex = results.length > 0 ? 0 : -1;
    
    // Clear container
    resultsContainer.innerHTML = '';
    
    // Show container if we have results
    if (results.length > 0) {
      resultsContainer.style.display = 'flex';
      navigationControls.style.display = 'flex';
      
      // Create result elements
      results.forEach((result, index) => {
        const resultElement = document.createElement('div');
        resultElement.className = 'vibe-semantic-search-result';
        resultElement.dataset.index = index.toString();
        
        // Highlight first result
        if (index === 0) {
          resultElement.classList.add('active');
        }
        
        Object.assign(resultElement.style, {
          padding: '10px',
          borderRadius: '6px',
          border: '1px solid #eee',
          cursor: 'pointer',
          backgroundColor: index === 0 ? '#f5f9ff' : 'white',
          borderLeft: index === 0 ? '3px solid #4F46E5' : '1px solid #eee'
        });
        
        // Create similarity badge
        const similarityBadge = document.createElement('div');
        similarityBadge.textContent = `${Math.round(result.similarity * 100)}%`;
        Object.assign(similarityBadge.style, {
          fontSize: '12px',
          fontWeight: 'bold',
          color: '#4F46E5',
          backgroundColor: '#EEF2FF',
          padding: '2px 6px',
          borderRadius: '12px',
          display: 'inline-block',
          marginBottom: '4px'
        });
        
        // Create text content
        const textContent = document.createElement('div');
        textContent.textContent = result.text;
        Object.assign(textContent.style, {
          fontSize: '14px',
          lineHeight: '1.4',
          color: '#333'
        });
        
        resultElement.appendChild(similarityBadge);
        resultElement.appendChild(textContent);
        
        // Add click handler
        resultElement.addEventListener('click', () => {
          navigateToResult(index);
        });
        
        resultsContainer.appendChild(resultElement);
      });
      
      // Update counter
      updateCounter();
    } else {
      resultsContainer.style.display = 'none';
      navigationControls.style.display = 'none';
    }
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
function navigateResults(direction: 'next' | 'previous') {
  if (currentResults.length === 0) return;
  
  const newIndex = direction === 'next'
    ? (currentResultIndex + 1) % currentResults.length
    : (currentResultIndex - 1 + currentResults.length) % currentResults.length;
  
  navigateToResult(newIndex);
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
  const resultElements = resultsContainer?.querySelectorAll('.vibe-semantic-search-result');
  
  if (resultElements) {
    resultElements.forEach((el, i) => {
      const element = el as HTMLElement;
      if (i === index) {
        element.classList.add('active');
        element.style.backgroundColor = '#f5f9ff';
        element.style.borderLeft = '3px solid #4F46E5';
        
        // Scroll the result into view
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        element.classList.remove('active');
        element.style.backgroundColor = 'white';
        element.style.borderLeft = '1px solid #eee';
      }
    });
  }
  
  // TODO: Highlight the result in the page content
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