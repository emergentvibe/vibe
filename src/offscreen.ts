/**
 * Offscreen Document Script
 * 
 * This script runs in the offscreen document and hosts the embedding model.
 * The offscreen document has full DOM access and can use URL.createObjectURL.
 */

import { pipeline, env } from '@xenova/transformers';

// Configure transformers.js for offscreen document environment
console.log('[Offscreen] Configuring transformers.js environment');
env.allowLocalModels = false;
env.useBrowserCache = true; // Enable browser cache in offscreen document
env.useFSCache = false;

// Force disable web workers to prevent importScripts errors
// This is the most reliable way to prevent worker-related issues in extensions
try {
  // Attempt multiple approaches to disable workers
  Object.defineProperty(env, 'useWorkers', {
    value: false,
    writable: true,
    configurable: true
  });
  
  // Try direct property setting as fallback
  (env as any).useWorkers = false;
  
  // Set global flag to prevent worker creation
  (window as any).__TRANSFORMERS_DISABLE_WORKERS__ = true;
} catch (e) {
  console.warn('[Offscreen] Could not set worker properties:', e);
}

// Debug the environment
console.log('[Offscreen] Transformers.js environment after configuration:', {
  cacheDir: env.cacheDir,
  localModelPath: env.localModelPath,
  useFSCache: env.useFSCache,
  useBrowserCache: env.useBrowserCache,
  useWorkers: (env as any).useWorkers,
  disableWorkerFlag: (window as any).__TRANSFORMERS_DISABLE_WORKERS__
});

// Model information - Use smaller model to reduce load time
const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const MODEL_SETTINGS = {
  quantized: true,
  revision: 'main',
  // Force non-worker mode
  progress_callback: function(progress: number) {
    updateProgress(progress);
  },
  // Explicitly request sequential = true to disable parallel operations
  sequential: true,
  // Cache loaded models
  cache: true
};

// Model state tracking
let embeddingModel: any = null;
let isModelLoading = false;
let modelLoadError: Error | null = null;
let modelLoadingPromise: Promise<any> | null = null;
let loadingProgress = 0;

// Flag to track model service status
let isModelReady = false;

/**
 * Log to both console and visible DOM
 */
function log(message: string) {
  console.log(`[Offscreen] ${message}`);
  const logElement = document.getElementById('log');
  if (logElement) {
    logElement.textContent = message;
  }
}

/**
 * Update progress in DOM
 */
function updateProgress(progress: number) {
  if (isNaN(progress) || progress < 0) {
    // Handle NaN progress with an increment pattern
    loadingProgress = Math.min(99, loadingProgress + 1);
  } else {
    loadingProgress = Math.min(99, Math.round(progress * 100));
  }
  log(`Loading model: ${loadingProgress}%`);
}

/**
 * Patched pipeline function that ensures we don't use workers
 */
async function createPipeline(task: any, model: string, options: any) {
  try {
    // Force disable workers before pipeline creation
    (env as any).useWorkers = false;
    
    // Create the pipeline with explicit sequential setting
    return await pipeline(task, model, {
      ...options,
      sequential: true, // Force sequential processing
    });
  } catch (error) {
    console.error('[Offscreen] Error creating pipeline:', error);
    throw error;
  }
}

/**
 * Initialize the model on offscreen document load
 */
