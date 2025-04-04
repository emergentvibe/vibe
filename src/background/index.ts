import { exaService, SimilarResult, SearchOptions } from '../services/exa';

console.log('Vibe background script loaded');

chrome.runtime.onInstalled.addListener(() => {
  console.log('Vibe extension installed');
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Received message:', request);
  
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