
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
            'js': 'babel', 'jsx': 'babel', 'ts': 'babel-ts', 'tsx': 'babel-ts', 'css': 'css'
        };
        const pluginMap: { [key: string]: any[] } = {
            'js': [pluginBabel, pluginEstree], 'jsx': [pluginBabel, pluginEstree],
            'ts': [pluginBabel, pluginEstree], 'tsx': [pluginBabel, pluginEstree],
            'css': [pluginPostcss]
        };
        const parser = parserMap[extension];
        const plugins = pluginMap[extension];

        if (!parser || !plugins) {
            return content; // Don't format if not a supported file type
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
        return content; // Return original content on error
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

const ErrorIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
);

const FallbackComponent = ({ error }: { error: Error | null }) => (
    <div className="bg-gray-900 text-white h-screen w-screen flex items-center justify-center font-sans">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 max-w-lg text-center shadow-2xl">
            <ErrorIcon />
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

interface Message {
  id: number;
  sender: 'user' | 'ai' | 'system';
  content: string;
  plan?: any[];
  error?: string;
}

interface PullRequest {
  id: number;
  title: string;
  author: string;
  branch: string;
  changes: string;
  tests: {
    passed: number;
    failed: number;
    coverage: string;
  };
}

interface TerminalLog {
    id: number;
    time: string;
    source: string;
    message: string;
}

interface AgentMessage {
    id: number;
    time: string;
    from: string;
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
            { name: 'index.html', type: 'file', extension: 'html', path: '/public/index.html', content: '<div id="root"></div>' },
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
    { name: 'package.json', type: 'file', extension: 'json', path: '/package.json', content: '{ "name": "my-app" }' },
    { name: '.gitignore', type: 'file', path: '/.gitignore', content: `# See https://help.github.com/articles/ignoring-files/ for more about ignoring files.

# dependencies
node_modules/

# production
dist/
build/
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*

# misc
.DS_Store
.vscode/
` },
];

const initialAgents: Agent[] = [
    { name: 'Orchestrator', status: 'Idle' },
    { name: 'Frontend-Dev', status: 'Idle' },
    { name: 'Backend-Dev', status: 'Idle' },
    { name: 'QA-Tester', status: 'Idle' },
];


// --- ICONS ---
const FolderIcon = ({ open }: { open?: boolean }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-sky-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {open ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" /> : <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />}
    </svg>
);

const GenericFileIcon = ({ className = 'text-gray-400' } : { className?: string}) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 mr-2 ${className} shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
  </svg>
);

const HtmlIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 shrink-0 text-[#E34F26]" fill="currentColor" viewBox="0 0 24 24"><path d="M1.5 0h21l-1.91 21.563L11.977 24l-8.564-2.438L1.5 0zM12 19.45l5.438-1.582L17.99 6.84H6.8l.533 6.01h6.826l-.4 4.512-2.16.604-2.138-.602-.133-1.496H6.182l.24 2.65L12 19.45z"/></svg>
);

const JsonIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 shrink-0 text-yellow-400" fill="currentColor" viewBox="0 0 24 24"><path d="M16 12.016c0-1.094-.906-2.016-2-2.016v-4c3.313 0 6 2.688 6 6s-2.688 6-6 6v-4c1.094 0 2-.922 2-1.984zM8 11.984c0-1.062.906-1.984 2-1.984v4c-1.094 0-2-.922-2-2.016zM22 12c0 5.531-4.469 10-10 10S2 17.531 2 12 6.469 2 12 2s10 4.469 10 10z"/></svg>
);

const JsIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 shrink-0" fill="#F7DF1E" viewBox="0 0 24 24">
        <rect width="24" height="24" fill="black" />
        <path d="M17.4 18.2c.4-.3.6-.8.6-1.3 0-1.1-.8-1.7-2.3-1.7h-1.4v3.4h1.5c1.4 0 2.1-.6 2.1-1.4zm-1.5-.9h-.6v-1.1h.6c.6 0 .9.2.9.6 0 .3-.3.5-.9.5zm-3.8 2.2h1.6v-6.8H10v5.4h2.1v1.4zm3.8-11.8H6.5v13h11.1V6.7z"/>
    </svg>
);

const TsxIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 shrink-0" fill="#3178C6" viewBox="0 0 24 24">
        <rect width="24" height="24" />
        <path fill="white" d="M12.2 11.4v1.8h-1.8v1.3h1.8v1.8h1.4v-1.8h1.8v-1.3h-1.8v-1.8h-1.4zM9.8 11.9c0-.4.3-.7.7-.7h1.6v-1.4H10c-1.2 0-2 .8-2 2.1 0 1.2.7 2 2 2h1.5v-1.4h-1.6c-.4 0-.7-.3-.7-.6zm5.6-2.3v-.9H9.4v1.4h1.7c.3 0 .5.2.5.5v4.3c0 .3-.2.5-.5.5H9.4v1.4h6v-.9h-4.4v-1.2h3.2v-.9h-3.2v-1.3h4.6z"/>
    </svg>
);

const CssIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 shrink-0 text-[#1572B6]" fill="currentColor" viewBox="0 0 24 24"><path d="M1.5 0h21l-1.91 21.563L11.977 24l-8.564-2.438L1.5 0zM19.42 6.55l-9.13 3.996.113.454.112.455h4.22l-.25 2.817-2.13.588-2.13-.587-.14-1.58H6.3l.28 3.17L12 17.4l5.42-1.49.72-8.36z"/></svg>
);

const NewFileIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
);

const NewFolderIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m-9 4h16a2 2 0 002-2V7a2 2 0 00-2-2h-5l-2-2H6a2 2 0 00-2 2v11a2 2 0 002 2z" />
    </svg>
);

const FormatCodeIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
);

const SourceControlIcon = ({className}: {className?: string}) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.21-1.02-.584-1.39l-4.5-4.5a2.25 2.25 0 00-3.182 0l-1.82 1.82a2.25 2.25 0 01-3.182 0l-4.5-4.5a2.25 2.25 0 00-3.182 0l-1.82 1.82A2.25 2.25 0 002.25 6.75z" />
    </svg>
);

