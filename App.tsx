
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import * as prettier from "https://esm.sh/prettier@3.3.2/standalone";
import * as pluginBabel from "https://esm.sh/prettier@3.3.2/plugins/babel";
import * as pluginEstree from "https://esm.sh/prettier@3.3.2/plugins/estree";
import * as pluginHtml from "https://esm.sh/prettier@3.3.2/plugins/html";
import * as pluginPostcss from "https://esm.sh/prettier@3.3.2/plugins/postcss";
import * as monaco from 'https://esm.sh/monaco-editor@0.49.0';
import { WebContainer } from 'https://esm.sh/@webcontainer/api?module';

// --- ERROR BOUNDARY ---
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

const ErrorIconFallback = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
);

const FallbackComponent = ({ error, onRetry }: { error: Error | null; onRetry: () => void; }) => (
    <div className="bg-gray-900 text-white h-screen w-screen flex items-center justify-center font-sans">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 max-w-2xl text-center shadow-2xl">
            <ErrorIconFallback />
            <h1 className="text-3xl font-bold text-red-400 mb-2">Something went wrong.</h1>
            <p className="text-gray-400 mb-6">An unexpected error occurred. You can try to retry or refresh the page.</p>
            {error && (
                <pre className="bg-gray-900 text-left p-4 rounded-md text-sm text-red-300 overflow-auto mb-6 custom-scrollbar max-h-60">
                    <code>{error.stack || error.toString()}</code>
                </pre>
            )}
            <div className="flex justify-center space-x-4">
                <button
                    onClick={onRetry}
                    className="bg-green-600 hover:bg-green-500 text-white font-semibold py-2 px-6 rounded-md transition-colors"
                >
                    Retry
                </button>
                <button
                    onClick={() => window.location.reload()}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-6 rounded-md transition-colors"
                >
                    Refresh Page
                </button>
            </div>
        </div>
    </div>
);

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return <FallbackComponent error={this.state.error} onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}


// --- TYPES ---
interface FileNode {
  name: string;
  type: 'folder' | 'file';
  extension?: string;
  content?: string;
  children?: FileNode[];
  path: string;
}

type AgentTaskState = 'Queued' | 'Executing' | 'Completed' | 'Failed' | 'Blocked';

interface AgentTask {
    id: string;
    description: string;
    state: AgentTaskState;
    filePath: string;
    dependencies?: string[];
    agent: string;
    retries: number;
}

interface Agent {
  name: string;
  status: 'Idle' | 'Working';
  tasks: AgentTask[];
}


interface TerminalLog {
    id: number;
    time: string;
    source: string;
    message: string;
}

interface CommLog {
    id: number;
    agent: string;
    message: string;
    time: string;
}

interface Commit {
    id: string;
    message: string;
    author: string;
    date: string;
}

// --- MOCK DATA & CONFIG ---
const packageJsonContent = JSON.stringify({
    name: "vite-react-starter",
    private: true,
    version: "0.0.0",
    type: "module",
    scripts: {
        dev: "vite"
    },
    dependencies: {
        "react": "^18.2.0",
        "react-dom": "^18.2.0"
    },
    devDependencies: {
        "@vitejs/plugin-react": "^4.2.1",
        "vite": "^5.1.5",
        "typescript": "^5.4.2",
        "@types/react": "^18.2.64",
        "@types/react-dom": "^18.2.21"
    }
}, null, 2);

const viteConfigContent = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
});`;


const initialFiles: FileNode[] = [
    { 
        name: 'index.html', 
        type: 'file', 
        extension: 'html', 
        path: '/index.html', 
        content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Agentic Preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/index.tsx"></script>
  </body>
</html>` 
    },
    {
        name: 'src',
        type: 'folder',
        path: '/src',
        children: [
            { name: 'App.tsx', type: 'file', extension: 'tsx', path: '/src/App.tsx', content: `import React, { useState } from 'react';

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="app">
      <h1>Hello Agentic!</h1>
      <p>A simple React app, live-reloaded.</p>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          Count is {count}
        </button>
        <p>Edit <code>src/App.tsx</code> and watch the preview update.</p>
      </div>
    </div>
  );
}

export default App;
` },
            { name: 'index.tsx', type: 'file', extension: 'tsx', path: '/src/index.tsx', content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
` },
            { name: 'styles.css', type: 'file', extension: 'css', path: '/src/styles.css', content: `body {
  background-color: #242424;
  color: rgba(255, 255, 255, 0.87);
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;
  text-align: center;
  padding-top: 4rem;
}

.app {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.card {
  padding: 2em;
  border: 1px solid #444;
  border-radius: 8px;
}

button {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0.6em 1.2em;
  font-size: 1em;
  font-weight: 500;
  font-family: inherit;
  background-color: #1a1a1a;
  cursor: pointer;
  transition: border-color 0.25s;
  color: white;
}
button:hover {
  border-color: #646cff;
}
` },
        ],
    },
    { name: 'package.json', type: 'file', extension: 'json', path: '/package.json', content: packageJsonContent },
    { name: 'vite.config.js', type: 'file', extension: 'js', path: '/vite.config.js', content: viteConfigContent },
    { name: '.gitignore', type: 'file', path: '/.gitignore', content: 'node_modules\ndist\nbuild' },
];

const initialAgents: Agent[] = [
    { name: 'Orchestrator', status: 'Idle', tasks: [] },
    { name: 'Frontend-Dev', status: 'Idle', tasks: [] },
    { name: 'Backend-Dev', status: 'Idle', tasks: [] },
    { name: 'QA-Tester', status: 'Idle', tasks: [] },
    { name: 'UX-Designer', status: 'Idle', tasks: [] },
];

// --- HELPERS ---
const formatCodeWithPrettier = async (content: string, extension: string): Promise<string> => {
    try {
        const parserMap: { [key: string]: string } = { 'js': 'babel', 'jsx': 'babel', 'ts': 'babel-ts', 'tsx': 'babel-ts', 'css': 'css', 'html': 'html' };
        const pluginMap: { [key: string]: any[] } = { 'js': [pluginBabel, pluginEstree], 'jsx': [pluginBabel, pluginEstree], 'ts': [pluginBabel, pluginEstree], 'tsx': [pluginBabel, pluginEstree], 'css': [pluginPostcss], 'html': [pluginHtml] };
        const parser = parserMap[extension];
        const plugins = pluginMap[extension];
        if (!parser || !plugins) return content;
        return await prettier.format(content, { parser, plugins, printWidth: 80, tabWidth: 2, useTabs: false, semi: true, singleQuote: true });
    } catch (error) {
        console.warn(`Prettier formatting failed for extension ${extension}:`, error);
        return content;
    }
};

const getLanguageForExtension = (extension?: string): string => {
    const langMap: { [key: string]: string } = { 'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript', 'css': 'css', 'html': 'html', 'json': 'json' };
    return langMap[extension || ''] || 'plaintext';
};

const findFileNode = (path: string, nodes: FileNode[]): FileNode | null => {
    for (const node of nodes) {
        if (node.path === path) return node;
        if (node.type === 'folder' && node.children) {
            const found = findFileNode(path, node.children);
            if (found) return found;
        }
    }
    return null;
};

const generatePlaceholderSVG = (width: number, height: number, text: string): string => {
    const bgColor = '#6b7280'; // gray-500
    const textColor = '#f3f4f6'; // gray-100
    const fontSize = Math.max(Math.min(width / (text.length * 0.6), height / 4), 10);
    const svg = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
    <rect width="100%" height="100%" fill="${bgColor}" />
    <text x="50%" y="50%" dy=".3em" fill="${textColor}" font-size="${fontSize}" text-anchor="middle" font-family="sans-serif">${text}</text>
</svg>
    `.trim();
    const base64 = window.btoa(svg);
    return `data:image/svg+xml;base64,${base64}`;
};


// --- ICONS ---
const LogoIcon = () => <svg className="h-6 w-6 text-blue-400" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const ExplorerIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>;
const SourceControlIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>;
const AgentsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z" clipRule="evenodd" /></svg>;
const ChecklistIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>;
const CloseIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>;
const FolderIcon = ({ open }: { open?: boolean }) => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-sky-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d={open ? "M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" : "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"} /></svg>;
const GenericFileIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 mr-2 shrink-0 text-gray-400`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>;
const ReactIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 shrink-0 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z" /><ellipse cx="12" cy="12" rx="4" ry="10" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="4" ry="10" transform="rotate(120 12 12)" /><ellipse cx="12" cy="12" rx="4" ry="10" transform="rotate(180 12 12)" /></svg>;
const HTMLIcon = () => <div className="h-5 w-5 mr-2 shrink-0 text-orange-500 font-bold text-xs flex items-center justify-center bg-orange-900/50 rounded-sm">HT</div>;
const CSSIcon = () => <div className="h-5 w-5 mr-2 shrink-0 text-blue-500 font-bold text-xs flex items-center justify-center bg-blue-900/50 rounded-sm">CS</div>;
const JSIcon = () => <div className="h-5 w-5 mr-2 shrink-0 text-yellow-400 font-bold text-xs flex items-center justify-center bg-yellow-900/50 rounded-sm">JS</div>;
const TSIcon = () => <div className="h-5 w-5 mr-2 shrink-0 text-blue-400 font-bold text-xs flex items-center justify-center bg-blue-900/50 rounded-sm">TS</div>;
const JSONIcon = () => <div className="h-5 w-5 mr-2 shrink-0 text-green-500 font-bold text-xs flex items-center justify-center bg-green-900/50 rounded-sm">{`{}`}</div>;
const GitIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 4.5l-9 9m9 0l-9-9" /></svg>;
const ChevronDownIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>;
const SendIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>;
const SpinnerIcon = ({className = 'h-5 w-5'}: {className?: string}) => <svg className={`animate-spin text-white ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>;
const CheckCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>;
const XCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>;
const BlockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" /></svg>;
const QueuedIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-cyan-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>;
const CodeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>;
const PreviewIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542 7z" /></svg>;
const PlanIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>;
const RetryIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 4l1.5 1.5A9 9 0 0120.5 15M20 20l-1.5-1.5A9 9 0 003.5 9" /></svg>;
const UndoIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11 15l-3-3m0 0l3-3m-3 3h8a5 5 0 015 5v1" /></svg>;
const RedoIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 15l3-3m0 0l-3-3m3 3H5a5 5 0 00-5 5v1" /></svg>;


const FileIcon: React.FC<{ extension?: string }> = ({ extension }) => {
    switch (extension) {
        case 'js': return <JSIcon />;
        case 'ts': return <TSIcon />;
        case 'jsx': case 'tsx': return <ReactIcon />;
        case 'html': return <HTMLIcon />;
        case 'css': return <CSSIcon />;
        case 'json': return <JSONIcon />;
        case 'gitignore': return <GitIcon />;
        default: return <GenericFileIcon />;
    }
};

const TaskStatusIcon: React.FC<{ status: AgentTaskState }> = ({ status }) => {
    switch (status) {
        case 'Completed': return <CheckCircleIcon />;
        case 'Executing': return <SpinnerIcon className="h-4 w-4" />;
        case 'Failed': return <XCircleIcon />;
        case 'Blocked': return <BlockIcon />;
        case 'Queued': return <QueuedIcon />;
        default: return null;
    }
};


const GlobalStyles = () => (
    <style>{`
        :root {
            --bg-default: #111827; /* gray-900 */
            --bg-surface: #1F2937; /* gray-800 */
            --bg-inset: #111827;   /* gray-900 */
            --border-default: #374151; /* gray-700 */
        }
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #4A5568; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #718096; }
        .monaco-editor .margin { background-color: var(--bg-surface) !important; }
        .monaco-editor, .monaco-editor-background { background-color: var(--bg-surface) !important; }
        .bottom-panel-handle {
            cursor: row-resize;
            width: 100%;
            height: 8px;
            background-color: var(--bg-inset);
            border-top: 1px solid var(--border-default);
            position: absolute;
            top: -4px;
            left: 0;
            z-index: 20;
        }
    `}</style>
);

// --- UI COMPONENTS ---

const Header: React.FC = () => (
    <header className="flex items-center h-10 px-4 bg-gray-900 border-b border-gray-700 shrink-0">
        <LogoIcon />
        <span className="ml-2 font-semibold text-lg">Agentic</span>
    </header>
);

const ActivityBar: React.FC<{ activeView: string; setActiveView: (view: string) => void; onToggleAgentPanel: () => void; isAgentPanelOpen: boolean; }> = ({ activeView, setActiveView, onToggleAgentPanel, isAgentPanelOpen }) => {
    const views = [
        { id: 'explorer', icon: <ExplorerIcon />, label: 'Explorer' },
        { id: 'source-control', icon: <SourceControlIcon />, label: 'Source Control' },
        { id: 'checklist', icon: <ChecklistIcon />, label: 'Triage Checklist' },
    ];
    return (
        <div className="w-12 bg-gray-900 flex flex-col justify-between items-center py-2 shrink-0 border-r border-gray-700">
            <div className="space-y-2">
                {views.map(view => (
                    <button
                        key={view.id}
                        onClick={() => setActiveView(view.id)}
                        className={`p-2 rounded-md transition-colors ${activeView === view.id ? 'bg-blue-600/50 text-white' : 'text-gray-400 hover:bg-gray-700/50 hover:text-white'}`}
                        title={view.label}
                    >
                        {view.icon}
                    </button>
                ))}
            </div>
            <div>
                 <button
                    onClick={onToggleAgentPanel}
                    className={`p-2 rounded-md transition-colors ${isAgentPanelOpen ? 'bg-blue-600/50 text-white' : 'text-gray-400 hover:bg-gray-700/50 hover:text-white'}`}
                    title="Toggle Agents Panel"
                >
                    <AgentsIcon />
                </button>
            </div>
        </div>
    );
};

const CollapsibleSection: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, children, defaultOpen = true }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div>
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between text-left text-xs font-bold text-gray-400 hover:text-white p-2 uppercase">
                <div className="flex items-center">
                    <span className={`transform transition-transform ${isOpen ? 'rotate-90' : ''} mr-1`}><ChevronDownIcon /></span>
                    <span>{title}</span>
                </div>
            </button>
            {isOpen && <div className="pl-2">{children}</div>}
        </div>
    );
};

