import { Project, ApiRequest, Folder, Collection, ResponseData, ConsoleLog, Script, Body, HttpMethod, Header } from '../types';

/**
 * Recursively resolves variables in a string like `{{var}}`.
 * It handles nested variables (e.g., `{{baseUrl}}/{{path}}`) up to a max depth
 * to prevent infinite loops from circular references.
 */
const recursiveVariableResolver = (text: string, variables: { get: (key: string) => any }): string => {
    if (!text || typeof text !== 'string') return text;

    let resolvedText = text;
    const MAX_DEPTH = 10;
    let depth = 0;
    const variableRegex = /{{\s*([\w.-]+)\s*}}/g;
    const unresolvedRegex = /{{\s*[\w.-]+\s*}}/;

    while (depth < MAX_DEPTH && unresolvedRegex.test(resolvedText)) {
        let replacedInThisPass = false;
        resolvedText = resolvedText.replace(variableRegex, (match, varName) => {
            const value = variables.get(varName);
            if (value !== undefined) {
                const stringValue = String(value);
                if (stringValue !== match) {
                    replacedInThisPass = true;
                }
                return stringValue;
            }
            return match;
        });

        if (!replacedInThisPass) {
            break;
        }
        depth++;
    }

    if (depth === MAX_DEPTH && unresolvedRegex.test(resolvedText)) {
        console.warn("Variable resolution reached max depth, possibly due to a circular reference.", { original: text, resolved: resolvedText });
    }

    return resolvedText;
};

/**
 * Creates the `pm` object used as the context for script execution.
 * This object mimics the Postman `pm` API with distinct variable scopes.
 */
