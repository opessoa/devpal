import React from 'react';
import { Project, Variable, Collection, Folder, ApiRequest } from '../types';
import VariableEditor from './VariableEditor';
import { FolderIcon, GlobeAltIcon, TagIcon, ChevronRightIcon } from './icons';

interface VariableManagerProps {
  project: Project;
  onUpdateProject: (project: Project) => void;
  selectedItem: ApiRequest | Folder | Collection | null;
}

const VariableManager: React.FC<VariableManagerProps> = ({ project, onUpdateProject, selectedItem }) => {

  const handleGlobalVarsChange = (updatedVariables: Variable[]) => {
    onUpdateProject({ ...project, globalVariables: updatedVariables });
  };

  const handleItemVariablesChange = (itemId: string, updatedVariables: Variable[]) => {
    const update = (items: (Collection | Folder | ApiRequest)[]): (Collection | Folder | ApiRequest)[] => {
      return items.map(item => {
        if (item.id === itemId) {
          if ('variables' in item) {
            return { ...item, variables: updatedVariables };
          }
        }
        if ('items' in item && Array.isArray(item.items)) {
          return { ...item, items: update(item.items) as (Folder | ApiRequest)[] };
        }
        return item;
      });
    };
    const newCollections = update(project.collections) as Collection[];
    onUpdateProject({ ...project, collections: newCollections });
  };
  
  const findPath = (targetId: string, p: Project): (Folder | ApiRequest | Collection)[] | null => {
    const search = (id: string, items: (Folder | ApiRequest | Collection)[]): (Folder | ApiRequest | Collection)[] | null => {
        for (const item of items) {
            if (item.id === id) return [item];
            if ('items' in item && item.items) {
                const subPath = search(id, item.items);
                if (subPath) return [item, ...subPath];
            }
        }
        return null;
    };
    return search(targetId, p.collections);
  };
  
  if (!selectedItem) {
    return (
      <div className="p-4 h-full flex flex-col items-center justify-center text-center bg-gray-800 rounded-lg">
        <TagIcon className="w-16 h-16 text-gray-600 mb-4" />
        <h2 className="text-xl font-bold mb-2 text-white">Variable Manager</h2>
        <p className="text-sm text-gray-400">
          Select a request from the sidebar to view its variable context.
        </p>
        <p className="text-xs text-gray-500 mt-2">
          This view shows the hierarchy of variables (Global, Collection, Folders) that apply to the selected request.
        </p>
      </div>
    );
  }

  const path = findPath(selectedItem.id, project);

  const renderScope = (item: Folder | Collection, level: number) => (
    <div key={item.id} style={{ marginLeft: `${level * 1.5}rem` }} className="mb-6">
      <details open className="group">
        <summary className="flex items-center space-x-2 cursor-pointer list-none">
            <ChevronRightIcon className="w-4 h-4 text-gray-500 transform transition-transform group-open:rotate-90" />
            <FolderIcon className="w-5 h-5 text-yellow-500" />
            <span className="font-semibold text-gray-200">{item.name}</span>
            <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">
              {'type' in item ? 'Folder' : 'Collection'}
            </span>
        </summary>
        <div className="mt-4 pl-6 border-l-2 border-gray-700/50">
          <VariableEditor
            variables={item.variables}
            onChange={(vars) => handleItemVariablesChange(item.id, vars)}
          />
        </div>
      </details>
    </div>
  );
  

  return (
    <div className="p-4 h-full flex flex-col bg-gray-800 rounded-lg overflow-y-auto">
      <h2 className="text-xl font-bold mb-2 text-white">Variable Manager</h2>
      <p className="text-sm text-gray-400 mb-6">
        Showing variable scopes for: <span className="font-semibold text-gray-200">{selectedItem.name}</span>
      </p>
      
      {/* Global Variables */}
      <div className="mb-8">
        <details open className="group">
            <summary className="flex items-center space-x-2 cursor-pointer list-none">
                <ChevronRightIcon className="w-4 h-4 text-gray-500 transform transition-transform group-open:rotate-90" />
                <GlobeAltIcon className="w-5 h-5 text-blue-400" />
                <span className="font-semibold text-lg text-gray-200">Global Variables</span>
            </summary>
            <div className="mt-4 pl-6 border-l-2 border-blue-500/30">
                <VariableEditor
                    variables={project.globalVariables}
                    onChange={handleGlobalVarsChange}
                />
            </div>
        </details>
      </div>

      {/* Contextual Variables */}
      <div>
        <h3 className="text-lg font-semibold text-gray-200 mb-4 border-b border-gray-700 pb-2">Contextual Scopes (in order of precedence)</h3>
        {path ? (
          path
            .filter(p => 'items' in p) // Filter for Collections and Folders
            .map((scope, index) => renderScope(scope as Collection | Folder, index))
        ) : (
          <p className="text-gray-500 italic">Could not determine variable path for the selected item.</p>
        )}
      </div>
    </div>
  );
};

export default VariableManager;