const VIRTUAL_ROW_HEIGHT = 28; // in px

interface VirtualizedFileTreeProps {
    files: FileNode[];
    activeFile: string | null;
    onSelect: (path: string) => void;
    openFolders: Set<string>;
    toggleFolder: (path: string) => void;
    modifiedFiles: string[];
}

const VirtualizedFileTree: React.FC<VirtualizedFileTreeProps> = ({ files, activeFile, onSelect, openFolders, toggleFolder, modifiedFiles }) => {
    const flattenedNodes = useMemo(() => {
        const result: { node: FileNode; level: number }[] = [];
        const flatten = (nodes: FileNode[], level: number) => {
            nodes.sort((a,b) => {
                if (a.type === 'folder' && b.type === 'file') return -1;
                if (a.type === 'file' && b.type === 'folder') return 1;
                return a.name.localeCompare(b.name);
            }).forEach(node => {
                result.push({ node, level });
                if (node.type === 'folder' && openFolders.has(node.path) && node.children) {
                    flatten(node.children, level + 1);
                }
            });
        };
        flatten(files, 0);
        return result;
    }, [files, openFolders]);

    const containerRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(0);

    useEffect(() => {
        const measureContainer = () => {
            if (containerRef.current) {
                setContainerHeight(containerRef.current.clientHeight);
            }
        };
        measureContainer();
        const resizeObserver = new ResizeObserver(measureContainer);
        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }
        return () => resizeObserver.disconnect();
    }, []);

    const startIndex = Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT);
    const endIndex = Math.min(flattenedNodes.length, startIndex + Math.ceil(containerHeight / VIRTUAL_ROW_HEIGHT) + 1);
    const visibleNodes = flattenedNodes.slice(startIndex, endIndex);

    const renderRow = (item: { node: FileNode; level: number }) => {
        const { node, level } = item;
        const paddingLeft = `${level * 16 + 4}px`;
        if (node.type === 'folder') {
            const isOpen = openFolders.has(node.path);
            return (
                <button onClick={() => toggleFolder(node.path)} className="w-full h-full text-left flex items-center text-gray-300 hover:bg-gray-700/50 rounded" style={{ paddingLeft }}>
                    <span className={`transform transition-transform text-gray-500 mr-1 ${isOpen ? 'rotate-90' : ''}`}><ChevronDownIcon /></span>
                    <FolderIcon open={isOpen} />
                    <span>{node.name}</span>
                </button>
            );
        }
        
        const isModified = modifiedFiles.includes(node.path);
        return (
            <button onClick={() => onSelect(node.path)} className={`w-full h-full text-left flex items-center rounded ${activeFile === node.path ? 'bg-blue-600/30' : 'hover:bg-gray-700/50'} ${isModified ? 'text-yellow-400' : 'text-gray-300'}`} style={{ paddingLeft }}>
                <FileIcon extension={node.extension} />
                <span>{node.name}</span>
                {isModified && <span className="ml-auto mr-4 text-yellow-600 font-bold">M</span>}
            </button>
        );
    };

    return (
        <div 
            ref={containerRef}
            className="h-full w-full overflow-y-auto relative custom-scrollbar" 
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
            <div style={{ height: `${flattenedNodes.length * VIRTUAL_ROW_HEIGHT}px`, position: 'relative' }}>
                {visibleNodes.map((item, index) => {
                    const style: React.CSSProperties = {
                        position: 'absolute',
                        top: `${(startIndex + index) * VIRTUAL_ROW_HEIGHT}px`,
                        left: 0,
                        right: 0,
                        height: `${VIRTUAL_ROW_HEIGHT}px`
                    };
                    return <div key={item.node.path} style={style}>{renderRow(item)}</div>;
                })}
            </div>
        </div>
    );
};