const buildPmContext = (
    project: Project,
    itemId: string,
    findPath: (targetId: string, p: Project) => (Folder | ApiRequest | Collection)[] | null,
    initialRuntimeVariables: Map<string, any>,
    logSink: (log: Omit<ConsoleLog, 'timestamp'>) => void,
    pathString: string
) => {
    const pmContext = Object.create(null);

    // 1. Initialize maps for each distinct scope
    const globalsMap = new Map<string, any>();
    project.globalVariables.filter(v => v.enabled).forEach(v => globalsMap.set(v.key, v.value));

    const collectionMap = new Map<string, any>();
    const path = findPath(itemId, project);
    if (path) {
        const collection = path[0] as Collection;
        if (collection?.variables) {
            collection.variables.filter(v => v.enabled).forEach(v => collectionMap.set(v.key, v.value));
        }
    }
    
    // The environment scope holds folder variables and runtime variables.
    const environmentMap = new Map<string, any>();
    if (path) {
        for (let i = 1; i < path.length; i++) { // Skip collection at index 0
            const p = path[i];
            if ('variables' in p && Array.isArray((p as any).variables)) {
                (p as Folder).variables
                    .filter(v => v.enabled)
                    .forEach(v => environmentMap.set(v.key, v.value));
            }
        }
    }
    initialRuntimeVariables.forEach((v, k) => environmentMap.set(k, v));
    
    // 2. Create a unified resolver object that will point to the main `get` method.
    // This ensures all recursive resolutions use the same precedence logic.
    const unifiedResolver: { get: (k: string) => any } = { get: () => undefined };

    // 3. Define the main accessor for `pm.variables`. Its `get` method is the heart of the resolution logic.
    const variablesAccessor = {
        get: (key: string): any => {
            let rawValue: any;
            // Precedence: environment > collection > globals
            if (environmentMap.has(key)) rawValue = environmentMap.get(key);
            else if (collectionMap.has(key)) rawValue = collectionMap.get(key);
            else if (globalsMap.has(key)) rawValue = globalsMap.get(key);
            else return undefined;
            
            // Resolve any nested variables using the unified resolver.
            return typeof rawValue === 'string' ? recursiveVariableResolver(rawValue, unifiedResolver) : rawValue;
        },
        set: (key: string, value: any) => {
            // `pm.variables.set` creates a local/runtime variable.
            environmentMap.set(key, value);
        },
        has: (key: string): boolean => environmentMap.has(key) || collectionMap.has(key) || globalsMap.has(key),
        unset: (key: string): void => { 
            if(environmentMap.has(key)) environmentMap.delete(key);
        },
        clear: (): void => {
            environmentMap.clear();
        },
        toObject: (): object => {
            const allKeys = new Set([...globalsMap.keys(), ...collectionMap.keys(), ...environmentMap.keys()]);
            const obj: { [key: string]: any } = {};
            allKeys.forEach(key => {
                obj[key] = unifiedResolver.get(key); // Use the resolving getter
            });
            return obj;
        },
    };
    
    // 4. Point the unified resolver to the accessor's `get` method.
    unifiedResolver.get = variablesAccessor.get;

    pmContext.info = { getPath: () => pathString };
    pmContext.request = { headers: { add: () => {} } };
    pmContext.response = {};
    pmContext.console = {
        log: (...args: any[]) => logSink({ type: 'log', message: args }),
        warn: (...args: any[]) => logSink({ type: 'warn', message: args }),
        error: (...args: any[]) => {
            if (args.length === 1 && args[0]?._isScriptError) {
                const payload = args[0];
                logSink({
                    type: 'error', message: [payload.message],
                    errorDetails: { scriptType: payload.scriptType, line: payload.line }
                });
            } else {
                logSink({ type: 'error', message: args });
            }
        },
        info: (...args: any[]) => logSink({ type: 'info', message: args }),
    };

    // 5. Create accessors for each specific scope.
    // According to Postman docs, scope-specific accessors (.get, .toObject)
    // work only on their own scope and return raw (unresolved) values.
    const createScopeAccessor = (scopeMap: Map<string, any>) => {
        return {
            get: (key: string): any => {
                return scopeMap.get(key);
            },
            set: (key: string, value: any) => scopeMap.set(key, value),
            has: (key: string): boolean => scopeMap.has(key),
            unset: (key: string): void => { scopeMap.delete(key) },
            clear: (): void => { scopeMap.clear() },
            toObject: (): object => {
                return Object.fromEntries(scopeMap.entries());
            },
        };
    };

    const globalsAccessor = createScopeAccessor(globalsMap);
    const collectionAccessor = createScopeAccessor(collectionMap);
    const environmentAccessor = createScopeAccessor(environmentMap);

    pmContext.globals = globalsAccessor;
    pmContext.collectionVariables = collectionAccessor;
    pmContext.environment = environmentAccessor;
    pmContext.variables = variablesAccessor;

    const whitelistedModules = {
        moment: (window as any).moment,
        xml2js: (window as any).xml2js,
    };
    pmContext.require = (moduleName: string) => {
        if (Object.prototype.hasOwnProperty.call(whitelistedModules, moduleName)) {
            const module = (whitelistedModules as any)[moduleName];
            if (module) return module;
            throw new Error(`Library '${moduleName}' was not found. Make sure it's loaded correctly.`);
        }
        throw new Error(`'${moduleName}' is not a whitelisted module.`);
    };
    pmContext.sendRequest = (req: any, callback: (err: any, res?: any) => void) => {
        (async () => {
            try {
                const requestOptions: ApiRequest = {
                    id: 'pm-send-request', name: 'pm.sendRequest', type: 'request', method: 'GET',
                    url: '', headers: [], body: { mode: 'none' }, scripts: []
                };
                if (typeof req === 'string') {
                    requestOptions.url = req;
                } else {
                    requestOptions.url = typeof req.url === 'string' ? req.url : req.url?.raw || '';
                    requestOptions.method = req.method || 'GET';
                    if (req.header) {
                        const headersArray = Array.isArray(req.header) ? req.header : Object.entries(req.header).map(([key, value]) => ({ key, value: String(value) }));
                        requestOptions.headers = headersArray.map(h => ({
                            id: `h_sendReq_${Math.random()}`, key: h.key, value: h.value, enabled: !h.disabled
                        }));
                    }
                    if (req.body) {
                        requestOptions.body = { mode: req.body.mode || 'none', raw: req.body.raw };
                    }
                }
                const currentVariables = new Map(Object.entries(pmContext.variables.toObject()));
                const { resolvedUrl, resolvedHeaders, resolvedBody } = resolveRequest(
                    requestOptions, currentVariables, { request: { headers: { _headers: new Headers() } } }
                );
                
                const startTime = Date.now();
                const fetchRes = await fetch(resolvedUrl, {
                    method: requestOptions.method, headers: resolvedHeaders,
                    body: requestOptions.method !== 'GET' && requestOptions.method !== 'HEAD' ? resolvedBody : undefined,
                });
                const endTime = Date.now();
                const bodyText = await fetchRes.text();
                
                const responseHeaders: Record<string, string> = {};
                fetchRes.headers.forEach((value, key) => { responseHeaders[key] = value; });
                
                const pmResponse = {
                    code: fetchRes.status, status: fetchRes.statusText, headers: responseHeaders,
                    responseTime: endTime - startTime, responseSize: new Blob([bodyText]).size,
                    json: () => JSON.parse(bodyText), text: () => bodyText,
                };
                callback(null, pmResponse);

            } catch (err: any) {
                console.error('pm.sendRequest failed:', err);
                callback(err, undefined);
            }
        })();
    };

    return { pmContext };
};

