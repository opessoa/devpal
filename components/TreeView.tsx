import React, { useState } from 'react';
import { Collection, Folder, ApiRequest } from '../types';
import { FolderIcon, FileIcon, ChevronRightIcon, FolderPlusIcon, DocumentPlusIcon } from './icons';

type TreeItem = Collection | Folder | ApiRequest;

interface TreeViewProps {
  collections: Collection[];
  onSelect: (item: ApiRequest | Folder | Collection) => void;
  selectedId: string | null;
  onAddFolder: (parentId: string) => void;
  onAddRequest: (parentId: string) => void;
}

interface NodeProps {
  item: TreeItem;
  onSelect: (item: ApiRequest | Folder | Collection) => void;
  selectedId: string | null;
  level: number;
  onAddFolder: (parentId: string) => void;
  onAddRequest: (parentId: string) => void;
}

const getHttpMethodClass = (method: string) => {
    switch (method) {
        case 'GET': return 'text-green-400';
        case 'POST': return 'text-yellow-400';
        case 'PUT': return 'text-blue-400';
        case 'PATCH': return 'text-purple-400';
        case 'DELETE': return 'text-red-400';
        default: return 'text-gray-400';
    }
}

const Node: React.FC<NodeProps> = ({ item, onSelect, selectedId, level, onAddFolder, onAddRequest }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const isSelected = selectedId === item.id;
  const hasChildren = 'items' in item && item.items.length > 0;
  // FIX: Check for 'items' property to identify folder-like items (Collection, Folder)
  // as the Collection type does not have a 'type' property.
  const isFolder = 'items' in item;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };
  
  const handleSelect = () => {
      onSelect(item as ApiRequest | Folder | Collection);
  }

  const basePadding = 0.75; // rem
  const paddingLeft = `${basePadding + level * 1.25}rem`;

  return (
    <div>
      <div
        onClick={handleSelect}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ paddingLeft }}
        className={`flex items-center space-x-2 py-1.5 px-3 cursor-pointer rounded-md hover:bg-gray-700/50 ${isSelected ? 'bg-blue-600/30' : ''}`}
      >
        {hasChildren && (
          <ChevronRightIcon
            onClick={handleToggle}
            className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          />
        )}
        {!hasChildren && <div className="w-4" />}
        
        {isFolder ? <FolderIcon className="w-5 h-5 text-yellow-500" /> : <span className={`text-xs font-bold w-10 text-right pr-2 ${getHttpMethodClass((item as ApiRequest).method)}`}>{(item as ApiRequest).method}</span>}
        <span className="truncate flex-1">{item.name}</span>

        {isHovered && isFolder && (
          <div className="flex items-center space-x-1 ml-auto">
            <button
              onClick={(e) => { e.stopPropagation(); onAddRequest(item.id); }}
              title="New Request"
              className="p-0.5 rounded text-gray-400 hover:bg-gray-600 hover:text-white"
            >
              <DocumentPlusIcon className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onAddFolder(item.id); }}
              title="New Folder"
              className="p-0.5 rounded text-gray-400 hover:bg-gray-600 hover:text-white"
            >
              <FolderPlusIcon className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
      {isOpen && hasChildren && (
        <div>
          {(item as Collection | Folder).items.map((child) => (
            <Node key={child.id} item={child} onSelect={onSelect} selectedId={selectedId} level={level + 1} onAddFolder={onAddFolder} onAddRequest={onAddRequest} />
          ))}
        </div>
      )}
    </div>
  );
};


const TreeView: React.FC<TreeViewProps> = ({ collections, onSelect, selectedId, onAddFolder, onAddRequest }) => {
  return (
    <div className="p-2 space-y-1 text-sm">
      {collections.map((collection) => (
        <Node key={collection.id} item={collection} onSelect={onSelect} selectedId={selectedId} level={0} onAddFolder={onAddFolder} onAddRequest={onAddRequest} />
      ))}
    </div>
  );
};

export default TreeView;