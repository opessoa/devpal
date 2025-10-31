
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface Variable {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface Script {
  id: string;
  type: 'pre-request' | 'post-request';
  content: string;
}

export interface Header {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface GraphQLBody {
  query?: string;
  variables?: string;
}

export interface Body {
  mode: 'none' | 'raw' | 'form-data' | 'x-www-form-urlencoded' | 'binary' | 'graphql';
  raw?: string;
  rawLanguage?: 'json' | 'text' | 'xml' | 'html' | 'javascript';
  formData?: Variable[];
  urlEncoded?: Variable[];
  graphql?: GraphQLBody;
}


export interface ApiRequest {
  id: string;
  name: string;
  type: 'request';
  method: HttpMethod;
  url: string;
  headers: Header[];
  body: Body;
  scripts: Script[];
}

export interface Folder {
  id:string;
  name: string;
  type: 'folder';
  items: (Folder | ApiRequest)[];
  variables: Variable[];
  scripts: Script[];
}

export interface Collection {
  id: string;
  name: string;
  items: (Folder | ApiRequest)[];
  variables: Variable[];
  scripts: Script[];
}

export interface Project {
  collections: Collection[];
  globalVariables: Variable[];
}

export interface ResponseData {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  size: number;
  time: number;
}

export interface ScriptErrorDetails {
  scriptType: 'pre-request' | 'post-request';
  line?: number;
}

export interface ConsoleLog {
  type: 'log' | 'warn' | 'error' | 'info';
  timestamp: string;
  message: any[];
  errorDetails?: ScriptErrorDetails;
}

export interface AppSettings {
  corsProxy: {
    enabled: boolean;
    url: string;
  };
}