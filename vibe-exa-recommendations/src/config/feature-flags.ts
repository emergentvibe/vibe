/**
 * Feature Flags Configuration
 * 
 * This file contains the configuration for feature flags used throughout the extension.
 * Use this to enable/disable features or set them to different modes.
 */

export interface FeatureFlags {
  // Core features
  sidebar: boolean;         // Sidebar with recommendations
  exaRecommendations: boolean; // Exa API recommendations

  // Additional features (for future use)
  bookmarkSearch: boolean;  // Semantic search of bookmarks
  usageTracking: boolean;   // Track and limit usage
  premium: boolean;         // Premium features requiring payment
}

/**
 * Default feature flag configuration
 * Modify this to enable/disable features
 */
export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  // Enable sidebar and recommendations
  sidebar: true,
  exaRecommendations: true,

  // Future features (all disabled for now)
  bookmarkSearch: false,
  usageTracking: false,
  premium: false,
};

// Singleton to access feature flags throughout the application
class FeatureFlagService {
  private flags: FeatureFlags = DEFAULT_FEATURE_FLAGS;

  /**
   * Get the current feature flags
   */
  getFlags(): FeatureFlags {
    return {...this.flags};
  }

  /**
   * Check if a specific feature is enabled
   */
  isEnabled(feature: keyof FeatureFlags): boolean {
    return this.flags[feature] === true;
  }

  /**
   * Update feature flags (useful for dynamic feature toggling)
   * This could be connected to storage or remote config in the future
   */
  updateFlags(newFlags: Partial<FeatureFlags>): void {
    this.flags = {...this.flags, ...newFlags};
  }

  /**
   * Initialize flags from storage or remote config
   * Currently just uses the defaults
   */
  async initialize(): Promise<void> {
    try {
      // In the future, this could load from chrome.storage
      // For now, just use the defaults
      this.flags = DEFAULT_FEATURE_FLAGS;
    } catch (error) {
      console.error('Failed to initialize feature flags:', error);
      this.flags = DEFAULT_FEATURE_FLAGS;
    }
  }
}

// Export a singleton instance
export const featureFlags = new FeatureFlagService();

// Initialize flags when imported
featureFlags.initialize().catch(console.error); 