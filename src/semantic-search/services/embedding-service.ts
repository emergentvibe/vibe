/**
 * Embedding Service
 * 
 * Handles generating embeddings using Hugging Face's transformers.js library.
 * This runs entirely in the browser, with no API calls required.
 * 
 * It first tries to use the pre-loaded model from the background script,
 * but falls back to loading in the content script if needed.
 */

import { pipeline, env } from '@xenova/transformers';

// Configure transformers.js for browser environment
// Set proper CDN usage to avoid 404 errors
console.log('Configuring transformers.js environment in embedding service');
env.allowLocalModels = false;
env.useBrowserCache = false; // Disable browser cache as it's causing errors
env.useFSCache = false; // We're in a browser, so disable filesystem cache

// Aggressively block workers 
try {
  // Define useWorkers property if it doesn't exist
  if (!('useWorkers' in env)) {
    Object.defineProperty(env, 'useWorkers', {
      value: false,
      writable: true,
      configurable: true
    });
  } else {
    // Direct assignment if property exists
    (env as any).useWorkers = false;
  }
  
  // Block Worker constructor globally
  const originalWorker = window.Worker;
  Object.defineProperty(window, 'Worker', {
    value: function() {
      console.warn('Worker creation blocked by embedding service');
      return {
        postMessage: () => {},
        terminate: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false
      };
    },
    writable: true
  });
  
  // Set global flag to prevent worker creation by transformers.js
  (window as any).__TRANSFORMERS_DISABLE_WORKERS__ = true;
  
  console.log('Worker blocking applied in content script');
} catch (e) {
  console.warn('Could not apply worker blocking:', e);
}

// Debug the environment
console.log('Transformers.js environment after configuration:', {
  cacheDir: env.cacheDir,
  localModelPath: env.localModelPath,
  useFSCache: env.useFSCache,
  useBrowserCache: env.useBrowserCache
});

// Cache the embedding model
let embeddingModel: any = null;
let isModelLoading = false;
let modelLoadingPromise: Promise<any> | null = null;

// Model loading progress handlers for reporting
let modelLoadingProgressCallback: ((progress: number) => void) | null = null;
let currentModelLoadingProgress = 0;

// Background service flags
let isBackgroundModelAvailable = false;
let checkedBackgroundModel = false;
let isUsingBackgroundModel = false;

// Model ID
const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

// Cache to avoid regenerating the same embeddings
const embeddingCache: Record<string, number[]> = {};

/**
 * Check background model availability (now includes both service worker and offscreen)
 */
