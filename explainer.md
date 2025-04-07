# Semantic Search Execution Flow

## Class Structure

### HighlightManager
Controls all text finding and highlighting operations:
- `initialize()` - Initializes the text node cache
- `getAllTextNodes()` - Gets all text nodes in the document
- `findAndHighlightText()` - Finds and applies highlights to results
- `findTextMatches()` - Finds text matches using regex
- `highlightMatch()` - Applies highlight using Range API
- `setActiveHighlight()` - Sets the active highlight
- `removeAllHighlights()` - Removes all highlights
- `isElementVisible()` - Checks element visibility
- `scrollToElement()` - Scrolls to an element
- `getElementVerticalPosition()` - Gets element position
- `reset()` - Resets the manager state

### UIManager
Controls all UI operations:
- `setStatusElement()` - Sets status element reference
- `setCounterElement()` - Sets counter element reference
- `setResultsElement()` - Sets results element reference
- `setSearchInput()` - Sets search input reference
- `setNavigationButtons()` - Sets navigation button references
- `updateStatus()` - Updates status message
- `updateEmbeddingStatus()` - Updates embedding status
- `updateCounter()` - Updates result counter
- `updateNavigationControls()` - Updates navigation controls
- `displaySearchResults()` - Displays search results
- `clearResults()` - Clears results container
- `focusSearchInput()` - Focuses search input

## Execution Flow

### Initialization Process
`initSemanticSearch()` - Main entry point that initializes the feature
    `document.addEventListener('keydown', handleKeyDown)` - Registers keyboard listener
    `createOverlayElement()` - Creates the search UI overlay
        `uiManager.setStatusElement()` - Sets UI element references
        `uiManager.setCounterElement()` - Sets UI element references
        `uiManager.setResultsElement()` - Sets UI element references
        `uiManager.setSearchInput()` - Sets UI element references
        `uiManager.setNavigationButtons()` - Sets UI element references

### Search Activation Process
`handleKeyDown(event)` - Processes keyboard events
    `toggleSemanticSearch()` - Toggles search overlay visibility
        `showSemanticSearch()` - Shows search overlay and starts processing
            `uiManager.initialize()` - Initializes UI manager
            `uiManager.show()` - Shows UI overlay
            `uiManager.updateStatus()` - Updates status
            `startProcessingContent()` - Begins content analysis process
                `extractTextChunks()` - Extracts text from webpage
                `textNodeCache.initialize()` - Initializes text node cache
                `updateEmbeddingStatus()` - Updates embedding status
                `getEmbeddingModel()` - Loads the embedding model
                `generateChunkEmbeddings()` - Generates embeddings for chunks
        `hideSemanticSearch()` - Hides search overlay
            `uiManager.hide()` - Hides UI overlay
            `highlightManager.removeAllHighlights()` - Removes highlights
            `currentResults = []` - Resets results

### Search Execution Process
`performSearch()` - Triggered when user submits a query
    `highlightManager.removeAllHighlights()` - Clears previous highlights
    `uiManager.updateStatus()` - Shows loading status
    `searchService.search()` - Performs semantic search
        `generateEmbedding()` - Creates embedding for the query
        `cosineSimilarity()` - Calculates similarity between embeddings
    `highlightManager.findAndHighlightText()` - Finds and highlights matching text
        `highlightManager.initialize()` - Initializes highlight manager if needed
        `highlightManager.removeAllHighlights()` - Clears previous highlights
        `highlightManager.findTextMatches()` - Finds matching text nodes
        `highlightManager.isElementVisible()` - Checks element visibility
        `highlightManager.highlightMatch()` - Applies highlights using Range API
        `highlightManager.getElementVerticalPosition()` - Gets vertical position
    `uiManager.displaySearchResults()` - Shows results in UI
    `uiManager.updateStatus()` - Updates status with match count
    `setActiveResult()` - Sets first result as active
        `uiManager.updateCounter()` - Updates result counter
        `uiManager.updateNavigationControls()` - Updates navigation controls
        `highlightManager.setActiveHighlight()` - Highlights active result

### Navigation Process
`navigateResults(direction)` - Handles navigation between results
    `setActiveResult()` - Sets new active result
        `uiManager.updateCounter()` - Updates result counter
        `uiManager.updateNavigationControls()` - Updates navigation controls
        `highlightManager.setActiveHighlight()` - Highlights active result

### Cleanup Process
`cleanupSemanticSearch()` - Cleans up when extension is disabled
    `document.removeEventListener('keydown', handleKeyDown)` - Removes listeners
    `uiManager.clearResults()` - Clears UI elements
    `highlightManager.reset()` - Resets highlight manager
    `textNodeCache.clear()` - Clears text node cache

## Helper Functions

`createOverlayElement()` - Creates and styles the search UI
`removeHighlights()` - Removes all highlights from the page
`clearResults()` - Clears search results container
`testSemanticSearch()` - Test function for debugging
`escapeRegExp()` - Escapes special regex characters
