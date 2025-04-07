/**
 * Semantic Search - Main Entry Point
 * 
 * This module is the entry point for the semantic search feature.
 * It handles keyboard shortcuts and initializes the UI components.
 */

// Import required modules
import { TextChunk } from './types';
import { SearchResult } from './types';
import { extractTextChunks } from './utils/text-chunker';
import { generateEmbedding, cosineSimilarity } from './services/embedding-service';
import { featureFlags } from '../config/feature-flags';

// Keyboard shortcut configuration
const isMac = navigator.platform.toLowerCase().includes('mac');
const KEYBOARD_SHORTCUT = {
  key: 'f',
  modifier: isMac ? 'Alt' : 'Alt', // Option key on Mac registers as Alt
  display: isMac ? 'Option-F' : 'Alt-F'
};

// Define DebugData type
interface DebugData {
  chunks?: TextChunk[];
  embeddings?: number[][];
  search?: {
    query: string;
    queryEmbedding: number[];
    results: SearchResult[];
  };
  matches?: {
    threshold: number;
    results: SearchResult[];
  };
}

// State management
let isInitialized = false;
let isSearchVisible = false;
let isEmbeddingReady = false;
let pageChunks: TextChunk[] = [];
let chunkEmbeddings: Record<string, number[]> = {};
let currentResults: SearchResult[] = [];
let currentResultIndex = -1;
let searchOverlayElement: HTMLElement | null = null;
// Search mode toggle
let isSemanticMode = true; // true = semantic, false = regular

/**
 * TextNodeCache - Manages text node extraction and caching
 */
class TextNodeCache {
  private nodes: Text[] = [];
  private isInitialized = false;

  /**
   * Initialize the text node cache
   */
  initialize(): void {
    if (this.isInitialized) return;
    this.nodes = this.getAllTextNodes();
    this.isInitialized = true;
    console.log(`TextNodeCache: Initialized with ${this.nodes.length} text nodes`);
  }

