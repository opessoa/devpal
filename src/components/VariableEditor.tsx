import React from 'react';
import { Variable } from '../types';

interface VariableEditorProps {
  variables: Variable[];
  onChange: (updatedVariables: Variable[]) => void;
}

const VariableEditor: React.FC<VariableEditorProps> = ({ variables, onChange }) => {
  const handleVariableChange = (index: number, field: 'key' | 'value' | 'enabled', value: string | boolean) => {
    const newVariables = [...variables];
    const variable = { ...newVariables[index] };
    if (field === 'enabled') {
      variable.enabled = value as boolean;
    } else {
      variable[field] = value as string;
    }
    newVariables[index] = variable;
    onChange(newVariables);
  };

  const addVariable = () => {
    const newVariables = [...variables, { id: Date.now().toString(), key: '', value: '', enabled: true }];
    onChange(newVariables);
  };

  const removeVariable = (index: number) => {
    const newVariables = variables.filter((_, i) => i !== index);
    onChange(newVariables);
  };

  return (
    <div>
        {variables.map((variable, index) => (
            <div key={variable.id} className="flex items-center space-x-2 mb-2">
                <input type="checkbox" checked={variable.enabled} onChange={e => handleVariableChange(index, 'enabled', e.target.checked)} className="form-checkbox h-5 w-5 bg-gray-900 border-gray-600 rounded text-blue-500 focus:ring-blue-500" />
                <input type="text" placeholder="Key" value={variable.key} onChange={e => handleVariableChange(index, 'key', e.target.value)} className="w-1/3 bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                <input type="text" placeholder="Value" value={variable.value} onChange={e => handleVariableChange(index, 'value', e.target.value)} className="flex-grow bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                <button onClick={() => removeVariable(index)} className="text-gray-500 hover:text-red-500 text-xl font-bold">&times;</button>
            </div>
        ))}
        <button onClick={addVariable} className="text-blue-400 hover:text-blue-300 text-sm mt-2">+ Add Variable</button>
    </div>
  );
};

export default VariableEditor;