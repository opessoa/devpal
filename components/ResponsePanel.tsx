
import React, { useState, useEffect } from 'react';
import { ResponseData, ConsoleLog, ApiRequest } from '../types';

interface ResponsePanelProps {
  response: ResponseData | null;
  isLoading: boolean;
  consoleLogs: ConsoleLog[];
  sentRequestInfo: ApiRequest | null;
  onGoToScript: (scriptType: 'pre-request' | 'post-request') => void;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'text-green-400';
    if (status >= 300 && status < 400) return 'text-yellow-400';
    if (status >= 400 && status < 500) return 'text-orange-400';
    if (status >= 500) return 'text-red-500';
    return 'text-gray-400';
};

const ResponsePanel: React.FC<ResponsePanelProps> = ({ response, isLoading, consoleLogs, sentRequestInfo, onGoToScript }) => {
  const [activeTab, setActiveTab] = useState<'body' | 'headers' | 'console' | 'request'>('body');

  useEffect(() => {
    if (response) {
      setActiveTab('body');
    }
  }, [response]);
  
  if (!isLoading && !response && consoleLogs.length === 0) {
    return (
      <div className="p-4 h-full flex items-center justify-center text-gray-500">
        <p>Send a request to see the response here.</p>
      </div>
    );
  }

  const formattedBody = (body: string) => {
    try {
      const parsed = JSON.parse(body);
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      return body;
    }
  };
  
  const isJson = (body: string) => {
    try {
        JSON.parse(body);
        return true;
    } catch {
        return false;
    }
  }

  const getLogTypeClass = (type: ConsoleLog['type']) => {
    switch(type) {
        case 'error': return 'text-red-400 border-red-500/30';
        case 'warn': return 'text-yellow-400 border-yellow-500/30';
        case 'info': return 'text-blue-400 border-blue-500/30';
        default: return 'text-gray-300 border-gray-700';
    }
  }
  
  const renderLogMessage = (log: ConsoleLog) => {
    const messageContent = log.message.map((arg, i) => {
        if (typeof arg === 'object' && arg !== null) {
            try {
                const content = JSON.stringify(arg, null, 2);
                return <pre key={i} className="whitespace-pre-wrap font-mono text-sm inline-block">{content}</pre>;
            } catch (e) {
                 return <span key={i}>{String(arg)}&nbsp;</span>;
            }
        }
        return <span key={i}>{String(arg)}&nbsp;</span>;
    });

    if (log.errorDetails) {
        const { scriptType } = log.errorDetails;
        return (
            <div className="flex-1">
                {messageContent}
                <button
                    onClick={() => onGoToScript(scriptType)}
                    className="ml-2 text-blue-400 hover:text-blue-300 hover:underline text-xs"
                >
                    (go to script)
                </button>
            </div>
        )
    }
    
    return <div className="flex-1">{messageContent}</div>
  };


  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-2 border-b border-gray-700">
        <div className="flex items-center space-x-4 text-sm">
            {response ? (
                <>
                    <span className={`font-bold ${getStatusColor(response.status)}`}>Status: {response.status} {response.statusText}</span>
                    <span>Time: <span className="text-blue-400">{response.time} ms</span></span>
                    <span>Size: <span className="text-blue-400">{formatBytes(response.size)}</span></span>
                </>
            ) : isLoading ? (
                <div className="flex items-center space-x-2 text-gray-400">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                    <span>Sending...</span>
                </div>
            ): (
                 <span className="text-gray-500">Ready</span>
            )}
        </div>
        <div className="flex space-x-1 bg-gray-900/50 p-1 rounded-md">
          <button onClick={() => setActiveTab('body')} className={`px-3 py-1 text-sm rounded ${activeTab === 'body' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>Body</button>
          <button onClick={() => setActiveTab('headers')} className={`px-3 py-1 text-sm rounded ${activeTab === 'headers' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>Headers</button>
          <button onClick={() => setActiveTab('console')} className={`px-3 py-1 text-sm rounded ${activeTab === 'console' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>Console</button>
          <button onClick={() => setActiveTab('request')} className={`px-3 py-1 text-sm rounded ${activeTab === 'request' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`} disabled={!sentRequestInfo}>Request</button>
        </div>
      </div>
      <div className="flex-grow overflow-auto">
        {activeTab === 'body' && (
            isLoading ? (
                <div className="p-4 h-full flex items-center justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400"></div>
                </div>
            ) : response ? (
                <pre className="p-4 text-sm whitespace-pre-wrap break-all">
                    <code className={isJson(response.body) ? 'language-json' : ''}>{formattedBody(response.body)}</code>
                </pre>
            ) : (
                <div className="p-4 h-full flex items-center justify-center text-gray-500">
                    <p>Response body will appear here.</p>
                </div>
            )
        )}
        {activeTab === 'headers' && response && (
          <div className="p-4 text-sm">
            <ul>
              {Object.entries(response.headers).map(([key, value]) => (
                <li key={key} className="flex py-1 border-b border-gray-800">
                  <span className="font-semibold w-1/4 text-gray-300">{key}:</span>
                  <span className="w-3/4 break-all">{value}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {activeTab === 'console' && (
            <div className="p-2 font-mono text-xs">
                {consoleLogs.map((log, index) => (
                    <div key={index} className={`flex items-start p-2 border-b ${getLogTypeClass(log.type)}`}>
                        <span className="pr-4 text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        {renderLogMessage(log)}
                    </div>
                ))}
            </div>
        )}
        {activeTab === 'request' && sentRequestInfo && (
            <div className="p-4 text-sm">
                <div className="mb-4">
                    <h3 className="font-bold text-gray-400 uppercase text-xs mb-1">URL</h3>
                    <p className="font-mono bg-gray-900 p-2 rounded break-all">{sentRequestInfo.method} {sentRequestInfo.url}</p>
                </div>
                 <div className="mb-4">
                    <h3 className="font-bold text-gray-400 uppercase text-xs mb-2">Headers</h3>
                    <ul>
                      {sentRequestInfo.headers.map((header) => (
                        <li key={header.id} className="flex py-1 border-b border-gray-800 font-mono">
                          <span className="font-semibold w-1/3 text-gray-300">{header.key}:</span>
                          <span className="w-2/3 break-all">{header.value}</span>
                        </li>
                      ))}
                    </ul>
                </div>
                {sentRequestInfo.body.raw && (
                     <div>
                        <h3 className="font-bold text-gray-400 uppercase text-xs mb-1">Body</h3>
                        <pre className="p-2 text-sm whitespace-pre-wrap break-all bg-gray-900 rounded">
                            <code className={isJson(sentRequestInfo.body.raw) ? 'language-json' : ''}>{formattedBody(sentRequestInfo.body.raw)}</code>
                        </pre>
                    </div>
                )}
            </div>
        )}
      </div>
    </div>
  );
};

export default ResponsePanel;