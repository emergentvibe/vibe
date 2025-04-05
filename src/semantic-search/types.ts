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
   * CSS selector path to the DOM element
   */
  domPath: string;
  
  /**
   * Reference to the actual DOM element (if available)
   */
  element: Element | null;
  
  /**
   * Start position within the element's text content
   */
  startOffset: number;
  
  /**
   * End position within the element's text content
   */
  endOffset: number;
  
  /**
   * Optional vector embedding of the chunk text
   */
  embedding?: number[];
}

/**
 * Search result matching a text chunk
 */
export interface SearchResult {
  /**
   * Reference to the matching chunk's ID
   */
  chunkId: string;
  
  /**
   * Similarity score (0-1) with the search query
   */
  similarity: number;
  
  /**
   * The text content of the matching chunk
   */
  text: string;
  
  /**
   * Reference to the DOM element
   */
  element: Element | null;
  
  /**
   * Optional highlighting positions within the chunk
   */
  highlights?: {
    start: number;
    end: number;
  }[];
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