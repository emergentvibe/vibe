# Vibe Browser Extension Development Plan

## Overview
A browser extension for Arc that provides contextual website recommendations while browsing, with a persistent sidebar that can be toggled. History-based recommendations will be added in a future phase.

## Technical Stack
- Browser Extension Framework: Chrome Extension Manifest V3 (compatible with Arc)
- Frontend: React + TypeScript
- Styling: Tailwind CSS
- State Management: Simple local state management (React Context + hooks)
- UI: Custom components matching Arc's clean aesthetic

## Phase 1: Project Setup & Basic Structure ✅
1. ✅ Initialize project with necessary dependencies
2. ✅ Create manifest.json for extension configuration
3. ✅ Set up development environment
4. ✅ Create basic extension architecture:
   - ✅ Background script
   - ✅ Content script
   - ✅ Popup component
   - ✅ Sidebar component

## Phase 2: Contextual Recommendations Sidebar ✅
1. ✅ Design and implement persistent sidebar
   - ✅ Create fixed-position sidebar on the right
   - ✅ Add margin from viewport edges
   - ✅ Implement toggle button
2. ✅ Implement sidebar component
   - ✅ Create slide-out panel
   - ✅ Design recommendation cards (10 items)
   - ✅ Add close/open functionality with X button
3. ✅ Create mock recommendation engine
   - ✅ Define recommendation data structure
   - ✅ Implement mock recommendation generation (10 items)
   - ✅ Create API interface for future real implementation
4. ✅ Connect mock recommendations to sidebar
5. ✅ Add theme support
   - ✅ Implement light/dark mode detection
   - ✅ Create theme system with consistent colors
   - ✅ Add theme-aware components
   - ✅ Ensure proper contrast in both modes

## Phase 3: Semantic Recommendation Algorithm ✅
1. ✅ Design recommendation algorithm architecture
   - ✅ Define data structures and interfaces
   - ✅ Plan API integration points
   - ✅ Design caching strategy
2. ✅ Implement core algorithm components
   - ✅ Page content analysis
   - ✅ Semantic similarity calculation
   - ✅ Recommendation scoring
3. ✅ Create recommendation service
   - ✅ Implement API endpoints
   - ✅ Add error handling
   - ✅ Implement rate limiting
4. ✅ Integrate with sidebar
   - ✅ Replace mock data with real recommendations
   - ✅ Add loading states
   - ✅ Implement error handling

## Phase 4: Popup & Settings Implementation ✅
1. ✅ Create popup component
   - ✅ Design clean, minimal interface
   - ✅ Add title and description
   - ✅ Implement settings gear icon
2. ✅ Implement settings panel
   - ✅ Create API key input field
   - ✅ Add save functionality
   - ✅ Implement error handling
   - ✅ Add success/error messages
3. ✅ Add storage integration
   - ✅ Implement Chrome storage API
   - ✅ Add secure API key storage
   - ✅ Handle storage errors
4. ✅ Style popup components
   - ✅ Add Tailwind CSS
   - ✅ Implement dark/light mode
   - ✅ Ensure consistent styling

## Phase 5: CSS Isolation & Style Fixes
1. ✅ Fix CSS leakage issues
   - ✅ Remove Tailwind base styles from content script
   - ✅ Scope all CSS to extension components
   - ✅ Implement Shadow DOM for better isolation
   - ✅ Fix scrollbar style interference
2. ✅ Implement proper CSS scoping
   - ✅ Use CSS modules for component styles
   - ✅ Create isolated style containers
   - ✅ Ensure styles don't affect host website
3. ✅ Optimize style loading
   - ✅ Separate popup and content styles
   - ✅ Implement lazy loading where possible
   - ✅ Minimize global style impact
4. Test and verify
   - ✅ Check all components still work
   - ✅ Verify no host website interference
   - ✅ Test across different websites
   - ✅ Ensure consistent styling

## Phase 6: Chrome Web Store Preparation
1. Create Store Assets
   - ✅ Create extension icon in multiple sizes (16x16, 48x48, 128x128)
   - Create promotional images (440x280, 920x680)
   - Create screenshots of extension in action
   - Design a simple logo for the store listing