class ScriptExecutionError extends Error {
    _isScriptError = true;
    scriptType: 'pre-request' | 'post-request';
    line?: number;

    constructor(message: string, scriptType: 'pre-request' | 'post-request', line?: number) {
        super(message);
        this.name = 'ScriptExecutionError';
        this.scriptType = scriptType;
        this.line = line;
    }
}

const executeScript = async (script: Script, context: any, ownerName: string) => {
    const pm = context;
    try {
      const wrappedScript = `
        const console = pm.console;
        (async () => {
${script.content}
        })();
      `;
      const scriptFunction = new Function('pm', 'require', wrappedScript);
      await scriptFunction(pm, pm.require);
    } catch (e) {
      console.error("Script execution failed:", e);
      let errorMessage = e instanceof Error ? e.message : String(e);
      let errorLine: number | undefined = undefined;
      if (e instanceof Error && e.stack) {
        const match = e.stack.match(/:(\d+):(\d+)/);
        if (match && match[1]) {
          const lineNumberInWrappedScript = parseInt(match[1], 10);
          const line = lineNumberInWrappedScript - 2;
          if (line > 0) errorLine = line;
        }
      }
      throw new ScriptExecutionError(`Script error in "${ownerName}": ${errorMessage}`, script.type, errorLine);
    }
};

export const getScopedVariables = (
    project: Project,
    itemId: string,
    findPath: (targetId: string, p: Project) => (Folder | ApiRequest | Collection)[] | null,
    runtimeVariables: Map<string, any>
): Map<string, any> => {
    // This function is used for UI hints and previews. We don't need a real log sink.
    const mockLogSink = () => {}; 
    const path = findPath(itemId, project);
    const pathString = path ? path.map(p => p.name).join('/') : '';

    // Use the exact same context builder as script execution to ensure consistency.
    const { pmContext } = buildPmContext(
        project,
        itemId,
        findPath,
        runtimeVariables,
        mockLogSink,
        pathString
    );
    
    // pm.variables.toObject() returns a fully resolved object of all variables.
    const resolvedVariablesObject = pmContext.variables.toObject();

    // Convert the object to a Map as expected by the caller.
    return new Map(Object.entries(resolvedVariablesObject));
};

export const runPreRequestScripts = async (
    project: Project,
    itemId: string,
    findPath: (targetId: string, p: Project) => (Folder | ApiRequest | Collection)[] | null,
    logSink: (log: Omit<ConsoleLog, 'timestamp'>) => void,
    runtimeVariables: Map<string, any>,
    initialRequestHeaders?: Headers
): Promise<{ pmContext: any, variablesMap: Map<string, any> }> => {
    const path = findPath(itemId, project);
    const pathString = path ? path.map(p => p.name).join('/') : '';
    const { pmContext } = buildPmContext(project, itemId, findPath, runtimeVariables, logSink, pathString);

    if (initialRequestHeaders) {
        pmContext.request = {
            headers: {
                _headers: new Headers(initialRequestHeaders),
                add: function({key, value}: {key: string, value: string}) { this._headers.append(key, value); }
            }
        };
    }
    
    const scriptsToRun: { script: Script, ownerName: string }[] = [];
    if (path) {
        path.forEach(item => {
            if ('scripts' in item && Array.isArray((item as any).scripts)) {
                (item as Collection | Folder | ApiRequest).scripts
                    .filter(s => s.type === 'pre-request')
                    .forEach(s => scriptsToRun.push({ script: s, ownerName: item.name }));
            }
        });
    }

    for (const { script, ownerName } of scriptsToRun) {
        logSink({ type: 'info', message: [`Executing pre-request script from "${ownerName}"...`] });
        await executeScript(script, pmContext, ownerName);
    }

    const finalMergedMap = new Map(Object.entries(pmContext.variables.toObject()));
    return { pmContext, variablesMap: finalMergedMap };
};

