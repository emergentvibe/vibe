import { exaService, SimilarResult, SearchOptions } from '../services/exa';
// Remove semantic model import
// import './semantic-model';

console.log('Vibe background script loaded');

// Handle extension installation or update
chrome.runtime.onInstalled.addListener(() => {
  console.log('Vibe extension installed');
});

// Handle messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log(`[Background] Received message: ${request.type}`, request);
  
  // Add debug message support
  if (request.type === 'DEBUG_CHECK') {
    const response = {
      success: true,
      backgroundActive: true,
      extensionId: chrome.runtime.id,
      senderId: sender.id,
      senderType: 'content script',
      timestamp: new Date().toISOString()
    };
    console.log('[Background] Sending debug response:', response);
    sendResponse(response);
    return true;
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