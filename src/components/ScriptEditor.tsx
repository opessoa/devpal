import React, { useState, useRef } from 'react';
import { generateScriptWithGemini } from '../services/geminiService';
import { SparklesIcon, ErrorIcon } from './icons';
import CodeEditor from './CodeEditor';

interface ScriptEditorProps {
  value: string;
  onChange: (value: string) => void;
  scriptType: 'pre-request' | 'post-request';
  error?: { message: string; line?: number } | null;
  isGeminiEnabled: boolean;
}

const LINE_HEIGHT = '1.5rem'; // 24px

const ScriptEditor: React.FC<ScriptEditorProps> = ({ value, onChange, scriptType, error = null, isGeminiEnabled }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  
  const lineCount = value.split('\n').length;

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const handleGenerate = async () => {
    if (!prompt) return;
    setIsLoading(true);
    setModalError(null);
    try {
      const script = await generateScriptWithGemini(prompt, scriptType);
      onChange(script);
      setIsModalOpen(false);
      setPrompt('');
    } catch (e: any) {
      setModalError(e.message || 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoToErrorLine = () => {
    if (error?.line && textareaRef.current) {
        const lines = value.split('\n');
        const targetLineIndex = error.line - 1; // Convert 1-based line number to 0-based index

        if (targetLineIndex >= 0 && targetLineIndex < lines.length) {
            let position = 0;
            for (let i = 0; i < targetLineIndex; i++) {
                position += lines[i].length + 1; // +1 for the newline character
            }

            const textarea = textareaRef.current;
            textarea.focus();
            textarea.setSelectionRange(position, position);

            // Programmatically scroll the line into view.
            // LINE_HEIGHT is '1.5rem', which corresponds to the 'h-6' class (24px).
            const lineHeightPx = 24;
            const targetScrollTop = targetLineIndex * lineHeightPx;
            
            // To make it more pleasant, we center the line in the viewport.
            const textareaHeight = textarea.clientHeight;
            const centeredScrollTop = Math.max(0, targetScrollTop - (textareaHeight / 2) + (lineHeightPx / 2));
            
            textarea.scrollTop = centeredScrollTop;

            // Manually dispatch a scroll event.
            // This is crucial because setting scrollTop programmatically does not fire
            // the 'onscroll' event, which is needed to sync the line number gutter
            // and the syntax highlighting overlay.
            textarea.dispatchEvent(new Event('scroll', { bubbles: true }));
        }
    }
  };
  
  const displayedErrorMessage = error?.message.replace(/Script error in ".*": /, '');

  return (
    <div className="h-full flex flex-col relative bg-gray-800 rounded-md">
      <div className="flex-shrink-0 flex justify-between items-center p-2 border-b border-gray-700">
        <label className="text-xs font-semibold text-gray-400 uppercase">
          {scriptType === 'pre-request' ? 'Pre-request Script' : 'Post-request Script'}
        </label>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center space-x-1.5 px-2 py-1 bg-purple-600 hover:bg-purple-700 rounded-md text-sm transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
          disabled={!isGeminiEnabled}
          title={isGeminiEnabled ? "Generate script with AI" : "AI features are disabled. Enable them from the sidebar header."}
        >
          <SparklesIcon className="w-4 h-4" />
          <span>AI Generate</span>
        </button>
      </div>

      <div className={`flex-grow flex relative overflow-hidden ${error ? 'pb-10' : ''}`}>
        {/* Gutter */}
        <div 
            ref={gutterRef}
            className={`w-12 flex-shrink-0 bg-gray-900/50 text-right p-3 pr-2 text-gray-500 font-mono text-sm overflow-y-hidden select-none`}
            style={{ lineHeight: LINE_HEIGHT }}
        >
            {Array.from({ length: lineCount }, (_, i) => i + 1).map(lineNumber => (
                <div key={lineNumber} className="relative h-6 flex justify-end items-center">
                    {error && error.line === lineNumber && (
                        <ErrorIcon className="w-4 h-4 text-red-500 absolute -left-1" />
                    )}
                    {lineNumber}
                </div>
            ))}
        </div>

        {/* Editor */}
        <CodeEditor
            textareaRef={textareaRef}
            value={value}
            onChange={onChange}
            onScroll={handleScroll}
            language="javascript"
            placeholder={`// JavaScript code for ${scriptType} phase`}
            className="w-full h-full"
            paddingClass="p-3 pl-2"
        />
      </div>
      
      {error && (
        <div 
            onDoubleClick={handleGoToErrorLine}
            title="Double-click to jump to error line"
            className="absolute bottom-0 left-0 right-0 h-10 bg-red-900/90 text-red-200 p-2 font-mono text-xs flex items-center space-x-2 border-t border-red-700 z-10 overflow-y-auto cursor-pointer"
        >
            <p className="whitespace-pre-wrap break-all">{displayedErrorMessage}</p>
        </div>
      )}

      {isModalOpen && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20">
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg">
            <h3 className="text-lg font-bold mb-4">Generate Script with AI</h3>
            <p className="text-sm text-gray-400 mb-4">Describe what you want the script to do. For example, "Set a header 'Authorization' with a bearer token from the 'authToken' variable".</p>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full h-24 p-2 bg-gray-900 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="Your prompt here..."
            />
            {modalError && <p className="text-red-500 text-sm mt-2">{modalError}</p>}
            <div className="flex justify-end space-x-3 mt-4">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-md text-sm"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-md text-sm flex items-center disabled:opacity-50"
                disabled={isLoading || !prompt}
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Generating...
                  </>
                ) : (
                  'Generate'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScriptEditor;