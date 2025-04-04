import React, { useState, useEffect } from 'react';
import { getTheme, subscribeToThemeChanges, lightTheme } from './theme';
import { SimilarResult } from '../services/exa';
import DomainListManager from './DomainListManager';

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
  const [isOpen, setIsOpen] = useState(false);
  const [theme, setTheme] = useState(getTheme());
  const [recommendations, setRecommendations] = useState<SimilarResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sameDomain, setSameDomain] = useState(false);
  const [selectedDomainListId, setSelectedDomainListId] = useState<string | null>(null);

  useEffect(() => {
    // Subscribe to theme changes
    const unsubscribe = subscribeToThemeChanges(setTheme);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Find the main content element (usually body or a main container)
    const mainContent = document.body;
    
    if (isOpen) {
      // Add margin to the right when sidebar is open
      mainContent.style.marginRight = '400px';
      mainContent.style.transition = 'margin-right 0.3s ease';
    } else {
      // Remove margin when sidebar is closed
      mainContent.style.marginRight = '0';
    }

    // Cleanup function
    return () => {
      mainContent.style.marginRight = '0';
      mainContent.style.transition = '';
    };
  }, [isOpen]);

  useEffect(() => {
    // Fetch recommendations when sidebar is opened or filters change
    if (isOpen) {
      fetchRecommendations();
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
            color: theme.text
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
          
          {/* Filter Controls */}
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
          
          {/* Filter Indicator */}
          {(sameDomain || selectedDomainListId) && loading === false && (
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

          {/* Loading State */}
          {loading && (
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

          {/* Error State */}
          {error && (
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

          {/* Recommendations List */}
          {!loading && !error && (
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