/**
 * Background Semantic Model Service
 * Acts as a relay to the offscreen document that hosts the model
 */

console.log('[Background] Semantic model relay initialized');

// Model state tracking for relay
let offscreenAvailable = false;
let offscreenChecked = false;

/**
 * Check if the offscreen document is available
 */
async function checkOffscreenAvailability(): Promise<boolean> {
  if (offscreenChecked) {
    return offscreenAvailable;
  }
  
  try {
    if (!chrome.offscreen) {
      console.warn('[Background] Offscreen API not available');
      offscreenChecked = true;
      offscreenAvailable = false;
      return false;
    }
    
    // We'll do an actual check later
    offscreenChecked = true;
    offscreenAvailable = true;
    return true;
  } catch (error) {
    console.error('[Background] Error checking offscreen availability:', error);
    offscreenChecked = true;
    offscreenAvailable = false;
    return false;
  }
}

// Initialize the check
checkOffscreenAvailability();

// Export for testing (will be ignored in actual extension)
export {
  checkOffscreenAvailability
}; 