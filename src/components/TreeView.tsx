import React, { useState, useEffect, useRef } from 'react';
import { Collection, Folder, ApiRequest } from '../types';
import { FolderIcon, ChevronRightIcon, FolderPlusIcon, DocumentPlusIcon } from './icons';

type TreeItem = Collection | Folder | ApiRequest;

interface TreeViewProps {
  collections: Collection[];
  onSelect: (item: ApiRequest | Folder | Collection) => void;
  selectedId: string | null;
  onAddFolder: (parentId: string) => void;
  onAddRequest: (parentId:string) => void;
  onContextMenu: (event: React.MouseEvent, item: TreeItem) => void;
  renamingId: string | null;
  onRename: (id: string, newName: string) => void;
}

interface NodeProps {
  item: TreeItem;
  onSelect: (item: ApiRequest | Folder | Collection) => void;
  selectedId: string | null;
  level: number;
  onAddFolder: (parentId: string) => void;
  onAddRequest: (parentId: string) => void;
  onContextMenu: (event: React.MouseEvent, item: TreeItem) => void;
  renamingId: string | null;
  onRename: (id: string, newName: string) => void;
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

const Node: React.FC<NodeProps> = ({ item, onSelect, selectedId, level, onAddFolder, onAddRequest, onContextMenu, renamingId, onRename }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [renameValue, setRenameValue] = useState(item.name);
  const isSelected = selectedId === item.id;
  const isRenaming = renamingId === item.id;
  const hasChildren = 'items' in item && item.items.length > 0;
  const isFolder = 'items' in item;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };
  
  const handleSelect = () => {
      onSelect(item as ApiRequest | Folder | Collection);
  }

  const handleRenameSubmit = () => {
    if (renameValue.trim() && renameValue !== item.name) {
      onRename(item.id, renameValue.trim());
    } else {
      setRenameValue(item.name); // Revert if empty or unchanged
      onRename(item.id, item.name); // This just cancels the rename state
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setRenameValue(item.name);
      onRename(item.id, item.name);
    }
  };

  const basePadding = 0.75; // rem
  const paddingLeft = `${basePadding + level * 1.25}rem`;

  return (
    <div>
      <div
        onClick={handleSelect}
        onContextMenu={(e) => onContextMenu(e, item)}
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
        
        {isRenaming ? (
          <input
            ref={inputRef}
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={handleRenameKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-gray-900 text-white outline-none ring-1 ring-blue-500 rounded px-1 -my-0.5"
          />
        ) : (
          <span className="truncate flex-1">{item.name}</span>
        )}

        {isHovered && !isRenaming && isFolder && (
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
            <Node key={child.id} item={child} onSelect={onSelect} selectedId={selectedId} level={level + 1} onAddFolder={onAddFolder} onAddRequest={onAddRequest} onContextMenu={onContextMenu} renamingId={renamingId} onRename={onRename} />
          ))}
        </div>
      )}
    </div>
  );
};


const TreeView: React.FC<TreeViewProps> = ({ collections, onSelect, selectedId, onAddFolder, onAddRequest, onContextMenu, renamingId, onRename }) => {
  return (
    <div className="p-2 space-y-1 text-sm">
      {collections.map((collection) => (
        <Node key={collection.id} item={collection} onSelect={onSelect} selectedId={selectedId} level={0} onAddFolder={onAddFolder} onAddRequest={onAddRequest} onContextMenu={onContextMenu} renamingId={renamingId} onRename={onRename} />
      ))}
    </div>
  );
};

export default TreeView;