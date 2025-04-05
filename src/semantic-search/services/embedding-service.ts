/**
 * Embedding Service
 * 
 * Handles generating embeddings using Hugging Face's transformers.js library.
 * This runs entirely in the browser, with no API calls required.
 */

import { pipeline, env } from '@xenova/transformers';

// Configure transformers.js for browser environment
env.allowLocalModels = false;
env.useBrowserCache = true;

// Use a known working model ID from Xenova's collection
// These are optimized ports of HF models specifically for transformers.js
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

// Model caching to avoid reloading
let embeddingModel: any = null;
let isModelLoading = false;
let modelLoadPromise: Promise<any> | null = null;

// Cache to avoid regenerating the same embeddings
const embeddingCache: Record<string, number[]> = {};

/**
 * Get or initialize the embedding model
 */
export async function getEmbeddingModel() {
  // Return the model if it's already loaded
  if (embeddingModel) {
    return embeddingModel;
  }
  
  // If the model is already loading, return the existing promise
  if (isModelLoading && modelLoadPromise) {
    return modelLoadPromise;
  }
  
  // Otherwise, load the model
  isModelLoading = true;
  
  try {
    console.log(`Loading embedding model: ${MODEL_NAME}`);
    
    // Create the model load promise
    modelLoadPromise = pipeline('feature-extraction', MODEL_NAME, {
      quantized: false, // Set to false for more reliable loading
    });
    
    // Wait for the model to load and save it
    embeddingModel = await modelLoadPromise;
    
    console.log('Embedding model loaded successfully');
    return embeddingModel;
  } catch (error) {
    console.error('Error loading embedding model:', error);
    throw error;
  } finally {
    isModelLoading = false;
    modelLoadPromise = null;
  }
}

/**
 * Generate an embedding for a single text string
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // Check cache first
  const cacheKey = getCacheKey(text);
  if (embeddingCache[cacheKey]) {
    return embeddingCache[cacheKey];
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
  return `${MODEL_NAME}:${text.slice(0, 100).replace(/\s+/g, ' ')}`;
} 