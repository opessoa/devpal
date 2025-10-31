import React, { useState, useEffect, useCallback } from 'react';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { invoke } from "@tauri-apps/api/core";
import TreeView from './components/TreeView';
import RequestPanel from './components/RequestPanel';
import ResponsePanel from './components/ResponsePanel';
import FolderPanel from './components/FolderPanel';
import VariableEditor from './components/VariableEditor';
import VariableManager from './components/VariableManager';
import ContextMenu from './components/ContextMenu';
import { Project, ApiRequest, Folder, Collection, ResponseData, ConsoleLog, Variable, ScriptErrorDetails, AppSettings } from './types';
import { importPostmanCollection, importPostmanEnvironmentOrGlobals } from './services/postmanImporter';
import * as executionService from './services/executionService';
import { GlobeAltIcon, TagIcon, SparklesIcon, CogIcon } from './components/icons';

const initialProject: Project = {
  collections: [
    {
      id: 'coll1',
      name: 'My First Collection',
      variables: [
        { id: 'v1', key: 'baseUrl', value: 'https://jsonplaceholder.typicode.com', enabled: true},
        { id: 'v2', key: 'enableDiagnostics', value: 'true', enabled: true }
      ],
      scripts: [
          { id: 'cs1', type: 'pre-request', content: 'console.log("Running pre-request script from collection!");' }
      ],
      items: [
        {
          id: 'req1',
          name: 'Get User Example',
          type: 'request',
          method: 'GET',
          url: '{{baseUrl}}/users/{{userId}}',
          headers: [{ id: 'h1', key: 'Accept', value: 'application/json', enabled: true }],
          body: { mode: 'none' },
          scripts: [
              { id: 's2', type: 'pre-request', content: 'console.log("Request Path:", pm.info.getPath());' },
              { id: 's1', type: 'post-request', content: 'console.log("User data received:", pm.response.json());' }
          ]
        },
        {
          id: 'f1',
          name: 'Posts',
          type: 'folder',
          variables: [],
          scripts: [],
          items: [
            {
              id: 'req2',
              name: 'Create Post',
              type: 'request',
              method: 'POST',
              url: '{{baseUrl}}/posts',
              headers: [
                  { id: 'h2', key: 'Content-Type', value: 'application/json; charset=UTF-8', enabled: true }
              ],
              body: {
                mode: 'raw',
                rawLanguage: 'json',
                raw: JSON.stringify({
                  title: 'foo',
                  body: 'bar',
                  userId: 1,
                }, null, 2),
              },
              scripts: [
                  { id: 's2', type: 'pre-request', content: `if (pm.variables.get("enableDiagnostics") === "true") {
    const lang = pm.request.body.options.raw.language;
    console.log("Request body language is:", lang);

    const diagnostics = lang === 'json' ?
        JSON.stringify({ "diagnostics": { "source": "script", "timestamp": new Date().toISOString() } }) :
        '<diagnostics><source>script</source><timestamp>' + new Date().toISOString() + '</timestamp></diagnostics>';

    console.log('Generated diagnostic data:', diagnostics);
    pm.environment.set("diagnosticData", diagnostics);
} else {
    console.log("Diagnostics disabled.");
    const lang = pm.request.body.options.raw.language;
    const emptyState = lang === 'json' ? '{}' : '<empty/>';
    pm.environment.set("diagnosticData", emptyState);
}` }
              ]
            }
          ]
        }
      ]
    }
  ],
  globalVariables: [
      { id: 'gv1', key: 'userId', value: '1', enabled: true }
  ],
};

type ContextMenuState = {
    x: number;
    y: number;
    item: ApiRequest | Folder | Collection;
    visible: boolean;
};

const WelcomeScreen = () => (
    <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 bg-gray-800 rounded-lg p-8">
        <h1 className="text-3xl font-bold text-gray-300 mb-2">Welcome to DevPal API Client</h1>
        <p className="max-w-md">Select an item from the collection on the left to start.</p>
        <p className="mt-4 text-sm">Your work is automatically saved to your browser's local storage.</p>
    </div>
);