async function checkBackgroundModel(): Promise<boolean> {
  // Add a debug trace to check background communication
  try {
    // Send a debug message to check connectivity
    const debugResponse = await new Promise<any>(resolve => {
      chrome.runtime.sendMessage({ type: 'DEBUG_CHECK', timestamp: Date.now() }, (response) => {
        console.log('Debug connectivity check response:', response);
        resolve(response || { error: 'No response' });
      });
    });
    
    console.log('Background debug info:', debugResponse);
    
    // If we got a proper response, background communication is working
    if (debugResponse && debugResponse.success) {
      console.log('Successfully communicated with background script');
    }
  } catch (debugError) {
    console.warn('Debug check failed:', debugError);
  }
  
  if (checkedBackgroundModel) {
    return isBackgroundModelAvailable;
  }

  try {
    // First check chrome.storage for cached status
    const storageCheck = await new Promise<boolean>(resolve => {
      chrome.storage.local.get(['semanticModelReady', 'semanticModelHost'], (result) => {
        console.log('Storage check for model status:', result);
        if (result.semanticModelReady === true && result.semanticModelHost === 'offscreen') {
          console.log('Found ready model in offscreen document according to storage');
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
    
    // If storage indicates model is ready, short-circuit
    if (storageCheck) {
      checkedBackgroundModel = true;
      isBackgroundModelAvailable = true;
      console.log('Using model from offscreen document (from storage)');
      return true;
    }

    // Otherwise query model status directly
    return new Promise<boolean>((resolve) => {
      // Add a direct flag to ensure the message gets to the offscreen document
      chrome.runtime.sendMessage(
        { 
          type: 'GET_MODEL_STATUS',
          direct: true, 
          target: 'offscreen_document'
        },
        (response) => {
          // Handle possible errors due to extension context
          if (chrome.runtime.lastError) {
            console.error('Error checking model status:', chrome.runtime.lastError);
            checkedBackgroundModel = true;
            isBackgroundModelAvailable = false;
            resolve(false);
            return;
          }

          // Check if we got a valid response with ready state
          if (response && response.ready === true) {
            console.log(`Model is available in ${response.host || 'background'}`);
            checkedBackgroundModel = true;
            isBackgroundModelAvailable = true;
            resolve(true);
          } else {
            // Check for specific error types
            if (response && response.errorType === 'CSP_WASM_ERROR') {
              console.warn('Model unavailable due to CSP restrictions on WebAssembly. Falling back to content script model.');
            } else if (response && response.errorType === 'SERVICE_WORKER_LIMITATION') {
              console.warn('Model unavailable due to service worker limitations. Falling back to content script model.');
            } else if (response && response.errorType === 'OFFSCREEN_CREATION_ERROR') {
              console.warn('Failed to create offscreen document. Falling back to content script model.');
            } else if (response && response.errorType === 'OFFSCREEN_COMMUNICATION_ERROR') {
              console.warn('Error communicating with offscreen document. Falling back to content script model.');
            } else {
              console.log('Model not available:', response?.error || 'Unknown reason');
            }
            checkedBackgroundModel = true;
            isBackgroundModelAvailable = false;
            resolve(false);
          }
        }
      );
    });
  } catch (error) {
    console.error('Error checking background model (caught):', error);
    checkedBackgroundModel = true;
    isBackgroundModelAvailable = false;
    return false;
  }
}

/**
 * Register a callback to be notified about model loading progress
 */
export function registerModelLoadingProgressCallback(callback: (progress: number) => void) {
  modelLoadingProgressCallback = callback;
  
  // If we already have progress, immediately call with current progress
  if (currentModelLoadingProgress > 0) {
    callback(currentModelLoadingProgress);
  }
  
  // If we're using background model, immediately set to 100%
  if (isUsingBackgroundModel) {
    currentModelLoadingProgress = 100;
    callback(currentModelLoadingProgress);
  }
}

/**
 * Update model loading progress
 */
function updateModelLoadingProgress(progress: any) {
  // Handle NaN or invalid progress values
  if (isNaN(progress) || progress < 0) {
    // If we get NaN, use an estimated progress based on loading phase
    // This improves UX by showing some progress even when exact progress is unknown
    if (currentModelLoadingProgress < 30) {
      // Early phase - slowly increment progress
      currentModelLoadingProgress += 3;
    } else if (currentModelLoadingProgress < 70) {
      // Middle phase - medium increment
      currentModelLoadingProgress += 2;
    } else {
      // Late phase - slow increment again
      currentModelLoadingProgress += 1;
    }
  } else {
    // Valid progress percentage (0-1)
    currentModelLoadingProgress = Math.min(99, Math.round(progress * 100));
  }
  
  // Cap progress at 99% until fully loaded
  currentModelLoadingProgress = Math.min(99, currentModelLoadingProgress);
    
  // Call the registered callback if it exists
  if (modelLoadingProgressCallback) {
    modelLoadingProgressCallback(currentModelLoadingProgress);
  }
}

/**
 * Get or initialize the embedding model
 */
export async function getEmbeddingModel(): Promise<any> {
  // First, check if background model is available (if we haven't already)
  if (!checkedBackgroundModel) {
    isBackgroundModelAvailable = await checkBackgroundModel();
    
    if (isBackgroundModelAvailable) {
      console.log('Using background model');
      isUsingBackgroundModel = true;
      
      // Set progress to 100% since model is already loaded
      currentModelLoadingProgress = 100;
      if (modelLoadingProgressCallback) {
        modelLoadingProgressCallback(100);
      }
      
      // Create a robust proxy model that handles various access patterns
      const modelProxy = createModelProxy();
      console.log('Created background model proxy');
      return modelProxy;
    }
  }
  
  // If we're using the background model, return the proxy
  if (isUsingBackgroundModel) {
    return createModelProxy();
  }
  
  // Otherwise, fall back to content script model
  console.log('Falling back to content script model');
  
  // If model is already loaded, return it
  if (embeddingModel) {
    return embeddingModel;
  }

  // If model is currently loading, wait for it
  if (isModelLoading && modelLoadingPromise) {
    return modelLoadingPromise;
  }

  // Reset progress tracking
  currentModelLoadingProgress = 0;
  
  // Set loading flag
  isModelLoading = true;

  try {
    console.log('Loading embedding model in content script:', MODEL_ID);
    console.log('Current environment settings:', {
      cacheDir: env.cacheDir,
      localModelPath: env.localModelPath,
      useFSCache: env.useFSCache,
      useBrowserCache: env.useBrowserCache,
      useWorkers: (env as any).useWorkers,
      disableWorkersFlag: (window as any).__TRANSFORMERS_DISABLE_WORKERS__
    });
    
    // Create a promise for loading the model directly from HF CDN
    modelLoadingPromise = pipeline('feature-extraction', MODEL_ID, {
      quantized: true, // Use quantized model for smaller size
      revision: 'main', // Ensure we're using the main branch
      progress_callback: (progress: any) => {
        updateModelLoadingProgress(progress);
      },
      sequential: true, // Force sequential processing to prevent worker usage
      cache: true // Enable caching
    } as any);

    // Wait for model to load
    embeddingModel = await modelLoadingPromise;
    console.log('Embedding model loaded successfully in content script');
    
    // Set progress to 100% when fully loaded
    currentModelLoadingProgress = 100;
    if (modelLoadingProgressCallback) {
      modelLoadingProgressCallback(100);
    }
    
    return embeddingModel;
  } catch (error) {
    console.error('Error loading embedding model:', error);
    isModelLoading = false;
    modelLoadingPromise = null;
    throw error;
  } finally {
    // Reset loading flag if we're done
    if (embeddingModel) {
      isModelLoading = false;
    }
  }
}

/**
 * Create a robust proxy object for the background model
 */
function createModelProxy() {
  const handler = {
    // Handle property access
    get: function(target: any, prop: string | symbol) {
      // For function calls like model(text, options)
      if (prop === 'apply' || prop === 'call' || prop === '__call__') {
        return function(thisArg: any, argsArray: any[]) {
          // Extract text and options from arguments
          const text = argsArray[0];
          return generateEmbeddingViaBackground(text);
        };
      }
      
      // Handle special methods that might be called
      if (prop === 'then' || prop === 'catch' || prop === 'finally') {
        return undefined; // Not a Promise
      }
      
      // For direct property access
      return target[prop];
    },
    
    // Handle direct function calls like model(text, options)
    apply: function(target: any, thisArg: any, args: any[]) {
      const text = args[0];
      return generateEmbeddingViaBackground(text);
    }
  };
  
  // Create base object with necessary properties
  const baseObj = {
    __call__: async (text: string, options: any) => {
      return generateEmbeddingViaBackground(text);
    },
    call: async (text: string, options: any) => {
      return generateEmbeddingViaBackground(text);
    },
    // Mock tokenizer for libraries that access this
    tokenizer: {
      encode: async (text: string) => {
        return { input_ids: new Array(text.length).fill(0) };
      },
      decode: (tokens: any) => '',
      // Add more methods as needed
    },
    // Add more properties that might be accessed
    processor: {},
    config: { model_type: 'bert', hidden_size: 384 },
    device: 'cpu',
    // Log any unexpected property access
    handleUnexpectedAccess: (prop: string) => {
      console.warn('Unexpected property access on model proxy:', prop);
      return undefined;
    }
  };
  
  // Create and return the proxy
  return new Proxy(function() {}, handler);
}

/**
 * Generate embedding via background script model
 */
async function generateEmbeddingViaBackground(text: string): Promise<number[]> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(
        { 
          type: 'GENERATE_EMBEDDING', 
          text,
          direct: true,
          target: 'offscreen_document'
        },
        (response) => {
          // Check for extension errors
          if (chrome.runtime.lastError) {
            console.error('Error calling background embedding:', chrome.runtime.lastError);
            // Fall back to content script model
            isUsingBackgroundModel = false;
            isBackgroundModelAvailable = false;
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          // Check for API errors
          if (response.error) {
            console.error('Background embedding error:', response.error);
            // Fall back to content script model
            isUsingBackgroundModel = false;
            isBackgroundModelAvailable = false;
            reject(new Error(response.error));
            return;
          }
          
          try {
            // Get the embedding array from whatever format it's in
            let embeddingArray: number[];
            
            if (Array.isArray(response.embedding)) {
              embeddingArray = response.embedding;
            } else if (Array.isArray(response.data)) {
              embeddingArray = response.data;
            } else if (response.embedding && typeof response.embedding === 'object') {
              embeddingArray = Array.from(response.embedding.data || []);
            } else {
              throw new Error('Invalid embedding format received');
            }
            
            // Verify we have a valid array with data
            if (!embeddingArray || embeddingArray.length === 0) {
              throw new Error('Received empty embedding');
            }
            
            console.log(`Received embedding from background, length: ${embeddingArray.length}`);
            
            // Return the array directly rather than wrapping in an object
            resolve(embeddingArray);
          } catch (formatError) {
            console.error('Error parsing embedding response:', formatError, response);
            // Fall back to content script model
            isUsingBackgroundModel = false;
            isBackgroundModelAvailable = false;
            reject(formatError);
          }
        }
      );
    } catch (error) {
      console.error('Error generating embedding via background:', error);
      // Fall back to content script model
      isUsingBackgroundModel = false;
      isBackgroundModelAvailable = false;
      reject(error);
    }
  });
}

/**
 * Generate embedding for a text string
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // Validate text isn't empty
  if (!text || text.trim().length === 0) {
    throw new Error('No text provided for embedding generation');
  }
  
  // Check local cache first
  const cacheKey = getCacheKey(text);
  if (embeddingCache[cacheKey]) {
    return embeddingCache[cacheKey];
  }
  
  // If we're using the background model, use it
  if (isUsingBackgroundModel) {
    return generateEmbeddingViaBackground(text);
  }

  try {
    // Get the model
    const model = await getEmbeddingModel();
    
    // Generate embedding
    const output = await model(text, { 
      pooling: 'mean',
      normalize: true 
    });
    
    // Convert to array and cache with type assertion
    const embedding = Array.from(output.data) as number[];
    embeddingCache[cacheKey] = embedding;
    
    return embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

/**
 * Generate embeddings for multiple text strings in batches
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  // Process in batches to avoid performance issues
  const results: number[][] = [];
  const batchSize = 10; // Adjust based on browser performance

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    
    // Process batch in parallel
    const batchPromises = batch.map(text => generateEmbedding(text));
    const batchResults = await Promise.all(batchPromises);
    
    results.push(...batchResults);
  }

  return results;
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  // Handle zero vectors
  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Create a cache key for a text
 */
function getCacheKey(text: string): string {
  // Simple hashing function for cache keys
  return `${MODEL_ID}:${text.slice(0, 100).replace(/\s+/g, ' ')}`;
} 