import React, { useState } from 'react';
import { ApiKeyConfig } from '../types';
import { PlusIcon, TrashIcon, CheckCircleIcon, XCircleIcon } from './Icons';

interface ApiKeyManagerProps {
  apiKeys: ApiKeyConfig[];
  selectedKeyId: string | null;
  onAddKey: (key: ApiKeyConfig) => void;
  onRemoveKey: (id: string) => void;
  onSelectKey: (id: string) => void;
  onClose: () => void;
}

export const ApiKeyManager: React.FC<ApiKeyManagerProps> = ({ 
  apiKeys, selectedKeyId, onAddKey, onRemoveKey, onSelectKey, onClose 
}) => {
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [error, setError] = useState('');

  const handleAdd = () => {
    if (!newKeyName.trim() || !newKeyValue.trim()) {
      setError('Name and Key are required');
      return;
    }
    const newKey: ApiKeyConfig = {
      id: Math.random().toString(36).substring(7),
      name: newKeyName.trim(),
      key: newKeyValue.trim(),
    };
    onAddKey(newKey);
    setNewKeyName('');
    setNewKeyValue('');
    setError('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
          <h3 className="font-semibold text-slate-100">Manage Gemini API Keys</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <XCircleIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Add New Key */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-300">Add New Key</h4>
            <div className="grid gap-2">
              <input 
                type="text" 
                placeholder="Key Name (e.g. My Personal Key)" 
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-primary-500"
              />
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Gemini API Key (AIza...)" 
                  value={newKeyValue}
                  onChange={e => setNewKeyValue(e.target.value)}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-primary-500"
                />
                <button 
                  onClick={handleAdd}
                  className="bg-primary-600 hover:bg-primary-500 text-white px-3 py-2 rounded-lg"
                >
                  <PlusIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
          </div>

          {/* List Keys */}
          <div className="space-y-3">
             <h4 className="text-sm font-medium text-slate-300">Saved Keys</h4>
             <div className="max-h-60 overflow-y-auto space-y-2 custom-scrollbar">
                {apiKeys.length === 0 && (
                  <p className="text-slate-500 text-sm italic">No custom keys added. System default (if env var exists) will be used.</p>
                )}
                {apiKeys.map(key => (
                  <div 
                    key={key.id} 
                    onClick={() => onSelectKey(key.id)}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedKeyId === key.id 
                      ? 'bg-primary-900/20 border-primary-500' 
                      : 'bg-slate-800/30 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        selectedKeyId === key.id ? 'border-primary-500' : 'border-slate-500'
                      }`}>
                        {selectedKeyId === key.id && <div className="w-2 h-2 rounded-full bg-primary-500" />}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-200">{key.name}</div>
                        <div className="text-xs text-slate-500">
                          {key.key.substring(0, 8)}...{key.key.substring(key.key.length - 4)}
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onRemoveKey(key.id); }}
                      className="text-slate-500 hover:text-red-400 p-1"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
             </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-700 bg-slate-800/30 text-xs text-slate-500">
          Keys are stored locally in your browser and are never sent to any server other than Google's API.
        </div>
      </div>
    </div>
  );
};