  /**
   * Get all text nodes in the document
   */
  private getAllTextNodes(): Text[] {
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip empty text nodes
          if (!node.textContent?.trim()) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Skip script, style, noscript tags
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          
          const tagName = parent.tagName.toLowerCase();
          if (['script', 'style', 'noscript', 'svg'].includes(tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Skip hidden elements
          if (window.getComputedStyle(parent).display === 'none' ||
              window.getComputedStyle(parent).visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT;
          }
          
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    
    let currentNode: Text | null;
    while ((currentNode = walker.nextNode() as Text)) {
      nodes.push(currentNode);
    }
    
    return nodes;
  }

  /**
   * Get the cached text nodes
   */
  getNodes(): Text[] {
    if (!this.isInitialized) {
      this.initialize();
    }
    return this.nodes;
  }

  /**
   * Find text matches in the cached nodes
   */
  findMatches(text: string): Array<{node: Text, start: number, end: number}> {
    const matches: Array<{node: Text, start: number, end: number}> = [];
    const escapedText = this.escapeRegExp(text);
    const regex = new RegExp(escapedText, 'i'); // Case insensitive
    
    for (const node of this.getNodes()) {
      const nodeText = node.textContent || '';
      const match = regex.exec(nodeText);
      
      if (match) {
        matches.push({
          node,
          start: match.index,
          end: match.index + match[0].length
        });
      }
    }
    
    return matches;
  }

  /**
   * Escape special characters for regex
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Check if an element is visible
   */
  isElementVisible(element: HTMLElement): boolean {
    if (!element) return false;
    
    const style = window.getComputedStyle(element);
    return !(style.display === 'none' || 
             style.visibility === 'hidden' || 
             style.opacity === '0' ||
             element.offsetWidth === 0 || 
             element.offsetHeight === 0);
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.nodes = [];
    this.isInitialized = false;
  }
}

/**
 * HighlightManager - Handles all highlighting operations
 */
class HighlightManager {
  private readonly highlightClass = 'vibe-semantic-highlight';
  private readonly activeHighlightClass = 'vibe-semantic-highlight-active';
  private textNodes: Text[] = [];
  private initialized = false;

  /**
   * Initialize the manager
   */
  initialize(): void {
    if (this.initialized) return;
    this.textNodes = this.getAllTextNodes();
    this.initialized = true;
    console.log(`HighlightManager: Initialized with ${this.textNodes.length} text nodes`);
  }

  /**
   * Get all text nodes in the document
   */
  private getAllTextNodes(): Text[] {
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip empty text nodes
          if (!node.textContent?.trim()) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Skip script, style, noscript tags
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          
          const tagName = parent.tagName.toLowerCase();
          if (['script', 'style', 'noscript', 'svg'].includes(tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Skip hidden elements
          if (window.getComputedStyle(parent).display === 'none' ||
              window.getComputedStyle(parent).visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT;
          }
          
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    
    let currentNode: Text | null;
    while ((currentNode = walker.nextNode() as Text)) {
      nodes.push(currentNode);
    }
    
    return nodes;
  }

  /**
   * Find and highlight text for all results
   */
  findAndHighlightText(results: SearchResult[]): SearchResult[] {
    // Initialize if not already done
    if (!this.initialized) {
      this.initialize();
    }
    
    // Remove any existing highlights
    this.removeAllHighlights();
    
    const visibleResults: SearchResult[] = [];
    
    // For each result, try to find its text in the document
    for (const result of results) {
      try {
        const text = result.chunk.text.trim();
        if (!text) continue;
        
        // Find text nodes containing this text
        const matches = this.findTextMatches(text);
        if (matches.length === 0) continue;
        
        // Use the first match (most likely match)
        const match = matches[0];
        const element = match.node.parentElement;
        
        if (element && this.isElementVisible(element)) {
          // Create highlight using Range API
          const highlightElement = this.highlightMatch(match);
          
          if (highlightElement) {
            // Store the element reference and position
            result.element = element;
            result.visible = true;
            result.verticalPosition = this.getElementVerticalPosition(element);
            visibleResults.push(result);
          }
        }
      } catch (error) {
        console.error('Error highlighting text:', error, result);
        result.visible = false;
      }
    }
    
    return visibleResults;
  }

  /**
   * Find text matches in text nodes
   */
  private findTextMatches(text: string): Array<{node: Text, start: number, end: number}> {
    const matches: Array<{node: Text, start: number, end: number}> = [];
    const escapedText = this.escapeRegExp(text);
    const regex = new RegExp(escapedText, 'i'); // Case insensitive
    
    for (const node of this.textNodes) {
      const nodeText = node.textContent || '';
      const match = regex.exec(nodeText);
      
      if (match) {
        matches.push({
          node,
          start: match.index,
          end: match.index + match[0].length
        });
      }
    }
    
    return matches;
  }

  /**
   * Escape special characters for regex
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Highlight a text match using Range API
   */
  private highlightMatch(match: {node: Text, start: number, end: number}): HTMLElement | null {
    try {
      const range = document.createRange();
      range.setStart(match.node, match.start);
      range.setEnd(match.node, match.end);
      
      const highlight = document.createElement('span');
      highlight.className = this.highlightClass;
      highlight.style.backgroundColor = 'rgba(255, 255, 100, 0.4)';
      highlight.style.borderRadius = '2px';
      
      range.surroundContents(highlight);
      return highlight;
    } catch (error) {
      console.error('Error highlighting match:', error);
      return null;
    }
  }

  /**
   * Set active highlight
   */
  setActiveHighlight(index: number): void {
    // Remove active class from all highlights
    document.querySelectorAll(`.${this.activeHighlightClass}`).forEach(el => {
      el.classList.remove(this.activeHighlightClass);
    });
    
    // Add active class to the highlight at the specified index
    const highlights = document.querySelectorAll(`.${this.highlightClass}`);
    if (index >= 0 && index < highlights.length) {
      highlights[index].classList.add(this.activeHighlightClass);
      this.scrollToElement(highlights[index] as HTMLElement);
    }
  }

  /**
   * Check if an element is visible
   */
  private isElementVisible(element: HTMLElement): boolean {
    if (!element) return false;
    
    const style = window.getComputedStyle(element);
    return !(style.display === 'none' || 
             style.visibility === 'hidden' || 
             style.opacity === '0' ||
             element.offsetWidth === 0 || 
             element.offsetHeight === 0);
  }

  /**
   * Scroll to element
   */
  scrollToElement(element: HTMLElement): void {
    if (!element) return;
    
    // Scroll the element into view
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  }

  /**
   * Remove all highlights from the page
   */
  removeAllHighlights(): void {
    const highlights = document.querySelectorAll(`.${this.highlightClass}`);
    
    highlights.forEach(highlight => {
      // Replace the highlight with its content
      if (highlight.parentNode) {
        const parent = highlight.parentNode;
        while (highlight.firstChild) {
          parent.insertBefore(highlight.firstChild, highlight);
        }
        parent.removeChild(highlight);
      }
    });
  }

  /**
   * Get vertical position of an element
   */
  private getElementVerticalPosition(element: HTMLElement): number {
    return element.getBoundingClientRect().top + window.scrollY;
  }

  /**
   * Reset the manager
   */
  reset(): void {
    this.removeAllHighlights();
    this.textNodes = [];
    this.initialized = false;
  }
}

/**
 * UIManager - Handles all UI operations
 */
class UIManager {
  private statusElement: HTMLElement | null = null;
  private counterElement: HTMLElement | null = null;
  private resultsElement: HTMLElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private prevButton: HTMLButtonElement | null = null;
  private nextButton: HTMLButtonElement | null = null;
  private overlayElement: HTMLElement | null = null;
  private modeToggleButton: HTMLButtonElement | null = null;

  /**
   * Initialize the UI manager
   */
  initialize(): void {
    if (!this.overlayElement) {
      this.overlayElement = createOverlayElement();
      
      // Set UI references from the created overlay
      const statusEl = this.overlayElement.querySelector('.status') as HTMLElement;
      const counterEl = this.overlayElement.querySelector('.counter') as HTMLElement;
      const resultsEl = this.overlayElement.querySelector('.results') as HTMLElement;
      const searchInputEl = this.overlayElement.querySelector('.search-input') as HTMLInputElement;
      const prevButtonEl = this.overlayElement.querySelector('.prev-button') as HTMLButtonElement;
      const nextButtonEl = this.overlayElement.querySelector('.next-button') as HTMLButtonElement;
      const modeToggleEl = this.overlayElement.querySelector('.mode-toggle') as HTMLButtonElement;
      
      if (statusEl) this.setStatusElement(statusEl);
      if (counterEl) this.setCounterElement(counterEl);
      if (resultsEl) this.setResultsElement(resultsEl);
      if (searchInputEl) this.setSearchInput(searchInputEl);
      if (prevButtonEl && nextButtonEl) this.setNavigationButtons(prevButtonEl, nextButtonEl);
      if (modeToggleEl) this.setModeToggleButton(modeToggleEl);
    }
  }

  /**
   * Show the UI
   */
  show(): void {
    if (!this.overlayElement) {
      this.initialize();
    }
    
    if (this.overlayElement) {
      this.overlayElement.style.display = 'flex';
      if (this.searchInput) {
        this.searchInput.focus();
      }
    }
  }

  /**
   * Hide the UI
   */
  hide(): void {
    if (this.overlayElement) {
      this.overlayElement.style.display = 'none';
    }
  }

  /**
   * Set status element reference
   */
  setStatusElement(element: HTMLElement): void {
    this.statusElement = element;
  }

  /**
   * Set counter element reference
   */
  setCounterElement(element: HTMLElement): void {
    this.counterElement = element;
  }

  /**
   * Set results element reference
   */
  setResultsElement(element: HTMLElement): void {
    this.resultsElement = element;
  }

  /**
   * Set search input reference
   */
  setSearchInput(element: HTMLInputElement): void {
    this.searchInput = element;
  }

  /**
   * Set navigation button references
   */
  setNavigationButtons(prevButton: HTMLButtonElement, nextButton: HTMLButtonElement): void {
    this.prevButton = prevButton;
    this.nextButton = nextButton;
  }

  /**
   * Set mode toggle button reference
   */
  setModeToggleButton(button: HTMLButtonElement): void {
    this.modeToggleButton = button;
    this.updateModeToggle(isSemanticMode);
  }

  /**
   * Update the mode toggle button state
   */
  updateModeToggle(isSemanticMode: boolean): void {
    if (!this.modeToggleButton) return;
    
    this.modeToggleButton.textContent = isSemanticMode ? 
      'Mode: Semantic' : 
      'Mode: Standard';
      
    this.modeToggleButton.title = isSemanticMode ?
      'Click to switch to standard text search' :
      'Click to switch to semantic search';
  }

  /**
   * Update status indicator
   */
  updateStatus(message: string, isLoading: boolean = false): void {
    if (!this.statusElement) return;
    
    if (isLoading) {
      this.statusElement.innerHTML = `<div class="loading-spinner"></div> ${message}`;
    } else {
      this.statusElement.textContent = message;
    }
  }

  /**
   * Update embedding status
   */
  updateEmbeddingStatus(message: string, progress: number = -1): void {
    if (!this.statusElement) return;
    
    if (progress >= 0) {
      this.statusElement.innerHTML = `<div class="loading-spinner"></div> ${message} (${progress}%)`;
    } else {
      this.statusElement.innerHTML = `<div class="loading-spinner"></div> ${message}`;
    }
  }

  /**
   * Update counter
   */
  updateCounter(current: number, total: number): void {
    if (!this.counterElement) return;
    
    if (total === 0) {
      this.counterElement.textContent = 'No matches';
    } else {
      this.counterElement.textContent = `${current + 1} of ${total} matches`;
    }
  }

  /**
   * Update navigation controls
   */
  updateNavigationControls(current: number, total: number): void {
    if (!this.prevButton || !this.nextButton) return;
    
    this.prevButton.disabled = total === 0 || current <= 0;
    this.nextButton.disabled = total === 0 || current >= total - 1;
  }

  /**
   * Display search results
   */
  displaySearchResults(results: SearchResult[]): void {
    if (!this.resultsElement) return;
    
    // Clear previous results
    this.resultsElement.innerHTML = '';
    
    if (results.length === 0) {
      const noResults = document.createElement('div');
      noResults.textContent = 'No results found';
      noResults.style.padding = '16px';
      noResults.style.color = '#666';
      noResults.style.textAlign = 'center';
      noResults.style.fontStyle = 'italic';
      this.resultsElement.appendChild(noResults);
      return;
    }
    
    // Create results list
    const resultsList = document.createElement('ul');
    resultsList.style.listStyle = 'none';
    resultsList.style.margin = '0';
    resultsList.style.padding = '0';
    
    // Add each result
    results.forEach((result, index) => {
      const resultItem = document.createElement('li');
      resultItem.style.padding = '12px 16px';
      resultItem.style.borderBottom = '1px solid #eee';
      resultItem.style.cursor = 'pointer';
      
      // Add hover effect
      resultItem.addEventListener('mouseenter', () => {
        resultItem.style.backgroundColor = '#f5f5f5';
      });
      
      resultItem.addEventListener('mouseleave', () => {
        resultItem.style.backgroundColor = '';
      });
      
      // Add click handler
      resultItem.addEventListener('click', () => {
        setActiveResult(index);
      });
      
      // Format the result text
      const resultText = document.createElement('div');
      resultText.textContent = result.chunk.text;
      resultText.style.fontSize = '14px';
      resultText.style.lineHeight = '1.4';
      
      // Add similarity score
      const scoreText = document.createElement('div');
      scoreText.textContent = `Similarity: ${(result.score * 100).toFixed(0)}%`;
      scoreText.style.fontSize = '12px';
      scoreText.style.color = '#888';
      scoreText.style.marginTop = '4px';
      
      // Assemble the result item
      resultItem.appendChild(resultText);
      resultItem.appendChild(scoreText);
      resultsList.appendChild(resultItem);
    });
    
    this.resultsElement.appendChild(resultsList);
  }

  /**
   * Clear results
   */
  clearResults(): void {
    if (!this.resultsElement) return;
    this.resultsElement.innerHTML = '';
  }

  /**
   * Focus search input
   */
  focusSearchInput(): void {
    if (!this.searchInput) return;
    this.searchInput.focus();
  }
}

/**
 * SearchService - Handles semantic search operations
 */
class SearchService {
  /**
   * Generate embeddings for the given chunks
   */
  async generateEmbeddings(chunks: TextChunk[]): Promise<Record<string, number[]>> {
    const embeddings: Record<string, number[]> = {};
    
    try {
      // Process chunks in batches
      const batchSize = 5;
      let processedCount = 0;
      
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        
        // Generate embeddings for the batch in parallel
        const batchResults = await Promise.all(
          batch.map(async (chunk) => {
            try {
              const embedding = await generateEmbedding(chunk.text);
              return { id: chunk.id, embedding };
            } catch (error) {
              console.error(`Failed to generate embedding for chunk ${chunk.id}:`, error);
              return { id: chunk.id, embedding: [] };
            }
          })
        );
        
        // Store the embeddings
        batchResults.forEach(({ id, embedding }) => {
          if (embedding.length > 0) {
            embeddings[id] = embedding;
          }
        });
        
        // Update progress
        processedCount += batch.length;
        const progress = Math.round((processedCount / chunks.length) * 100);
        updateEmbeddingStatus(`Embedding website...`, progress);
      }
      
      return embeddings;
    } catch (error) {
      console.error('Failed to generate embeddings:', error);
      return embeddings;
    }
  }

  /**
   * Perform semantic search for the given query
   */
  async search(query: string, chunks: TextChunk[], embeddings: Record<string, number[]>): Promise<SearchResult[]> {
    try {
      // Generate embedding for the query
      const queryEmbedding = await generateEmbedding(query);
      
      // Calculate similarity for all chunks
      const results: SearchResult[] = [];
      const similarityThreshold = 0.3;
      
      for (const chunk of chunks) {
        const embedding = embeddings[chunk.id];
        if (!embedding) continue;
        
        try {
          const similarity = cosineSimilarity(queryEmbedding, embedding);
          if (similarity > similarityThreshold) {
            results.push({
              chunk,
              element: null,
              score: similarity,
              highlightedText: chunk.text,
              verticalPosition: 0,
              visible: false
            });
          }
        } catch (error) {
          console.error('Error calculating similarity:', error);
        }
      }
      
      // Sort results by similarity
      results.sort((a, b) => b.score - a.score);
      
      return results;
    } catch (error) {
      console.error('Error performing search:', error);
      throw new Error('Failed to perform search');
    }
  }
}

// Create manager instances
const highlightManager = new HighlightManager();
const uiManager = new UIManager();
const textNodeCache = new TextNodeCache();
const searchService = new SearchService();

/**
 * Initialize semantic search
 */
function initSemanticSearch(): void {
  if (isInitialized) return;
  
  // Check if semantic search feature is enabled
  if (!featureFlags.isEnabled('semanticSearch')) {
    console.log('Semantic search feature is disabled via feature flags');
    return;
  }
  
  console.log('Initializing semantic search...');
  
  // Add keyboard listener
  document.addEventListener('keydown', handleKeyDown);
  
  // Initialize UI
  uiManager.initialize();
  
  isInitialized = true;
}

/**
 * Handle keyboard events
 */
function handleKeyDown(event: KeyboardEvent): void {
  // Option-F or Alt-F to toggle search
  if (event.key === 'f' && (event.altKey || event.metaKey)) {
    event.preventDefault();
    toggleSemanticSearch();
  }
  
  // ESC to close search
  if (event.key === 'Escape' && isSearchVisible) {
    event.preventDefault();
    hideSemanticSearch();
  }
  
  // Arrow navigation for results
  if (isSearchVisible && currentResults.length > 0) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      navigateResults('next');
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      navigateResults('prev');
    }
  }
}

/**
 * Toggle semantic search visibility
 */
function toggleSemanticSearch(): void {
  if (isSearchVisible) {
    hideSemanticSearch();
  } else {
    showSemanticSearch();
  }
}

/**
 * Show semantic search
 */
function showSemanticSearch(): void {
  if (isSearchVisible) return;
  
  console.log('Showing semantic search');
  
  // Init UI if needed
  uiManager.initialize();
  uiManager.show();
  
  // Start content processing if not done yet
  if (!isEmbeddingReady) {
    uiManager.updateStatus('Embedding website...', true);
    startProcessingContent();
  } else {
    uiManager.updateStatus('Ready to search');
  }
  
  isSearchVisible = true;
}

/**
 * Hide semantic search
 */
function hideSemanticSearch(): void {
  if (!isSearchVisible) return;
  
  console.log('Hiding semantic search');
  
  // Hide UI
  uiManager.hide();
  
  // Clear results
  highlightManager.removeAllHighlights();
  currentResults = [];
  currentResultIndex = -1;
  
  isSearchVisible = false;
}

/**
 * Start processing webpage content
 */
async function startProcessingContent(): Promise<void> {
  if (isEmbeddingReady) return;
  
  console.log('Starting content processing...');
  
  try {
    // Extract text chunks
    pageChunks = await extractTextChunks();
    console.log(`Extracted ${pageChunks.length} text chunks`);
    
    // Initialize text node cache
    textNodeCache.initialize();
    
    // Generate embeddings
    chunkEmbeddings = await searchService.generateEmbeddings(pageChunks);
    
    isEmbeddingReady = true;
    uiManager.updateStatus('Ready to search');
  } catch (error) {
    console.error('Failed to process content:', error);
    uiManager.updateStatus('Failed to process content');
  }
}

/**
 * Update embedding status
 */
function updateEmbeddingStatus(message: string, progress: number = -1): void {
  uiManager.updateEmbeddingStatus(message, progress);
}

/**
 * Toggle search mode between semantic and regular
 */
function toggleSearchMode(): void {
  isSemanticMode = !isSemanticMode;
  
  // Update UI
  uiManager.updateModeToggle(isSemanticMode);
  
  // Update placeholder text
  const searchInput = document.querySelector('#vibe-semantic-search-overlay .search-input') as HTMLInputElement;
  if (searchInput) {
    searchInput.placeholder = isSemanticMode ? 'Search for meaning...' : 'Search for text...';
  }
  
  // Update status message
  if (isSemanticMode) {
    uiManager.updateStatus(isEmbeddingReady ? 'Ready for semantic search' : 'Preparing semantic search...');
    
    // Start content processing if not done yet
    if (!isEmbeddingReady) {
      startProcessingContent();
    }
  } else {
    uiManager.updateStatus('Ready for standard search');
  }
  
  // Clear previous results
  clearResults();
  highlightManager.removeAllHighlights();
  currentResults = [];
  currentResultIndex = -1;
  uiManager.updateCounter(0, 0);
  uiManager.updateNavigationControls(0, 0);
}

/**
 * Perform search using current search mode
 */
async function performSearch(query: string): Promise<void> {
  if (!query.trim()) {
    uiManager.updateStatus('Please enter a search query');
    return;
  }
  
  // Clear previous results
  highlightManager.removeAllHighlights();
  currentResults = [];
  currentResultIndex = -1;
  
  if (isSemanticMode) {
    // Perform semantic search
    await performSemanticSearch(query);
  } else {
    // Perform regular text search
    performRegularSearch(query);
  }
}

/**
 * Perform semantic search
 */
async function performSemanticSearch(query: string): Promise<void> {
  if (!isEmbeddingReady) {
    uiManager.updateStatus('Still embedding website...', true);
    return;
  }
  
  console.log(`Performing semantic search for: "${query}"`);
  
  try {
    // Perform search
    uiManager.updateStatus('Searching...', true);
    const searchResults = await searchService.search(query, pageChunks, chunkEmbeddings);
    
    // Highlight results
    const visibleResults = highlightManager.findAndHighlightText(searchResults);
    currentResults = visibleResults;
    
    // Display results
    uiManager.displaySearchResults(currentResults);
    uiManager.updateStatus(`Found ${currentResults.length} semantic matches`);
    
    // Set active result
    if (currentResults.length > 0) {
      setActiveResult(0);
    } else {
      uiManager.updateCounter(0, 0);
      uiManager.updateNavigationControls(0, 0);
    }
  } catch (error) {
    console.error('Semantic search failed:', error);
    uiManager.updateStatus('Semantic search failed');
  }
}

/**
 * Perform regular text search (standard control-F)
 */
function performRegularSearch(query: string): void {
  console.log(`Performing regular search for: "${query}"`);
  
  try {
    // Use text node cache for searching
    textNodeCache.initialize();
    const nodes = textNodeCache.getNodes();
    
    // Create results from matches
    const results: SearchResult[] = [];
    let matchCount = 0;
    
    // Use regex to find matches
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedQuery, 'gi');
    
    // Search all text nodes
    for (const node of nodes) {
      const text = node.textContent || '';
      let match;
      
      // Reset regex lastIndex to start fresh for each node
      regex.lastIndex = 0;
      
      // Find all matches in this node
      while ((match = regex.exec(text)) !== null) {
        const element = node.parentElement as HTMLElement;
        if (!element) continue;
        
        // Create a chunk object for this match
        const chunk: TextChunk = {
          id: `regular-${matchCount}`,
          text: match[0],
          element: element,
          position: 0,
          // Add any additional context
          sourceUrl: window.location.href
        };
        
        // Create result
        results.push({
          chunk,
          element,
          score: 1.0, // Regular matches have perfect score
          highlightedText: match[0],
          verticalPosition: element.getBoundingClientRect().top + window.scrollY,
          visible: true
        });
        
        matchCount++;
      }
    }
    
    // Highlight the results
    highlightManager.findAndHighlightText(results);
    currentResults = results;
    
    // Update UI
    uiManager.displaySearchResults(results);
    uiManager.updateStatus(`Found ${results.length} text matches`);
    
    // Set active result
    if (results.length > 0) {
      setActiveResult(0);
    } else {
      uiManager.updateCounter(0, 0);
      uiManager.updateNavigationControls(0, 0);
    }
  } catch (error) {
    console.error('Regular search failed:', error);
    uiManager.updateStatus('Search failed');
  }
}