const ExplorerIcon = ({className}: {className?: string}) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
         <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.75h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5M21 21V3M3 3v18" />
    </svg>
);

const FileIcon = ({ extension, name }: { extension?: string, name: string }) => {
  if (name === '.gitignore') {
    return <GenericFileIcon className="text-gray-500" />;
  }
  switch (extension) {
    case 'html': return <HtmlIcon />;
    case 'json': return <JsonIcon />;
    case 'js': return <JsIcon />;
    case 'tsx': case 'ts': return <TsxIcon />;
    case 'css': return <CssIcon />;
    default: return <GenericFileIcon />;
  }
};


// --- UI COMPONENTS ---

const HighlightedText = ({ text, highlight }: { text: string; highlight: string }) => {
  if (!highlight.trim()) {
    return <span>{text}</span>;
  }
  const regex = new RegExp(`(${highlight})`, 'gi');
  const parts = text.split(regex);
  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === highlight.toLowerCase() ? (
          <span key={i} className="bg-yellow-500 text-black rounded-sm">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </span>
  );
};

const FileTree = ({
    nodes,
    onSelectFile,
    selectedFile,
    searchTerm,
}: {
    nodes: FileNode[];
    onSelectFile: (node: FileNode) => void;
    selectedFile: FileNode | null;
    searchTerm: string;
}) => {
    const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});

    useEffect(() => {
        // If there's a search term, expand all folders to show the results within them.
        if (searchTerm) {
            const allFolderPaths: Record<string, boolean> = {};
            const expandFolders = (nodes: FileNode[]) => {
                nodes.forEach(node => {
                    if (node.type === 'folder') {
                        allFolderPaths[node.path] = true;
                        if (node.children) expandFolders(node.children);
                    }
                });
            };
            expandFolders(nodes);
            // We only expand folders during a search. When the search is cleared,
            // the user's manually set open/closed states are preserved.
            setOpenFolders(allFolderPaths);
        }
    }, [searchTerm, nodes]);

    const toggleFolder = (path: string) => {
        setOpenFolders(prev => ({ ...prev, [path]: !prev[path] }));
    };

    const filterNodes = (nodes: FileNode[], term: string): FileNode[] => {
        if (!term.trim()) return nodes;
        const lowerCaseTerm = term.toLowerCase();

        return nodes.reduce((acc: FileNode[], node) => {
            if (node.type === 'folder') {
                const filteredChildren = node.children ? filterNodes(node.children, term) : [];
                if (node.name.toLowerCase().includes(lowerCaseTerm) || filteredChildren.length > 0) {
                    acc.push({ ...node, children: filteredChildren });
                }
            } else { // File
                if (node.name.toLowerCase().includes(lowerCaseTerm)) {
                    acc.push(node);
                }
            }
            return acc;
        }, []);
    };

    const filteredNodes = useMemo(() => filterNodes(nodes, searchTerm), [nodes, searchTerm]);

    const renderNode = (node: FileNode, depth: number) => {
        const isFolder = node.type === 'folder';
        const isOpen = openFolders[node.path] || false;
        const isSelected = selectedFile?.path === node.path;

        if (isFolder) {
            return (
                <div key={node.path}>
                    <div
                        onClick={() => toggleFolder(node.path)}
                        className={`flex items-center cursor-pointer py-1 px-2 rounded-md ${ isSelected ? 'bg-blue-800' : 'hover:bg-gray-700' }`}
                        style={{ paddingLeft: `${depth * 1.25}rem` }}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 mr-1 text-gray-400 shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <FolderIcon open={isOpen} />
                        <span className="truncate font-semibold text-gray-200"><HighlightedText text={node.name} highlight={searchTerm} /></span>
                    </div>
                    {isOpen && node.children && (
                        <div>
                            {node.children.sort((a,b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)).map(child => renderNode(child, depth + 1))}
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div
                key={node.path}
                onClick={() => onSelectFile(node)}
                className={`flex items-center cursor-pointer py-1 px-2 rounded-md ${ isSelected ? 'bg-blue-800' : 'hover:bg-gray-700' }`}
                style={{ paddingLeft: `${depth * 1.25}rem` }}
            >
                <div className="w-5 mr-1 shrink-0"></div>
                <FileIcon extension={node.extension} name={node.name} />
                <span className="truncate text-gray-300"><HighlightedText text={node.name} highlight={searchTerm} /></span>
            </div>
        );
    };

    return (
        <div>
            {filteredNodes.sort((a,b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)).map(node => renderNode(node, 0))}
        </div>
    );
};

const ProjectExplorer = ({ files, onSelectFile, selectedFile, onCreateFile, onCreateFolder }: { files: FileNode[], onSelectFile: (node: FileNode) => void, selectedFile: FileNode | null, onCreateFile: (filename: string) => void, onCreateFolder: (foldername: string) => void }) => {
    const [searchTerm, setSearchTerm] = useState('');

    const handleNewFileClick = () => {
        const fileName = prompt("Enter new file name:");
        if (fileName) {
            onCreateFile(fileName);
        }
    };

    const handleNewFolderClick = () => {
        const folderName = prompt("Enter new folder name:");
        if (folderName) {
            onCreateFolder(folderName);
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-2 px-2">
                <h2 className="text-lg font-semibold">Project Explorer</h2>
                <div className="flex items-center space-x-1">
                    <button onClick={handleNewFolderClick} className="text-gray-400 hover:text-white p-1 rounded-md hover:bg-gray-700" title="New Folder">
                        <NewFolderIcon />
                    </button>
                    <button onClick={handleNewFileClick} className="text-gray-400 hover:text-white p-1 rounded-md hover:bg-gray-700" title="New File">
                        <NewFileIcon />
                    </button>
                </div>
            </div>
            <div className="relative mb-2 px-1">
                <input
                    type="text"
                    placeholder="Search files..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-600 rounded-md py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <div className="overflow-auto flex-grow custom-scrollbar">
                <FileTree nodes={files} onSelectFile={onSelectFile} selectedFile={selectedFile} searchTerm={searchTerm} />
            </div>
        </div>
    );
};

const CollapsibleSection = ({ title, count, children, defaultOpen = true }: { title: string, count: number, children: React.ReactNode, defaultOpen?: boolean }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    if (count === 0 && title !== "History") return null;

    return (
        <div>
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between text-left p-1.5 hover:bg-gray-700 rounded-md">
                <div className="flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 mr-1 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    <h3 className="font-bold text-sm uppercase tracking-wider">{title}</h3>
                </div>
                <span className="text-xs bg-gray-600 rounded-full px-2 py-0.5">{count}</span>
            </button>
            {isOpen && <div className="mt-1 pl-2 space-y-1">{children}</div>}
        </div>
    );
};

const ChangeItem = ({ path, onAction, actionIcon }: { path: string, onAction: () => void, actionIcon: '+' | '-' }) => (
    <div className="group flex items-center justify-between text-sm p-1 rounded-md hover:bg-gray-700/50">
        <span className="truncate">{path}</span>
        <button onClick={onAction} className="opacity-0 group-hover:opacity-100 bg-gray-600 hover:bg-blue-600 rounded-sm p-0.5" title={actionIcon === '+' ? 'Stage Change' : 'Unstage Change'}>
            {actionIcon === '+' ? 
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg> :
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
            }
        </button>
    </div>
);


const SourceControlPanel = ({
    isRepoInitialized,
    onInitializeRepo,
    gitStatus,
    stagedFiles,
    onStage,
    onUnstage,
    onCommit,
    commits,
}: {
    isRepoInitialized: boolean;
    onInitializeRepo: () => void;
    gitStatus: { modified: string[], untracked: string[] };
    stagedFiles: Set<string>;
    onStage: (path: string) => void;
    onUnstage: (path: string) => void;
    onCommit: (message: string) => void;
    commits: Commit[];
}) => {
    const [commitMessage, setCommitMessage] = useState('');

    const handleCommitClick = () => {
        if (!commitMessage.trim() || stagedFiles.size === 0) return;
        onCommit(commitMessage);
        setCommitMessage('');
    };

    if (!isRepoInitialized) {
        return (
            <div className="p-4 flex flex-col items-center justify-center h-full text-center">
                <SourceControlIcon className="h-12 w-12 text-gray-500 mb-4" />
                <p className="text-gray-400 mb-4">This directory is not yet a Git repository.</p>
                <button onClick={onInitializeRepo} className="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-md">
                    Initialize Repository
                </button>
            </div>
        );
    }
    
    const unstagedChanges = [...gitStatus.modified, ...gitStatus.untracked].filter(p => !stagedFiles.has(p));

    return (
        <div className="flex flex-col h-full">
            <div className="p-1 border-b border-gray-700">
                <textarea
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder="Commit message..."
                    className="w-full bg-gray-900 border border-gray-600 rounded-md py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 h-20 resize-none custom-scrollbar"
                />
                <button
                    onClick={handleCommitClick}
                    disabled={!commitMessage.trim() || stagedFiles.size === 0}
                    className="w-full mt-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-md text-sm"
                >
                    Commit {stagedFiles.size > 0 ? `${stagedFiles.size} file(s)`: ''}
                </button>
            </div>

            <div className="flex-grow overflow-auto custom-scrollbar p-1 space-y-2">
                <CollapsibleSection title="Staged Changes" count={stagedFiles.size}>
                    {[...stagedFiles].sort().map(path => (
                        <ChangeItem key={path} path={path} onAction={() => onUnstage(path)} actionIcon="-" />
                    ))}
                </CollapsibleSection>

                <CollapsibleSection title="Changes" count={unstagedChanges.length}>
                    {unstagedChanges.sort().map(path => (
                         <ChangeItem key={path} path={path} onAction={() => onStage(path)} actionIcon="+" />
                    ))}
                </CollapsibleSection>
                
                <CollapsibleSection title="History" count={commits.length} defaultOpen={false}>
                    {[...commits].map(commit => (
                        <div key={commit.id} className="text-xs p-2 border-b border-gray-700/50 last:border-b-0 hover:bg-gray-700/20">
                            <p className="font-semibold text-gray-200 truncate" title={commit.message}>{commit.message}</p>
                            <div className="flex items-center justify-between text-gray-400 mt-1">
                                <div className="flex items-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                    </svg>
                                    <span>{commit.author}</span>
                                </div>
                                <span>{new Date(commit.date).toLocaleDateString()}</span>
                            </div>
                            <div className="flex items-center text-gray-500 mt-1">
                                 <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1.5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                </svg>
                                <span className="font-mono text-sky-400">{commit.id.substring(0, 7)}</span>
                            </div>
                        </div>
                    ))}
                </CollapsibleSection>
            </div>
        </div>
    );
};

const SideBar = ({ files, onSelectFile, selectedFile, onCreateFile, onCreateFolder, ...gitProps }: any) => {
    const [activeView, setActiveView] = useState('explorer');

    return (
        <div className="bg-gray-800 text-white w-72 flex border-r border-gray-700">
            <div className="flex flex-col p-1 bg-gray-900 border-r border-gray-700">
                <button 
                    onClick={() => setActiveView('explorer')} 
                    className={`p-2 rounded-md ${activeView === 'explorer' ? 'text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}
                    title="Project Explorer"
                >
                    <ExplorerIcon />
                </button>
                <button 
                    onClick={() => setActiveView('source-control')} 
                    className={`p-2 rounded-md ${activeView === 'source-control' ? 'text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}
                    title="Source Control"
                >
                    <SourceControlIcon />
                </button>
            </div>
            <div className="flex-grow overflow-hidden">
                {activeView === 'explorer' ? (
                    <ProjectExplorer files={files} onSelectFile={onSelectFile} selectedFile={selectedFile} onCreateFile={onCreateFile} onCreateFolder={onCreateFolder} />
                ) : (
                    <SourceControlPanel {...gitProps} />
                )}
            </div>
        </div>
    );
}

const getOrCreateModel = (path: string, lang: string, value: string) => {
    const uri = monaco.Uri.parse(path);
    let model = monaco.editor.getModel(uri);
    if (model) {
        if (model.getValue() !== value) {
            // Push an edit to the model to update it's value
            // This is better than `setValue` because it preserves undo history
             model.pushEditOperations(
                [],
                [{
                    range: model.getFullModelRange(),
                    text: value,
                }],
                () => null
            );
        }
    } else {
        model = monaco.editor.createModel(value, lang, uri);
    }
    return model;
};

const CodeEditor = ({ file, onContentChange }: { file: FileNode, onContentChange: (path: string, content: string) => void }) => {
    const editorContainerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const onContentChangeRef = useRef(onContentChange);
    onContentChangeRef.current = onContentChange;

    const getLanguageFromExtension = useCallback((extension?: string): string => {
        switch (extension) {
            case 'js': case 'jsx': return 'javascript';
            case 'ts': case 'tsx': return 'typescript';
            case 'json': return 'json';
            case 'html': return 'html';
            case 'css': return 'css';
            case 'gitignore': return 'plaintext';
            default: return 'plaintext';
        }
    }, []);

    // Initialize editor instance
    useEffect(() => {
        if (editorContainerRef.current && !editorRef.current) {
            const editor = monaco.editor.create(editorContainerRef.current, {
                theme: 'vs-dark',
                automaticLayout: true,
                minimap: { enabled: true },
                fontSize: 14,
                wordWrap: 'on',
                padding: { top: 16 }
            });
            editorRef.current = editor;

            editor.onDidChangeModelContent(() => {
                const model = editor.getModel();
                if (model && !model.isDisposed()) {
                    const path = model.uri.path;
                    const content = model.getValue();
                    onContentChangeRef.current(path, content);
                }
            });
        }
        return () => {
            if (editorRef.current) {
                editorRef.current.dispose();
                editorRef.current = null;
            }
        };
    }, []);

    // Handle file changes
    useEffect(() => {
        const editor = editorRef.current;
        if (!editor || !file) return;

        const language = getLanguageFromExtension(file.extension);
        const model = getOrCreateModel(file.path, language, file.content || '');

        if (editor.getModel() !== model) {
            editor.setModel(model);
        }
    }, [file, getLanguageFromExtension]);

    return (
        <div className="h-full" ref={editorContainerRef} />
    );
};

const findFileByPath = (path: string, nodes: FileNode[]): FileNode | null => {
    for (const node of nodes) {
        if (node.path === path) return node;
        if (node.type === 'folder' && node.children) {
            const found = findFileByPath(path, node.children);
            if (found) return found;
        }
    }
    return null;
};

const PreviewPanel = ({ files }: { files: FileNode[] }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const generatePreview = async () => {
            setError(null);
            try {
                // 1. Find necessary files
                const htmlFile = findFileByPath('/public/index.html', files);
                const cssFile = findFileByPath('/src/styles.css', files);
                const appFile = findFileByPath('/src/App.tsx', files);
                const indexFile = findFileByPath('/src/index.tsx', files);

                if (!htmlFile || !appFile || !indexFile) {
                    setError("Essential files (index.html, App.tsx, index.tsx) not found.");
                    return;
                }

                // 2. Transpile TSX/JSX to JS
                if (!window.Babel) {
                    setError("Babel is not loaded. Cannot transpile code.");
                    return;
                }
                
                // A more robust way to clean code for bundling.
                // Removes all import and export statements from App.tsx.
                const appContent = (appFile.content || '')
                    .replace(/^import .*$/gm, '')
                    .replace(/^export .*$/gm, '');

                // Removes all import statements from index.tsx.
                const indexContent = (indexFile.content || '')
                    .replace(/^import .*$/gm, '');

                const combinedJsx = `
                    (function() {
                        // Make React and its hooks available in the scope since we removed the imports.
                        // The global 'React' and 'ReactDOM' are loaded from CDN.
                        const { useState, useEffect, useCallback, useRef, useMemo, Fragment, StrictMode } = React;
                        
                        // --- From App.tsx ---
                        // The 'App' function/class will be defined here.
                        ${appContent}

                        // --- From index.tsx ---
                        // This part will call ReactDOM.createRoot and .render.
                        // It assumes 'App' is defined from above and 'ReactDOM' is a global.
                        ${indexContent}
                    })();
                `;

                const { code: transpiledCode } = window.Babel.transform(combinedJsx, {
                    presets: ["react", "typescript"],
                    filename: 'bundle.tsx'
                });


                // 3. Construct the final HTML for the iframe
                const finalHtml = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8" />
                        <title>Preview</title>
                        <style>
                            ${cssFile?.content || ''}
                        </style>
                    </head>
                    <body>
                        ${htmlFile.content}
                        
                        <!-- React CDN -->
                        <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
                        <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
                        
                        <!-- Transpiled App Code -->
                        <script type="text/javascript">
                            try {
                                ${transpiledCode}
                            } catch (e) {
                                const root = document.getElementById('root') || document.body;
                                root.innerHTML = '<div style="color: #ff5555; background-color: #220000; padding: 1rem; font-family: monospace;"><h3>Runtime Error</h3><pre>' + e.stack + '</pre></div>';
                                console.error(e);
                            }
                        </script>
                    </body>
                    </html>
                `;

                // 4. Update iframe
                const iframe = iframeRef.current;
                if (iframe) {
                    iframe.srcdoc = finalHtml;
                }

            } catch (e: any) {
                console.error("Preview generation error:", e);
                const escapedMessage = e.message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                const errorMessage = `
                    <div style="color: #ff5555; background-color: #220000; padding: 1rem; font-family: monospace; font-size: 14px; white-space: pre-wrap; height: 100vh; box-sizing: border-box;">
                        <h3 style="margin-top: 0; margin-bottom: 1rem; font-size: 1.2rem; border-bottom: 1px solid #552222; padding-bottom: 0.5rem;">Build Error</h3>
                        ${e.loc ? `<p style="margin: 0 0 1rem 0; color: #ff9999;"><strong>Location:</strong> Line ${e.loc.line}, Column ${e.loc.column}</p>` : ''}
                        <code style="display: block;">${escapedMessage}</code>
                    </div>
                `;
                setError(e.message);
                const iframe = iframeRef.current;
                if (iframe) {
                  iframe.srcdoc = errorMessage;
                }
            }
        };

        const timeoutId = setTimeout(generatePreview, 500); // Debounce
        return () => clearTimeout(timeoutId);

    }, [files]);

    return (
        <div className="h-full w-full bg-white">
            <iframe
                ref={iframeRef}
                title="Live Preview"
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin"
            />
        </div>
    );
};

const MainPanel = ({ selectedFile, onFileContentChange, files, onFormatFile }: { selectedFile: FileNode | null; onFileContentChange: (path: string, content: string) => void, files: FileNode[], onFormatFile: () => void }) => {
    const [view, setView] = useState<'editor' | 'preview'>('editor');
    const isFormattable = selectedFile && ['js', 'jsx', 'ts', 'tsx', 'css'].includes(selectedFile.extension || '');

    const renderEditor = () => {
        if (!selectedFile) {
            return (
                <div className="flex-grow flex items-center justify-center">
                    <div className="text-center text-gray-500">
                        <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-3H8" /></svg>
                        <h3 className="mt-2 text-sm font-medium">Select a file</h3>
                        <p className="mt-1 text-sm">Choose a file from the explorer to begin editing.</p>
                    </div>
                </div>
            );
        }
        return <CodeEditor file={selectedFile} onContentChange={onFileContentChange} />;
    };

    return (
        <div className="bg-gray-900 text-white flex-grow flex flex-col">
            <div className="flex items-center justify-between p-2 bg-gray-800 border-b border-gray-700 shrink-0">
                <div className="flex items-center min-w-0">
                    {view === 'editor' && selectedFile ? (
                        <>
                            <FileIcon extension={selectedFile.extension} name={selectedFile.name} />
                            <span className="font-mono text-sm truncate">{selectedFile.path}</span>
                            {isFormattable && (
                                <button onClick={onFormatFile} className="ml-4 text-gray-400 hover:text-white p-1 rounded-md hover:bg-gray-700" title="Format Code">
                                    <FormatCodeIcon />
                                </button>
                            )}
                        </>
                    ) : view === 'preview' ? (
                        <span className="font-semibold text-sm">Live Preview</span>
                    ) : null }
                </div>
                <div className="flex items-center bg-gray-900 rounded-md p-0.5">
                    <button onClick={() => setView('editor')} className={`px-2 py-0.5 text-xs rounded-sm transition-colors ${view === 'editor' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}>Editor</button>
                    <button onClick={() => setView('preview')} className={`px-2 py-0.5 text-xs rounded-sm transition-colors ${view === 'preview' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}>Preview</button>
                </div>
            </div>
            <div className="flex-grow overflow-hidden bg-[#1e1e1e]">
                {view === 'editor' ? renderEditor() : <PreviewPanel files={files} />}
            </div>
        </div>
    );
};


const RightPanel = ({ agents }: { agents: Agent[] }) => {
    return (
        <div className="bg-gray-800 text-white w-72 flex flex-col p-2 border-l border-gray-700">
            <h2 className="text-lg font-semibold mb-2 px-2">Agent Status</h2>
            <div className="space-y-2">
                {agents.map(agent => (
                    <div key={agent.name} className="bg-gray-700 p-2 rounded-md transition-all duration-300">
                        <div className="flex items-center justify-between">
                            <span className="font-bold">{agent.name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${agent.status === 'Active' ? 'bg-green-500 text-black animate-pulse' : 'bg-gray-500 text-white'}`}>{agent.status}</span>
                        </div>
                        {agent.task && <p className="text-xs text-gray-300 mt-1 truncate" title={agent.task}>{agent.task}</p>}
                    </div>
                ))}
            </div>
        </div>
    );
};

const BottomPanel = ({ terminalLogs, agentMessages }: { terminalLogs: TerminalLog[], agentMessages: AgentMessage[] }) => {
    const [activeTab, setActiveTab] = useState('agentComms');
    const logsEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [terminalLogs, agentMessages]);

    const tabs = [
        { id: 'terminal', name: 'Terminal' },
        { id: 'agentComms', name: 'Agent Comms' },
        { id: 'debug', name: 'Debug Console' },
    ];

    const renderContent = () => {
        switch (activeTab) {
            case 'terminal':
                return (
                    <div className="p-2 font-mono text-xs overflow-auto h-full custom-scrollbar">
                        {terminalLogs.map(log => (
                           <div key={log.id}>
                                <span className="text-gray-500 mr-2">{log.time}</span>
                                <span className="text-cyan-400 mr-2">[{log.source}]</span>
                                <span>{log.message}</span>
                           </div>
                        ))}
                         <div ref={logsEndRef} />
                    </div>
                );
            case 'agentComms':
                return (
                    <div className="p-2 space-y-2 overflow-auto h-full custom-scrollbar">
                        {agentMessages.map(msg => (
                            <div key={msg.id} className="text-xs">
                                <span className="text-gray-500 mr-2">{msg.time}</span>
                                <span className="font-bold text-yellow-400 mr-2">&lt;{msg.from}&gt;</span>
                                <span className="text-gray-200 whitespace-pre-wrap">{msg.message}</span>
                            </div>
                        ))}
                         <div ref={logsEndRef} />
                    </div>
                );
            case 'debug':
                return <div className="p-2 text-gray-400 text-sm">Debug console is empty.</div>;
            default: return null;
        }
    }

    return (
        <div className="bg-gray-800 text-white flex flex-col border-t border-gray-700 h-64">
             <div className="flex border-b border-gray-700">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 text-sm font-medium ${activeTab === tab.id ? 'bg-gray-900 border-b-2 border-blue-500 text-white' : 'text-gray-400 hover:bg-gray-700'}`}
                    >
                        {tab.name}
                    </button>
                ))}
            </div>
            <div className="flex-grow bg-gray-900 overflow-hidden">
                {renderContent()}
            </div>
        </div>
    );
};

const ChatPanel = ({ onSendMessage, loading }: { onSendMessage: (msg: string) => Promise<void>, loading: boolean }) => {
    const [input, setInput] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    
    const handleSend = () => {
        if (input.trim() && !loading) {
            onSendMessage(input.trim());
            setInput('');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };
    
    useEffect(() => {
        const el = textareaRef.current;
        if (el) {
            el.style.height = 'auto';
            el.style.height = `${el.scrollHeight}px`;
        }
    }, [input]);

    return (
        <div className="p-4 border-t border-gray-700 bg-gray-800">
             <div className="relative bg-gray-900 border border-gray-600 rounded-lg">
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Provide instructions to the AI agents..."
                    className="w-full bg-transparent p-3 pr-20 text-white rounded-lg focus:outline-none resize-none custom-scrollbar"
                    rows={1}
                    style={{maxHeight: '200px'}}
                    disabled={loading}
                />
                <button
                    onClick={handleSend}
                    disabled={loading || !input.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white p-2 rounded-full"
                    aria-label="Send message"
                >
                    {loading ? (
                        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.428A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>
                    )}
                </button>
            </div>
        </div>
    );
};

const Header = () => (
    <header className="bg-gray-900 text-white p-3 flex items-center border-b border-gray-700 shadow-md">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-400 mr-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" /></svg>
        <h1 className="text-xl font-bold">Agentic - AI Development Environment</h1>
    </header>
);

const StatusBar = ({ branch, changesCount }: { branch: string, changesCount: number }) => {
    return (
        <div className="bg-gray-900 text-white flex items-center px-2 py-1 border-t border-gray-700 text-xs font-mono">
            <div className="flex items-center" title="Current Branch">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 20.5V15.5C11 13.0147 8.98528 11 6.5 11C4.01472 11 2 13.0147 2 15.5V20.5M11 3.5V8.5C11 10.9853 8.98528 13 6.5 13H2" />
                </svg>
                <span>{branch}</span>
            </div>
            {changesCount > 0 && (
                <div className="flex items-center ml-4" title={`${changesCount} unstaged changes`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    <span>{changesCount}</span>
                </div>
            )}
        </div>
    );
};

const App = () => {
    // Core state
    const [files, setFiles] = useState<FileNode[]>(initialFiles);
    const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
    const [agents, setAgents] = useState<Agent[]>(initialAgents);
    const [messages, setMessages] = useState<Message[]>([]);
    const [terminalLogs, setTerminalLogs] = useState<TerminalLog[]>([]);
    const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    
    // Git state
    const [isRepoInitialized, setIsRepoInitialized] = useState(false);
    const [committedFiles, setCommittedFiles] = useState<FileNode[]>([]);
    const [stagedFiles, setStagedFiles] = useState<Set<string>>(new Set());
    const [commits, setCommits] = useState<Commit[]>([]);
    const [currentBranch] = useState('main');
    
    const ai = useMemo(() => {
        if (!process.env.API_KEY) {
          console.error("API_KEY environment variable not set.");
          return null;
        }
        return new GoogleGenAI({ apiKey: process.env.API_KEY });
    }, []);

    // --- LOGGING ---
    const addTerminalLog = (source: string, message: string) => {
        setTerminalLogs(prev => [...prev, { id: prev.length, time: new Date().toLocaleTimeString(), source, message }]);
    };
    
    const addAgentMessage = (from: string, message: string) => {
        setAgentMessages(prev => [...prev, { id: prev.length, time: new Date().toLocaleTimeString(), from, message }]);
    };
    
    // --- FILE SYSTEM UTILS ---
    const updateFileContent = async (path: string, content: string) => {
        const fileNode = findFileByPath(path, files);
        let finalContent = content;

        if (fileNode && fileNode.extension && ['js', 'ts', 'tsx', 'jsx', 'css'].includes(fileNode.extension)) {
            finalContent = await formatCodeWithPrettier(content, fileNode.extension);
        }

        setFiles(prevFiles => {
            const newFiles = JSON.parse(JSON.stringify(prevFiles));
            const file = findFileByPath(path, newFiles);
            if (file && file.type === 'file') {
                file.content = finalContent;
                if (selectedFile?.path === path) {
                    setSelectedFile(prev => prev ? { ...prev, content: finalContent } : null);
                }
            }
            return newFiles;
        });
    };
    
    const handleFileContentChange = (path: string, content: string) => {
        const currentFile = findFileByPath(path, files);
        if (currentFile && currentFile.content === content) {
            return; // No change, prevent re-render
        }

        setFiles(prevFiles => {
            const newFiles = JSON.parse(JSON.stringify(prevFiles));
            const file = findFileByPath(path, newFiles);
            if (file && file.type === 'file') {
                file.content = content;
                if (selectedFile?.path === path) {
                    setSelectedFile(prev => prev ? { ...prev, content: content } : null);
                }
            }
            return newFiles;
        });
    };

    const handleCreateFile = (filename: string) => {
        if (!filename.trim()) {
            alert("File name cannot be empty.");
            return;
        }
        const newPath = `/${filename}`;
        if (files.some(file => file.path === newPath)) {
            alert(`File "${filename}" already exists.`);
            return;
        }
        const parts = filename.split('.');
        const extension = parts.length > 1 ? parts[parts.length - 1] : undefined;
        const newFile: FileNode = { name: filename, type: 'file', path: newPath, content: '', extension: extension };
        setFiles(prevFiles => [...prevFiles, newFile]);
        setSelectedFile(newFile);
    };

    const handleCreateFolder = (folderName: string) => {
        if (!folderName.trim()) {
            alert("Folder name cannot be empty.");
            return;
        }
        const newPath = `/${folderName}`;
        if (files.some(file => file.path === newPath)) {
            alert(`A folder or file named "${folderName}" already exists at the root.`);
            return;
        }
        // Basic validation for invalid characters
        if (/[\\/:*?"<>|]/.test(folderName)) {
            alert("Folder name contains invalid characters.");
            return;
        }
        const newFolder: FileNode = { name: folderName, type: 'folder', path: newPath, children: [] };
        setFiles(prevFiles => [...prevFiles, newFolder]);
    };

    const handleFormatCurrentFile = async () => {
        if (!selectedFile) return;
        await updateFileContent(selectedFile.path, selectedFile.content || '');
    };
    
    // --- GIT LOGIC ---
    const gitStatus = useMemo(() => {
        if (!isRepoInitialized) return { modified: [], untracked: [], total: 0 };

        const committedFileMap = new Map<string, string>(); // path -> content
        const flatten = (nodes: FileNode[], map: Map<string, string>) => {
            for (const node of nodes) {
                if (node.type === 'file') map.set(node.path, node.content || '');
                if (node.children) flatten(node.children, map);
            }
        };
        flatten(committedFiles, committedFileMap);

        const modified: string[] = [];
        const untracked: string[] = [];
        
        const checkChanges = (nodes: FileNode[]) => {
            for (const node of nodes) {
                if(node.type === 'file') {
                    const committedContent = committedFileMap.get(node.path);
                    if (committedContent !== undefined) {
                        if (committedContent !== node.content) {
                            modified.push(node.path);
                        }
                    } else {
                        untracked.push(node.path);
                    }
                }
                if (node.children) checkChanges(node.children);
            }
        }
        checkChanges(files);
        
        return { modified, untracked, total: modified.length + untracked.length };
    }, [files, committedFiles, isRepoInitialized]);

    const handleInitializeRepo = () => {
        const initialCommit: Commit = {
            id: Math.random().toString(36).substring(2, 15),
            message: 'Initial commit',
            author: 'System',
            date: new Date().toISOString(),
        };
        const filesCopy = JSON.parse(JSON.stringify(files));
        setCommittedFiles(filesCopy);
        setCommits([initialCommit]);
        setIsRepoInitialized(true);
        addTerminalLog('Git', 'Initialized empty Git repository.');
    };

    const handleStage = (path: string) => {
        setStagedFiles(prev => new Set(prev).add(path));
    };

    const handleUnstage = (path: string) => {
        setStagedFiles(prev => {
            const newSet = new Set(prev);
            newSet.delete(path);
            return newSet;
        });
    };

    const handleCommit = (message: string) => {
        if (stagedFiles.size === 0) return;

        const newCommit: Commit = {
            id: Math.random().toString(36).substring(2, 15),
            message,
            author: 'User',
            date: new Date().toISOString(),
        };

        setCommits(prev => [newCommit, ...prev]);
        setCommittedFiles(JSON.parse(JSON.stringify(files)));
        setStagedFiles(new Set());
        addTerminalLog('Git', `Committed ${stagedFiles.size} changes.`);
    };


    // --- AGENT/AI LOGIC ---
    const updateAgentStatus = useCallback((agentName: string, status: 'Active' | 'Idle', task?: string) => {
        setAgents(prevAgents =>
            prevAgents.map(agent =>
                agent.name === agentName ? { ...agent, status, task: task || (status === 'Idle' ? undefined : agent.task) } : agent
            )
        );
    }, []);

    const executePlan = async (plan: any[]) => {
        const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

        updateAgentStatus('Orchestrator', 'Active', 'Executing generated plan...');
        await delay(500);
        addAgentMessage('Orchestrator', 'Starting plan execution.');
        updateAgentStatus('Orchestrator', 'Idle');
        await delay(500);

        for (const step of plan) {
            addTerminalLog('Executor', `Executing action: ${step.action}`);
            
            let agentName = 'Orchestrator';
            let taskDescription = '';

            if (step.action === 'SEND_MESSAGE') {
                agentName = step.args.from || 'Orchestrator';
                taskDescription = `Sending message: "${(step.args.message || '').substring(0, 50)}..."`;
            } else if (step.action === 'WRITE_FILE') {
                agentName = step.args.path.match(/\.(tsx|css|html)$/) ? 'Frontend-Dev' : 'Backend-Dev';
                taskDescription = `Writing to file: ${step.args.path}`;
            } else if (step.action === 'READ_FILE') {
                agentName = 'Orchestrator';
                taskDescription = `Reading file: ${step.args.path}`;
            }

            updateAgentStatus(agentName, 'Active', taskDescription);
            await delay(1000 + Math.random() * 1000);

            switch (step.action) {
                case 'SEND_MESSAGE':
                    if (step.args.from && step.args.message) {
                        addAgentMessage(step.args.from, step.args.message);
                    }
                    break;
                case 'WRITE_FILE':
                    if (step.args.path && typeof step.args.content === 'string') {
                        await updateFileContent(step.args.path, step.args.content);
                        addAgentMessage(agentName, `Updated ${step.args.path}.`);
                    }
                    break;
                case 'READ_FILE':
                    addAgentMessage(agentName, `Read file ${step.args.path}. Acknowledged content.`);
                    break;
                default:
                     addAgentMessage('System', `Unknown action: ${step.action}`);
            }

            updateAgentStatus(agentName, 'Idle');
            await delay(500);
        }

        updateAgentStatus('Orchestrator', 'Active', 'Finalizing plan execution.');
        await delay(500);
        addAgentMessage('Orchestrator', 'Plan execution complete. Awaiting next instructions.');
        updateAgentStatus('Orchestrator', 'Idle');
    };

    const handleSendMessage = async (userMessage: string) => {
        if (!ai) {
             setMessages(prev => [...prev, { id: prev.length, sender: 'system', content: '', error: 'Gemini API key not configured.' }]);
             return;
        }
        setIsLoading(true);
        addTerminalLog('User', `Sending message: ${userMessage}`);
        setMessages(prev => [...prev, { id: prev.length, sender: 'user', content: userMessage }]);
        
        const fileStructure = JSON.stringify(files, (key, value) => key === 'content' ? undefined : value, 2);
        
        const systemInstruction = `You are the vigilant guardian of the software delivery pipeline, ensuring seamless transitions from code to production with unyielding precision and efficiency. You are the automated backbone of reliable release cycles.

Your personality is:
- Precise: Every detail matters; accuracy is paramount.
- Reliable: You execute tasks consistently and correctly.
- Efficient: You streamline processes and seek the most direct path.
- Proactive: You anticipate potential issues.
- Methodical: You adhere strictly to established procedures.
- Solution-Oriented: You focus on resolving challenges quickly.

Your communication style is direct, factual, concise, and professional. You use technical DevOps terminology (e.g., CI/CD, artifact, rollback, containerization, staging, production, etc.).

Your core directives are:
- Ensure all software deployments and file modifications are executed flawlessly.
- Automate and optimize the CI/CD pipeline and development workflow.
- Proactively monitor for potential issues.
- Provide real-time, accurate status updates on your plan.
- Facilitate rapid, controlled rollbacks or fixes if needed.`;

        const userPrompt = `Your goal is to fulfill the user's request by creating a plan of actions for your agent team.

User Request: "${userMessage}"

Current file structure:
${fileStructure}

Currently open file: ${selectedFile ? `path: ${selectedFile.path}\\ncontent:\\n${selectedFile.content}` : 'None'}

Your task is to generate a JSON object representing a plan of actions. 
The plan should be an array of action objects.

Available actions:
1.  READ_FILE: Reads the content of a file.
    - args: { "path": "/path/to/file.ext" }
2.  WRITE_FILE: Writes content to a file. If the file doesn't exist, it will be created.
    - args: { "path": "/path/to/file.ext", "content": "file content here" }
3.  SEND_MESSAGE: An agent sends a message to another agent or to the team. THIS IS REQUIRED before writing code to discuss the plan.
    - args: { "from": "AgentName", "message": "The message content." }
4.  ask_user_for_clarification: Ask the user a question if the request is ambiguous.
    - args: { "question": "Your question for the user." }

IMPORTANT:
- The response MUST be a single JSON object. Do not include any other text, markdown, or explanations.
- The root of the object must be a "plan" key containing an array of actions.
- All file content in the 'content' field of WRITE_FILE actions MUST be a valid single-line JSON string. This means all newlines, quotes, and other special characters MUST be properly escaped (e.g., use \\n for newlines, \\" for quotes).

Example response:
{
  "plan": [
    {
      "action": "SEND_MESSAGE",
      "args": {
        "from": "Orchestrator",
        "message": "Acknowledged. User requests a new button. Frontend-Dev, please implement in App.tsx."
      }
    },
    {
      "action": "WRITE_FILE",
      "args": {
        "path": "/src/App.tsx",
        "content": "import React from 'react';\\n\\nconst App = () => {\\n  return <button>New Button</button>;\\n};\\n\\nexport default App;"
      }
    }
  ]
}
`;

        try {
            const result = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: userPrompt,
                config: {
                    systemInstruction,
                }
            });
            const textResponse = result.text.trim();
            const cleanedResponse = textResponse.replace(/^```json\n?/, '').replace(/\n?```$/, '');
            
            addTerminalLog('Gemini', 'Received plan response.');
            
            const parsed = JSON.parse(cleanedResponse);

            if (parsed.plan && Array.isArray(parsed.plan)) {
                setMessages(prev => [...prev, { id: prev.length, sender: 'ai', content: `Received a plan with ${parsed.plan.length} steps.`, plan: parsed.plan }]);
                await executePlan(parsed.plan);
            } else {
                throw new Error("Invalid plan structure in response.");
            }
        } catch (error: any) {
             console.error("Error during agent execution:", error);
             addTerminalLog('Error', `Execution failed: ${error.message}`);
             setMessages(prev => [...prev, { id: prev.length, sender: 'system', content: '', error: `Error during agent execution:\n${error.toString()}` }]);
        } finally {
            setIsLoading(false);
        }
    };
    
    const gitProps = {
        isRepoInitialized,
        onInitializeRepo: handleInitializeRepo,
        gitStatus,
        stagedFiles,
        onStage: handleStage,
        onUnstage: handleUnstage,
        onCommit: handleCommit,
        commits,
    };

    return (
      <div className="bg-gray-900 text-white h-screen w-screen flex flex-col font-sans">
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 8px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: #1f2937; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #6b7280; }
            `}</style>
            <Header />
            <div className="flex flex-grow overflow-hidden">
                <SideBar
                    files={files}
                    onSelectFile={setSelectedFile}
                    selectedFile={selectedFile}
                    onCreateFile={handleCreateFile}
                    onCreateFolder={handleCreateFolder}
                    {...gitProps}
                />
                <div className="flex flex-col flex-grow">
                    <div className="flex flex-col flex-grow overflow-hidden">
                        <div className="flex-grow overflow-hidden">
                          <MainPanel 
                              selectedFile={selectedFile} 
                              onFileContentChange={handleFileContentChange} 
                              files={files}
                              onFormatFile={handleFormatCurrentFile}
                          />
                        </div>
                        {isRepoInitialized && <StatusBar branch={currentBranch} changesCount={gitStatus.total - stagedFiles.size} />}
                    </div>
                     <ChatPanel onSendMessage={handleSendMessage} loading={isLoading} />
                </div>
                 <RightPanel agents={agents} />
            </div>
            <BottomPanel terminalLogs={terminalLogs} agentMessages={agentMessages} />
        </div>
    );
};

export default App;
