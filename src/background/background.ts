/**
 * Background Script for Vibe Extension
 * 
 * This script runs in the background and handles communication between content scripts,
 * manages API calls, and maintains state across the browser.
 */

import { exaService } from '../services/exa';
import { featureFlags } from '../config/feature-flags';

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_RECOMMENDATIONS') {
    // Check if Exa recommendations feature is enabled
    if (!featureFlags.isEnabled('exaRecommendations')) {
      sendResponse({ error: 'Recommendations feature is disabled' });
      return true;
    }
    
    // Get the tab URL from the sender
    const url = sender.tab?.url;
    if (!url) {
      sendResponse({ error: 'Cannot determine current URL' });
      return true;
    }
    
    // Get recommendations
    handleGetRecommendations(url, message.sameDomain, message.domainListId, sendResponse);
    return true; // Indicates we'll respond asynchronously
  }
  
  return false;
});

/**
 * Handle getting recommendations for a URL
 */
async function handleGetRecommendations(
  url: string, 
  sameDomain = false,
  domainListId: string | null = null,
  sendResponse: (response?: any) => void
) {
  try {
    // Check if Exa recommendations feature is enabled
    if (!featureFlags.isEnabled('exaRecommendations')) {
      sendResponse({ error: 'Recommendations feature is disabled' });
      return;
    }
    
    console.log(`Getting recommendations for ${url}, sameDomain: ${sameDomain}, domainListId: ${domainListId}`);
    
    // Get similar links using the Exa service
    const results = await exaService.findSimilarPages(url, {
      sameDomain,
      domainListId: domainListId || undefined
    });
    
    // Send response back to content script
    sendResponse({ recommendations: results });
  } catch (error) {
    console.error('Error getting recommendations:', error);
    sendResponse({ error: 'Failed to get recommendations' });
  }
}

/**
 * Initialize the background script
 */
async function initialize() {
  try {
    // Initialize feature flags
    await featureFlags.initialize();
    console.log('Background script initialized with feature flags:', featureFlags.getFlags());
  } catch (error) {
    console.error('Failed to initialize background script:', error);
  }
}

// Initialize on startup
initialize(); 