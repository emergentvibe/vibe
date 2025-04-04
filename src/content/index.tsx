import React from 'react';
import { createRoot } from 'react-dom/client';
import Sidebar from './Sidebar';
import './content.css';

console.log('%c VIBE EXTENSION LOADED ', 'background: #4F46E5; color: white; font-size: 20px; padding: 10px;');

let container: HTMLDivElement | null = null;
let root: any = null;
let currentUrl = window.location.href;

// Function to initialize the sidebar
function initSidebar() {
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

// Initialize on first load
initSidebar();

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
  console.log('Navigation detected, ensuring sidebar is present');
  
  // If the container no longer exists or was removed from DOM, re-initialize
  if (!document.getElementById('vibe-root')) {
    console.log('Sidebar container not found, re-initializing');
    initSidebar();
  } else {
    console.log('Sidebar container still exists, no need to re-initialize');
  }
}

// Poll for URL changes as a fallback (some SPAs don't use History API)
setInterval(checkForUrlChanges, 1000);

// Ensure sidebar persists across page transitions
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    handleNavigation();
  }
}); 