export const resolveRequest = (
    request: ApiRequest,
    variablesMap: Map<string, any>,
    pmContext: any
): { resolvedUrl: string, resolvedHeaders: Headers, resolvedBody: BodyInit | undefined } => {
    const variablesForResolver = { get: (key: string) => variablesMap.get(key) };
    
    const resolvedUrl = recursiveVariableResolver(request.url, variablesForResolver);
    
    const resolvedHeaders = new Headers();
    request.headers.filter(h => h.enabled).forEach(header => {
        resolvedHeaders.set(
            recursiveVariableResolver(header.key, variablesForResolver), 
            recursiveVariableResolver(header.value, variablesForResolver)
        );
    });
    
    if (pmContext.request?.headers?._headers) {
        pmContext.request.headers._headers.forEach((value: string, key: string) => {
            resolvedHeaders.set(key, value);
        });
    }

    let resolvedBody: BodyInit | undefined = undefined;
    const { mode, raw, formData, urlEncoded, graphql } = request.body;
    
    switch(mode) {
        case 'raw':
            resolvedBody = raw ? recursiveVariableResolver(raw, variablesForResolver) : undefined;
            break;

        case 'x-www-form-urlencoded':
            if (urlEncoded?.length) {
                const params = new URLSearchParams();
                urlEncoded.filter(p => p.enabled).forEach(p => {
                    params.append(recursiveVariableResolver(p.key, variablesForResolver), recursiveVariableResolver(p.value, variablesForResolver));
                });
                resolvedBody = params;
                if (!resolvedHeaders.has('Content-Type')) {
                    resolvedHeaders.set('Content-Type', 'application/x-www-form-urlencoded');
                }
            }
            break;
            
        case 'form-data':
            if (formData?.length) {
                const data = new FormData();
                 formData.filter(p => p.enabled).forEach(p => {
                    data.append(recursiveVariableResolver(p.key, variablesForResolver), recursiveVariableResolver(p.value, variablesForResolver));
                });
                resolvedBody = data;
                resolvedHeaders.delete('Content-Type');
            }
            break;

        case 'graphql':
            if (graphql?.query) {
                const query = recursiveVariableResolver(graphql.query, variablesForResolver);
                let variables: any = {};
                if (graphql.variables) {
                    try {
                        const resolvedVarsString = recursiveVariableResolver(graphql.variables, variablesForResolver);
                        if (resolvedVarsString.trim()) variables = JSON.parse(resolvedVarsString);
                    } catch (e) {
                        throw new Error(`GraphQL variables field contains invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
                    }
                }
                resolvedBody = JSON.stringify({ query, variables });
                if (!resolvedHeaders.has('Content-Type')) {
                    resolvedHeaders.set('Content-Type', 'application/json');
                }
            }
            break;
    }
    return { resolvedUrl, resolvedHeaders, resolvedBody };
};

export const serializeResolvedBodyForDisplay = (body: BodyInit | undefined): string | undefined => {
    if (!body) return undefined;
    if (typeof body === 'string') return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body instanceof FormData) {
        const parts: string[] = [];
        (body as any).forEach((value: any, key: string) => {
            parts.push(typeof value === 'object' && value.name ? `${key}: [File: ${value.name}]` : `${key}: ${value}`);
        });
        return parts.join('\n');
    }
    return '[Unsupported body type for display]';
};

export const runPostRequestScripts = async (
    pmContext: any,
    project: Project,
    itemId: string,
    findPath: (targetId: string, p: Project) => (Folder | ApiRequest | Collection)[] | null,
    response: ResponseData,
    logSink: (log: Omit<ConsoleLog, 'timestamp'>) => void
): Promise<Map<string, any>> => {
    pmContext.response = {
        code: response.status, status: response.statusText,
        headers: {
            _headers: response.headers,
            get(key: string): string | undefined {
                const lowerKey = key.toLowerCase();
                const actualKey = Object.keys(this._headers).find(k => k.toLowerCase() === lowerKey);
                return actualKey ? this._headers[actualKey] : undefined;
            },
            has(key: string): boolean {
                const lowerKey = key.toLowerCase();
                return Object.keys(this._headers).some(k => k.toLowerCase() === lowerKey);
            }
        },
        responseTime: response.time, responseSize: response.size,
        json: () => JSON.parse(response.body), text: () => response.body,
    };
    
    const path = findPath(itemId, project);
    const scriptsToRun: { script: Script, ownerName: string }[] = [];
    if (path) {
        path.forEach(item => {
            if ('scripts' in item && Array.isArray((item as any).scripts)) {
                (item as Collection | Folder | ApiRequest).scripts
                    .filter(s => s.type === 'post-request')
                    .forEach(s => scriptsToRun.push({ script: s, ownerName: item.name }));
            }
        });
    }

    for (const { script, ownerName } of scriptsToRun) {
        logSink({ type: 'info', message: [`Executing post-request script from "${ownerName}"...`] });
        await executeScript(script, pmContext, ownerName);
    }

    // Return the final state of the environment map for persistence as runtime variables.
    return new Map(Object.entries(pmContext.environment.toObject()));
};