2. Write Store Listing Content
   - ✅ Create a compelling extension description
   - ✅ Write feature highlights
   - ✅ Create a user guide with:
     - ✅ Installation instructions
     - ✅ How to get an Exa API key
     - ✅ How to use the extension
     - ✅ Troubleshooting tips
   - ✅ Write a privacy policy section about API key usage

3. Technical Requirements
   - Create a zip file of the extension
   - Verify manifest.json meets all store requirements
   - Test extension on multiple websites
   - Ensure all permissions are justified

4. Domain Lists Feature
   - Implement domain list management system to filter recommendations
   - UI Components:
     - Create domain list selector next to "Same Domain Only" button
     - Design popover panel for managing domain lists
     - Add form interface for creating/editing domain lists
   - Storage:
     - Store domain lists in chrome.storage
     - Implement CRUD operations for domain lists
   - Recommendations:
     - Integrate with Exa service to filter by selected domain list
     - Update sidebar to show active domain list
   - UX Considerations:
     - Support drag-and-drop for reordering domains
     - Allow bulk import/export of domain lists
     - Implement search/filter for large domain lists

## Phase 7: Store Submission
1. Package Extension
   - Create production build
   - Generate zip file
   - Verify all files are included

2. Submit to Chrome Web Store
   - Create developer account if needed
   - Pay one-time developer fee
   - Fill out store listing form
   - Upload extension package
   - Submit for review

## Implementation Details
- Sidebar: 
  - ✅ Fixed position in top-right with margin
  - ✅ Toggleable with floating button and X
  - ✅ Shows 10 recommendations
  - ✅ Persists across page navigation
  - ✅ Theme-aware (light/dark mode)
- Popup:
  - ✅ Clean, minimal design
  - ✅ Settings panel for API key
  - ✅ Theme-aware styling
  - ✅ Secure storage integration
- UI: Clean, minimal design matching Arc's aesthetic
- State: Simple React Context + hooks for state management
- Recommendations: Real-time semantic recommendations using Exa API

### Domain Lists Feature Implementation Notes

#### Data Structure
```typescript
interface DomainList {
  id: string;         // Unique identifier
  name: string;       // User-friendly name
  domains: string[];  // List of domains
  createdAt: number;  // Timestamp
  updatedAt: number;  // Timestamp
}
```

#### Storage Operations
- Use chrome.storage.sync to save domain lists
- Implement methods for:
  - getDomainLists()
  - saveDomainList(list)
  - updateDomainList(id, data)
  - deleteDomainList(id)

#### UI Components
1. **Domain List Selector**
   - Dropdown button with current selection shown
   - Shows "Domain Lists" when none selected
   - Position next to "Same Domain Only" button
   - Visually consistent with existing toggle

2. **List Management Popover**
   - Modal/popover that appears when button clicked
   - Contains:
     - List of saved domain lists (with select/edit/delete actions)
     - "Create New List" button
     - Search box for filtering lists (if many exist)

3. **Edit List Form**
   - Form with:
     - Name input field
     - Textarea for domains (one per line)
     - Option to paste multiple domains at once
     - Validation to ensure proper domain formats
     - Save/Cancel buttons

#### UX Flow
1. User clicks "Domain Lists" button
2. Popover shows existing lists or "No lists yet" message
3. User can click on a list to select it or click "Create New List"
4. When creating/editing, form appears for input
5. Upon save, list is stored and becomes available in selector
6. When a list is selected, recommendations are filtered to only show results from those domains

#### Integration with Exa Service
- Modify findSimilarPages method to accept array of domains
- Update message passing to include selected domain list
- Update UI to show which list is currently active

## Next Steps
1. ✅ Set up development environment
2. ✅ Create basic extension structure
3. ✅ Implement sidebar component
4. ✅ Add mock recommendations
5. ✅ Add theme support
6. ✅ Implement semantic recommendation algorithm
7. ✅ Implement popup and settings
8. ✅ Fix CSS isolation issues
9. Create promotional images and screenshots
10. Write store listing content
11. Submit to Chrome Web Store 