const FileExplorer: React.FC<{ files: FileNode[]; activeFile: string | null; onSelect: (path: string) => void; modifiedFiles: string[] }> = ({ files, activeFile, onSelect, modifiedFiles }) => {
    const [openFolders, setOpenFolders] = useState(new Set(['/src']));
    const [isOpen, setIsOpen] = useState(true);

    const toggleFolder = (path: string) => {
        setOpenFolders(prev => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    };

    return (
        <div className="h-full flex flex-col">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between text-left text-xs font-bold text-gray-400 hover:text-white p-2 uppercase">
                <div className="flex items-center">
                    <span className={`transform transition-transform ${isOpen ? 'rotate-90' : ''} mr-1`}><ChevronDownIcon /></span>
                    <span>Explorer</span>
                </div>
            </button>
            {isOpen && (
                 <div className="flex-1 min-h-0 pl-2">
                    <VirtualizedFileTree files={files} activeFile={activeFile} onSelect={onSelect} openFolders={openFolders} toggleFolder={toggleFolder} modifiedFiles={modifiedFiles} />
                 </div>
            )}
        </div>
    );
};

const checklistItems = [
    {
        title: 'Schema-Driven I/O Validation',
        description: 'Use a library like Zod to validate environment variables and API payloads at runtime. This prevents bugs from invalid data structures and provides clear error messages.',
        codeSnippets: [{
            filename: 'src/domain/schemas.ts',
            language: 'typescript',
            code: `// src/domain/schemas.ts
import { z } from "zod";

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development","test","production"]),
  API_URL: z.string().url(),
  AI_KEY: z.string().min(10),
});
export type Env = z.infer<typeof EnvSchema>;`
        }]
    },
    {
        title: 'Global Error Boundary',
        description: 'Implement a global error boundary to catch unexpected errors and provide a user-friendly fallback UI. Include a retry mechanism and detailed error information for developers.',
        codeSnippets: [{
            filename: 'src/ui/ErrorBoundary.tsx',
            language: 'tsx',
            code: `// src/ui/ErrorBoundary.tsx
import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state = { error: undefined };
  componentDidCatch(error: Error) { this.setState({ error }); }
  render() {
    if (this.state.error) {
      return (
        <section role="alert" aria-live="assertive">
          <h2>Something went wrong</h2>
          {process.env.NODE_ENV !== "production" && (
            <pre>{this.state.error.stack}</pre>
          )}
          <button onClick={() => this.setState({ error: undefined })}>Retry</button>
        </section>
      );
    }
    return this.props.children;
  }
}`
        }]
    },
    {
        title: 'Robust Network Helpers',
        description: 'Create helper functions for network requests that handle non-ok responses and safely parse JSON, preventing crashes from unexpected API responses.',
        codeSnippets: [{
            filename: 'src/services/http.ts',
            language: 'typescript',
            code: `// src/services/http.ts
export async function safeJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try { return JSON.parse(text) as T; }
  catch { throw new Error(\`Invalid JSON (\${res.status}): \${text.slice(0,200)}\`); }
}`
        }]
    },
];

const ChecklistPanel: React.FC = () => (
    <div className="h-full p-2 overflow-y-auto text-white text-sm custom-scrollbar">
        <CollapsibleSection title="Triage Checklist" defaultOpen={true}>
            <div className="space-y-4 py-2">
                {checklistItems.map((item, index) => (
                    <div key={index} className="bg-gray-900/40 p-3 rounded-md">
                        <h3 className="font-semibold text-blue-400 flex items-center text-sm mb-2">
                            <CheckCircleIcon />
                            <span className="ml-2">{item.title}</span>
                        </h3>
                        <p className="text-gray-400 text-xs leading-normal pl-6 mb-3">{item.description}</p>
                        
                        {item.codeSnippets && item.codeSnippets.map((snippet, sIndex) => (
                            <div key={sIndex} className="ml-6 bg-gray-900 rounded-md border border-gray-700 overflow-hidden">
                                <div className="text-xs text-gray-400 bg-gray-800 px-3 py-1 border-b border-gray-700">
                                    {snippet.filename}
                                </div>
                                <pre className="p-3 text-xs custom-scrollbar overflow-auto font-mono">
                                    <code>{snippet.code}</code>
                                </pre>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </CollapsibleSection>
    </div>
);

const SourceControlPanel: React.FC<{ modifiedFiles: string[]; }> = ({ modifiedFiles }) => (
    <div className="h-full p-2 overflow-y-auto text-white text-sm custom-scrollbar">
        <div className="mb-4">
            <textarea
                placeholder="Commit message"
                className="w-full p-2 bg-gray-900 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
            />
            <button className="w-full mt-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50" disabled={modifiedFiles.length === 0}>
                Commit Changes
            </button>
        </div>
        <CollapsibleSection title="Changes" defaultOpen={true}>
            {modifiedFiles.map(file => (
                <div key={file} className="flex items-center justify-between p-1 rounded hover:bg-gray-700/50">
                    <span>{file}</span>
                </div>
            ))}
        </CollapsibleSection>
    </div>
);

const Sidebar: React.FC<{
    activeView: string;
    files: FileNode[];
    activeFile: string | null;
    onSelectFile: (path: string) => void;
    modifiedFiles: string[];
}> = (props) => (
    <div className="w-64 bg-gray-800 text-white flex-shrink-0 border-r border-gray-700">
        {props.activeView === 'explorer' && <FileExplorer files={props.files} activeFile={props.activeFile} onSelect={props.onSelectFile} modifiedFiles={props.modifiedFiles} />}
        {props.activeView === 'source-control' && <SourceControlPanel modifiedFiles={props.modifiedFiles} />}
        {props.activeView === 'checklist' && <ChecklistPanel />}
    </div>
);

const EditorPanel: React.FC<{
    openFiles: string[];
    activeFile: string | null;
    files: FileNode[];
    onSelectFile: (path: string) => void;
    onCloseFile: (path: string) => void;
    onSave: (path: string, content: string) => void;
    codeToInsert: { id: string, code: string } | null;
    onInsertionComplete: () => void;
}> = ({ openFiles, activeFile, files, onSelectFile, onCloseFile, onSave, codeToInsert, onInsertionComplete }) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const monacoInstanceRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const modelsRef = useRef(new Map<string, monaco.editor.ITextModel>());

    useEffect(() => {
        if (editorRef.current && !monacoInstanceRef.current) {
            monacoInstanceRef.current = monaco.editor.create(editorRef.current, { theme: 'vs-dark', automaticLayout: true, wordWrap: 'on' });
            monacoInstanceRef.current.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                if (activeFile && monacoInstanceRef.current) onSave(activeFile, monacoInstanceRef.current.getValue());
            });
        }
        return () => { monacoInstanceRef.current?.dispose(); monacoInstanceRef.current = null; };
    }, []);

    useEffect(() => {
        if (!monacoInstanceRef.current) return;
    
        openFiles.forEach(path => {
            const file = findFileNode(path, files);
            if (file && !modelsRef.current.has(path)) {
                const language = getLanguageForExtension(file.extension);
                const newModel = monaco.editor.createModel(file.content || '', language, monaco.Uri.parse(path));
                modelsRef.current.set(path, newModel);
            }
        });
    
        const openFilesSet = new Set(openFiles);
        modelsRef.current.forEach((model, path) => {
            if (!openFilesSet.has(path)) {
                model.dispose();
                modelsRef.current.delete(path);
            }
        });
    
        const currentModel = activeFile ? modelsRef.current.get(activeFile) : null;
        if (monacoInstanceRef.current.getModel() !== currentModel) {
            monacoInstanceRef.current.setModel(currentModel || null);
        }
    }, [activeFile, openFiles, files, onSave]);

    useEffect(() => {
        if (codeToInsert && monacoInstanceRef.current) {
            const editor = monacoInstanceRef.current;
            const selection = editor.getSelection();
            if (selection) {
                editor.executeEdits('ai-assistant-insert', [{
                    range: selection,
                    text: codeToInsert.code,
                    forceMoveMarkers: true
                }]);
            }
            onInsertionComplete();
        }
    }, [codeToInsert, onInsertionComplete]);

    if (openFiles.length === 0) {
        return <div className="flex-1 bg-gray-800 flex items-center justify-center text-gray-500">Select a file to open</div>;
    }

    return (
        <div className="flex-1 flex flex-col bg-gray-800 h-full">
            <div className="flex justify-between items-stretch bg-gray-900 text-sm shrink-0 border-b border-gray-700">
                <div className="flex-1 flex overflow-x-auto custom-scrollbar min-w-0">
                    {openFiles.map(path => {
                        const file = findFileNode(path, files);
                        return (
                            <div key={path} className={`flex items-center border-r border-gray-700 ${activeFile === path ? 'bg-gray-800' : 'bg-gray-700/50'} shrink-0`}>
                                <button onClick={() => onSelectFile(path)} className="px-4 py-2 text-gray-300 hover:bg-gray-700 flex items-center">
                                   <FileIcon extension={file?.extension} /> {file?.name || '...'}
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); onCloseFile(path); }} className="px-2 text-gray-400 hover:bg-red-500/50 hover:text-white rounded-sm mr-2">
                                    <CloseIcon />
                                </button>
                            </div>
                        );
                    })}
                </div>
                <div className="flex items-center px-2 border-l border-gray-700 shrink-0">
                     <button
                        title="Undo (Ctrl+Z)"
                        onClick={() => monacoInstanceRef.current?.trigger('source', 'undo', null)}
                        disabled={!activeFile}
                        className="p-1.5 rounded text-gray-400 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <UndoIcon />
                    </button>
                    <button
                        title="Redo (Ctrl+Y)"
                        onClick={() => monacoInstanceRef.current?.trigger('source', 'redo', null)}
                        disabled={!activeFile}
                        className="p-1.5 rounded text-gray-400 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <RedoIcon />
                    </button>
                </div>
            </div>
            <div ref={editorRef} className="flex-1 w-full h-full min-h-0"></div>
        </div>
    );
};

const PreviewPanel: React.FC<{ files: FileNode[], addLog: (source: string, message: string) => void }> = ({ files, addLog }) => {
    const [status, setStatus] = useState<'booting' | 'installing' | 'running' | 'error'>('booting');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [url, setUrl] = useState('');
    const webContainerInstanceRef = useRef<WebContainer | null>(null);
    const isBootedRef = useRef(false);
    const containerFileContentRef = useRef<Record<string, string>>({});

    useEffect(() => {
        const bootWebContainer = async () => {
            if (webContainerInstanceRef.current) return;
            setStatus('booting');
            addLog('Preview', 'Booting WebContainer...');
            try {
                const wc = await WebContainer.boot();
                webContainerInstanceRef.current = wc;

                wc.on('server-ready', (_, url) => { setUrl(url); setStatus('running'); addLog('Preview', `Server is ready at ${url}`); });
                wc.on('error', (error) => { const message = `WebContainer error: ${error.message}`; setStatus('error'); setErrorMessage(message); addLog('Preview', message); });

                const fileSystemTree = {};
                const initialContent: Record<string, string> = {};
                const processNode = (node: FileNode, currentPath: object) => {
                    if (node.type === 'file' && node.content !== undefined) {
                        currentPath[node.name] = { file: { contents: node.content } };
                        initialContent[node.path] = node.content;
                    }
                    else if (node.type === 'folder' && node.children) {
                        const newDir = {}; currentPath[node.name] = { directory: newDir };
                        node.children.forEach(child => processNode(child, newDir));
                    }
                };
                files.forEach(node => processNode(node, fileSystemTree));
                await wc.mount(fileSystemTree);
                containerFileContentRef.current = initialContent;


                setStatus('installing');
                addLog('Preview', 'Installing dependencies...');
                const installProcess = await wc.spawn('npm', ['install']);
                installProcess.output.pipeTo(new WritableStream({ write(data) { addLog('npm', data); } }));
                const installExitCode = await installProcess.exit;

                if (installExitCode !== 0) {
                    const message = `npm install failed with exit code ${installExitCode}. See terminal for details.`;
                    setStatus('error'); setErrorMessage(message); addLog('Preview', message);
                    return;
                }
                addLog('Preview', 'Dependencies installed. Starting dev server...');

                const devProcess = await wc.spawn('npm', ['run', 'dev']);
                devProcess.output.pipeTo(new WritableStream({ write(data) { addLog('vite', data); } }));
                isBootedRef.current = true;

            } catch (error) {
                const message = `WebContainer boot failed: ${error instanceof Error ? error.message : String(error)}`;
                setStatus('error'); setErrorMessage(message); addLog('Preview', message);
            }
        };
        bootWebContainer();
        return () => { webContainerInstanceRef.current?.teardown(); webContainerInstanceRef.current = null; };
    }, []);

    useEffect(() => {
        if (!isBootedRef.current) return;
        const wc = webContainerInstanceRef.current;
        if (!wc) return;
    
        const updateChangedFiles = async () => {
            const newFileContent: Record<string, string> = {};
            const collectFiles = (nodes: FileNode[]) => {
                nodes.forEach(node => {
                    if (node.type === 'file' && node.content !== undefined) {
                        newFileContent[node.path] = node.content;
                    }
                    if (node.children) {
                        collectFiles(node.children);
                    }
                });
            };
            collectFiles(files);
            
            const promises: Promise<void>[] = [];
            const updatedPaths: string[] = [];
    
            for (const path in newFileContent) {
                if (containerFileContentRef.current[path] !== newFileContent[path]) {
                    promises.push(wc.fs.writeFile(path, newFileContent[path]));
                    updatedPaths.push(path.split('/').pop() || path);
                }
            }
    
            for (const path in containerFileContentRef.current) {
                if (!(path in newFileContent)) {
                     promises.push(wc.fs.rm(path));
                     updatedPaths.push(`(deleted) ${path.split('/').pop() || path}`);
                }
            }
            
            if (promises.length > 0) {
                addLog('Preview', `Syncing ${promises.length} file change(s): ${updatedPaths.slice(0, 3).join(', ')}${updatedPaths.length > 3 ? '...' : ''}`);
                try {
                    await Promise.all(promises);
                    containerFileContentRef.current = newFileContent;
                } catch (e) {
                    addLog('Preview', `Error syncing files: ${e.message}`);
                }
            }
        };
    
        updateChangedFiles();
    }, [files, addLog]);

    const StatusDisplay = () => (
        <div className="absolute inset-0 bg-gray-800 flex flex-col items-center justify-center text-white p-4 text-center">
            {status === 'error' ? (
                <div className="w-full max-w-lg"><ErrorIconFallback /><h2 className="mt-4 text-xl font-bold text-red-400">Preview Environment Error</h2><p className="text-gray-400 mb-4">The live preview failed to start. Check the terminal for details.</p><pre className="mt-2 bg-gray-900 text-left p-4 rounded-md text-sm text-red-300 overflow-auto w-full custom-scrollbar"><code>{errorMessage}</code></pre></div>
            ) : ( <><div className="h-16 w-16"><SpinnerIcon /></div><p className="mt-4 text-lg animate-pulse">{status.charAt(0).toUpperCase() + status.slice(1)}...</p></> )}
        </div>
    );
    
    return (
        <div className="flex-1 bg-gray-800 relative h-full">
            {status !== 'running' && <StatusDisplay />}
            <iframe src={url} className={`w-full h-full bg-white transition-opacity duration-500 ${status === 'running' ? 'opacity-100' : 'opacity-0'}`} title="Application Preview" sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups" />
        </div>
    );
};

const AgentPanel: React.FC<{ 
    isOpen: boolean; 
    agents: Agent[]; 
    commLogs: CommLog[]; 
    onGenerateCode: (prompt: string) => Promise<string>;
    onInsertCode: (code: string) => void;
    activeFile: string | null;
}> = ({ isOpen, agents, commLogs, onGenerateCode, onInsertCode, activeFile }) => {
    const [filterAgent, setFilterAgent] = useState('All');
    const [assistantPrompt, setAssistantPrompt] = useState('');
    const [generatedCode, setGeneratedCode] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    if (!isOpen) return null;

    const getAgentColor = (agentName: string) => ({ 'Orchestrator': 'text-purple-400', 'Frontend-Dev': 'text-blue-400', 'UX-Designer': 'text-pink-400', 'QA-Tester': 'text-green-400', 'Backend-Dev': 'text-orange-400', 'User': 'text-teal-300' }[agentName] || 'text-gray-300');
    const getStatusColor = (status: Agent['status']) => ({ 'Idle': 'text-green-400', 'Working': 'text-yellow-400 animate-pulse' }[status] || 'text-gray-400');
    
    const agentNames = useMemo(() => ['All', 'User', ...agents.map(a => a.name)], [agents]);
    const filteredLogs = useMemo(() => commLogs.filter(log => filterAgent === 'All' || log.agent === filterAgent), [commLogs, filterAgent]);

    const handleGenerateClick = async () => {
        if (!assistantPrompt.trim()) return;
        setIsGenerating(true);
        setGeneratedCode('');
        try {
            const code = await onGenerateCode(assistantPrompt);
            setGeneratedCode(code);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            setGeneratedCode(`// Error generating code: ${message}`);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="w-96 bg-gray-800 border-l border-gray-700 text-white flex flex-col p-2 space-y-2">
            <CollapsibleSection title="Agent Status">
                <div className="space-y-3 p-2">
                    {agents.map(agent => (
                        <div key={agent.name} className="text-sm flex justify-between items-center bg-gray-900/50 p-2 rounded-md">
                            <span className={`font-semibold ${getAgentColor(agent.name)}`}>{agent.name}</span>
                            <span className={`font-mono text-xs ${getStatusColor(agent.status)}`}>{agent.status}</span>
                        </div>
                    ))}
                </div>
            </CollapsibleSection>

            <CollapsibleSection title="Communications" defaultOpen={true}>
                 <div className="px-2 pt-2">
                    <div className="flex flex-wrap gap-1">
                        {agentNames.map(name => (
                            <button
                                key={name}
                                onClick={() => setFilterAgent(name)}
                                className={`px-2 py-0.5 text-xs rounded-full transition-colors ${filterAgent === name ? 'bg-blue-600 text-white font-semibold' : 'bg-gray-700 hover:bg-gray-600'}`}
                            >
                                {name}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="space-y-4 p-2 text-sm max-h-[calc(100vh-350px)] overflow-y-auto custom-scrollbar">
                     {filteredLogs.length === 0 ? (<p className="text-gray-400 text-xs text-center p-4">No communications for this filter.</p>) : (
                        filteredLogs.map((log) => (
                            <div key={log.id} className={`flex flex-col ${log.agent === 'User' ? 'items-end' : 'items-start'}`}>
                               <div className={`max-w-[85%] p-2 rounded-lg ${log.agent === 'User' ? 'bg-blue-600' : 'bg-gray-700'}`}>
                                   <div className="flex justify-between items-baseline mb-1">
                                    <span className={`font-bold text-xs ${getAgentColor(log.agent)}`}>{log.agent}</span>
                                    <span className="text-xs text-gray-400 ml-2">{log.time}</span>
                                   </div>
                                   <p className="text-gray-200 text-sm whitespace-pre-wrap">{log.message}</p>
                               </div>
                            </div>
                        ))
                     )}
                </div>
            </CollapsibleSection>

            <CollapsibleSection title="AI Assistant" defaultOpen={true}>
                <div className="p-2 space-y-2 text-sm">
                    <textarea
                        value={assistantPrompt}
                        onChange={(e) => setAssistantPrompt(e.target.value)}
                        placeholder="Describe a component or function..."
                        className="w-full p-2 bg-gray-900 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows={4}
                        disabled={isGenerating}
                    />
                    <button
                        onClick={handleGenerateClick}
                        disabled={isGenerating || !assistantPrompt.trim()}
                        className="w-full flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                    >
                        {isGenerating ? <SpinnerIcon className="h-4 w-4" /> : 'Generate Code'}
                    </button>
                    {(isGenerating || generatedCode) && (
                        <div className="bg-gray-900/50 rounded-md mt-2 border border-gray-700">
                            {isGenerating && !generatedCode && <div className="p-4 text-center text-gray-400">Generating...</div>}
                            {generatedCode && (
                                <>
                                    <pre className="text-xs custom-scrollbar overflow-auto max-h-60 p-2">
                                        <code>{generatedCode}</code>
                                    </pre>
                                    <div className="p-2 border-t border-gray-700">
                                        <button
                                            onClick={() => onInsertCode(generatedCode)}
                                            disabled={!activeFile}
                                            className="w-full text-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                                            title={!activeFile ? "Open a file to insert code" : "Insert into active editor"}
                                        >
                                            Insert into Editor
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </CollapsibleSection>
        </div>
    );
};

const ExecutionPlanPanel: React.FC<{ tasks: AgentTask[]; onRetry: (taskId: string) => void; }> = ({ tasks, onRetry }) => {
    if (tasks.length === 0) {
        return <div className="flex flex-col items-center justify-center h-full bg-gray-800 text-gray-500"><PlanIcon /><p className="mt-2">No execution plan generated yet.</p></div>;
    }
    
    const getStatusColor = (status: AgentTaskState) => ({
        'Blocked': 'bg-gray-700 border-gray-600',
        'Queued': 'bg-cyan-900/50 border-cyan-700',
        'Executing': 'bg-yellow-900/50 border-yellow-700 animate-pulse',
        'Completed': 'bg-green-900/50 border-green-700',
        'Failed': 'bg-red-900/50 border-red-700',
    }[status]);

    return (
        <div className="h-full bg-gray-800 p-4 overflow-y-auto custom-scrollbar">
            <h2 className="text-lg font-semibold mb-4">Execution Plan</h2>
            <div className="space-y-1">
                {tasks.map(task => {
                    const nestingLevel = task.id.split('.').length - 1;
                    const indentStyle = { paddingLeft: `${nestingLevel * 20 + 12}px` };
                    return (
                        <div key={task.id} className={`p-2 rounded-md border text-sm ${getStatusColor(task.state)}`} style={indentStyle}>
                            <div className="flex items-center justify-between">
                                <p className="font-medium text-gray-200">{task.description}</p>
                                <div className="flex items-center space-x-2 text-xs font-mono shrink-0 ml-4">
                                    {task.state === 'Failed' && (
                                        <button onClick={() => onRetry(task.id)} title="Retry task" className="p-1 rounded-md hover:bg-gray-600 text-yellow-400 transition-colors">
                                            <RetryIcon />
                                        </button>
                                    )}
                                    <TaskStatusIcon status={task.state} />
                                    <span>{task.state}</span>
                                </div>
                            </div>
                            {task.dependencies && task.dependencies.length > 0 && (
                                <div className="mt-1 text-xs text-gray-400">
                                    <span className="font-semibold">Depends on:</span> {task.dependencies.join(', ')}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    );
};

const TerminalPanel: React.FC<{ logs: TerminalLog[]; height: number; onResize: (e: React.MouseEvent) => void; }> = ({ logs, height, onResize }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [logs]);

    return (
        <div style={{ height: `${height}px` }} className="bg-gray-900 text-white font-mono text-sm flex flex-col relative">
            <div className="bottom-panel-handle" onMouseDown={onResize}></div>
            <div className="flex-shrink-0 p-2 border-b border-gray-700">
                <span className="font-semibold">TERMINAL</span>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-2">
                {logs.map(log => (
                    <div key={log.id} className="flex">
                        <span className="text-gray-500 mr-2 shrink-0">{log.time}</span>
                        <span className="text-cyan-400 mr-2 shrink-0">{log.source}:</span>
                        <span className="flex-1 whitespace-pre-wrap break-words">{log.message}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const CommandBar: React.FC<{
    onSubmit: (e: React.FormEvent) => void;
    inputValue: string;
    onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    isThinking: boolean;
    aiStatus: string;
}> = ({ onSubmit, inputValue, onInputChange, isThinking, aiStatus }) => (
    <div className="flex-shrink-0 border-t border-gray-700 p-2 bg-gray-900 flex items-center space-x-4">
        <div className="flex items-center space-x-2 shrink-0">
            <span className="text-sm font-semibold text-gray-400">AI Status:</span>
            <span className={`text-sm font-mono px-2 py-1 rounded-md ${isThinking ? 'bg-yellow-500/20 text-yellow-300 animate-pulse' : 'bg-green-500/20 text-green-300'}`}>
                {aiStatus}
            </span>
        </div>
        <form onSubmit={onSubmit} className="flex-1 flex items-center space-x-2">
             <input
                type="text" value={inputValue} onChange={onInputChange}
                placeholder="Provide instructions to the AI agents..."
                className="flex-1 bg-gray-700 rounded-md px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isThinking}
            />
            <button type="submit" className="bg-blue-600 hover:bg-blue-500 rounded-md p-2 disabled:bg-gray-500 disabled:cursor-not-allowed" disabled={isThinking || !inputValue.trim()}>
                {isThinking ? <SpinnerIcon /> : <SendIcon />}
            </button>
        </form>
    </div>
);


const MainView: React.FC<{
    activeTab: 'code' | 'preview' | 'plan';
    setActiveTab: (tab: 'code' | 'preview' | 'plan') => void;
    openFiles: string[]; activeFile: string | null; files: FileNode[];
    onSelectFile: (path: string) => void; onCloseFile: (path: string) => void; onSave: (path: string, content: string) => void;
    addLog: (source: string, message: string) => void; allTasks: AgentTask[]; onRetryTask: (taskId: string) => void;
    codeToInsert: { id: string, code: string } | null; onInsertionComplete: () => void;
}> = (props) => {
    const tabs = [
        { id: 'code', label: 'Code', icon: <CodeIcon /> },
        { id: 'preview', label: 'Live Preview', icon: <PreviewIcon /> },
        { id: 'plan', label: 'Execution Plan', icon: <PlanIcon /> },
    ];
    
    return (
        <div className="flex-1 flex flex-col min-w-0 bg-gray-800">
            <div className="flex border-b border-gray-700 bg-gray-900 shrink-0">
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => props.setActiveTab(tab.id as any)} className={`flex items-center px-4 py-2 text-sm font-medium border-b-2 transition-colors ${props.activeTab === tab.id ? 'border-blue-500 text-white' : 'border-transparent text-gray-400 hover:text-white'}`}>
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>
            <div className="flex-1 min-h-0">
                {props.activeTab === 'code' && <EditorPanel 
                    openFiles={props.openFiles} activeFile={props.activeFile} files={props.files} 
                    onSelectFile={props.onSelectFile} onCloseFile={props.onCloseFile} onSave={props.onSave} 
                    codeToInsert={props.codeToInsert} onInsertionComplete={props.onInsertionComplete} 
                />}
                {props.activeTab === 'preview' && <PreviewPanel files={props.files} addLog={props.addLog} />}
                {props.activeTab === 'plan' && <ExecutionPlanPanel tasks={props.allTasks} onRetry={props.onRetryTask} />}
            </div>
        </div>
    );
};


// --- MAIN APP COMPONENT ---
export function App() {
    // State
    const [files, setFiles] = useState<FileNode[]>(initialFiles);
    const [agents, setAgents] = useState<Agent[]>(initialAgents);
    const [activeView, setActiveView] = useState('explorer'); // 'explorer', 'source-control', 'checklist'
    const [activeMainTab, setActiveMainTab] = useState<'code' | 'preview' | 'plan'>('code');
    const [openFiles, setOpenFiles] = useState<string[]>(['/src/App.tsx']);
    const [activeFile, setActiveFile] = useState<string | null>('/src/App.tsx');
    const [agentPanelOpen, setAgentPanelOpen] = useState(true);
    const [terminalLogs, setTerminalLogs] = useState<TerminalLog[]>([{id: 0, time: new Date().toLocaleTimeString(), source: 'System', message: 'Welcome to Agentic!'}]);
    const [commLogs, setCommLogs] = useState<CommLog[]>([]);
    const [userInput, setUserInput] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [aiStatus, setAiStatus] = useState('Idle');
    const [bottomPanelHeight, setBottomPanelHeight] = useState(200);
    const [headFiles, setHeadFiles] = useState<Record<string, string>>({});
    const [modifiedFiles, setModifiedFiles] = useState<string[]>([]);
    const [originalPrompt, setOriginalPrompt] = useState('');
    const [codeToInsert, setCodeToInsert] = useState<{ id: string, code: string } | null>(null);

    // Refs and Memos
    const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.API_KEY }), []);
    const allTasks = useMemo(() => agents.flatMap(a => a.tasks).sort((a,b) => a.id.localeCompare(b.id, undefined, { numeric: true })), [agents]);
    const MAX_AUTO_RETRIES = 1;

    // Logging Utils
    const addLog = useCallback((source: string, message: string) => { setTerminalLogs(prev => [...prev, { id: prev.length, time: new Date().toLocaleTimeString(), source, message }]); }, []);
    const addCommLog = useCallback((agent: string, message: string) => { setCommLogs(prev => [...prev, { id: prev.length, agent, message, time: new Date().toLocaleTimeString() }]); }, []);

    // File Utils
    const updateFileNode = (path: string, newContent: string, nodes: FileNode[]): FileNode[] => nodes.map(node => {
        if (node.path === path) return { ...node, content: newContent };
        if (node.type === 'folder' && node.children) return { ...node, children: updateFileNode(path, newContent, node.children) };
        return node;
    });

    const addFileNode = (newNode: FileNode, nodes: FileNode[]): FileNode[] => {
        const parentPath = newNode.path.substring(0, newNode.path.lastIndexOf('/')) || '/';
        const addRec = (currentNodes: FileNode[]): FileNode[] => currentNodes.map(node => {
            if (node.path === parentPath && node.type === 'folder') {
                const childExists = node.children?.some(child => child.path === newNode.path);
                if (childExists) return node;
                return { ...node, children: [...(node.children || []), newNode] };
            } else if (node.children) {
                return {...node, children: addRec(node.children) };
            }
            return node;
        });
        if (parentPath === '/') {
            const nodeExists = nodes.some(node => node.path === newNode.path);
            if(nodeExists) return nodes;
            return [...nodes, newNode];
        }
        return addRec(nodes);
    };

    const serializeFileTree = (nodes: FileNode[], indent = ''): string => {
        let result = '';
        nodes.forEach(node => {
            result += `${indent}${node.name}\n`;
            if (node.type === 'folder' && node.children) {
                result += serializeFileTree(node.children, indent + '  ');
            }
        });
        return result;
    }

    // Effect for detecting file changes against HEAD
    useEffect(() => {
        const flattenFiles = (nodes: FileNode[]): Record<string, string> => {
            let flat: Record<string, string> = {};
            nodes.forEach(node => {
                if(node.type === 'file' && node.content) flat[node.path] = node.content;
                if(node.children) flat = {...flat, ...flattenFiles(node.children)};
            });
            return flat;
        }
        const currentFileContent = flattenFiles(files);
        const newModified: string[] = [];
        for (const path in currentFileContent) {
            if (path in headFiles) {
                if (currentFileContent[path] !== headFiles[path]) newModified.push(path);
            } else newModified.push(path);
        }
        setModifiedFiles(newModified);
    }, [files, headFiles]);

    // Handlers
    const handleSelectFile = (path: string) => {
        if (!openFiles.includes(path)) setOpenFiles([...openFiles, path]);
        setActiveFile(path);
        setActiveMainTab('code');
    };

    const handleCloseFile = (path: string) => {
        const newOpenFiles = openFiles.filter(p => p !== path);
        setOpenFiles(newOpenFiles);
        if (activeFile === path) setActiveFile(newOpenFiles[newOpenFiles.length - 1] || null);
    };
    
    const handleSaveFile = useCallback(async (path: string, content: string) => {
        const file = findFileNode(path, files);
        if (file?.extension) {
            const formattedContent = await formatCodeWithPrettier(content, file.extension);
            setFiles(currentFiles => updateFileNode(path, formattedContent, currentFiles));
            addLog('Editor', `Saved and formatted ${path}`);
        }
    }, [files, addLog]);
    
    const handleBottomPanelResize = useCallback((e: React.MouseEvent) => {
        const startY = e.clientY;
        const startHeight = bottomPanelHeight;
        const doDrag = (moveEvent: MouseEvent) => {
            const newHeight = startHeight - (moveEvent.clientY - startY);
            if (newHeight > 50 && newHeight < window.innerHeight - 200) {
                setBottomPanelHeight(newHeight);
            }
        };
        const stopDrag = () => {
            document.removeEventListener('mousemove', doDrag);
            document.removeEventListener('mouseup', stopDrag);
        };
        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', stopDrag);
    }, [bottomPanelHeight]);

    const handleRetryTask = (taskId: string) => {
        addLog('System', `Manual retry initiated for task ${taskId}.`);
        setAgents(currentAgents =>
            currentAgents.map(agent => ({
                ...agent,
                tasks: agent.tasks.map(task =>
                    task.id === taskId && task.state === 'Failed'
                        ? { ...task, state: 'Queued', retries: 0 }
                        : task
                )
            }))
        );
    };

    const handleInsertCodeIntoEditor = useCallback((code: string) => {
        if (activeFile) {
            setCodeToInsert({ id: `insert-${Date.now()}`, code });
        } else {
            addLog('System', 'Cannot insert code. No active file selected.');
        }
    }, [activeFile, addLog]);
    
    const handleInsertionComplete = useCallback(() => {
        setCodeToInsert(null);
    }, []);

    // --- AGENT EXECUTION LOGIC ---

    const generateCodeSnippet = useCallback(async (prompt: string): Promise<string> => {
        addCommLog('UX-Designer', `Generating code for prompt: "${prompt.substring(0, 50)}..."`);
        const fullPrompt = `You are an expert coding assistant. Generate a code snippet based on the following request.
    IMPORTANT: Respond ONLY with the raw code snippet. Do not include any explanation, markdown formatting, or anything else. Just the code.

    Request: "${prompt}"`;
    
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: fullPrompt,
        });
    
        const code = response.text.trim();
        const codeBlockRegex = /`{3}(?:\w+)?\n([\s\S]+?)\n`{3}/;
        const match = code.match(codeBlockRegex);
        if (match) {
            return match[1].trim();
        }
        return code;
    }, [ai, addCommLog]);

    const generateExecutionPlan = useCallback(async (userRequest: string, fileTree: string): Promise<Omit<AgentTask, 'state' | 'retries'>[]> => {
        const planSchema = {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING, description: 'Unique identifier using dot-notation for sub-tasks (e.g., "task-1", "task-1.1").' },
                    description: { type: Type.STRING, description: 'A detailed, granular description of the task.' },
                    filePath: { type: Type.STRING, description: 'The primary file path this task will modify or create.' },
                    agent: { type: Type.STRING, description: 'The name of the agent best suited for this task (e.g., "Frontend-Dev").' },
                    dependencies: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'List of task IDs that must be completed before this task can start.' }
                },
                required: ['id', 'description', 'filePath', 'agent', 'dependencies']
            }
        };

        const systemInstruction = "You are an expert AI software project orchestrator. Your role is to analyze a user's request, the current codebase, and a list of available AI agents, and then generate a detailed, parallelized execution plan. The plan must be structured as a JSON array of task objects.";
        const prompt = `
            User Request: "${userRequest}"

            Current File Structure:
            ${fileTree}

            Available Agents & Specializations (These roles are mutually exclusive and must be strictly followed):
            - Orchestrator: Manages the overall process. Not assigned to coding tasks.
            - Frontend-Dev: **Logic ONLY.** Responsible for component structure, state management (e.g., React hooks), event handlers (e.g., onClick), and data flow within \`.tsx\` and \`.jsx\` files. **This agent MUST NOT write any CSS or add/change \`className\` attributes.**
            - Backend-Dev: Specializes in server-side logic (if applicable).
            - QA-Tester: Writes and runs tests (e.g., Jest, Vitest).
            - UX-Designer: **Styling and Layout ONLY.** Exclusively responsible for all visual aspects. This includes:
                - Writing all CSS in \`.css\` files.
                - Adding or modifying \`className\` and \`style\` attributes in \`.tsx\` and \`.jsx\` files to apply styles.
                - Implementing layouts and visual design.
                - Generating logos or placeholder images.

            Please generate an execution plan with the following considerations:
            1.  **Granularity & Sub-tasks**: Break down the request into the smallest possible atomic sub-tasks. Use dot-notation for sub-task IDs (e.g., parent 'task-1', sub-tasks 'task-1.1', 'task-1.2').
            2.  **Parallelization**: Identify all tasks that can be executed concurrently. Maximize parallel work by correctly defining dependencies.
            3.  **Agent Assignment**: Assign the most suitable agent for each task based on their strict, non-overlapping specializations.
                - Example 1: A request to "add a button that increments a counter" should be split.
                    - Task A (Frontend-Dev): Add the \`<button>\` element and the \`onClick\` handler logic to \`App.tsx\`.
                    - Task B (UX-Designer): Add a \`className\` to the new button in \`App.tsx\` and define the corresponding styles in a \`.css\` file.
                - Example 2: A request to "create a new CSS file for styling" MUST be assigned to 'UX-Designer'.
            4.  **Dependencies**: Meticulously define dependencies using task IDs. A task cannot start until all its dependencies are 'Completed'.
                - **Infer Dependencies**: You must infer dependencies based on file modifications and task logic. For instance, if 'task-1.1' (Frontend-Dev) adds a new button with a specific \`className\` to \`Component.tsx\`, then 'task-1.2' (UX-Designer) which styles that \`className\` in \`styles.css\` MUST have a dependency on 'task-1.1'. Similarly, a task that creates a file must be a dependency for any task that modifies that same file.
            5.  **Error Recovery (in description)**: For complex tasks, add a brief note in the description about what to check if it fails, e.g., "(On failure, verify component imports)".

            The output must be a valid JSON array matching the provided schema.
        `;
        
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: planSchema,
            },
        });
        
        return JSON.parse(response.text);
    }, [ai]);

    const generateCodeForTask = useCallback(async (task: AgentTask, agentName: string): Promise<string> => {
        const file = findFileNode(task.filePath, files);
        const currentContent = file?.content || (file ? '' : '# This is a new file');
        const fileTree = serializeFileTree(files);

        let agentSpecificInstructions = '';
        if (agentName === 'UX-Designer') {
            agentSpecificInstructions = `
**UX-Designer Specific Instructions (CRITICAL):**
- **CSS Variables ARE MANDATORY**: You MUST define and use CSS variables for all styling properties, including colors, spacing (padding, margin, gap), and font sizes.
- **Define in \`:root\`**: All CSS variables must be defined within a \`:root\` selector in the relevant CSS file. If the selector doesn't exist, you must create it.
- **Use Variables Everywhere**: After defining them, you MUST use the \`var()\` function to apply these variables throughout your CSS rules. Do not use any hardcoded values like \`#FFF\`, \`16px\`, or \`2rem\` directly in your styles.
- **Example**:
  \`\`\`css
  :root {
    --primary-color: #3b82f6;
    --text-color: #e5e7eb;
    --spacing-medium: 16px;
  }
  .my-button {
    background-color: var(--primary-color);
    padding: var(--spacing-medium);
    color: var(--text-color);
  }
  \`\`\`
- **Maintainability**: Ensure the CSS is well-organized and reusable.
`;
        }
        
        const prompt = `You are the ${agentName} agent.
Your current task is: "${task.description}".
The overall user request is: "${originalPrompt}".

You are working on the file: \`${task.filePath}\`.
The current content of the file is:
\`\`\`${getLanguageForExtension(file?.extension)}
${currentContent}
\`\`\`

Here is the full file tree for context:
${fileTree}

**General Coding Requirements:**
- **Accessibility (A11Y)**: This is a non-negotiable, critical requirement. All generated code must be highly accessible.
    - **Labels**: All interactive elements (buttons, links, inputs) MUST have a descriptive \`aria-label\`. For buttons that operate on an item in a list, the label must include the item's name (e.g., \`aria-label="Delete task: Buy milk"\`).
    - **State Management**: Use ARIA attributes to indicate the state of components.
        - Use \`aria-pressed="true/false"\` for toggle buttons.
        - Use \`aria-expanded="true/false"\` for any element that shows or hides another region (e.g., accordions, dropdowns), and link them with \`aria-controls="ID_OF_REGION"\`.
    - **Structural Roles**: Use landmark and structural roles to define the page structure.
        - For lists of items (e.g., a to-do list), the container MUST have \`role="list"\` and each item MUST have \`role="listitem"\`.
        - Use roles like \`navigation\`, \`main\`, \`region\`, \`tablist\`, \`tab\`, and \`tabpanel\` where appropriate to create a semantic and navigable structure.
- **User Experience (UX)**: When implementing features like adding an item to a list, ensure the text input field is cleared after the item is successfully added. This allows for faster consecutive entries.

${agentSpecificInstructions}

Based on all the above, provide the new, complete content for the file \`${task.filePath}\`.
IMPORTANT: Respond ONLY with the raw file content. Do not include any explanation, markdown formatting, or anything else. Just the code.
`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        let newContent = response.text.trim();
        const codeBlockRegex = /```(?:\w+)?\n([\s\S]+?)\n```/;
        const match = newContent.match(codeBlockRegex);
        if (match) {
            newContent = match[1].trim();
        }
        return newContent;
    }, [ai, files, originalPrompt]);

    const generateCodeWithImage = useCallback(async (task: AgentTask, agentName: string, imageUri: string): Promise<string> => {
        const file = findFileNode(task.filePath, files);
        const currentContent = file?.content || '';

        const prompt = `You are the ${agentName} agent.
Your current task is: "${task.description}".
The overall user request is: "${originalPrompt}".

You have been provided with an image data URI that you must insert into the file: ${imageUri}

You are working on the file: \`${task.filePath}\`.
The current content of the file is:
\`\`\`${getLanguageForExtension(file?.extension)}
${currentContent}
\`\`\`

Your goal is to intelligently insert an \`<img>\` tag with the provided image data URI as its \`src\` into the current file content.
- Place it in a semantically appropriate location based on the task description.
- If there's an existing placeholder or image to be replaced, replace it.
- Ensure the final output is the *complete*, updated content for the file \`${task.filePath}\`.

IMPORTANT: Respond ONLY with the raw, full file content. Do not include any explanation, markdown formatting, or anything else. Just the code.
`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        let newContent = response.text.trim();
        const codeBlockRegex = /```(?:\w+)?\n([\s\S]+?)\n```/;
        const match = newContent.match(codeBlockRegex);
        if (match) {
            newContent = match[1].trim();
        }
        return newContent;
    }, [ai, files, originalPrompt]);


    const executeTask = useCallback(async (task: AgentTask, agentName: string) => {
        setAiStatus(`Executing: ${task.description}`);
        addCommLog(agentName, `Starting task: "${task.description}" (Attempt ${task.retries + 1})`);
        
        try {
            const isImageTask = agentName === 'UX-Designer' && /placeholder|dummy image|wireframe|logo/i.test(task.description);
            let newContent;

            if (isImageTask) {
                let imageUrl = '';
                const isLogoTask = /logo/i.test(task.description);

                if (isLogoTask) {
                    addCommLog(agentName, `Recognized logo generation task. Generating logo with Imagen...`);
                    try {
                        const imagePrompt = task.description;
                        const response = await ai.models.generateImages({
                            model: 'imagen-4.0-generate-001',
                            prompt: imagePrompt || 'a modern logo for a web application',
                            config: {
                                numberOfImages: 1,
                                outputMimeType: 'image/png',
                                aspectRatio: '1:1',
                            },
                        });
                        const base64ImageBytes = response.generatedImages[0].image.imageBytes;
                        imageUrl = `data:image/png;base64,${base64ImageBytes}`;
                        addCommLog(agentName, `Successfully generated logo.`);
                    } catch (imageError) {
                        const message = imageError instanceof Error ? imageError.message : String(imageError);
                        addLog('Agent', `Logo generation failed: ${message}. Falling back to SVG placeholder.`);
                        imageUrl = ''; // Ensure fallback is triggered
                    }
                }

                if (!imageUrl) {
                    addCommLog(agentName, isLogoTask ? 'Falling back to SVG placeholder...' : 'Generating SVG placeholder...');
                    const sizeMatch = task.description.match(/(\d+)\s?x\s?(\d+)/);
                    const width = sizeMatch ? parseInt(sizeMatch[1], 10) : 150;
                    const height = sizeMatch ? parseInt(sizeMatch[2], 10) : 100;
                    
                    let text = 'Placeholder';
                    const textMatch = task.description.match(/(?:text|label|content)\s*['"]([^'"]+)['"]/i);
                    if (textMatch && textMatch[1]) {
                        text = textMatch[1];
                    } else if (isLogoTask) {
                        text = "Logo";
                    }

                    imageUrl = generatePlaceholderSVG(width, height, text);
                }
                
                newContent = await generateCodeWithImage(task, agentName, imageUrl);

            } else {
                newContent = await generateCodeForTask(task, agentName);
            }

            const file = findFileNode(task.filePath, files);
            if (file) {
                const formattedContent = await formatCodeWithPrettier(newContent, file.extension || '');
                setFiles(currentFiles => updateFileNode(task.filePath, formattedContent, currentFiles));
            } else {
                const parts = task.filePath.split('/');
                const name = parts.pop() || '';
                const extension = name.split('.').pop() || '';
                const formattedContent = await formatCodeWithPrettier(newContent, extension);
                const newNode: FileNode = { name, type: 'file', extension, path: task.filePath, content: formattedContent };
                setFiles(currentFiles => addFileNode(newNode, currentFiles));
            }

            addCommLog(agentName, `Task "${task.description}" completed successfully.`);
            setAgents(currentAgents => currentAgents.map(agent => agent.name === agentName ? {
                ...agent, status: 'Idle', tasks: agent.tasks.map(t => t.id === task.id ? { ...t, state: 'Completed' } : t)
            } : agent));

        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            addLog('Agent', `Task "${task.description}" failed: ${errorMessage}`);
            const newRetryCount = task.retries + 1;
            
            if (newRetryCount <= MAX_AUTO_RETRIES) {
                addCommLog(agentName, `Retrying task "${task.description}".`);
                setAgents(currentAgents => currentAgents.map(agent => agent.name === agentName ? {
                    ...agent, status: 'Idle', tasks: agent.tasks.map(t => t.id === task.id ? { ...t, state: 'Queued', retries: newRetryCount } : t)
                } : agent));
            } else {
                addCommLog(agentName, `Task "${task.description}" failed after max retries.`);
                setAgents(currentAgents => currentAgents.map(agent => agent.name === agentName ? {
                    ...agent, status: 'Idle', tasks: agent.tasks.map(t => t.id === task.id ? { ...t, state: 'Failed' } : t)
                } : agent));
            }
        }
    }, [addCommLog, addLog, files, generateCodeForTask, generateCodeWithImage, MAX_AUTO_RETRIES, ai, originalPrompt]);

    useEffect(() => {
        if (!isThinking) return;

        // --- State Consistency: Block tasks with failed dependencies ---
        const failedTaskIds = new Set(allTasks.filter(t => t.state === 'Failed').map(t => t.id));
        if (failedTaskIds.size > 0) {
            const tasksToBlock = new Set<string>();
            allTasks.forEach(task => {
                const hasFailedDep = (task.dependencies || []).some(dep => failedTaskIds.has(dep));
                if (hasFailedDep && task.state !== 'Blocked' && task.state !== 'Failed' && task.state !== 'Completed') {
                    tasksToBlock.add(task.id);
                }
            });
            
            if (tasksToBlock.size > 0) {
                setAgents(currentAgents => currentAgents.map(agent => ({
                    ...agent,
                    tasks: agent.tasks.map(task => tasksToBlock.has(task.id) ? { ...task, state: 'Blocked' } : task)
                })));
                return; // State will update, effect will re-run with consistent data
            }
        }
        
        // --- Execution Logic: Find and run available tasks ---
        const completedTaskIds = new Set(allTasks.filter(t => t.state === 'Completed').map(t => t.id));
        const availableAgents = agents.filter(a => a.status === 'Idle' && a.tasks.some(t => ['Queued', 'Blocked'].includes(t.state)));
        
        let runnableTasks: {task: AgentTask, agentName: string}[] = [];
        availableAgents.forEach(agent => {
            const task = agent.tasks.find(t => 
                ['Queued', 'Blocked'].includes(t.state) && 
                (t.dependencies || []).every(dep => completedTaskIds.has(dep))
            );
            if (task) {
                runnableTasks.push({ task, agentName: agent.name });
            }
        });
        
        if (runnableTasks.length > 0) {
            setAgents(currentAgents => {
                const runnableTaskIds = new Set(runnableTasks.map(rt => rt.task.id));
                const involvedAgentNames = new Set(runnableTasks.map(rt => rt.agentName));
                return currentAgents.map(agent => {
                    if (involvedAgentNames.has(agent.name)) {
                        return { ...agent, status: 'Working', tasks: agent.tasks.map(t => runnableTaskIds.has(t.id) ? { ...t, state: 'Executing' } : t) };
                    }
                    return agent;
                });
            });
            runnableTasks.forEach(({ task, agentName }) => executeTask(task, agentName));
        } else {
            const anyExecuting = allTasks.some(t => t.state === 'Executing');
            const allDone = allTasks.every(t => ['Completed', 'Failed', 'Blocked'].includes(t.state));
            if (!anyExecuting && allTasks.length > 0 && allDone) {
                const anyFailed = allTasks.some(t => t.state === 'Failed' || t.state === 'Blocked');
                addCommLog('Orchestrator', anyFailed ? 'Finished with errors.' : 'All tasks completed successfully!');
                setAiStatus('Idle');
                setIsThinking(false);
                setAgents(currentAgents => currentAgents.map(a => ({ ...a, status: 'Idle' })));
            }
        }
    }, [agents, isThinking, allTasks, executeTask, addCommLog]);

    const handleUserInputSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userInput.trim() || isThinking) return;
    
        const prompt = userInput;
        setOriginalPrompt(prompt);
        addCommLog('User', prompt);
        setUserInput('');
        setIsThinking(true);
        setAiStatus('Planning...');
        setAgents(initialAgents);
        setCommLogs([{ id: 0, agent: 'User', message: prompt, time: new Date().toLocaleTimeString() }]);
        setActiveMainTab('plan');
    
        try {
            const fileTreeString = serializeFileTree(files);
            const plan = await generateExecutionPlan(prompt, fileTreeString);
            
            addCommLog('Orchestrator', `I have created an execution plan with ${plan.length} task(s).`);

            const agentsWithTasks = initialAgents.map(agent => ({
                ...agent,
                tasks: plan
                    .filter(task => task.agent === agent.name)
                    .map((task): AgentTask => ({ ...task, state: (task.dependencies && task.dependencies.length > 0) ? 'Blocked' : 'Queued', retries: 0 }))
            }));
            
            setAgents(agentsWithTasks);
            setAiStatus('Ready to Execute');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            addLog('System', `Error during planning: ${errorMessage}`);
            addCommLog('Orchestrator', `I failed to create a plan. Error: ${errorMessage}`);
            setIsThinking(false);
            setAiStatus('Error');
        }
    };


    return (
        <div className="h-screen w-screen bg-gray-900 text-white flex flex-col font-sans overflow-hidden">
            <GlobalStyles />
            <Header />
            <div className="flex flex-1 min-h-0">
                <ActivityBar activeView={activeView} setActiveView={setActiveView} onToggleAgentPanel={() => setAgentPanelOpen(!agentPanelOpen)} isAgentPanelOpen={agentPanelOpen} />
                <Sidebar activeView={activeView} files={files} activeFile={activeFile} onSelectFile={handleSelectFile} modifiedFiles={modifiedFiles} />
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="flex-1 flex min-h-0">
                        <MainView 
                            activeTab={activeMainTab}
                            setActiveTab={setActiveMainTab}
                            openFiles={openFiles}
                            activeFile={activeFile}
                            files={files}
                            onSelectFile={handleSelectFile}
                            onCloseFile={handleCloseFile}
                            onSave={handleSaveFile}
                            addLog={addLog}
                            allTasks={allTasks}
                            onRetryTask={handleRetryTask}
                            codeToInsert={codeToInsert}
                            onInsertionComplete={handleInsertionComplete}
                        />
                    </div>
                    <TerminalPanel logs={terminalLogs} height={bottomPanelHeight} onResize={handleBottomPanelResize} />
                </div>
                <AgentPanel 
                    isOpen={agentPanelOpen} 
                    agents={agents} 
                    commLogs={commLogs} 
                    onGenerateCode={generateCodeSnippet}
                    onInsertCode={handleInsertCodeIntoEditor}
                    activeFile={activeFile}
                />
            </div>
            <CommandBar 
                onSubmit={handleUserInputSubmit}
                inputValue={userInput}
                onInputChange={(e) => setUserInput(e.target.value)}
                isThinking={isThinking}
                aiStatus={aiStatus}
            />
        </div>
    );
}
