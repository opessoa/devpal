import React, { useState, useEffect } from 'react';
import { Folder, Collection, Variable, Script } from '../types';
import VariableEditor from './VariableEditor';
import ScriptEditor from './ScriptEditor';
import { FolderIcon } from './icons';

interface FolderPanelProps {
  item: Folder | Collection;
  onUpdateItem: (updatedItem: Folder | Collection) => void;
  isGeminiEnabled: boolean;
}

const FolderPanel: React.FC<FolderPanelProps> = ({ item, onUpdateItem, isGeminiEnabled }) => {
  const [activeTab, setActiveTab] = useState<'variables' | 'pre-request' | 'post-request'>('variables');
  const [localItem, setLocalItem] = useState<Folder | Collection>(item);

  useEffect(() => {
    setLocalItem(item);
  }, [item]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalItem(prev => ({...prev!, name: e.target.value}));
  }

  const handleNameBlur = () => {
    if (item.name !== localItem.name) {
      onUpdateItem(localItem);
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  }

  const handleVariableChange = (variables: Variable[]) => {
    const updated = { ...localItem, variables };
    setLocalItem(updated);
    onUpdateItem(updated);
  };

  const handleScriptChange = (type: 'pre-request' | 'post-request', content: string) => {
    const scriptIndex = localItem.scripts.findIndex(s => s.type === type);
    const newScripts = [...localItem.scripts];
    if (scriptIndex > -1) {
        newScripts[scriptIndex] = {...newScripts[scriptIndex], content };
    } else {
        newScripts.push({id: Date.now().toString(), type, content});
    }
    const updated = {...localItem, scripts: newScripts};
    setLocalItem(updated);
    onUpdateItem(updated);
  };

  const getScriptContent = (type: 'pre-request' | 'post-request') => {
    return localItem.scripts.find(s => s.type === type)?.content || '';
  };

  return (
    <div className="p-4 h-full flex flex-col bg-gray-800 rounded-lg">
      <div className="flex items-center space-x-3 mb-4">
        <FolderIcon className="w-8 h-8 text-yellow-500 flex-shrink-0" />
        <input
            type="text"
            value={localItem.name}
            onChange={handleNameChange}
            onBlur={handleNameBlur}
            onKeyDown={handleKeyDown}
            className="text-xl font-semibold bg-transparent focus:outline-none focus:bg-gray-900/50 rounded-md px-2 py-1 w-full"
        />
      </div>
      <p className="text-sm text-gray-400 mb-4">
        Manage variables and scripts for this { 'type' in localItem && localItem.type === 'folder' ? 'folder' : 'collection'}. These will be inherited by all requests and folders within it.
      </p>

      <div className="flex space-x-1 border-b border-gray-700 mb-4">
          {['variables', 'pre-request', 'post-request'].map(tabName => (
              <button
                  key={tabName}
                  onClick={() => setActiveTab(tabName as any)}
                  className={`px-4 py-2 text-sm capitalize ${activeTab === tabName ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400'}`}
              >
                  {tabName.replace('-', ' ')}
              </button>
          ))}
      </div>

      <div className="flex-grow overflow-y-auto pr-2">
        {activeTab === 'variables' && (
          <VariableEditor variables={localItem.variables} onChange={handleVariableChange} />
        )}
        {activeTab === 'pre-request' && (
          <ScriptEditor scriptType="pre-request" value={getScriptContent('pre-request')} onChange={(c) => handleScriptChange('pre-request', c)} isGeminiEnabled={isGeminiEnabled} />
        )}
        {activeTab === 'post-request' && (
          <ScriptEditor scriptType="post-request" value={getScriptContent('post-request')} onChange={(c) => handleScriptChange('post-request', c)} isGeminiEnabled={isGeminiEnabled} />
        )}
      </div>
    </div>
  );
};

export default FolderPanel;