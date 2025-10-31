import {
  Collection,
  Folder,
  ApiRequest,
  Variable,
  Script,
  Body,
  HttpMethod,
} from '../types';

// #region Postman Type Definitions
// Simplified types for Postman v2.1.0 Collection Schema

interface PostmanVariable {
  id?: string;
  key: string;
  value: any;
  type?: string;
  disabled?: boolean;
}

interface PostmanScript {
  listen: 'prerequest' | 'test';
  script: {
    id?: string;
    type: string;
    exec: string[] | string;
  };
}

interface PostmanUrl {
  raw: string;
  protocol?: string;
  host?: string | string[];
  path?: string | string[];
  query?: { key: string; value: string }[];
}

interface PostmanHeader {
  key: string;
  value: string;
  disabled?: boolean;
}

// FIX: Expanded PostmanBody interface to support various body types for import.
interface PostmanBody {
  mode: 'raw' | 'urlencoded' | 'formdata' | 'file' | 'graphql';
  raw?: string;
  urlencoded?: { key: string; value: string; disabled?: boolean }[];
  formdata?: { key: string; value: string; disabled?: boolean; type: 'text' | 'file'; src?: any }[];
  graphql?: { query: string; variables?: string };
  options?: {
      raw?: {
          language?: 'json' | 'text' | 'xml' | 'html' | 'javascript';
      }
  }
}

interface PostmanRequest {
  method: HttpMethod;
  header: PostmanHeader[];
  body?: PostmanBody;
  url: PostmanUrl | string;
}

interface PostmanItem {
  name: string;
  item?: PostmanItem[]; // If it's a folder
  request?: PostmanRequest; // If it's a request
  event?: PostmanScript[];
  variable?: PostmanVariable[];
}

interface PostmanCollection {
  info: {
    _postman_id: string;
    name: string;
    schema: string;
  };
  item: PostmanItem[];
  event?: PostmanScript[];
  variable?: PostmanVariable[];
}

interface PostmanEnvironment {
    id: string;
    name: string;
    values: {
        key: string;
        value: string;
        type: string;
        enabled: boolean;
    }[];
    _postman_variable_scope: 'environment' | 'globals';
}

// #endregion

const toDevPalVariables = (postmanVars: PostmanVariable[] | undefined): Variable[] => {
  if (!postmanVars) return [];
  return postmanVars.map((v) => ({
    id: `var_${Date.now()}_${Math.random()}`,
    key: v.key,
    value: String(v.value),
    enabled: !v.disabled,
  }));
};

const toDevPalScripts = (postmanEvents: PostmanScript[] | undefined): Script[] => {
  if (!postmanEvents) return [];
  return postmanEvents
    .filter((e) => e.listen === 'prerequest' || e.listen === 'test')
    .map((e) => ({
      id: `script_${Date.now()}_${Math.random()}`,
      type: e.listen === 'prerequest' ? 'pre-request' : 'post-request',
      content: Array.isArray(e.script.exec) ? e.script.exec.join('\n') : String(e.script.exec),
    }));
};

const transformPostmanItem = (item: PostmanItem): Folder | ApiRequest => {
  // It's a Folder
  if (item.item && item.item.length >= 0) {
    return {
      id: `f_${Date.now()}_${Math.random()}`,
      name: item.name,
      type: 'folder',
      items: item.item.map(transformPostmanItem),
      variables: toDevPalVariables(item.variable),
      scripts: toDevPalScripts(item.event),
    };
  }

  // It's a Request
  const req = item.request!;
  
  // FIX: Greatly improved body parsing to handle various Postman body types.
  const body: Body = { mode: 'none' };
  if (req.body) {
      switch (req.body.mode) {
          case 'raw':
              body.mode = 'raw';
              body.raw = req.body.raw || '';
              body.rawLanguage = req.body.options?.raw?.language || 'text';
              break;
          case 'urlencoded':
              body.mode = 'x-www-form-urlencoded';
              body.urlEncoded = req.body.urlencoded?.map(p => ({
                  id: `kv_${Date.now()}_${Math.random()}`,
                  key: p.key,
                  value: p.value,
                  enabled: !p.disabled
              })) || [];
              break;
          case 'formdata':
              body.mode = 'form-data';
              // Note: File uploads are not supported, so we only import text fields.
              body.formData = req.body.formdata?.filter(p => p.type === 'text').map(p => ({
                  id: `kv_${Date.now()}_${Math.random()}`,
                  key: p.key,
                  value: p.value,
                  enabled: !p.disabled
              })) || [];
              break;
          case 'graphql':
              body.mode = 'graphql';
              body.graphql = {
                  query: req.body.graphql?.query || '',
                  variables: req.body.graphql?.variables || ''
              };
              break;
          case 'file':
              body.mode = 'binary';
              break;
          default:
              body.mode = 'none';
      }
  }

  return {
    id: `req_${Date.now()}_${Math.random()}`,
    name: item.name,
    type: 'request',
    method: req.method,
    url: typeof req.url === 'string' ? req.url : req.url.raw,
    headers: req.header ? req.header.map((h) => ({
      id: `h_${Date.now()}_${Math.random()}`,
      key: h.key,
      value: h.value,
      enabled: !h.disabled,
    })) : [],
    body: body,
    scripts: toDevPalScripts(item.event),
  };
};

export const importPostmanCollection = (jsonString: string): Collection => {
  const collection: PostmanCollection = JSON.parse(jsonString);

  if (!collection.info?._postman_id || !collection.item) {
    throw new Error('Invalid Postman Collection format.');
  }

  return {
    id: `coll_${Date.now()}_${Math.random()}`,
    name: collection.info.name,
    items: collection.item.map(transformPostmanItem),
    variables: toDevPalVariables(collection.variable),
    scripts: toDevPalScripts(collection.event),
  };
};

export const importPostmanEnvironmentOrGlobals = (jsonString: string): Variable[] => {
    const environment: PostmanEnvironment = JSON.parse(jsonString);

    if (!environment.values || !environment._postman_variable_scope) {
        throw new Error('Invalid Postman Environment or Globals format.');
    }

    return environment.values.map(v => ({
        id: `var_${Date.now()}_${Math.random()}`,
        key: v.key,
        value: v.value,
        enabled: v.enabled,
    }));
}