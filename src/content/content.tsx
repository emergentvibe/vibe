import React from 'react';
import ReactDOM from 'react-dom/client';
import Sidebar from './Sidebar';
import { initSemanticSearch } from '../semantic-search/semantic-search';
import { featureFlags } from '../config/feature-flags';

// Unique ID for the sidebar container
const SIDEBAR_CONTAINER_ID = 'vibe-sidebar-container';

/**
 * Initialize the sidebar component
 */
function initializeSidebar() {
  // Check if sidebar feature is enabled
  if (!featureFlags.isEnabled('sidebar')) {
    console.log('Sidebar feature is disabled via feature flags');
    return;
  }

  // Create container for sidebar if it doesn't exist
  let container = document.getElementById(SIDEBAR_CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = SIDEBAR_CONTAINER_ID;
    document.body.appendChild(container);
  }

  // Render the sidebar component
  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <Sidebar />
    </React.StrictMode>
  );
}

/**
 * Initialize the semantic search feature
 */
function initializeSemanticSearch() {
  // Check if semantic search feature is enabled
  if (!featureFlags.isEnabled('semanticSearch')) {
    console.log('Semantic search feature is disabled via feature flags');
    return;
  }

  console.log('Starting semantic search initialization with delay');
  
  // Add a slight delay to ensure browser environment is fully ready
  // This helps with browser cache access issues
  setTimeout(() => {
    console.log('Initializing semantic search after delay');
    initSemanticSearch();
  }, 1000);
}

/**
 * Initialize all features based on feature flags
 */
async function initializeFeatures() {
  console.log('VIBE EXTENSION INITIALIZING');
  
  // Wait for feature flags to initialize
  try {
    await featureFlags.initialize();
    console.log('Feature flags initialized:', featureFlags.getFlags());

    // Initialize features based on flags
    initializeSidebar();
    
    // Wait for document to be fully loaded before initializing semantic search
    if (document.readyState === 'complete') {
      initializeSemanticSearch();
    } else {
      console.log('Waiting for document to be complete before initializing semantic search');
      window.addEventListener('load', () => {
        console.log('Document load complete, initializing semantic search');
        initializeSemanticSearch();
      }, { once: true });
    }

  } catch (error) {
    console.error('Failed to initialize features:', error);
  }
}

// Start initialization when the DOM is fully loaded
console.log('VIBE EXTENSION LOADED, document.readyState:', document.readyState);
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeFeatures);
} else {
  initializeFeatures();
} 