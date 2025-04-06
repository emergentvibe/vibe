import { exaService, SimilarResult, SearchOptions } from '../services/exa';
// Import semantic model module - it self-initializes on import
import './semantic-model';

console.log('Vibe background script loaded');

// Path to the offscreen document
const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';

/**
 * Create an offscreen document for hosting the embedding model
 */
async function createOffscreenDocument() {
  try {
    // First check if an offscreen document already exists using getContexts
    const hasExisting = await hasOffscreenDocument();
    
    if (hasExisting) {
      console.log('Offscreen document already exists, not creating another one');
      return;
    }
    
    // Check if the offscreen API is available
    if (!chrome.offscreen) {
      console.error('Offscreen API not available, cannot create document');
      return;
    }
    
    // Create offscreen document for model hosting
    console.log('Creating offscreen document for model hosting');
    
    try {
      await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH),
        reasons: ['DOM_SCRAPING'] as chrome.offscreen.Reason[],
        justification: 'Host embedding model with full DOM access'
      });
      console.log('Offscreen document created successfully');
    } catch (createError) {
      // Check for "Only a single offscreen document may be created" error
      if (String(createError).includes('single offscreen document')) {
        console.log('Offscreen document already exists (from error check)');
        // This is actually fine - it means the document already exists
        return;
      }
      // Re-throw other errors
      throw createError;
    }
  } catch (error) {
    console.error('Error creating offscreen document:', error);
    throw error;
  }
}

/**
 * Check if an offscreen document already exists
 */
async function hasOffscreenDocument(): Promise<boolean> {
  try {
    // Check if the API is available
    if (!chrome.offscreen) {
      console.warn('Offscreen API not available');
      return false;
    }
    
    // Get all existing offscreen documents
    // Note: This is a simplification as the actual API might vary between Chrome versions
    const contexts = await chrome.runtime.getContexts({ 
      contextTypes: ['OFFSCREEN_DOCUMENT'] as any 
    });
    
    return contexts && Array.isArray(contexts) && contexts.length > 0;
  } catch (error) {
    console.warn('Could not check for offscreen document, assuming none exists:', error);
    return false;
  }
}

/**
 * Close the offscreen document if it exists
 */
async function closeOffscreenDocument() {
  try {
    if (await hasOffscreenDocument()) {
      await chrome.offscreen.closeDocument();
      console.log('Offscreen document closed');
    }
  } catch (error) {
    console.error('Error closing offscreen document:', error);
  }
}

// Initialize the offscreen document when the extension starts
createOffscreenDocument().catch(error => {
  console.error('Error during offscreen document initialization:', error);
});

// Handle extension installation or update
chrome.runtime.onInstalled.addListener(() => {
  console.log('Vibe extension installed');
  // Ensure offscreen document is created after installation or update
  createOffscreenDocument();
});

// Relay messages to/from the offscreen document
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const senderType = sender.id === chrome.runtime.id ? 
    (sender.documentId ? 'offscreen document' : 'extension') : 
    'content script';
  
  console.log(`[Background] Received message: ${request.type} from ${senderType}`, request);
  
  // Add debug message support
  if (request.type === 'DEBUG_CHECK') {
    const response = {
      success: true,
      backgroundActive: true,
      offscreenApiAvailable: !!chrome.offscreen,
      extensionId: chrome.runtime.id,
      senderId: sender.id,
      senderDocumentId: sender.documentId,
      senderType,
      timestamp: new Date().toISOString()
    };
    console.log('[Background] Sending debug response:', response);
    sendResponse(response);
    return true;
  }
  
  // Relay embedding-related messages to the offscreen document
  if (request.type === 'GET_MODEL_STATUS' || request.type === 'GENERATE_EMBEDDING') {
    // Don't relay messages from the offscreen document back to itself
    // This prevents circular message routing
    if (sender.documentId || (sender.id === chrome.runtime.id && !sender.tab)) {
      console.log('[Background] Message appears to be from offscreen document, not relaying');
      return false;
    }
    
    // If message doesn't have target set, add it
    if (!request.target) {
      request.target = 'offscreen_document';
    }
    
    console.log('[Background] Checking if offscreen document exists');
    
    // Check if offscreen document exists first
    hasOffscreenDocument().then(exists => {
      console.log('[Background] Offscreen document exists:', exists);
      
      if (!exists) {
        console.log('[Background] Creating offscreen document before sending message');
        // Create it first, then send the message
        createOffscreenDocument()
          .then(() => {
            // Add a slight delay to ensure the document is fully initialized
            setTimeout(() => {
              console.log('[Background] Relaying message to offscreen document after creation');
              chrome.runtime.sendMessage(request)
                .then(response => {
                  console.log('[Background] Got response from offscreen document:', response);
                  sendResponse(response);
                })
                .catch(error => {
                  console.error('[Background] Error sending message to offscreen document:', error);
                  sendResponse({ 
                    error: error.message,
                    errorType: 'OFFSCREEN_COMMUNICATION_ERROR' 
                  });
                });
            }, 500); // 500ms delay
          })
          .catch(error => {
            console.error('[Background] Could not create offscreen document:', error);
            sendResponse({ 
              error: 'Could not create offscreen document: ' + error.message,
              errorType: 'OFFSCREEN_CREATION_ERROR' 
            });
          });
      } else {
        // Offscreen document exists, send message directly
        console.log('[Background] Relaying message to existing offscreen document');
        chrome.runtime.sendMessage(request)
          .then(response => {
            console.log('[Background] Got response from offscreen document:', response);
            sendResponse(response);
          })
          .catch(error => {
            console.error('[Background] Error sending message to offscreen document:', error);
            sendResponse({ 
              error: error.message,
              errorType: 'OFFSCREEN_COMMUNICATION_ERROR' 
            });
          });
      }
    }).catch(error => {
      console.error('[Background] Error checking offscreen document existence:', error);
      sendResponse({
        error: 'Error checking offscreen document: ' + error.message,
        errorType: 'OFFSCREEN_CHECK_ERROR'
      });
    });
    
    return true; // Indicate async response
  }
  
  if (request.type === 'GET_RECOMMENDATIONS') {
    // Get the current URL from the sender tab
    const currentUrl = sender.tab?.url || '';
    console.log('Getting recommendations for URL:', currentUrl);
    
    // Set up search options
    const searchOptions: SearchOptions = {};
    
    // Apply filters based on request parameters
    if (request.sameDomain) {
      searchOptions.sameDomain = true;
    } else if (request.domainListId) {
      searchOptions.domainListId = request.domainListId;
    }
    
    // Use Exa service to get real recommendations
    exaService.findSimilarPages(currentUrl, searchOptions)
      .then((recommendations: SimilarResult[]) => {
        console.log('Received recommendations:', recommendations);
        sendResponse({ recommendations });
      })
      .catch((error) => {
        console.error('Error getting recommendations:', error);
        sendResponse({ recommendations: [] });
      });
    
    // Return true to indicate we'll send a response asynchronously
    return true;
  }
  
  return true;
}); 