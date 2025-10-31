import React, { useState, useEffect, useCallback } from 'react';
import { ApiRequest, HttpMethod, Body, Variable } from '../types';
import ScriptEditor from './ScriptEditor';
import { SendIcon } from './icons';
import VariableEditor from './VariableEditor';
import CodeEditor from './CodeEditor';

type RequestPanelTab = 'headers' | 'body' | 'pre-request' | 'post-request' | 'preview' | 'variables';

interface RequestPanelProps {
  request: ApiRequest;
  onUpdateRequest: (updatedRequest: ApiRequest) => void;
  onSendRequest: (request: ApiRequest) => void;
  onResolvePreview: (request: ApiRequest) => Promise<ApiRequest>;
  getScopedVariables: (itemId: string) => Map<string, string>;
  onResolveVariablesWithScripts: (itemId: string) => Promise<Map<string, any>>;
  activeTab: RequestPanelTab;
  onTabChange: (tab: RequestPanelTab) => void;
  scriptError: { requestId: string; scriptType: 'pre-request' | 'post-request'; message: string; line?: number; } | null;
  onClearScriptError: () => void;
  isGeminiEnabled: boolean;
}

const httpMethods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const Tooltip = ({ visible, content, top, left }: { visible: boolean, content: React.ReactNode, top: number, left: number }) => {
    if (!visible) return null;
    return (
        <div 
            style={{ top: `${top}px`, left: `${left}px` }}
            className="fixed bg-gray-900 border border-gray-700 rounded-md shadow-xl p-2 text-sm z-50 pointer-events-none animate-fade-in-fast max-w-md"
        >
            {content}
        </div>
    );
};


