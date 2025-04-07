import React from 'react';
import { createRoot } from 'react-dom/client';
import Sidebar from './Sidebar';
import './content.css';
import { featureFlags } from '../config/feature-flags';

console.log('%c VIBE EXTENSION LOADED ', 'background: #4F46E5; color: white; font-size: 20px; padding: 10px;');

let container: HTMLDivElement | null = null;
let root: any = null;
let currentUrl = window.location.href;

// Function to initialize the sidebar
function initSidebar() {
  // Check if sidebar feature is enabled
  if (!featureFlags.isEnabled('sidebar')) {
    console.log('Sidebar feature is disabled via feature flags');
    return;
  }

  // Check if container already exists
  if (document.getElementById('vibe-root')) {
    console.log('Vibe root already exists, skipping initialization');
    return;
  }

  console.log('Creating container for sidebar');
  container = document.createElement('div');
  container.id = 'vibe-root';

  // Create shadow root
  const shadowRoot = container.attachShadow({ mode: 'open' });

  // Create a container for styles
  const styleContainer = document.createElement('div');
  styleContainer.id = 'vibe-style-container';
  shadowRoot.appendChild(styleContainer);

  // Create a container for the React app
  const appContainer = document.createElement('div');
  appContainer.id = 'vibe-app-container';
  shadowRoot.appendChild(appContainer);

  // Add the container to the document body
  document.body.appendChild(container);
  console.log('Container added to document body');

  // Render the sidebar
  console.log('Rendering sidebar component');
  root = createRoot(appContainer);
  root.render(
    <React.StrictMode>
      <Sidebar />
    </React.StrictMode>
  );
  console.log('Sidebar rendered');
}

// Initialize features based on feature flags
async function initializeFeatures() {
  // Wait for feature flags to initialize
  try {
    await featureFlags.initialize();
    console.log('Feature flags initialized:', featureFlags.getFlags());

    // Initialize sidebar if enabled
    if (featureFlags.isEnabled('sidebar')) {
      initSidebar();
      // Only set up navigation listeners if sidebar is enabled
      setupNavigationListeners();
    }
  } catch (error) {
    console.error('Failed to initialize features:', error);
  }
}

// Set up navigation listeners for sidebar persistence
function setupNavigationListeners() {
  // Only set up if sidebar feature is enabled
  if (!featureFlags.isEnabled('sidebar')) {
    return;
  }

  // Handle navigation via History API (for SPAs)
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function(...args) {
    originalPushState.apply(this, args);
    handleNavigation();
  };

  history.replaceState = function(...args) {
    originalReplaceState.apply(this, args);
    handleNavigation();
  };

  // Handle popstate events (back/forward navigation)
  window.addEventListener('popstate', handleNavigation);

  // Set up URL change detector
  setInterval(checkForUrlChanges, 1000);

  // Ensure sidebar persists across page transitions
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      handleNavigation();
    }
  });

  console.log('Navigation listeners set up for sidebar persistence');
}

// URLChange detector (as a fallback)
function checkForUrlChanges() {
  if (currentUrl !== window.location.href) {
    currentUrl = window.location.href;
    console.log('URL changed to:', currentUrl);
    handleNavigation();
  }
}

// Handle navigation events
function handleNavigation() {
  // Double-check sidebar feature is enabled before doing anything
  if (!featureFlags.isEnabled('sidebar')) {
    return;
  }

  console.log('Navigation detected, ensuring sidebar is present');
  
  // If the container no longer exists or was removed from DOM, re-initialize
  if (!document.getElementById('vibe-root')) {
    console.log('Sidebar container not found, re-initializing');
    initSidebar();
  } else {
    console.log('Sidebar container still exists, no need to re-initialize');
  }
}

// Start initialization
initializeFeatures(); 