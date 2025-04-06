import React, { useState, useEffect } from 'react';
import { getTheme, subscribeToThemeChanges, lightTheme } from './theme';
import { SimilarResult } from '../services/exa';
import DomainListManager from './DomainListManager';
import { featureFlags } from '../config/feature-flags';

// Helper function to extract base URL
const getBaseUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    return url;
  }
};

const Sidebar: React.FC = () => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [theme, setTheme] = useState(getTheme());
  const [recommendations, setRecommendations] = useState<SimilarResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sameDomain, setSameDomain] = useState(false);
  const [selectedDomainListId, setSelectedDomainListId] = useState<string | null>(null);

  // Check if sidebar feature is enabled
  useEffect(() => {
    const checkFeatureFlag = async () => {
      setIsEnabled(featureFlags.isEnabled('sidebar'));
    };
    
    checkFeatureFlag();
    
    // In the future, you could subscribe to feature flag changes here
  }, []);

  // If feature is disabled, don't render anything
  if (!isEnabled) {
    return null;
  }

  useEffect(() => {
    // Subscribe to theme changes
    const unsubscribe = subscribeToThemeChanges(setTheme);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Instead of modifying body margin, we'll create a container element that overlays the page
    // This prevents shifting the page content when the sidebar opens
    
    // Create or get the wrapper element
    let wrapper = document.getElementById('vibe-sidebar-wrapper');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.id = 'vibe-sidebar-wrapper';
      document.body.appendChild(wrapper);
    }
    
    // Set styles on wrapper instead of body
    Object.assign(wrapper.style, {
      position: 'fixed',
      top: '0',
      right: '0',
      bottom: '0',
      width: isOpen ? '400px' : '0',
      zIndex: '9998',
      transition: 'width 0.3s ease',
      pointerEvents: 'none' // Let clicks pass through when not open
    });
    
    // Cleanup function
    return () => {
      if (wrapper && document.body.contains(wrapper)) {
        document.body.removeChild(wrapper);
      }
    };
  }, [isOpen]);

  useEffect(() => {
    // Fetch recommendations when sidebar is opened or filters change
    if (isOpen) {
      // Only fetch if Exa recommendations are enabled
      if (featureFlags.isEnabled('exaRecommendations')) {
        fetchRecommendations();
      } else {
        setError('Recommendations are currently disabled.');
      }
    }
  }, [isOpen, sameDomain, selectedDomainListId]);

  // Handle domain list selection
  const handleDomainListSelect = (listId: string | null) => {
    // If a list is selected, turn off sameDomain filter
    if (listId) {
      setSameDomain(false);
    }
    setSelectedDomainListId(listId);
  };

  const fetchRecommendations = () => {
    // Early return if Exa recommendations feature is disabled
    if (!featureFlags.isEnabled('exaRecommendations')) {
      setError('Recommendations are currently disabled.');
      return;
    }

    setLoading(true);
    setError(null);
    
    // Get the current URL
    const currentUrl = window.location.href;
    console.log('Fetching recommendations for:', currentUrl, 
      'Same domain only:', sameDomain,
      'Domain list ID:', selectedDomainListId);
    
    // Send message to background script to get recommendations
    chrome.runtime.sendMessage(
      { 
        type: 'GET_RECOMMENDATIONS',
        sameDomain,
        domainListId: selectedDomainListId
      },
      (response) => {
        setLoading(false);
        if (response && response.recommendations) {
          console.log('Received recommendations:', response.recommendations);
          setRecommendations(response.recommendations);
        } else {
          console.error('Error getting recommendations:', response);
          setError('Failed to load recommendations');
        }
      }
    );
  };

  const handleToggle = () => {
    console.log('Toggle button clicked, current state:', isOpen);
    setIsOpen(!isOpen);
    console.log('New state will be:', !isOpen);
  };

  const handleClose = () => {
    console.log('Close button clicked');
    setIsOpen(false);
  };

  const toggleSameDomain = () => {
    // Turn off domain list filter if same domain is enabled
    if (!sameDomain) {
      setSelectedDomainListId(null);
    }
    setSameDomain(!sameDomain);
  };

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={handleToggle}
        style={{
          position: 'fixed',
          top: '80px',
          right: isOpen ? '420px' : '20px',
          zIndex: 10000,
          backgroundColor: theme.primary,
          color: theme.text,
          border: 'none',
          borderRadius: '50%',
          width: '40px',
          height: '40px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 2px 4px ${theme.shadow}`,
          transition: 'all 0.3s ease'
        }}
      >
        Vibe
      </button>

      {/* Sidebar Panel */}
      {isOpen && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: '400px',
            height: '100vh',
            backgroundColor: theme.background,
            boxShadow: `-2px 0 4px ${theme.shadow}`,
            zIndex: 9999,
            padding: '20px',
            overflowY: 'auto',
            color: theme.text,
            pointerEvents: 'auto' // Enable interactions with the sidebar
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px'
          }}>
            <h2 style={{
              fontSize: '24px',
              fontWeight: 'bold',
              color: theme.text
            }}>Vibe Recommendations</h2>
            <button
              onClick={handleClose}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                color: theme.textSecondary,
                padding: '4px 8px'
              }}
            >
              ×
            </button>
          </div>
          
          {/* Feature Disabled Notice */}
          {!featureFlags.isEnabled('exaRecommendations') && (
            <div style={{
              padding: '16px',
              backgroundColor: '#FEF3C7',
              color: '#92400E',
              borderRadius: '8px',
              marginBottom: '16px',
              textAlign: 'center'
            }}>
              Recommendations are currently disabled.
              <br />
              Coming back soon!
            </div>
          )}
          
          {/* Filter Controls - Only show if recommendations are enabled */}
          {featureFlags.isEnabled('exaRecommendations') && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              {/* Same Domain Toggle */}
              <button
                onClick={toggleSameDomain}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 12px',
                  backgroundColor: sameDomain ? theme.primary : theme.surface,
                  color: sameDomain ? 'white' : theme.textSecondary,
                  border: `1px solid ${sameDomain ? theme.primary : theme.border}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'all 0.2s ease'
                }}
              >
                {sameDomain ? '✓ Same Domain Only' : 'Same Domain Only'}
              </button>
              
              {/* Domain List Selector */}
              <DomainListManager 
                theme={theme}
                onSelectList={handleDomainListSelect}
                selectedListId={selectedDomainListId}
                sameDomain={sameDomain}
              />
            </div>
          )}
          
          {/* Filter Indicator - Only show if recommendations are enabled */}
          {featureFlags.isEnabled('exaRecommendations') && (sameDomain || selectedDomainListId) && loading === false && (
            <div style={{
              padding: '8px 12px',
              backgroundColor: theme.surface,
              borderRadius: '6px',
              marginBottom: '12px',
              fontSize: '12px',
              color: theme.textSecondary
            }}>
              {sameDomain && (
                <span>
                  Showing results from {new URL(window.location.href).hostname}
                </span>
              )}
              {selectedDomainListId && (
                <span>
                  Filtering by domain list
                </span>
              )}
            </div>
          )}

          {/* Loading State - Only show if recommendations are enabled */}
          {featureFlags.isEnabled('exaRecommendations') && loading && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '200px',
              color: theme.textSecondary
            }}>
              Loading recommendations...
            </div>
          )}

          {/* Error State - Only show if recommendations are enabled */}
          {featureFlags.isEnabled('exaRecommendations') && error && (
            <div style={{
              padding: '16px',
              backgroundColor: '#FEE2E2',
              color: '#991B1B',
              borderRadius: '8px',
              marginBottom: '16px'
            }}>
              {error}
            </div>
          )}

          {/* Recommendations List - Only show if recommendations are enabled */}
          {featureFlags.isEnabled('exaRecommendations') && !loading && !error && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}>
              {recommendations.length > 0 ? (
                recommendations.map((rec) => (
                  <a
                    key={rec.id}
                    href={rec.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '16px',
                      backgroundColor: theme.surface,
                      borderRadius: '8px',
                      textDecoration: 'none',
                      color: theme.text,
                      transition: 'transform 0.2s ease',
                      cursor: 'pointer',
                      border: `1px solid ${theme.border}`
                    }}
                    className="vibe-recommendation-card"
                  >
                    <h3 style={{
                      fontSize: '16px',
                      fontWeight: '600',
                      marginBottom: '4px',
                      color: theme.text
                    }}>{rec.title || 'Untitled'}</h3>
                    
                    {/* Base URL as subtitle */}
                    <p style={{
                      fontSize: '12px',
                      color: theme.primary,
                      marginBottom: '8px',
                      fontWeight: '500'
                    }}>{getBaseUrl(rec.url)}</p>
                    
                    {rec.author && (
                      <p style={{
                        fontSize: '12px',
                        color: theme.textSecondary,
                        marginBottom: '8px'
                      }}>By {rec.author}</p>
                    )}
                    {rec.publishedDate && (
                      <p style={{
                        fontSize: '12px',
                        color: theme.textSecondary,
                        marginBottom: '8px'
                      }}>Published: {new Date(rec.publishedDate).toLocaleDateString()}</p>
                    )}
                    {rec.score && (
                      <div style={{
                        fontSize: '12px',
                        color: theme.textSecondary,
                        marginTop: '8px'
                      }}>
                        Relevance: {Math.round(rec.score * 100)}%
                      </div>
                    )}
                  </a>
                ))
              ) : (
                <div style={{
                  padding: '16px',
                  backgroundColor: theme.surface,
                  borderRadius: '8px',
                  color: theme.textSecondary,
                  textAlign: 'center'
                }}>
                  No recommendations found for this page.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default Sidebar; 