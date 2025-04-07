/**
 * Text Chunker Utility
 * 
 * Responsible for extracting and chunking text content from a webpage
 * into meaningful units for semantic search.
 */

import { TextChunk } from '../types';

// Default options for content processing
const DEFAULT_OPTIONS = {
  minChunkLength: 50,    // Minimum characters per chunk (reduced from 100)
  maxChunkLength: 100,   // Maximum characters per chunk (reduced from 1000)
  overlapPercentage: 0, // Percentage of overlap between chunks (increased from 10)
  excludeSelectors: [
    'script', 'style', 'noscript', 'iframe', 'svg',
    'nav', 'header', 'footer', 'aside',
    '.ad', '.ads', '.advertisement', '[aria-hidden="true"]'
  ]
};

/**
 * Process the current document and extract text chunks
 */
export function extractTextChunks(options = DEFAULT_OPTIONS): TextChunk[] {
  // Get all text-containing elements
  const textNodes = getTextNodes(options.excludeSelectors);
  
  // Extract raw text from each element
  const rawChunks = extractRawChunks(textNodes);
  
  // Process raw chunks into semantic chunks
  const chunks = processChunks(rawChunks, options);
  console.log(`📝 Created ${chunks.length} semantic chunks`);
  
  return chunks;
}

/**
 * Get all text-containing elements from the document,
 * excluding elements matching the exclude selectors
 */
function getTextNodes(excludeSelectors: string[]): Element[] {
  // Create a selector to exclude elements
  const excludeSelector = excludeSelectors.join(', ');
  
  // Get all elements with text
  const allElements = document.querySelectorAll('body *');
  
  // Filter to only elements with visible text
  const textElements = Array.from(allElements).filter(element => {
    // Skip excluded elements
    if (element.matches(excludeSelector)) {
      return false;
    }
    
    // Skip elements with no text
    const text = element.textContent?.trim();
    if (!text) {
      return false;
    }
    
    // Skip hidden elements
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    
    // Check if this element contains mostly text (not just a wrapper)
    const hasTextNode = Array.from(element.childNodes).some(
      node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
    );
    
    return hasTextNode;
  });
  
  return textElements;
}

/**
 * Extract raw text chunks from elements
 */
function extractRawChunks(elements: Element[]): { 
  element: Element; 
  text: string; 
  domPath: string;
}[] {
  return elements.map(element => {
    return {
      element,
      text: element.textContent?.trim() || '',
      domPath: getDomPath(element)
    };
  }).filter(chunk => chunk.text.length > 0);
}

/**
 * Process raw chunks into semantic chunks
 */
function processChunks(
  rawChunks: { element: Element; text: string; domPath: string }[],
  options: typeof DEFAULT_OPTIONS
): TextChunk[] {
  const result: TextChunk[] = [];
  
  // Helper function to split a large text into smaller chunks with overlap
  const splitTextIntoChunks = (text: string, domPath: string, element: Element): TextChunk[] => {
    const chunks: TextChunk[] = [];
    
    // If text is small enough, return it as a single chunk
    if (text.length <= options.maxChunkLength) {
      if (text.length >= options.minChunkLength) {
        // Check if the element is valid
        const isValidElement = element instanceof HTMLElement;
        
        chunks.push({
          id: generateChunkId(),
          text,
          element: element as HTMLElement,
          position: 0
        });
      }
      return chunks;
    }
    
    // Split long text into chunks
    let startPos = 0;
    let position = 0;
    
    while (startPos < text.length) {
      // Determine end position for this chunk
      let endPos = Math.min(startPos + options.maxChunkLength, text.length);
      
      // If we're not at the end of the text, try to find a natural break point (space, period, etc.)
      if (endPos < text.length) {
        // Look for a natural breakpoint within 20% of the max length
        const breakZone = Math.floor(options.maxChunkLength * 0.2);
        const potentialBreakPos = text.substring(endPos - breakZone, endPos).lastIndexOf(' ');
        
        if (potentialBreakPos >= 0) {
          endPos = endPos - breakZone + potentialBreakPos;
        }
      }
      
      // Create a chunk if it meets min length requirement
      const chunkText = text.substring(startPos, endPos).trim();
      if (chunkText.length >= options.minChunkLength) {
        // Check if the element is valid
        const isValidElement = element instanceof HTMLElement;
        
        chunks.push({
          id: generateChunkId(),
          text: chunkText,
          element: element as HTMLElement,
          position: position++
        });
      }
      
      // Move to next chunk position with overlap
      const overlapAmount = Math.floor((endPos - startPos) * (options.overlapPercentage / 100));
      startPos = endPos - overlapAmount;
    }
    
    return chunks;
  };
  
  // Group chunks by their parent element (for paragraphs, lists, etc.)
  const groupedChunks: { [key: string]: typeof rawChunks } = {};
  
  rawChunks.forEach(chunk => {
    // Use parent element as the grouping key for similar elements
    const parent = chunk.element.parentElement;
    if (!parent) return;
    
    const parentPath = getDomPath(parent);
    if (!groupedChunks[parentPath]) {
      groupedChunks[parentPath] = [];
    }
    groupedChunks[parentPath].push(chunk);
  });
  
  // Process each group of chunks
  Object.values(groupedChunks).forEach(group => {
    // For single elements, split text if needed
    if (group.length === 1) {
      const chunk = group[0];
      result.push(...splitTextIntoChunks(chunk.text, chunk.domPath, chunk.element));
      return;
    }
    
    // For groups of elements, concatenate text and then split as needed
    let concatenatedText = '';
    const groupElements: Element[] = [];
    
    group.forEach(chunk => {
      concatenatedText += (concatenatedText ? ' ' : '') + chunk.text;
      groupElements.push(chunk.element);
    });
    
    // Split the concatenated text if it's too large
    if (concatenatedText.length > options.maxChunkLength) {
      // Use the first element's path as the reference
      const domPath = group[0].domPath;
      const element = group[0].element;
      result.push(...splitTextIntoChunks(concatenatedText, domPath, element));
    } 
    // Otherwise create a single chunk if it meets the minimum length
    else if (concatenatedText.length >= options.minChunkLength) {
      result.push({
        id: generateChunkId(),
        text: concatenatedText,
        element: group[0].element as HTMLElement,
        position: 0
      });
    }
  });
  
  return result;
}

/**
 * Generate a DOM path for an element
 */
function getDomPath(element: Element): string {
  const path: string[] = [];
  let currentElement: Element | null = element;
  
  while (currentElement) {
    // Get element identifier
    let identifier = currentElement.tagName.toLowerCase();
    
    // Add id if it exists
    if (currentElement.id) {
      identifier += `#${currentElement.id}`;
    }
    // Otherwise add classes
    else if (currentElement.className) {
      // Handle both string and SVGAnimatedString (for SVG elements)
      let classStr = '';
      
      if (typeof currentElement.className === 'string') {
        classStr = currentElement.className;
      } 
      // Handle SVG elements which have className as an object
      else if (typeof currentElement.className === 'object' && 
               'baseVal' in currentElement.className) {
        // Safe access with type assertion
        const svgClass = currentElement.className as { baseVal: string };
        classStr = svgClass.baseVal;
      }
      
      if (classStr) {
        const classes = classStr.split(/\s+/).filter(Boolean);
        if (classes.length) {
          identifier += `.${classes.join('.')}`;
        }
      }
    }
    
    // Add to path
    path.unshift(identifier);
    
    // Move to parent
    currentElement = currentElement.parentElement;
  }
  
  return path.join(' > ');
}

/**
 * Generate a unique ID for a chunk
 */
function generateChunkId(): string {
  return `chunk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
} 