const App: React.FC = () => {
  const [project, setProject] = useState<Project>(initialProject);
  const [selectedItem, setSelectedItem] = useState<ApiRequest | Folder | Collection | null>(null);
  const [response, setResponse] = useState<ResponseData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLog[]>([]);
  const [sentRequestInfo, setSentRequestInfo] = useState<ApiRequest | null>(null);
  const [isGlobalsModalOpen, setIsGlobalsModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({ corsProxy: { enabled: false, url: '' } });
  const [viewMode, setViewMode] = useState<'item' | 'variables'>('item');
  const [runtimeVariables, setRuntimeVariables] = useState<Map<string, any>>(new Map());
  const [activeRequestPanelTab, setActiveRequestPanelTab] = useState<'headers' | 'body' | 'pre-request' | 'post-request' | 'preview' | 'variables'>('headers');
  const [scriptError, setScriptError] = useState<{ requestId: string; scriptType: 'pre-request' | 'post-request'; message: string; line?: number; } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ x: 0, y: 0, item: initialProject.collections[0], visible: false });
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const [isGeminiEnabled, setIsGeminiEnabled] = useState<boolean>(false);

  useEffect(() => {
    const checkApiKey = async () => {
      const saved = localStorage.getItem('geminiEnabled');
      if (saved !== null) {
        setIsGeminiEnabled(JSON.parse(saved));
      } else {
        try {
          const API_KEY: string | null = await invoke('get_api_key');
          setIsGeminiEnabled(!!API_KEY);
        } catch (error) {
          console.error("Error checking API key:", error);
          setIsGeminiEnabled(false);
        }
      }
    };
    checkApiKey();
  }, []);

  useEffect(() => {
    localStorage.setItem('geminiEnabled', JSON.stringify(isGeminiEnabled));
  }, [isGeminiEnabled]);

  const findPath = useCallback((targetId: string, p: Project): (Folder | ApiRequest | Collection)[] | null => {
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
  }, []);

  useEffect(() => {
    const handleClick = () => setContextMenu(prev => ({ ...prev, visible: false }));
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    try {
      const savedProject = localStorage.getItem('apiClientProject');
      if (savedProject) {
        const loadedProject = JSON.parse(savedProject);
        setProject(loadedProject);
        setSelectedItem(null);
      }
      const savedSettings = localStorage.getItem('apiClientSettings');
      if (savedSettings) {
        setSettings(JSON.parse(savedSettings));
      }
    } catch (error) {
      console.error("Failed to load project from local storage:", error);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('apiClientProject', JSON.stringify(project));
      
      if (selectedItem) {
        const path = findPath(selectedItem.id, project);
        const freshItem = path ? path[path.length - 1] : null;

        if (freshItem && JSON.stringify(selectedItem) !== JSON.stringify(freshItem)) {
          setSelectedItem(freshItem);
        } else if (!freshItem) {
          setSelectedItem(null);
        }
      }
    } catch (error) {
      console.error("Failed to save project to local storage:", error);
    }
  }, [project, selectedItem, findPath]);

  useEffect(() => {
    try {
      localStorage.setItem('apiClientSettings', JSON.stringify(settings));
    } catch (error) {
        console.error("Failed to save settings to local storage:", error);
    }
  }, [settings]);

  const getScopedVariables = useCallback((itemId: string): Map<string, any> => {
    return executionService.getScopedVariables(project, itemId, findPath, runtimeVariables);
  }, [project, findPath, runtimeVariables]);
  
  const handleSelect = useCallback(async (item: ApiRequest | Folder | Collection) => {
    setSelectedItem(item);
    setViewMode('item');
    setActiveRequestPanelTab('headers');
    if ('type' in item && item.type === 'request') {
        setResponse(null); 
        setConsoleLogs([]);
        setSentRequestInfo(null);
        setScriptError(null);
    }
  }, []);

  const handleUpdateItem = useCallback((itemToUpdate: ApiRequest | Folder | Collection) => {
    const update = (items: (ApiRequest | Folder | Collection)[]): (ApiRequest | Folder | Collection)[] => {
        return items.map(item => {
            if (item.id === itemToUpdate.id) {
                return itemToUpdate;
            }
            if ('items' in item && Array.isArray(item.items)) {
                return { ...item, items: update(item.items) as (ApiRequest | Folder)[] };
            }
            return item;
        });
    };
    const newCollections = update(project.collections) as Collection[];
    setProject(prevProject => ({ ...prevProject, collections: newCollections }));
    if (selectedItem && selectedItem.id === itemToUpdate.id) {
        setSelectedItem(itemToUpdate);
    }
  }, [project.collections, selectedItem]);

  const getResolvedVariablesAfterScripts = useCallback(async (itemId: string): Promise<Map<string, any>> => {
    try {
        const { variablesMap } = await executionService.runPreRequestScripts(project, itemId, findPath, () => {}, runtimeVariables, undefined, settings); // logs are discarded
        return variablesMap;
    } catch (e) {
        console.error("Failed to resolve variables with scripts", e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        throw new Error(`Script error during variable resolution: ${errorMessage}`);
    }
  }, [project, findPath, runtimeVariables, settings]);


  const resolveRequestPreview = useCallback(async (request: ApiRequest): Promise<ApiRequest> => {
    try {
      const initialHeaders = new Headers(request.headers.filter(h => h.enabled).reduce((acc, h) => ({...acc, [h.key]: h.value}), {}));
      
      const { pmContext, variablesMap } = await executionService.runPreRequestScripts(
          project, request.id, findPath, () => {}, runtimeVariables, initialHeaders, settings
      );
      
      const { resolvedUrl, resolvedHeaders, resolvedBody } = executionService.resolveRequest(request, variablesMap, pmContext);
      
      const finalRequest = {
          ...request,
          url: resolvedUrl,
          headers: Array.from(resolvedHeaders.entries()).map(([k,v], i) => ({ id: `h_preview_${i}`, key:k, value: v, enabled: true})),
          body: {...request.body, raw: executionService.serializeResolvedBodyForDisplay(resolvedBody) }
      };
      
      return finalRequest;
    } catch (e) {
        console.error("Script execution failed during preview:", e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        throw new Error(`Script error during preview: ${errorMessage}`);
    }
  }, [project, findPath, runtimeVariables, settings]);


  const handleSendRequest = async (request: ApiRequest) => {
      setIsLoading(true);
      setResponse(null);
      setConsoleLogs([]);
      setSentRequestInfo(null);
      setScriptError(null);

      const addLog = (log: Omit<ConsoleLog, 'timestamp'>) => {
          setConsoleLogs(prev => [...prev, {...log, timestamp: new Date().toISOString()}]);
      }
      
      try {
          const initialHeaders = new Headers(request.headers.filter(h => h.enabled).reduce((acc, h) => ({...acc, [h.key]: h.value}), {}));
          
          const { pmContext, variablesMap: preRequestVars } = await executionService.runPreRequestScripts(
              project, request.id, findPath, addLog, runtimeVariables, initialHeaders, settings
          );

          const { resolvedUrl, resolvedHeaders, resolvedBody } = executionService.resolveRequest(request, preRequestVars, pmContext);
          
          const sentRequestForDisplay = {
              ...request,
              url: resolvedUrl,
              headers: Array.from(resolvedHeaders.entries()).map(([k,v], i) => ({ id: `h_sent_${i}`, key:k, value: v, enabled: true})),
              body: {...request.body, raw: executionService.serializeResolvedBodyForDisplay(resolvedBody) }
          };
          setSentRequestInfo(sentRequestForDisplay);

          const finalUrl = settings.corsProxy.enabled && settings.corsProxy.url
            ? `${settings.corsProxy.url.replace(/\/$/, '')}/${sentRequestForDisplay.url}`
            : sentRequestForDisplay.url;

          const startTime = Date.now();
          const fetchResponse = await fetch(finalUrl, {
              method: request.method,
              headers: resolvedHeaders,
              body: request.method !== 'GET' && request.method !== 'HEAD' ? resolvedBody : undefined,
          });
          const endTime = Date.now();

          const responseBodyText = await fetchResponse.text();
          const responseHeaders: Record<string, string> = {};
          fetchResponse.headers.forEach((value, key) => {
              responseHeaders[key] = value;
          });

          const responseData: ResponseData = {
              status: fetchResponse.status,
              statusText: fetchResponse.statusText,
              headers: responseHeaders,
              body: responseBodyText,
              size: new Blob([responseBodyText]).size,
              time: endTime - startTime
          };
          setResponse(responseData);
          
          const finalVariables = await executionService.runPostRequestScripts(pmContext, project, request.id, findPath, responseData, addLog);
          setRuntimeVariables(finalVariables);

      } catch (error: any) {
          const errorMessage = error.message || 'An unexpected error occurred.';
          const logEntry: Omit<ConsoleLog, 'timestamp'> = { type: 'error', message: [errorMessage] };
          
          if (error._isScriptError) {
              const scriptErrorDetails = { scriptType: error.scriptType, line: error.line };
              logEntry.errorDetails = scriptErrorDetails;
              setScriptError({
                  requestId: request.id,
                  ...scriptErrorDetails,
                  message: errorMessage,
              });
          }
          
          if (!consoleLogs.some(log => log.message.includes(errorMessage))) {
              addLog(logEntry);
          }

          setResponse({
              status: 0,
              statusText: 'Client Error',
              headers: {},
              body: errorMessage,
              size: 0,
              time: 0
          });
      } finally {
          setIsLoading(false);
      }
  };
  
  const handleTauriExport = async () => {
    try {
      const filePath = await saveDialog({
        defaultPath: 'devpal-project.json',
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
      });
      if (filePath) {
        const dataStr = JSON.stringify(project, null, 2);
        await writeTextFile(filePath, dataStr);
        alert('Project exported successfully!');
      }
    } catch (error) {
      console.error("Failed to export project:", error);
      alert(`Error: ${error}`);
    }
  };
  
  const handleTauriImport = async () => {
    try {
      const selectedPath = await openDialog({
        multiple: false,
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
      });

      if (typeof selectedPath === 'string') {
        const text = await readTextFile(selectedPath);
        if (!text) throw new Error("File is empty.");
        
        const data = JSON.parse(text);

        if (data.info && data.info._postman_id && Array.isArray(data.item)) {
          const newCollection = importPostmanCollection(text);
          setProject(p => ({ ...p, collections: [...p.collections, newCollection] }));
          alert(`Postman collection "${newCollection.name}" imported successfully!`);
        } 
        else if (Array.isArray(data.values) && data._postman_variable_scope) {
          const newVariables = importPostmanEnvironmentOrGlobals(text);
          setProject(p => {
            const existingKeys = new Set(p.globalVariables.map(v => v.key));
            const filteredNewVars = newVariables.filter(v => !existingKeys.has(v.key));
            const addedCount = filteredNewVars.length;
            const skippedCount = newVariables.length - addedCount;
            alert(`Imported ${addedCount} variables from "${data.name || 'Postman file'}". Skipped ${skippedCount} duplicate variables.`);
            return { ...p, globalVariables: [...p.globalVariables, ...filteredNewVars] };
          });
        }
        else if (Array.isArray(data.collections) && Array.isArray(data.globalVariables)) {
          setProject(data);
          setSelectedItem(null);
          setResponse(null);
          alert('DevPal project imported successfully!');
        } else {
          throw new Error("Unrecognized file format. Please import a valid DevPal project or Postman v2.1.0+ file.");
        }
      }
    } catch (err: any) {
      console.error("Failed to import file:", err);
      alert(`Error: ${err.message || "Could not import file."}`);
    }
  };


  const handleGlobalVarsChange = (updatedVariables: Variable[]) => {
    setProject(p => ({ ...p, globalVariables: updatedVariables }));
  };

  const handleAddItem = useCallback((parentId: string, itemToAdd: Folder | ApiRequest) => {
    const add = (items: (Collection | Folder | ApiRequest)[]): (Collection | Folder | ApiRequest)[] => {
        return items.map(item => {
            if (item.id === parentId && 'items' in item) {
                return { ...item, items: [...item.items, itemToAdd] as (Folder | ApiRequest)[] };
            }
            if ('items' in item && Array.isArray(item.items)) {
                return { ...item, items: add(item.items) as (Folder | ApiRequest)[] };
            }
            return item;
        });
    };
    setProject(prevProject => {
        const newCollections = add(prevProject.collections) as Collection[];
        return { ...prevProject, collections: newCollections };
    });
    setSelectedItem(itemToAdd);
    setViewMode('item');
  }, []);

  const handleAddFolder = useCallback((parentId: string) => {
      const newFolder: Folder = {
          id: `f_${Date.now()}`,
          name: 'New Folder',
          type: 'folder',
          items: [],
          variables: [],
          scripts: [],
      };
      handleAddItem(parentId, newFolder);
  }, [handleAddItem]);
  
  const handleAddRequest = useCallback((parentId: string) => {
      const newRequest: ApiRequest = {
          id: `req_${Date.now()}`,
          name: 'New Request',
          type: 'request',
          method: 'GET',
          url: '',
          headers: [],
          body: { mode: 'none' },
          scripts: [],
      };
      handleAddItem(parentId, newRequest);
  }, [handleAddItem]);

  const handleGoToScript = (scriptType: ScriptErrorDetails['scriptType']) => {
    if (selectedItem && 'type' in selectedItem && selectedItem.type === 'request') {
        setActiveRequestPanelTab(scriptType);
    }
  };

  const handleContextMenu = (event: React.MouseEvent, item: ApiRequest | Folder | Collection) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, item, visible: true });
  };
  
  const handleStartRename = () => {
    if (contextMenu.item) {
      setRenamingId(contextMenu.item.id);
    }
    setContextMenu(prev => ({ ...prev, visible: false }));
  };

  const handleRename = (id: string, newName: string) => {
    setRenamingId(null);
    const path = findPath(id, project);
    if (path) {
      const itemToUpdate = { ...path[path.length - 1], name: newName };
      handleUpdateItem(itemToUpdate);
    }
  };

  const deepCloneWithNewIds = (item: Folder | ApiRequest | Collection): any => {
    // FIX: Safely access `type` property, which does not exist on `Collection`.
    const itemType = 'type' in item ? item.type : 'coll';
    const newId = `${itemType}_${Date.now()}_${Math.random()}`;
    const clone: any = { ...item, id: newId };
    
    const cloneWithIds = (obj: any, key: string) => {
        if (obj[key] && Array.isArray(obj[key])) {
           clone[key] = obj[key].map((subItem: any) => ({ ...subItem, id: `${subItem.type || 'item'}_${Date.now()}_${Math.random()}` }));
        }
    }
    cloneWithIds(item, 'variables');
    cloneWithIds(item, 'scripts');
    
    // FIX: Safely access `body` and `headers`, which only exist on `ApiRequest`.
    if ('headers' in item) {
      cloneWithIds(item, 'headers');
    }

    if ('body' in item && item.body) {
      if (item.body.formData) clone.body.formData = item.body.formData.map((v: Variable) => ({ ...v, id: `var_${Date.now()}_${Math.random()}` }));
      if (item.body.urlEncoded) clone.body.urlEncoded = item.body.urlEncoded.map((v: Variable) => ({ ...v, id: `var_${Date.now()}_${Math.random()}` }));
    }

    if ('items' in item && item.items) {
      clone.items = item.items.map(deepCloneWithNewIds);
    }
    return clone;
  };

  const handleDuplicate = () => {
    const itemToDuplicate = contextMenu.item;
    if (!itemToDuplicate) return;

    const clonedItem = deepCloneWithNewIds(itemToDuplicate);
    clonedItem.name = `${itemToDuplicate.name} (Copy)`;

    const path = findPath(itemToDuplicate.id, project);
    const parent = path && path.length > 1 ? path[path.length - 2] : null;

    if (parent && 'items' in parent) {
      const insert = (items: (Collection | Folder | ApiRequest)[]): (Collection | Folder | ApiRequest)[] => {
        const newItems: (Collection | Folder | ApiRequest)[] = [];
        for (const item of items) {
          newItems.push(item);
          if (item.id === parent.id && 'items' in item) {
            const parentClone = { ...item, items: [...item.items] };
            const index = parentClone.items.findIndex((i: any) => i.id === itemToDuplicate.id);
            if (index !== -1) {
              parentClone.items.splice(index + 1, 0, clonedItem);
            }
            newItems[newItems.length - 1] = parentClone;
          } else if ('items' in item) {
             const updatedSubItems = insert(item.items);
             (newItems[newItems.length -1] as any).items = updatedSubItems;
          }
        }
        return newItems;
      };
      const newCollections = insert(project.collections);
      setProject(p => ({ ...p, collections: newCollections as Collection[] }));
    } else { // It's a top-level collection
      const newCollections = [...project.collections];
      const index = newCollections.findIndex(c => c.id === itemToDuplicate.id);
      if (index > -1) {
        newCollections.splice(index + 1, 0, clonedItem);
        setProject(p => ({...p, collections: newCollections }));
      }
    }
    setContextMenu(prev => ({ ...prev, visible: false }));
  };

  const handleDelete = () => {
    const itemToDelete = contextMenu.item;
    if (!itemToDelete) return;

    if (window.confirm(`Are you sure you want to delete "${itemToDelete.name}"?`)) {
      // Check if the currently selected item is the one being deleted or is a descendant of it.
      let shouldDeselect = false;
      if (selectedItem) {
        const isOrIsDescendantOf = (parent: any, childId: string): boolean => {
          if (parent.id === childId) return true;
          if (!('items' in parent && Array.isArray(parent.items))) return false;
          return parent.items.some((item: any) => isOrIsDescendantOf(item, childId));
        };
        if (isOrIsDescendantOf(itemToDelete, selectedItem.id)) {
          shouldDeselect = true;
        }
      }

      const remove = (items: (Collection | Folder | ApiRequest)[]): (Collection | Folder | ApiRequest)[] => {
        return items.reduce((acc, item) => {
          if (item.id === itemToDelete.id) {
            return acc; // Don't include the item to delete
          }
          if ('items' in item && Array.isArray(item.items)) {
            // Recurse into children
            acc.push({ ...item, items: remove(item.items) as (Folder | ApiRequest)[] });
          } else {
            acc.push(item);
          }
          return acc;
        }, [] as (Collection | Folder | ApiRequest)[]);
      };
      
      const newCollections = remove(project.collections) as Collection[];
      setProject(prevProject => ({ ...prevProject, collections: newCollections }));

      if (shouldDeselect) {
        setSelectedItem(null);
      }
    }
    setContextMenu(prev => ({ ...prev, visible: false }));
  };


  const renderMainPanel = () => {
    if (viewMode === 'variables') {
        return <VariableManager project={project} onUpdateProject={setProject} selectedItem={selectedItem} />;
    }
    if (!selectedItem) return <WelcomeScreen />;
    if ('type' in selectedItem && selectedItem.type === 'request') {
        return <RequestPanel 
            request={selectedItem as ApiRequest} 
            onUpdateRequest={handleUpdateItem as (req: ApiRequest) => void}
            onSendRequest={handleSendRequest}
            onResolvePreview={resolveRequestPreview}
            getScopedVariables={getScopedVariables}
            onResolveVariablesWithScripts={getResolvedVariablesAfterScripts}
            activeTab={activeRequestPanelTab}
            onTabChange={setActiveRequestPanelTab}
            scriptError={scriptError}
            onClearScriptError={() => setScriptError(null)}
            isGeminiEnabled={isGeminiEnabled}
        />;
    }
    if ('items' in selectedItem) { // Folder or Collection
        return <FolderPanel 
            item={selectedItem as Folder | Collection} 
            onUpdateItem={handleUpdateItem as (item: Folder | Collection) => void}
            isGeminiEnabled={isGeminiEnabled}
        />;
    }
    return <WelcomeScreen />;
  };

  return (
    <div className="flex h-screen bg-gray-900 text-white font-sans">
        <aside className="w-1/4 max-w-xs min-w-[250px] bg-gray-800 h-full flex flex-col border-r border-gray-700">
            <div className="p-3 border-b border-gray-700 flex items-center justify-between">
                <h1 className="text-xl font-bold">DevPal</h1>
                 <div className="flex items-center space-x-2">
                    <button 
                        onClick={() => setIsGeminiEnabled(prev => !prev)} 
                        title={isGeminiEnabled ? "Disable AI Features" : "Enable AI Features"} 
                        className={`p-1.5 rounded-md transition-colors ${isGeminiEnabled ? 'text-purple-400 hover:bg-purple-900/50' : 'text-gray-500 hover:text-white hover:bg-gray-700'}`}
                        disabled={!isGeminiEnabled}
                    >
                        <SparklesIcon className="w-5 h-5" />
                    </button>
                    <button onClick={() => setIsSettingsModalOpen(true)} title="Settings" className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md">
                        <CogIcon className="w-5 h-5" />
                    </button>
                    <button onClick={() => setIsGlobalsModalOpen(true)} title="Manage Globals" className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md">
                        <GlobeAltIcon className="w-5 h-5" />
                    </button>
                    <button onClick={() => setViewMode('variables')} title="Variable Manager" className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md">
                        <TagIcon className="w-5 h-5" />
                    </button>
                    <button onClick={handleTauriImport} className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded">Import</button>
                    <button onClick={handleTauriExport} className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded">Export</button>
                </div>
            </div>
            <div className="flex-grow overflow-y-auto">
              <TreeView 
                collections={project.collections} 
                onSelect={handleSelect} 
                selectedId={selectedItem?.id || null}
                onAddFolder={handleAddFolder}
                onAddRequest={handleAddRequest}
                onContextMenu={handleContextMenu}
                renamingId={renamingId}
                onRename={handleRename}
              />
            </div>
        </aside>

        <main className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
            <div className="flex-1 min-h-0">
              {renderMainPanel()}
            </div>
            <div className="flex-1 min-h-0 bg-gray-800 rounded-lg overflow-hidden">
              <ResponsePanel 
                response={response} 
                isLoading={isLoading} 
                consoleLogs={consoleLogs}
                sentRequestInfo={sentRequestInfo}
                onGoToScript={handleGoToScript}
              />
            </div>
        </main>
        
        {contextMenu.visible && (
            <ContextMenu 
                x={contextMenu.x}
                y={contextMenu.y}
                item={contextMenu.item}
                onClose={() => setContextMenu(prev => ({...prev, visible: false }))}
                onRename={handleStartRename}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
            />
        )}
        
        {isGlobalsModalOpen && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20">
                <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col border border-gray-700">
                    <h3 className="text-lg font-bold mb-4 text-white">Global Variables</h3>
                    <p className="text-sm text-gray-400 mb-4">These variables are available for all requests in your project.</p>
                    <div className="flex-grow overflow-y-auto pr-2 -mr-2">
                        <VariableEditor variables={project.globalVariables} onChange={handleGlobalVarsChange} />
                    </div>
                    <div className="flex justify-end mt-6 pt-4 border-t border-gray-700">
                        <button
                            onClick={() => setIsGlobalsModalOpen(false)}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        )}

        {isSettingsModalOpen && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20">
                <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg border border-gray-700">
                    <h3 className="text-lg font-bold mb-4 text-white">Settings</h3>
                    <div className="space-y-6">
                        <div>
                            <h4 className="text-md font-semibold text-gray-200 mb-2">CORS Proxy</h4>
                            <p className="text-sm text-gray-400 mb-4">
                                Bypass browser CORS restrictions by routing requests through a proxy. This is useful for development when the target API doesn't send the correct CORS headers.
                            </p>
                            <label className="flex items-center space-x-3 cursor-pointer">
                                <div className="relative">
                                    <input
                                        type="checkbox"
                                        className="sr-only"
                                        checked={settings.corsProxy.enabled}
                                        onChange={e => setSettings(s => ({ ...s, corsProxy: { ...s.corsProxy, enabled: e.target.checked } }))}
                                    />
                                    <div className={`block w-10 h-6 rounded-full ${settings.corsProxy.enabled ? 'bg-blue-600' : 'bg-gray-600'}`}></div>
                                    <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${settings.corsProxy.enabled ? 'translate-x-4' : ''}`}></div>
                                </div>
                                <span className="text-sm text-gray-200 font-medium">Enable CORS Proxy</span>
                            </label>

                            {settings.corsProxy.enabled && (
                                <div className="mt-4 animate-fade-in-fast">
                                    <label htmlFor="proxy-url" className="block text-sm font-medium text-gray-300 mb-1">Proxy URL</label>
                                    <input
                                        id="proxy-url"
                                        type="text"
                                        value={settings.corsProxy.url}
                                        onChange={e => setSettings(s => ({ ...s, corsProxy: { ...s.corsProxy, url: e.target.value } }))}
                                        placeholder="https://your-proxy-server.com/"
                                        className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <p className="text-xs text-yellow-500 mt-2">
                                        Warning: Do not send sensitive data (like API keys) through public proxies you do not trust.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex justify-end mt-6 pt-4 border-t border-gray-700">
                        <button
                            onClick={() => setIsSettingsModalOpen(false)}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default App;