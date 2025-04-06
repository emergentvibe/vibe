import React, { useState, useEffect } from 'react';
import { storage } from '../services/storage';
import { featureFlags } from '../config/feature-flags';

interface SettingsProps {
  onClose: () => void;
}

const Settings: React.FC<SettingsProps> = ({ onClose }) => {
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [exaEnabled, setExaEnabled] = useState(false);

  useEffect(() => {
    // Check feature flags and load current API key when component mounts
    const initialize = async () => {
      setExaEnabled(featureFlags.isEnabled('exaRecommendations'));
      
      // Only load API key if Exa recommendations are enabled
      if (featureFlags.isEnabled('exaRecommendations')) {
        const settings = await storage.getSettings();
        setApiKey(settings.exaApiKey);
      }
    };
    initialize();
  }, []);

  const handleSave = async () => {
    // Don't allow saving if feature is disabled
    if (!exaEnabled) {
      return;
    }
    
    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await storage.updateApiKey(apiKey);
      setSuccess(true);
    } catch (err) {
      setError('Failed to save API key. Please try again.');
      console.error('Error saving API key:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Settings</h2>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700"
        >
          ×
        </button>
      </div>

      <div className="space-y-4">
        {/* Only show API key settings if Exa feature is enabled */}
        {exaEnabled ? (
          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-1">
              Exa API Key
            </label>
            <input
              type="password"
              id="apiKey"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Enter your Exa API key"
            />
            <p className="mt-1 text-sm text-gray-500">
              Get your API key from{' '}
              <a
                href="https://exa.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:text-indigo-800"
              >
                exa.ai
              </a>
            </p>
          </div>
        ) : (
          <div className="p-3 bg-yellow-50 text-yellow-700 rounded-md text-sm">
            Exa recommendations feature is currently disabled. 
            <br />
            No API key configuration is required for semantic search.
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 text-red-700 rounded-md text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="p-3 bg-green-50 text-green-700 rounded-md text-sm">
            API key saved successfully!
          </div>
        )}

        {/* Only show save button if Exa feature is enabled */}
        {exaEnabled && (
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
              isSaving ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isSaving ? 'Saving...' : 'Save API Key'}
          </button>
        )}
      </div>
    </div>
  );
};

export default Settings; 