const RequestPanel: React.FC<RequestPanelProps> = ({ request, onUpdateRequest, onSendRequest, onResolvePreview, getScopedVariables, onResolveVariablesWithScripts, activeTab, onTabChange, scriptError, onClearScriptError, isGeminiEnabled }) => {
  const [localRequest, setLocalRequest] = useState<ApiRequest>(request);
  const [previewRequest, setPreviewRequest] = useState<ApiRequest | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ visible: boolean; content: React.ReactNode; top: number; left: number; }>({
    visible: false,
    content: null,
    top: 0,
    left: 0,
  });
  const [resolvedHintVariables, setResolvedHintVariables] = useState<Map<string, any>>(new Map());
  const [resolvedTabVariables, setResolvedTabVariables] = useState<Map<string, any> | null>(null);
  const [isResolvingTabVars, setIsResolvingTabVars] = useState(false);
  const [tabVarsError, setTabVarsError] = useState<string | null>(null);


  useEffect(() => {
    setLocalRequest(request);
  }, [request]);

  const fetchPreview = useCallback(async () => {
    setIsPreviewLoading(true);
    setPreviewError(null);
    try {
      const resolved = await onResolvePreview(request);
      setPreviewRequest(resolved);
    } catch (e: any) {
      console.error("Failed to generate request preview", e);
      setPreviewError(e.message || 'Could not generate preview.');
      setPreviewRequest(null);
    } finally {
      setIsPreviewLoading(false);
    }
  }, [request, onResolvePreview]);

  const fetchTabVariables = useCallback(async () => {
    setIsResolvingTabVars(true);
    setTabVarsError(null);
    try {
      const resolved = await onResolveVariablesWithScripts(request.id);
      setResolvedTabVariables(resolved);
    } catch (e: any) {
      console.error("Failed to resolve variables for tab", e);
      setTabVarsError(e.message || 'Could not resolve variables.');
      setResolvedTabVariables(null);
    } finally {
      setIsResolvingTabVars(false);
    }
  }, [request.id, onResolveVariablesWithScripts]);

  useEffect(() => {
    if (activeTab === 'preview') {
      fetchPreview();
    } else if (activeTab === 'variables') {
      fetchTabVariables();
    }
  }, [request, activeTab, fetchPreview, fetchTabVariables]);
  
  // Debounced effect for updating variables for the hover tooltip
  useEffect(() => {
      const handler = setTimeout(() => {
          onResolveVariablesWithScripts(localRequest.id)
              .then(setResolvedHintVariables)
              .catch(err => {
                  console.warn("Could not resolve hint variables with scripts, falling back.", err);
                  setResolvedHintVariables(getScopedVariables(localRequest.id));
              });
      }, 300); // 300ms delay

      return () => clearTimeout(handler);
  }, [localRequest.id, localRequest.url, localRequest.body, JSON.stringify(localRequest.headers), onResolveVariablesWithScripts, getScopedVariables]);


  const hideTooltip = () => {
    setTooltip(prev => ({ ...prev, visible: false }));
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;

    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
        hideTooltip();
        return;
    }
    
    let offset: number | null = null;

    try {
        if ((document as any).caretPositionFromPoint) {
            const range = (document as any).caretPositionFromPoint(e.clientX, e.clientY);
            if (range) {
                offset = range.offset;
            }
        } else if ((document as any).caretRangeFromPoint) {
            const range = (document as any).caretRangeFromPoint(e.clientX, e.clientY);
            if (range) {
                offset = range.startOffset;
            }
        }
    } catch (err) {
        console.warn("Could not get caret position from point:", err);
        hideTooltip();
        return;
    }
    
    if (offset === null) {
        hideTooltip();
        return;
    }

    const value = target.value;
    const variableRegex = /{{\s*([\w.-]+)\s*}}/g;
    const matches = [...value.matchAll(variableRegex)];

    const matchUnderCursor = matches.find(match => {
        if (match.index === undefined) return false;
        const startIndex = match.index;
        const endIndex = startIndex + match[0].length;
        return offset! >= startIndex && offset! < endIndex;
    });

    if (matchUnderCursor) {
        const varName = matchUnderCursor[1];
        const varValue = resolvedHintVariables.get(varName);

        setTooltip({
            visible: true,
            content: (
                <div className="flex items-start space-x-2">
                    <span className="font-mono text-gray-300 flex-shrink-0">{`{{${varName}}}`}</span>
                    <span className="text-gray-500">=</span>
                    {varValue === undefined ? (
                        <span className="font-mono text-red-400 italic">Unresolved</span>
                    ) : (
                         <pre className="font-mono text-purple-300 whitespace-pre-wrap break-all">{typeof varValue === 'object' ? JSON.stringify(varValue, null, 2) : String(varValue)}</pre>
                    )}
                </div>
            ),
            top: e.clientY + 10,
            left: e.clientX + 10,
        });
    } else {
        hideTooltip();
    }
  };


  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const updated = {...localRequest, name: e.target.value };
    setLocalRequest(updated);
  }

  const handleNameBlur = () => {
    if (request.name !== localRequest.name) {
      onUpdateRequest(localRequest);
    }
  }

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
          e.currentTarget.blur();
      }
  }
  
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const updated = {...localRequest, url: e.target.value};
    setLocalRequest(updated);
    onUpdateRequest(updated);
  };
  
  const handleMethodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const updated = {...localRequest, method: e.target.value as HttpMethod};
    setLocalRequest(updated);
    onUpdateRequest(updated);
  };

  const handleHeaderChange = (index: number, field: 'key' | 'value' | 'enabled', value: string | boolean) => {
    const newHeaders = [...localRequest.headers];
    const header = { ...newHeaders[index] };
    if (field === 'enabled') {
        header.enabled = value as boolean;
    } else {
        header[field] = value as string;
    }
    newHeaders[index] = header;
    const updated = {...localRequest, headers: newHeaders};
    setLocalRequest(updated);
    onUpdateRequest(updated);
  };

  const addHeader = () => {
    const newHeaders = [...localRequest.headers, { id: Date.now().toString(), key: '', value: '', enabled: true }];
    const updated = {...localRequest, headers: newHeaders};
    setLocalRequest(updated);
    onUpdateRequest(updated);
  };

  const removeHeader = (index: number) => {
    const newHeaders = localRequest.headers.filter((_, i) => i !== index);
    const updated = {...localRequest, headers: newHeaders};
    setLocalRequest(updated);
    onUpdateRequest(updated);
  };

  const handleBodyModeChange = (mode: Body['mode']) => {
    const newBody: Body = { mode };

    if (mode === 'raw') {
        newBody.raw = localRequest.body.raw || '';
        newBody.rawLanguage = localRequest.body.rawLanguage || 'text';
    }
    if (mode === 'form-data') newBody.formData = localRequest.body.formData || [];
    if (mode === 'x-www-form-urlencoded') newBody.urlEncoded = localRequest.body.urlEncoded || [];
    if (mode === 'graphql') newBody.graphql = localRequest.body.graphql || { query: '', variables: '' };

    const updated = {...localRequest, body: newBody };
    setLocalRequest(updated);
    onUpdateRequest(updated);
  }

  const handleRawBodyChange = (value: string) => {
    // FIX: Correctly set the body mode to 'raw' when raw content is changed. This prevents an invalid state where the body object could have a 'raw' property but a different 'mode' like 'form-data'.
    const updated = {...localRequest, body: {...localRequest.body, mode: 'raw' as const, raw: value}};
    setLocalRequest(updated);
    onUpdateRequest(updated);
  }

  const handleRawLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const lang = e.target.value as Body['rawLanguage'];
    const updated = {...localRequest, body: {...localRequest.body, rawLanguage: lang }};
    setLocalRequest(updated);
    onUpdateRequest(updated);
  }
  
  const handleKeyValueBodyChange = (values: Variable[]) => {
      const key = localRequest.body.mode === 'form-data' ? 'formData' : 'urlEncoded';
      if (key === 'urlEncoded' || key === 'formData') {
          const updated = {...localRequest, body: {...localRequest.body, [key]: values }};
          setLocalRequest(updated);
          onUpdateRequest(updated);
      }
  }

  const handleGraphQLChange = (field: 'query' | 'variables', value: string) => {
    const newGraphqlBody = { ...(localRequest.body.graphql || {}), [field]: value };
    // FIX: Correctly set the body mode to 'graphql' when GraphQL content is changed. This prevents an invalid state where the body object could have a 'graphql' property but a different 'mode'.
    const updated = {...localRequest, body: {...localRequest.body, mode: 'graphql' as const, graphql: newGraphqlBody }};
    setLocalRequest(updated);
    onUpdateRequest(updated);
  }


  const handleScriptChange = (type: 'pre-request' | 'post-request', content: string) => {
    const scriptIndex = localRequest.scripts.findIndex(s => s.type === type);
    const newScripts = [...localRequest.scripts];
    if (scriptIndex > -1) {
        newScripts[scriptIndex] = {...newScripts[scriptIndex], content };
    } else {
        newScripts.push({id: Date.now().toString(), type, content});
    }
    const updated = {...localRequest, scripts: newScripts};
    setLocalRequest(updated);
    onUpdateRequest(updated);
  }

  const getScriptContent = (type: 'pre-request' | 'post-request') => {
    return localRequest.scripts.find(s => s.type === type)?.content || '';
  }

  const handleTabClick = (tab: RequestPanelTab) => {
    onTabChange(tab);
  };

  const formattedBody = (body: string | undefined) => {
    if (!body) return '';
    try {
      const parsed = JSON.parse(body);
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      return body;
    }
  };
  
  const isJson = (body: string | undefined) => {
    if (!body) return false;
    try {
        JSON.parse(body);
        return true;
    } catch {
        return false;
    }
  };

  const preRequestError = (scriptError && scriptError.requestId === request.id && scriptError.scriptType === 'pre-request') ? scriptError : null;
  const postRequestError = (scriptError && scriptError.requestId === request.id && scriptError.scriptType === 'post-request') ? scriptError : null;


  return (
    <div 
        className="h-full flex flex-col bg-gray-800 rounded-lg"
        onMouseMove={handleMouseMove}
        onMouseLeave={hideTooltip}
    >
        <div className="p-4 flex-1 flex flex-col min-h-0">
            <input
                type="text"
                value={localRequest.name}
                onChange={handleNameChange}
                onBlur={handleNameBlur}
                onKeyDown={handleNameKeyDown}
                className="text-lg font-semibold mb-3 bg-transparent focus:outline-none focus:bg-gray-900/50 rounded-md px-2 py-1 -ml-2 w-full"
            />
            <div className="flex items-center space-x-2 mb-4">
                <select value={localRequest.method} onChange={handleMethodChange} className="bg-gray-900 border border-gray-700 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold">
                    {httpMethods.map(method => <option key={method} value={method}>{method}</option>)}
                </select>
                <input
                    type="text"
                    value={localRequest.url}
                    onChange={handleUrlChange}
                    placeholder="https://api.example.com/data"
                    className="flex-grow bg-gray-900 border border-gray-700 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button onClick={() => onSendRequest(localRequest)} className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition-colors">
                    <SendIcon className="w-5 h-5" />
                    <span>Send</span>
                </button>
            </div>

            <div className="flex space-x-1 border-b border-gray-700 mb-4">
                {(['headers', 'body', 'pre-request', 'post-request', 'preview', 'variables'] as RequestPanelTab[]).map(tabName => (
                    <button
                        key={tabName}
                        onClick={() => handleTabClick(tabName)}
                        className={`px-4 py-2 text-sm capitalize ${activeTab === tabName ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400'}`}
                    >
                        {tabName.replace('-', ' ')}
                    </button>
                ))}
            </div>

            <div className="flex-grow overflow-y-auto">
                {activeTab === 'headers' && (
                    <div>
                        {localRequest.headers.map((header, index) => (
                            <div key={header.id} className="flex items-center space-x-2 mb-2">
                                <input type="checkbox" checked={header.enabled} onChange={e => handleHeaderChange(index, 'enabled', e.target.checked)} className="form-checkbox h-5 w-5 bg-gray-900 border-gray-600 rounded text-blue-500 focus:ring-blue-500" />
                                <input type="text" placeholder="Key" value={header.key} onChange={e => handleHeaderChange(index, 'key', e.target.value)} className="w-1/3 bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                <input type="text" placeholder="Value" value={header.value} onChange={e => handleHeaderChange(index, 'value', e.target.value)} className="flex-grow bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                <button onClick={() => removeHeader(index)} className="text-gray-500 hover:text-red-500">&times;</button>
                            </div>
                        ))}
                        <button onClick={addHeader} className="text-blue-400 hover:text-blue-300 text-sm mt-2">+ Add Header</button>
                    </div>
                )}
                 {activeTab === 'body' && (
                    <div className="h-full flex flex-col">
                        <div className="flex-shrink-0 flex items-center justify-between p-1 bg-gray-900/50 rounded-t-md">
                           <div className="flex items-center space-x-1">
                               {(['none', 'form-data', 'x-www-form-urlencoded', 'raw', 'graphql', 'binary'] as Body['mode'][]).map(mode => (
                                    <button 
                                        key={mode} 
                                        onClick={() => handleBodyModeChange(mode)}
                                        className={`px-3 py-1 text-xs rounded-md capitalize ${localRequest.body.mode === mode ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                                    >
                                        {mode.replace(/_/g, ' ')}
                                    </button>
                                ))}
                            </div>
                            { localRequest.body.mode === 'raw' && (
                                <select
                                    value={localRequest.body.rawLanguage || 'text'}
                                    onChange={handleRawLanguageChange}
                                    className="bg-gray-800 border border-gray-700 rounded-md px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                    <option value="text">Text</option>
                                    <option value="json">JSON</option>
                                    <option value="javascript">JavaScript</option>
                                    <option value="html">HTML</option>
                                    <option value="xml">XML</option>
                                </select>
                            )}
                        </div>
                        <div className="flex-grow bg-gray-900 rounded-b-md">
                            { localRequest.body.mode === 'none' && (
                                <div className="p-4 text-center text-gray-500">This request does not have a body.</div>
                            )}
                            { localRequest.body.mode === 'raw' && (
                                <CodeEditor
                                    value={localRequest.body.raw || ''}
                                    onChange={handleRawBodyChange}
                                    language={localRequest.body.rawLanguage || 'text'}
                                    placeholder='{ "key": "value" }'
                                    className="h-full"
                                />
                            )}
                            { (localRequest.body.mode === 'form-data' || localRequest.body.mode === 'x-www-form-urlencoded') && (
                                <div className="p-4">
                                    <VariableEditor 
                                        variables={localRequest.body.mode === 'form-data' ? localRequest.body.formData! : localRequest.body.urlEncoded!}
                                        onChange={handleKeyValueBodyChange}
                                    />
                                </div>
                            )}
                            { localRequest.body.mode === 'graphql' && (
                                <div className="h-full flex flex-col">
                                    <div className="flex-1 flex flex-col p-2 min-h-0">
                                        <label className="text-xs text-gray-400 mb-1">Query</label>
                                        <CodeEditor
                                            value={localRequest.body.graphql?.query || ''}
                                            onChange={(v) => handleGraphQLChange('query', v)}
                                            language="graphql"
                                            placeholder='query GetUser($id: ID!) { user(id: $id) { name } }'
                                            className="w-full flex-grow bg-gray-800 rounded-md"
                                        />
                                    </div>
                                    <div className="flex-1 flex flex-col p-2 min-h-0 border-t border-gray-700">
                                        <label className="text-xs text-gray-400 mb-1">GraphQL Variables</label>
                                        <CodeEditor
                                            value={localRequest.body.graphql?.variables || ''}
                                            onChange={(v) => handleGraphQLChange('variables', v)}
                                            language="json"
                                            placeholder='{ "id": "1" }'
                                            className="w-full flex-grow bg-gray-800 rounded-md"
                                        />
                                    </div>
                                </div>
                            )}
                            { localRequest.body.mode === 'binary' && (
                                <div className="p-4 text-center text-gray-500">
                                    <p>File uploads are not yet supported.</p>
                                    <button className="mt-2 px-3 py-1 text-sm bg-gray-700 rounded-md text-gray-400 cursor-not-allowed">Select File</button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {activeTab === 'pre-request' && 
                    <ScriptEditor 
                        scriptType="pre-request" 
                        value={getScriptContent('pre-request')} 
                        onChange={(c) => {
                            handleScriptChange('pre-request', c);
                            if (preRequestError) onClearScriptError();
                        }}
                        error={preRequestError ? { message: preRequestError.message, line: preRequestError.line } : null}
                        isGeminiEnabled={isGeminiEnabled}
                    />}
                {activeTab === 'post-request' && 
                    <ScriptEditor 
                        scriptType="post-request" 
                        value={getScriptContent('post-request')} 
                        onChange={(c) => {
                            handleScriptChange('post-request', c);
                             if (postRequestError) onClearScriptError();
                        }}
                        error={postRequestError ? { message: postRequestError.message, line: postRequestError.line } : null}
                        isGeminiEnabled={isGeminiEnabled}
                    />}
                {activeTab === 'preview' && (
                    <div className="p-4 text-sm">
                        {isPreviewLoading && (
                            <div className="p-4 h-full flex items-center justify-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
                            </div>
                        )}
                        {previewError && (
                            <div className="p-4 bg-red-900/50 text-red-300 rounded">
                                <strong className="font-bold">Error generating preview:</strong>
                                <p className="font-mono mt-2">{previewError}</p>
                            </div>
                        )}
                        {previewRequest && (
                            <div>
                                <div className="mb-4">
                                    <h3 className="font-bold text-gray-400 uppercase text-xs mb-1">URL</h3>
                                    <p className="font-mono bg-gray-900 p-2 rounded break-all">{previewRequest.method} {previewRequest.url}</p>
                                </div>
                                <div className="mb-4">
                                    <h3 className="font-bold text-gray-400 uppercase text-xs mb-2">Headers</h3>
                                    <ul>
                                    {previewRequest.headers.map((header) => (
                                        <li key={header.id} className="flex py-1 border-b border-gray-800 font-mono">
                                        <span className="font-semibold w-1/3 text-gray-300">{header.key}:</span>
                                        <span className="w-2/3 break-all">{header.value}</span>
                                        </li>
                                    ))}
                                    {previewRequest.headers.length === 0 && <li className="text-gray-500 italic">No headers.</li>}
                                    </ul>
                                </div>
                                {previewRequest.body.raw ? (
                                    <div>
                                        <h3 className="font-bold text-gray-400 uppercase text-xs mb-1">Body</h3>
                                        <pre className="p-2 text-sm whitespace-pre-wrap break-all bg-gray-900 rounded">
                                            <code className={isJson(previewRequest.body.raw) ? 'language-json' : ''}>{formattedBody(previewRequest.body.raw)}</code>
                                        </pre>
                                    </div>
                                ) : (
                                    <div>
                                        <h3 className="font-bold text-gray-400 uppercase text-xs mb-1">Body</h3>
                                        <p className="text-gray-500 p-2 italic">No body for this request.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
                {activeTab === 'variables' && (
                    <div className="p-4 text-sm">
                        {isResolvingTabVars && !resolvedTabVariables && (
                             <div className="p-4 h-full flex items-center justify-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
                            </div>
                        )}
                        {tabVarsError && (
                            <div className="p-4 bg-red-900/50 text-red-300 rounded">
                                <strong className="font-bold">Error resolving variables:</strong>
                                <p className="font-mono mt-2">{tabVarsError}</p>
                            </div>
                        )}
                        {resolvedTabVariables && (
                            <div>
                                <p className="text-xs text-gray-400 mb-4">
                                    Showing final variable values after executing all pre-request scripts. Resolution order: Globals, Collection/Folder, Scripts.
                                </p>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead className="border-b border-gray-700">
                                            <tr>
                                                <th className="p-2 font-semibold text-gray-300 w-1/3">Key</th>
                                                <th className="p-2 font-semibold text-gray-300">Value</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Array.from(resolvedTabVariables.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => (
                                                <tr key={key} className="border-b border-gray-800">
                                                    <td className="p-2 font-mono align-top text-purple-300 break-all">{key}</td>
                                                    <td className="p-2 font-mono align-top">
                                                        <pre className="whitespace-pre-wrap break-all">
                                                            {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                                                        </pre>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
        <Tooltip {...tooltip} />
    </div>
  );
};

export default RequestPanel;