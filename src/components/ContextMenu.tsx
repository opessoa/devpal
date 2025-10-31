import React from 'react';
import { ApiRequest, Folder, Collection } from '../types';
import { PencilSquareIcon, DocumentDuplicateIcon, TrashIcon } from './icons';

interface ContextMenuProps {
  x: number;
  y: number;
  item: ApiRequest | Folder | Collection;
  onClose: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, onClose, onRename, onDuplicate, onDelete }) => {
  const menuStyle: React.CSSProperties = {
    top: y,
    left: x,
    position: 'absolute',
  };

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      style={menuStyle}
      className="z-50 bg-gray-700 text-white rounded-md shadow-lg border border-gray-600 min-w-[160px] p-1 animate-fade-in-fast"
    >
      <ul>
        <li
          onClick={() => handleAction(onRename)}
          className="flex items-center space-x-3 px-3 py-1.5 text-sm rounded-md hover:bg-blue-600 cursor-pointer"
        >
          <PencilSquareIcon className="w-4 h-4" />
          <span>Rename</span>
        </li>
        <li
          onClick={() => handleAction(onDuplicate)}
          className="flex items-center space-x-3 px-3 py-1.5 text-sm rounded-md hover:bg-blue-600 cursor-pointer"
        >
          <DocumentDuplicateIcon className="w-4 h-4" />
          <span>Duplicate</span>
        </li>
        <li className="my-1 border-t border-gray-600" />
        <li
          onClick={() => handleAction(onDelete)}
          className="flex items-center space-x-3 px-3 py-1.5 text-sm rounded-md hover:bg-red-500 cursor-pointer text-red-300 hover:text-white"
        >
          <TrashIcon className="w-4 h-4" />
          <span>Delete</span>
        </li>
      </ul>
    </div>
  );
};

export default ContextMenu;