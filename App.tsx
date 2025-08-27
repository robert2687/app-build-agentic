
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import * as prettier from "https://esm.sh/prettier@3.3.2/standalone";
import * as pluginBabel from "https://esm.sh/prettier@3.3.2/plugins/babel";
import * as pluginEstree from "https://esm.sh/prettier@3.3.2/plugins/estree";
import * as pluginHtml from "https://esm.sh/prettier@3.3.2/plugins/html";
import * as pluginPostcss from "https://esm.sh/prettier@3.3.2/plugins/postcss";
import * as monaco from 'https://esm.sh/monaco-editor@0.49.0';

declare global {
  interface Window {
    Babel: any;
  }
}

// --- HELPERS ---
const formatCodeWithPrettier = async (content: string, extension: string): Promise<string> => {
    try {
        const parserMap: { [key: string]: string } = {
            'js': 'babel', 'jsx': 'babel', 'ts': 'babel-ts', 'tsx': 'babel-ts', 'css': 'css', 'html': 'html'
        };
        const pluginMap: { [key: string]: any[] } = {
            'js': [pluginBabel, pluginEstree], 'jsx': [pluginBabel, pluginEstree],
            'ts': [pluginBabel, pluginEstree], 'tsx': [pluginBabel, pluginEstree],
            'css': [pluginPostcss], 'html': [pluginHtml]
        };
        const parser = parserMap[extension];
        const plugins = pluginMap[extension];

        if (!parser || !plugins) {
            return content;
        }

        return await prettier.format(content, {
            parser,
            plugins: plugins,
            printWidth: 80,
            tabWidth: 2,
            useTabs: false,
            semi: true,
            singleQuote: true,
        });
    } catch (error) {
        console.warn(`Prettier formatting failed for extension ${extension}:`, error);
        return content;
    }
};


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