async function initializeModel() {
  try {
    log('Starting embedding model initialization');
    
    // Set loading flag
    isModelLoading = true;
    modelLoadError = null;
    loadingProgress = 0;
    
    // Force disable workers again right before loading
    (env as any).useWorkers = false;
    (window as any).__TRANSFORMERS_DISABLE_WORKERS__ = true;
    
    // Load the model
    log(`Loading model: ${MODEL_ID}`);
    
    try {
      // First try the direct pipeline approach
      const pipelineOptions = {
        ...MODEL_SETTINGS,
        sequential: true,
        quantized: true,
        cache: true
      };
      
      // Create pipeline and wait for model to load
      modelLoadingPromise = createPipeline('feature-extraction', MODEL_ID, pipelineOptions);
      embeddingModel = await modelLoadingPromise;
      
      // Test the model with a simple embedding to ensure it works
      log('Testing model with simple embedding');
      const testResult = await embeddingModel('test', { 
        pooling: 'mean',
        normalize: true,
        sequential: true
      });
      
      log(`Test successful, embedding length: ${testResult.data.length}`);
      
      // Store the model structure for debugging
      const modelStructure = inspectObjectStructure(embeddingModel);
      log(`Model structure: ${modelStructure.slice(0, 100)}...`);
      
      isModelReady = true;
      
      // Store in local storage that model is ready
      chrome.storage.local.set({ 
        semanticModelReady: true,
        semanticModelHost: 'offscreen'
      });
      
      loadingProgress = 100;
      log('Model loading complete (100%)');
      return embeddingModel;
      
    } catch (pipelineError) {
      log(`Pipeline approach failed: ${pipelineError instanceof Error ? pipelineError.message : String(pipelineError)}`);
      throw pipelineError;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`Error loading embedding model: ${errorMessage}`);
    modelLoadError = error instanceof Error ? error : new Error(String(error));
    isModelLoading = false;
    modelLoadingPromise = null;
    
    // Store error in local storage
    chrome.storage.local.set({ 
      semanticModelReady: false,
      semanticModelError: errorMessage,
      semanticModelHost: 'failed'
    });
    
    return null;
  } finally {
    // Reset loading flag if we have a result (success or error)
    isModelLoading = false;
  }
}

/**
 * Inspect and return a basic structure of an object for debugging
 */
function inspectObjectStructure(obj: any, depth: number = 0, maxDepth: number = 2): string {
  if (depth > maxDepth) return '...';
  if (obj === null) return 'null';
  if (obj === undefined) return 'undefined';
  if (typeof obj !== 'object') return typeof obj;
  
  const result: string[] = [];
  for (const key in obj) {
    if (key === 'data' && ArrayBuffer.isView(obj[key])) {
      // Type assertion for TypedArray
      const typedArray = obj[key] as unknown as { length: number };
      result.push(`${key}: TypedArray(${typedArray.length})`);
    } else {
      try {
        result.push(`${key}: ${inspectObjectStructure(obj[key], depth + 1, maxDepth)}`);
      } catch (e) {
        // Type assertion for error
        const error = e as Error;
        result.push(`${key}: [Error: ${error.message}]`);
      }
    }
  }
  return `{${result.join(', ')}}`;
}

/**
 * Generate embedding for text using offscreen document model
 */
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    // Make sure model is loaded
    if (!embeddingModel) {
      if (!isModelLoading) {
        // Try to load the model if not already loading
        await initializeModel();
      } else if (modelLoadingPromise) {
        // Wait for current loading to complete
        embeddingModel = await modelLoadingPromise;
      }
      
      // Check if model is still not available
      if (!embeddingModel) {
        throw new Error('Model loading failed');
      }
    }
    
    // Generate embedding - ensure we're using sequential processing
    const output = await embeddingModel(text, { 
      pooling: 'mean',
      normalize: true,
      sequential: true  // Force sequential processing
    });
    
    // Convert to proper array
    const embeddingArray = Array.from(output.data) as number[];
    console.log('[Offscreen] Generated embedding array of length:', embeddingArray.length);
    
    return embeddingArray;
  } catch (error) {
    console.error('[Offscreen] Error generating embedding:', error);
    throw error;
  }
}

// Handle messages from background script or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Only process messages explicitly targeted to the offscreen document
  // or direct queries to prevent circular message handling
  if (request.target !== 'offscreen_document' && !request.direct) {
    return false;
  }
  
  if (request.type === 'GET_MODEL_STATUS') {
    // Return current model status
    const response = {
      ready: isModelReady,
      loading: isModelLoading,
      progress: loadingProgress,
      error: modelLoadError ? modelLoadError.message : null,
      host: 'offscreen'
    };
    sendResponse(response);
    return true;
  }
  
  if (request.type === 'GENERATE_EMBEDDING') {
    // Generate embedding for text
    if (!request.text) {
      sendResponse({ error: 'No text provided' });
      return true;
    }
    
    generateEmbedding(request.text)
      .then(embedding => {
        // Return in the exact format expected by content script
        sendResponse({ 
          embedding: embedding,
          data: embedding,
          success: true,
          error: null
        });
      })
      .catch(error => {
        console.error('[Offscreen] Error generating embedding:', error);
        sendResponse({ 
          error: error instanceof Error ? error.message : String(error),
          success: false
        });
      });
    
    return true; // Indicate async response
  }
  
  return false;
});

// Start loading the model immediately
log('Starting initial model load');
initializeModel().catch(error => {
  log(`Initial model load failed: ${error}`);
}); 