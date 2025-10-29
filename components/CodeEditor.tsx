import React, { useRef, useEffect } from 'react';

declare const hljs: any;

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: string;
  placeholder?: string;
  className?: string;
  paddingClass?: string;
  textareaRef?: React.Ref<HTMLTextAreaElement>;
  onScroll?: (event: React.UIEvent<HTMLTextAreaElement>) => void;
}

const FONT_CLASSES = 'font-mono text-sm';
const LINE_HEIGHT = '1.5rem';

const CodeEditor: React.FC<CodeEditorProps> = ({ 
    value, 
    onChange, 
    language, 
    placeholder, 
    className = '', 
    paddingClass = 'p-3',
    textareaRef, 
    onScroll 
}) => {
  const highlightRef = useRef<HTMLElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (highlightRef.current && typeof hljs !== 'undefined') {
      highlightRef.current.removeAttribute('data-highlighted');
      hljs.highlightElement(highlightRef.current);
    }
  }, [value, language]);

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (preRef.current) {
      const { scrollTop, scrollLeft } = e.currentTarget;
      preRef.current.scrollTop = scrollTop;
      preRef.current.scrollLeft = scrollLeft;
    }
    if (onScroll) {
        onScroll(e);
    }
  };

  return (
    <div className={`relative w-full h-full ${className}`}>
        <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onScroll={handleScroll}
            placeholder={!value ? placeholder : ''}
            className={`absolute inset-0 z-10 resize-none bg-transparent caret-white ${paddingClass} ${FONT_CLASSES} text-transparent focus:outline-none whitespace-pre overflow-auto`}
            style={{ lineHeight: LINE_HEIGHT }}
            spellCheck="false"
        />
        <pre 
            ref={preRef}
            className={`absolute inset-0 pointer-events-none overflow-hidden ${paddingClass} ${FONT_CLASSES}`}
            style={{ lineHeight: LINE_HEIGHT }}
            aria-hidden="true"
        >
            <code ref={highlightRef} className={`language-${language}`}>
                {value + '\n'}
            </code>
        </pre>
    </div>
  );
};

export default CodeEditor;