const FallbackComponent = ({ error }: { error: Error | null }) => (
    <div className="bg-gray-900 text-white h-screen w-screen flex items-center justify-center font-sans">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 max-w-lg text-center shadow-2xl">
            <ErrorIconFallback />
            <h1 className="text-3xl font-bold text-red-400 mb-2">Something went wrong.</h1>
            <p className="text-gray-400 mb-6">An unexpected error occurred. Please try refreshing the application.</p>
            {error && (
                <pre className="bg-gray-900 text-left p-4 rounded-md text-sm text-red-300 overflow-auto mb-6 custom-scrollbar">
                    <code>{error.toString()}</code>
                </pre>
            )}
            <button
                onClick={() => window.location.reload()}
                className="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-6 rounded-md transition-colors"
            >
                Refresh Page
            </button>
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

  render() {
    if (this.state.hasError) {
      return <FallbackComponent error={this.state.error} />;
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

interface Agent {
  name:string;
  status: 'Idle' | 'Active';
  task?: string;
}

interface TerminalLog {
    id: number;
    time: string;
    source: string;
    message: string;
}

interface Commit {
    id: string;
    message: string;
    author: string;
    date: string;
}

// --- MOCK DATA ---
const initialFiles: FileNode[] = [
    {
        name: 'public',
        type: 'folder',
        path: '/public',
        children: [
            { name: 'index.html', type: 'file', extension: 'html', path: '/public/index.html', content: '<!DOCTYPE html><html><head><link rel="stylesheet" href="/src/styles.css"></head><body><div id="root"></div><script type="module" src="/src/index.tsx"></script></body></html>' },
        ],
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
    { name: 'package.json', type: 'file', extension: 'json', path: '/package.json', content: '{ "name": "my-app" }' },
    { name: '.gitignore', type: 'file', path: '/.gitignore', content: 'node_modules\ndist\nbuild' },
];

const initialAgents: Agent[] = [
    { name: 'Orchestrator', status: 'Idle' },
    { name: 'Frontend-Dev', status: 'Idle' },
    { name: 'Backend-Dev', status: 'Idle' },
    { name: 'QA-Tester', status: 'Idle' },
];


// --- ICONS ---
const ExplorerIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>;
const SourceControlIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>;
const AgentsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.124-1.282-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.653.124-1.282.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>;
const CloseIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>;
const GitBranchIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m-4-4a3 3 0 013-3h2a3 3 0 013 3m-3-3V5a3 3 0 013-3h2" /></svg>;
const FetchIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 mr-1.5 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>;
const PullIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 mr-1.5 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>;
const FolderIcon = ({ open }: { open?: boolean }) => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-sky-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d={open ? "M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" : "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"} /></svg>;
const GenericFileIcon = ({ className = 'text-gray-400' }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 mr-2 shrink-0 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>;
const JSIcon = () => <div className="h-5 w-5 mr-2 shrink-0 text-yellow-400 font-bold text-xs flex items-center justify-center bg-yellow-900/50 rounded-sm">JS</div>;
const TSIcon = () => <div className="h-5 w-5 mr-2 shrink-0 text-blue-400 font-bold text-xs flex items-center justify-center bg-blue-900/50 rounded-sm">TS</div>;
const ReactIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 shrink-0 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z" /><ellipse cx="12" cy="12" rx="4" ry="10" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="4" ry="10" transform="rotate(120 12 12)" /><ellipse cx="12" cy="12" rx="4" ry="10" transform="rotate(180 12 12)" /></svg>;
const HTMLIcon = () => <div className="h-5 w-5 mr-2 shrink-0 text-orange-500 font-bold text-xs flex items-center justify-center bg-orange-900/50 rounded-sm">HT</div>;
const CSSIcon = () => <div className="h-5 w-5 mr-2 shrink-0 text-blue-500 font-bold text-xs flex items-center justify-center bg-blue-900/50 rounded-sm">CS</div>;
const JSONIcon = () => <div className="h-5 w-5 mr-2 shrink-0 text-green-500 font-bold text-xs flex items-center justify-center bg-green-900/50 rounded-sm">{`{}`}</div>;
const GitIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 4.5l-9 9m9 0l-9-9" /></svg>;
const CommitAllIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>;
const ChevronDownIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>;

const FileIcon = ({ extension }: { extension?: string }) => {
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

// --- VSCODE-LIKE COMPONENTS ---

const ActivityBar: React.FC<{ activeView: string; setActiveView: (view: string) => void }> = ({ activeView, setActiveView }) => {
    const views = [
        { id: 'explorer', icon: <ExplorerIcon />, label: 'Explorer' },
        { id: 'source-control', icon: <SourceControlIcon />, label: 'Source Control' },
        { id: 'agents', icon: <AgentsIcon />, label: 'Agents' },
    ];
    return (
        <div className="w-12 bg-gray-800 flex flex-col items-center py-2 space-y-2 shrink-0 border-r border-gray-700">
            {views.map(view => (
                <button
                    key={view.id}
                    onClick={() => setActiveView(view.id)}
                    className={`p-2 rounded-md transition-colors ${activeView === view.id ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700/50 hover:text-white'}`}
                    title={view.label}
                >
                    {view.icon}
                </button>
            ))}
        </div>
    );
};

const CollapsibleSection: React.FC<{ title: string; children: React.ReactNode; count?: number; headerActions?: React.ReactNode; defaultOpen?: boolean }> = ({ title, children, count, headerActions, defaultOpen = true }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div>
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between text-left text-xs font-bold text-gray-400 hover:text-white p-2 uppercase">
                <div className="flex items-center">
                    <span className={`transform transition-transform ${isOpen ? 'rotate-90' : ''} mr-1`}><ChevronDownIcon /></span>
                    <span>{title}</span>
                </div>
                {isOpen && headerActions}
            </button>
            {isOpen && <div className="pl-2">{children}</div>}
        </div>
    );
};

const FileTree: React.FC<{ files: FileNode[]; activeFile: string | null; onSelect: (path: string) => void; openFolders: Set<string>; toggleFolder: (path: string) => void; }> = ({ files, activeFile, onSelect, openFolders, toggleFolder }) => {
    const renderNode = (node: FileNode, level = 0) => {
        if (node.type === 'folder') {
            const isOpen = openFolders.has(node.path);
            return (
                <div key={node.path}>
                    <button onClick={() => toggleFolder(node.path)} className="w-full text-left flex items-center py-1 text-gray-300 hover:bg-gray-700/50 rounded" style={{ paddingLeft: `${level * 16 + 4}px` }}>
                        <span className={`transform transition-transform text-gray-500 mr-1 ${isOpen ? 'rotate-90' : ''}`}><ChevronDownIcon /></span>
                        <FolderIcon open={isOpen} />
                        <span>{node.name}</span>
                    </button>
                    {isOpen && node.children?.map(child => renderNode(child, level + 1))}
                </div>
            );
        }

        return (
            <button key={node.path} onClick={() => onSelect(node.path)} className={`w-full text-left flex items-center py-1 rounded ${activeFile === node.path ? 'bg-blue-600/30 text-white' : 'text-gray-300 hover:bg-gray-700/50'}`} style={{ paddingLeft: `${level * 16 + 4}px` }}>
                <FileIcon extension={node.extension} />
                <span>{node.name}</span>
            </button>
        );
    };

    return <div>{files.map(node => renderNode(node))}</div>;
};

const FileExplorer: React.FC<{ files: FileNode[]; activeFile: string | null; onSelect: (path: string) => void }> = ({ files, activeFile, onSelect }) => {
    const [openFolders, setOpenFolders] = useState(new Set(['/src']));
    const toggleFolder = (path: string) => {
        setOpenFolders(prev => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    };

    return (
        <div className="h-full overflow-y-auto">
            <CollapsibleSection title="Explorer">
                <FileTree files={files} activeFile={activeFile} onSelect={onSelect} openFolders={openFolders} toggleFolder={toggleFolder} />
            </CollapsibleSection>
        </div>
    );
};

const SourceControlPanel: React.FC<{
    modifiedFiles: string[]; untrackedFiles: string[]; stagedFiles: string[]; commits: Commit[]; commitMessage: string;
    onCommitMessageChange: (msg: string) => void; onStage: (path: string) => void; onUnstage: (path: string) => void;
    onStageAll: () => void; onCommit: () => void; onCommitAll: () => void; onFetch: () => void; onPull: () => void;
    pullableCommits: number;
}> = (props) => {
    const { modifiedFiles, untrackedFiles, stagedFiles, commits, commitMessage, onCommitMessageChange, onStage, onUnstage, onStageAll, onCommit, onCommitAll, onFetch, onPull, pullableCommits } = props;
    const unstagedChanges = [...modifiedFiles, ...untrackedFiles];

    return (
        <div className="h-full p-2 overflow-y-auto text-white text-sm">
            <div className="flex space-x-2 mb-4">
                 <button onClick={onFetch} className="w-full flex items-center justify-center px-2 py-1.5 border border-gray-600 text-sm font-medium rounded-md text-white bg-gray-700 hover:bg-gray-600">
                    <FetchIcon /> Fetch
                </button>
                <button onClick={onPull} disabled={pullableCommits === 0} className="w-full flex items-center justify-center px-2 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed relative">
                    <PullIcon /> Pull
                    {pullableCommits > 0 && <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs font-bold">{pullableCommits}</span>}
                </button>
            </div>
            <textarea value={commitMessage} onChange={(e) => onCommitMessageChange(e.target.value)} placeholder="Message" className="w-full p-2 bg-gray-900 border border-gray-700 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" rows={3} />
            <div className="flex space-x-2 mt-2">
                <button onClick={onCommit} disabled={stagedFiles.length === 0 || !commitMessage.trim()} className="w-full px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed">Commit ({stagedFiles.length})</button>
                <button onClick={onCommitAll} disabled={unstagedChanges.length === 0 || !commitMessage.trim()} className="w-full flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed"><CommitAllIcon /> Commit All ({unstagedChanges.length})</button>
            </div>

            <div className="space-y-2 mt-4">
                <CollapsibleSection title="Staged Changes" count={stagedFiles.length}>
                    {stagedFiles.map(path => (<div key={path} className="flex items-center justify-between p-1.5 hover:bg-gray-700/50 rounded-md group"><span className="flex items-center"><FileIcon extension={path.split('.').pop()} />{path}</span><button onClick={() => onUnstage(path)} className="text-xs opacity-0 group-hover:opacity-100 bg-gray-600 hover:bg-gray-500 px-2 py-0.5 rounded">-</button></div>))}
                </CollapsibleSection>
                <CollapsibleSection title="Changes" count={unstagedChanges.length} headerActions={<button onClick={onStageAll} className="text-xs hover:bg-gray-600 p-1 rounded" title="Stage All Changes">Stage All</button>}>
                    {unstagedChanges.map(path => (<div key={path} className="flex items-center justify-between p-1.5 hover:bg-gray-700/50 rounded-md group"><span className="flex items-center"><FileIcon extension={path.split('.').pop()} />{path}<span className="ml-2 text-xs text-yellow-400">{untrackedFiles.includes(path) ? 'U' : 'M'}</span></span><button onClick={() => onStage(path)} className="text-xs opacity-0 group-hover:opacity-100 bg-gray-600 hover:bg-gray-500 px-2 py-0.5 rounded">+</button></div>))}
                </CollapsibleSection>
                <CollapsibleSection title="Commits" count={commits.length} defaultOpen={false}>
                     {commits.map(commit => (<div key={commit.id} className="p-2 border-b border-gray-700/50"><p className="font-semibold text-blue-400">{commit.message}</p><p className="text-xs text-gray-400">{commit.id} by {commit.author} on {new Date(commit.date).toLocaleString()}</p></div>))}
                </CollapsibleSection>
            </div>
        </div>
    );
};

const AgentPanel: React.FC<{ agents: Agent[] }> = ({ agents }) => (
    <div className="h-full p-2 text-sm">
        <CollapsibleSection title="Active Agents">
            <div className="space-y-2">
                {agents.map(agent => (
                    <div key={agent.name} className="bg-gray-700/50 p-3 rounded-md">
                        <div className="flex justify-between items-center">
                            <span className="font-semibold text-white">{agent.name}</span>
                            <span className={`px-2 py-0.5 text-xs rounded-full ${agent.status === 'Active' ? 'bg-green-500 text-green-900' : 'bg-gray-500 text-gray-900'}`}>{agent.status}</span>
                        </div>
                        {agent.task && <p className="text-sm text-gray-400 mt-1">{agent.task}</p>}
                    </div>
                ))}
            </div>
        </CollapsibleSection>
    </div>
);

const Sidebar: React.FC<{ activeView: string; files: FileNode[]; activeFile: string | null; onFileSelect: (path: string) => void; scmData: any }> = ({ activeView, files, activeFile, onFileSelect, scmData }) => {
    const viewMap: { [key: string]: { title: string; component: React.ReactNode } } = {
        'explorer': { title: 'Explorer', component: <FileExplorer files={files} activeFile={activeFile} onSelect={onFileSelect} /> },
        'source-control': { title: 'Source Control', component: <SourceControlPanel {...scmData} /> },
        'agents': { title: 'Agents', component: <AgentPanel agents={scmData.agents} /> }
    };

    const currentView = viewMap[activeView] || viewMap['explorer'];

    return (
        <div className="w-64 bg-gray-800 flex flex-col shrink-0 border-r border-gray-700">
            <h2 className="text-sm font-semibold p-2.5 uppercase tracking-wider text-gray-300">{currentView.title}</h2>
            <div className="flex-grow overflow-y-auto">{currentView.component}</div>
        </div>
    );
};

const Editor: React.FC<{ file: FileNode | null; onContentChange: (path: string, content: string) => void }> = ({ file, onContentChange }) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const monacoInstanceRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

    useEffect(() => {
        if (editorRef.current && !monacoInstanceRef.current) {
            monacoInstanceRef.current = monaco.editor.create(editorRef.current, {
                theme: 'vs-dark',
                automaticLayout: true,
                minimap: { enabled: true },
                scrollBeyondLastLine: false,
                fontSize: 14,
            });
            monacoInstanceRef.current.onDidChangeModelContent(() => {
                if (file && monacoInstanceRef.current) {
                    onContentChange(file.path, monacoInstanceRef.current.getValue());
                }
            });
        }
    }, []);

    useEffect(() => {
        if (file && monacoInstanceRef.current) {
            let model = monaco.editor.getModel(monaco.Uri.parse(file.path));
            if (!model) {
                const languageMap: { [key: string]: string } = { 'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript', 'css': 'css', 'html': 'html', 'json': 'json' };
                model = monaco.editor.createModel(file.content || '', languageMap[file.extension || ''] || 'plaintext', monaco.Uri.parse(file.path));
            } else if (model.getValue() !== file.content) {
                model.setValue(file.content || '');
            }
            monacoInstanceRef.current.setModel(model);
        }
    }, [file]);

    return (
        <div className="h-full w-full bg-[#1E1E1E]">
            {file ? <div ref={editorRef} className="h-full w-full"></div> : <div className="flex items-center justify-center h-full text-gray-500">Select a file to begin editing.</div>}
        </div>
    );
};

const PreviewPanel: React.FC<{ files: FileNode[] }> = ({ files }) => {
    const [iframeContent, setIframeContent] = useState('');
    const findFileByPath = (nodes: FileNode[], path: string): FileNode | null => {
        for (const node of nodes) {
            if (node.path === path) return node;
            if (node.children) {
                const found = findFileByPath(node.children, path);
                if (found) return found;
            }
        }
        return null;
    };
    useEffect(() => {
        const transpileTsx = (code: string) => {
            try { return window.Babel.transform(code, { presets: ['react', 'typescript'], filename: 'App.tsx' }).code; } catch (e) { console.error('Babel error:', e); return `document.body.innerHTML = '<pre style="color:red;">${e.message}</pre>'`; }
        };
        const buildProject = () => {
            const htmlFile = findFileByPath(files, '/public/index.html');
            if (!htmlFile || !htmlFile.content) { setIframeContent('<html><body>No index.html found.</body></html>'); return; }
            let content = htmlFile.content;
            const scriptTags = Array.from(content.matchAll(/<script[^>]+src="([^"]+)"[^>]*><\/script>/g));
            const linkTags = Array.from(content.matchAll(/<link[^>]+href="([^"]+)"[^>]*>/g));
            const replacements = new Map<string, string>();
            for (const match of [...scriptTags, ...linkTags]) {
                const path = match[1];
                const file = findFileByPath(files, path);
                if (file && typeof file.content === 'string') {
                    let fileContent = file.content;
                    if (file.extension === 'tsx' || file.extension === 'ts') { fileContent = transpileTsx(fileContent); }
                    const blob = new Blob([fileContent], { type: file.extension === 'css' ? 'text/css' : 'application/javascript' });
                    replacements.set(path, URL.createObjectURL(blob));
                }
            }
            for(const [path, url] of replacements) { content = content.replace(path, url); }
            setIframeContent(content);
        };
        buildProject();
    }, [files]);
    return <div className="h-full w-full bg-white"><iframe srcDoc={iframeContent} title="Preview" sandbox="allow-scripts allow-same-origin" className="w-full h-full border-none" /></div>;
};

const Terminal: React.FC<{ logs: TerminalLog[] }> = ({ logs }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [logs]);
    return (<div ref={scrollRef} className="h-full bg-[#1E1E1E] text-white font-mono text-sm p-4 overflow-y-auto"><pre>{logs.map(log => (<div key={log.id} className="flex"><span className="text-gray-500 mr-4">{log.time}</span><span className="text-cyan-400 mr-2">{`[${log.source}]`}</span><p className="flex-1 whitespace-pre-wrap">{log.message}</p></div>))}</pre></div>);
};

const EditorPanel: React.FC<{ openFiles: FileNode[], activeFile: string | null; onSelectFile: (path: string) => void; onCloseFile: (path: string) => void; onContentChange: (path: string, content: string) => void; files: FileNode[] }> = ({ openFiles, activeFile, onSelectFile, onCloseFile, onContentChange, files }) => {
    const [view, setView] = useState<'editor' | 'preview'>('editor');
    const activeFileNode = useMemo(() => openFiles.find(f => f.path === activeFile) || null, [openFiles, activeFile]);

    return (
        <div className="flex-grow flex flex-col bg-gray-800 overflow-hidden">
            <div className="flex items-center justify-between bg-gray-800 border-b border-gray-700 shrink-0">
                <div className="flex items-center overflow-x-auto">
                    {openFiles.map(file => (
                        <div key={file.path} className={`flex items-center p-2 text-sm border-r border-gray-700 cursor-pointer whitespace-nowrap ${activeFile === file.path ? 'bg-[#1E1E1E] text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}>
                            <button onClick={() => onSelectFile(file.path)} className="flex items-center"><FileIcon extension={file.extension} /><span>{file.name}</span></button>
                            <button onClick={(e) => { e.stopPropagation(); onCloseFile(file.path); }} className="ml-3 p-0.5 rounded hover:bg-gray-600"><CloseIcon /></button>
                        </div>
                    ))}
                </div>
                <div className="flex p-1">
                    <button onClick={() => setView('editor')} className={`px-3 py-1 text-sm rounded-md ${view === 'editor' ? 'bg-gray-700' : 'hover:bg-gray-700/50'}`}>Editor</button>
                    <button onClick={() => setView('preview')} className={`px-3 py-1 text-sm rounded-md ${view === 'preview' ? 'bg-gray-700' : 'hover:bg-gray-700/50'}`}>Preview</button>
                </div>
            </div>
            <div className="flex-grow relative">
                {view === 'editor' ? <Editor file={activeFileNode} onContentChange={onContentChange} /> : <PreviewPanel files={files} />}
            </div>
        </div>
    );
};

const BottomPanel: React.FC<{ logs: TerminalLog[] }> = ({ logs }) => {
    const [activeTab, setActiveTab] = useState('terminal');
    return (
        <div className="h-48 bg-gray-800 flex flex-col shrink-0 border-t border-gray-700">
            <div className="flex bg-gray-800 shrink-0">
                <button onClick={() => setActiveTab('terminal')} className={`px-4 py-1.5 text-sm uppercase tracking-wider ${activeTab === 'terminal' ? 'bg-[#1E1E1E] text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}>Terminal</button>
                <button onClick={() => setActiveTab('problems')} className={`px-4 py-1.5 text-sm uppercase tracking-wider ${activeTab === 'problems' ? 'bg-[#1E1E1E] text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}>Problems</button>
            </div>
            <div className="flex-grow overflow-hidden">
                {activeTab === 'terminal' && <Terminal logs={logs} />}
                {activeTab === 'problems' && <div className="p-4 text-gray-500 text-sm">No problems have been detected.</div>}
            </div>
        </div>
    );
};

const StatusBar: React.FC = () => (
    <div className="h-6 bg-gray-800 border-t border-gray-700 flex items-center justify-between px-4 text-sm text-gray-300 shrink-0">
        <div className="flex items-center">
            <GitBranchIcon /> main
        </div>
        <div>UTF-8</div>
    </div>
);

// --- MAIN APP COMPONENT ---

const App: React.FC = () => {
    // Core State
    const [files, setFiles] = useState<FileNode[]>(initialFiles);
    const [agents, setAgents] = useState<Agent[]>(initialAgents);
    const [terminalLogs, setTerminalLogs] = useState<TerminalLog[]>([]);

    // UI State
    const [activeView, setActiveView] = useState('explorer'); // explorer, source-control, agents
    const [openFiles, setOpenFiles] = useState<string[]>(['/src/App.tsx']);
    const [activeFile, setActiveFile] = useState<string | null>('/src/App.tsx');

    // Git State
    const [originalFileContents, setOriginalFileContents] = useState(new Map<string, string>());
    const [modifiedFiles, setModifiedFiles] = useState<string[]>([]);
    const [untrackedFiles, setUntrackedFiles] = useState<string[]>([]);
    const [stagedFiles, setStagedFiles] = useState<string[]>([]);
    const [commits, setCommits] = useState<Commit[]>([]);
    const [commitMessage, setCommitMessage] = useState('');
    const [remoteCommits, setRemoteCommits] = useState<Commit[]>([]);
    const [pullableCommits, setPullableCommits] = useState(0);

    // --- UTILITY FUNCTIONS ---
    const findFile = useCallback((nodes: FileNode[], path: string): FileNode | null => {
        for (const node of nodes) {
            if (node.path === path) return node;
            if (node.children) {
                const found = findFile(node.children, path);
                if (found) return found;
            }
        }
        return null;
    }, []);

    const updateFileContent = useCallback((nodes: FileNode[], path: string, content: string): FileNode[] => {
        return nodes.map(node => {
            if (node.path === path) return { ...node, content };
            if (node.children) return { ...node, children: updateFileContent(node.children, path, content) };
            return node;
        });
    }, []);
    
    const addTerminalLog = (source: string, message: string) => {
        setTerminalLogs(prev => [...prev, { id: Date.now() + Math.random(), time: new Date().toLocaleTimeString(), source, message }]);
    };

    // --- INITIALIZATION ---
    const initGit = () => {
        const initialMap = new Map<string, string>();
        const untracked: string[] = [];
        const traverse = (nodes: FileNode[]) => {
            nodes.forEach(node => {
                if (node.type === 'file' && typeof node.content === 'string') untracked.push(node.path);
                else if (node.children) traverse(node.children);
            });
        };
        traverse(files);
        setOriginalFileContents(initialMap);
        setUntrackedFiles(untracked);
        addTerminalLog('git', 'Initialized empty Git repository.');
        const remoteCommit: Commit = { id: 'remote001', message: 'feat: initial remote setup', author: 'Remote', date: new Date(Date.now() - 100000).toISOString() };
        setRemoteCommits([remoteCommit]);
    };
    useEffect(initGit, []);
    
    // --- GIT FILE TRACKING EFFECT ---
    useEffect(() => {
        const modified: string[] = [];
        const traverse = (nodes: FileNode[]) => {
            nodes.forEach(node => {
                if (node.type === 'file' && typeof node.content === 'string') {
                    if (originalFileContents.has(node.path) && originalFileContents.get(node.path) !== node.content && !stagedFiles.includes(node.path)) {
                        modified.push(node.path);
                    }
                } else if (node.children) {
                    traverse(node.children);
                }
            });
        };
        traverse(files);
        setModifiedFiles(modified);
    }, [files, originalFileContents, stagedFiles]);

    // --- EVENT HANDLERS ---
    const handleOpenFile = (path: string) => {
        if (!openFiles.includes(path)) {
            setOpenFiles(prev => [...prev, path]);
        }
        setActiveFile(path);
    };

    const handleCloseFile = (path: string) => {
        const newOpenFiles = openFiles.filter(p => p !== path);
        setOpenFiles(newOpenFiles);
        if (activeFile === path) {
            setActiveFile(newOpenFiles[newOpenFiles.length - 1] || null);
        }
    };

    const handleFileContentChange = useCallback((path: string, content: string) => {
        setFiles(prevFiles => updateFileContent(prevFiles, path, content));
    }, [updateFileContent]);

    // --- Git Handlers ---
    const handleStage = (path: string) => { setStagedFiles(prev => [...prev, path]); setModifiedFiles(prev => prev.filter(p => p !== path)); setUntrackedFiles(prev => prev.filter(p => p !== path)); addTerminalLog('git', `Staged ${path}`); };
    const handleUnstage = (path: string) => { setStagedFiles(prev => prev.filter(p => p !== path)); if (originalFileContents.has(path)) { setModifiedFiles(prev => [...prev, path]); } else { setUntrackedFiles(prev => [...prev, path]); } addTerminalLog('git', `Unstaged ${path}`); };
    const handleStageAll = () => { const all = [...modifiedFiles, ...untrackedFiles]; setStagedFiles(prev => [...new Set([...prev, ...all])]); setModifiedFiles([]); setUntrackedFiles([]); addTerminalLog('git', `Staged ${all.length} files.`); };
    const performCommit = (filesToCommit: string[], message: string) => {
        const newCommit: Commit = { id: Math.random().toString(36).substring(2, 9), message, author: 'You', date: new Date().toISOString() };
        setCommits(prev => [newCommit, ...prev]);
        addTerminalLog('git', `Committed ${filesToCommit.length} file(s): "${message}"`);
        const newOriginals = new Map(originalFileContents);
        filesToCommit.forEach(path => { const file = findFile(files, path); if (file) newOriginals.set(path, file.content || ''); });
        setOriginalFileContents(newOriginals);
        setCommitMessage('');
    };
    const handleCommit = () => { if (stagedFiles.length === 0 || !commitMessage.trim()) return; performCommit(stagedFiles, commitMessage); setStagedFiles([]); };
    const handleCommitAll = () => { const all = [...new Set([...modifiedFiles, ...untrackedFiles])]; if (all.length === 0 || !commitMessage.trim()) return; addTerminalLog('git', `Staged ${all.length} files for commit.`); performCommit(all, commitMessage); setStagedFiles([]); setModifiedFiles([]); setUntrackedFiles([]); };
    const handleFetch = () => { addTerminalLog('git', 'Fetching from remote...'); setTimeout(() => { const newCommits = remoteCommits.filter(rc => !commits.some(lc => lc.id === rc.id)); setPullableCommits(newCommits.length); addTerminalLog('git', newCommits.length > 0 ? `Fetch complete. Found ${newCommits.length} new commit(s).` : 'Fetch complete. Already up-to-date.'); }, 1000); };
    const handlePull = () => { addTerminalLog('git', 'Pulling from remote...'); const newCommits = remoteCommits.filter(rc => !commits.some(lc => lc.id === rc.id)); setCommits(prev => [...newCommits, ...prev]); setPullableCommits(0); addTerminalLog('git', `Pull complete. Merged ${newCommits.length} commit(s).`); };

    const scmData = { modifiedFiles, untrackedFiles, stagedFiles, commits, commitMessage, onCommitMessageChange: setCommitMessage, onStage: handleStage, onUnstage: handleUnstage, onStageAll: handleStageAll, onCommit: handleCommit, onCommitAll: handleCommitAll, onFetch: handleFetch, onPull: handlePull, pullableCommits, agents };
    const openFileNodes = useMemo(() => openFiles.map(path => findFile(files, path)).filter((f): f is FileNode => f !== null), [openFiles, files, findFile]);

    return (
        <div className="h-screen w-screen bg-gray-900 text-white flex flex-col font-sans text-sm">
            <main className="flex-grow flex overflow-hidden">
                <ActivityBar activeView={activeView} setActiveView={setActiveView} />
                <Sidebar activeView={activeView} files={files} activeFile={activeFile} onFileSelect={handleOpenFile} scmData={scmData} />
                <div className="flex-grow flex flex-col overflow-hidden bg-[#1E1E1E]">
                    <EditorPanel openFiles={openFileNodes} activeFile={activeFile} onSelectFile={setActiveFile} onCloseFile={handleCloseFile} onContentChange={handleFileContentChange} files={files} />
                    <BottomPanel logs={terminalLogs} />
                </div>
            </main>
            <StatusBar />
        </div>
    );
};

export default App;