/**
 * Set active result
 */
function setActiveResult(index: number): void {
  if (currentResults.length === 0 || index < 0 || index >= currentResults.length) {
    return;
  }
  
  currentResultIndex = index;
  
  // Update UI
  uiManager.updateCounter(currentResultIndex, currentResults.length);
  uiManager.updateNavigationControls(currentResultIndex, currentResults.length);
  
  // Highlight current result
  highlightManager.setActiveHighlight(index);
}

/**
 * Navigate between results
 */
function navigateResults(direction: 'next' | 'prev'): void {
  if (currentResults.length === 0) return;
  
  let newIndex = currentResultIndex;
  
  if (direction === 'next' && currentResultIndex < currentResults.length - 1) {
    newIndex++;
  } else if (direction === 'prev' && currentResultIndex > 0) {
    newIndex--;
  }
  
  if (newIndex !== currentResultIndex) {
    setActiveResult(newIndex);
  }
}

/**
 * Create overlay element
 */
function createOverlayElement(): HTMLElement {
  const overlayElement = document.createElement('div');
  overlayElement.id = 'vibe-semantic-search-overlay';
  overlayElement.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 400px;
    max-width: calc(100vw - 40px);
    background: white;
    border: 1px solid #ccc;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 999999999;
    font-family: Arial, sans-serif;
    display: none;
    flex-direction: column;
    max-height: calc(100vh - 40px);
  `;
  
  // Create search header
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 16px;
    border-bottom: 1px solid #eee;
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  
  // Create search input
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search...';
  searchInput.className = 'search-input';
  searchInput.style.cssText = `
    flex: 1;
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
  `;
  
  // Create search button
  const searchButton = document.createElement('button');
  searchButton.textContent = 'Search';
  searchButton.style.cssText = `
    padding: 8px 12px;
    background: #4285f4;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 14px;
    cursor: pointer;
  `;
  
  // Create close button
  const closeButton = document.createElement('button');
  closeButton.textContent = '×';
  closeButton.style.cssText = `
    border: none;
    background: transparent;
    font-size: 20px;
    cursor: pointer;
    color: #666;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
  `;
  
  // Create mode toggle
  const modeToggleButton = document.createElement('button');
  modeToggleButton.textContent = 'Mode: Semantic';
  modeToggleButton.className = 'mode-toggle';
  modeToggleButton.style.cssText = `
    padding: 4px 8px;
    background: #f0f0f0;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    margin-left: 8px;
  `;
  
  // Create status section
  const statusSection = document.createElement('div');
  statusSection.style.cssText = `
    padding: 8px 16px;
    background: #f8f9fa;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    color: #555;
  `;
  
  // Create status indicator
  const statusElement = document.createElement('div');
  statusElement.className = 'status';
  statusElement.textContent = 'Ready';
  
  // Create counter element
  const counterElement = document.createElement('div');
  counterElement.className = 'counter';
  counterElement.textContent = '0 matches';
  
  // Create results section
  const resultsElement = document.createElement('div');
  resultsElement.className = 'results';
  resultsElement.style.cssText = `
    padding: 0;
    overflow-y: auto;
    flex: 1;
    max-height: 300px;
  `;
  
  // Create navigation section
  const navigationSection = document.createElement('div');
  navigationSection.style.cssText = `
    padding: 8px 16px;
    border-top: 1px solid #eee;
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;
  
  // Create navigation buttons
  const prevButton = document.createElement('button');
  prevButton.textContent = '← Previous';
  prevButton.className = 'prev-button';
  prevButton.disabled = true;
  prevButton.style.cssText = `
    padding: 6px 12px;
    background: #f2f2f2;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
  `;
  
  const nextButton = document.createElement('button');
  nextButton.textContent = 'Next →';
  nextButton.className = 'next-button';
  nextButton.disabled = true;
  nextButton.style.cssText = `
    padding: 6px 12px;
    background: #f2f2f2;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
  `;
  
  // Assemble the UI
  header.appendChild(searchInput);
  header.appendChild(searchButton);
  header.appendChild(modeToggleButton);
  header.appendChild(closeButton);
  
  statusSection.appendChild(statusElement);
  statusSection.appendChild(counterElement);
  
  navigationSection.appendChild(prevButton);
  navigationSection.appendChild(nextButton);
  
  overlayElement.appendChild(header);
  overlayElement.appendChild(statusSection);
  overlayElement.appendChild(resultsElement);
  overlayElement.appendChild(navigationSection);
  
  // Add event listeners
  searchButton.addEventListener('click', () => {
    if (searchInput.value) {
      performSearch(searchInput.value);
    }
  });
  
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && searchInput.value) {
      performSearch(searchInput.value);
    }
  });
  
  closeButton.addEventListener('click', () => {
    toggleSemanticSearch();
  });
  
  prevButton.addEventListener('click', () => {
    navigateResults('prev');
  });
  
  nextButton.addEventListener('click', () => {
    navigateResults('next');
  });
  
  modeToggleButton.addEventListener('click', () => {
    toggleSearchMode();
  });
  
  // Store the overlay element
  searchOverlayElement = overlayElement;
  
  // Add to document
  document.body.appendChild(overlayElement);
  
  return overlayElement;
}

/**
 * Clean up semantic search
 */
function cleanupSemanticSearch(): void {
  if (!isInitialized) return;
  
  console.log('Cleaning up semantic search...');
  
  // Remove event listeners
  document.removeEventListener('keydown', handleKeyDown);
  
  // Clean up UI
  uiManager.clearResults();
  
  // Remove highlights
  highlightManager.reset();
  
  // Clear cache
  textNodeCache.clear();
  
  // Remove overlay element if it exists
  if (searchOverlayElement && searchOverlayElement.parentNode) {
    searchOverlayElement.parentNode.removeChild(searchOverlayElement);
    searchOverlayElement = null;
  }
  
  // Reset state
  isInitialized = false;
  isSearchVisible = false;
  isEmbeddingReady = false;
  pageChunks = [];
  chunkEmbeddings = {};
  currentResults = [];
  currentResultIndex = -1;
}

/**
 * Clear results in the UI
 */
function clearResults(): void {
  uiManager.clearResults();
}

// Export public functions
export { initSemanticSearch, cleanupSemanticSearch }; 