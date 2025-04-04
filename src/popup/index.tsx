import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import './styles.css';
import Settings from './Settings';

const Popup: React.FC = () => {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="w-64">
      {showSettings ? (
        <Settings onClose={() => setShowSettings(false)} />
      ) : (
        <div className="p-4">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-xl font-bold">Vibe</h1>
            <button
              onClick={() => setShowSettings(true)}
              className="text-gray-500 hover:text-gray-700"
            >
              ⚙️
            </button>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Contextual website recommendations while browsing.
          </p>
          <button
            onClick={() => setShowSettings(true)}
            className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Configure API Key
          </button>
        </div>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
); 