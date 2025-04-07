/**
 * Type definitions for Semantic Search feature
 */

/**
 * Represents a chunk of text extracted from the DOM
 */
export interface TextChunk {
  /**
   * Unique identifier for the chunk
   */
  id: string;
  
  /**
   * The text content of the chunk
   */
  text: string;
  
  /**
   * Reference to the actual DOM element (if available)
   */
  element: HTMLElement;
  
  /**
   * Source URL of the chunk
   */
  sourceUrl?: string;
  
  /**
   * Position of the chunk
   */
  position?: number;
  
  /**
   * Embedding vector for the chunk
   */
  embedding?: number[];
}

/**
 * Search result matching a text chunk
 */
export interface SearchResult {
  /**
   * Reference to the matching chunk
   */
  chunk: TextChunk;
  
  /**
   * Reference to the DOM element
   */
  element: HTMLElement | null;
  
  /**
   * Score of the search result (0-1)
   */
  score: number;
  
  /**
   * Highlighted text content
   */
  highlightedText?: string;
  
  /**
   * Vertical position of the element on the page (for sorting top-to-bottom)
   */
  verticalPosition: number;
  
  /**
   * Whether the element is visible on the page
   */
  visible: boolean;
  
  /**
   * Optional highlighting positions within the chunk
   */
  highlights?: {
    start: number;
    end: number;
  }[];
  
  /**
   * @deprecated Use chunk.id instead
   */
  chunkId?: string;
  
  /**
   * @deprecated Use score instead
   */
  similarity?: number;
  
  /**
   * @deprecated Use chunk.text instead
   */
  text?: string;
}

/**
 * Configuration options for content processing
 */
export interface ContentProcessorOptions {
  /**
   * Minimum characters per chunk
   */
  minChunkLength: number;
  
  /**
   * Maximum characters per chunk
   */
  maxChunkLength: number;
  
  /**
   * Percentage of overlap between chunks
   */
  overlapPercentage: number;
  
  /**
   * CSS selectors for elements to exclude
   */
  excludeSelectors: string[];
}

/**
 * Options for text chunk generation
 */
export interface TextChunkOptions {
  /**
   * Minimum chunk size
   */
  minChunkSize?: number;
  
  /**
   * Maximum chunk size
   */
  maxChunkSize?: number;
  
  /**
   * Overlap size
   */
  overlapSize?: number;
  
  /**
   * CSS selectors for elements to exclude
   */
  excludeSelectors?: string[];
} 