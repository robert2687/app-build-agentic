
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { GoogleGenAI, Type } from "@google/genai";

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
  from: 'user' | 'ai';
  text: string;
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
    time: string;
    source: string;
    message: string;
}

// --- ICONS (as stateless functional components) ---
const FolderIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-sky-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
);

const GenericFileIcon = ({ className = 'text-gray-400' } : { className?: string}) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 mr-2 ${className} shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
  </svg>
);

const HtmlIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 shrink-0" viewBox="0 0 24 24">
        <rect width="24" height="24" rx="3" fill="#e34c26" />
        <text x="4" y="17" fontFamily="monospace" fontSize="12" fontWeight="bold" fill="white">{"<>"}</text>
    </svg>
);

const JsonIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 shrink-0" viewBox="0 0 24 24">
        <rect width="24" height="24" rx="3" fill="#f1e05a" />
        <text x="4" y="17" fontFamily="monospace" fontSize="12" fontWeight="bold" fill="black">{"{}"}</text>
    </svg>
);

const JsIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 shrink-0" viewBox="0 0 24 24">
        <rect width="24" height="24" rx="3" fill="#f7df1e" />
        <text x="6" y="17" fontFamily="monospace" fontSize="14" fontWeight="bold" fill="black">JS</text>
    </svg>
);

const TSIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 shrink-0" viewBox="0 0 24 24">
        <rect width="24" height="24" rx="3" fill="#3178c6" />
        <text x="5" y="17" fontFamily="monospace" fontSize="14" fontWeight="bold" fill="white">TS</text>
    </svg>
);

const FileIcon = ({ extension }: { extension?: string }) => {
  switch (extension) {
    case 'html':
      return <HtmlIcon />;
    case 'json':
      return <JsonIcon />;
    case 'js':
      return <JsIcon />;
    case 'ts':
    case 'tsx':
      return <TSIcon />;
    default:
      return <GenericFileIcon />;
  }
};


const CpuChipIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-3 shrink-0">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V8.25a2.25 2.25 0 0 0-2.25-2.25H8.25a2.25 2.25 0 0 0-2.25 2.25v9.5A2.25 2.25 0 0 0 8.25 19.5Z" />
    </svg>
);

const DocumentTextIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-1">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
);

const CodeBracketIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-1">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 12" />
    </svg>
);

const SearchIcon = ({ className = 'h-4 w-4 text-gray-400' }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
);

const CheckCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-green-500"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>;
const XCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-red-500"><path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>;
const ArrowPathIcon = ({ spinning = true }: { spinning?: boolean }) => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 text-blue-400 ${spinning ? 'animate-spin' : ''}`}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 11.667 0l3.181-3.183m-4.991-2.691v4.992m0 0-3.182-3.182a8.25 8.25 0 0 1-11.667 0l-3.181 3.182m4.991 2.691H7.965M16.023 9.348A8.25 8.25 0 0 1 19.5 12m0 0a8.25 8.25 0 0 1-3.477 6.651m-3.477-6.651a8.25 8.25 0 0 0-3.477-6.651m3.477 6.651L12 12" /></svg>;
const SparklesIcon = ({ className = "w-5 h-5 mr-3 text-yellow-400" }) => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" /></svg>;

const FullscreenEnterIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
    </svg>
);

const FullscreenExitIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5M15 15l5.25 5.25" />
    </svg>
);

const WandIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.475 2.118A2.25 2.25 0 0 1 .75 15.375a3 3 0 0 0 5.78-1.128 2.25 2.25 0 0 1 2.475-2.118 2.25 2.25 0 0 1 2.475 2.118ZM8.25 10.5a3 3 0 1 1-5.78-1.128 2.25 2.25 0 0 0-2.475-2.118A2.25 2.25 0 0 0 .75 9.375a3 3 0 0 1 5.78 1.128 2.25 2.25 0 0 0 2.475 2.118 2.25 2.25 0 0 0 2.475-2.118Zm8.25-3a3 3 0 1 0-5.78 1.128 2.25 2.25 0 0 1-2.475 2.118A2.25 2.25 0 0 1 5.25 4.875a3 3 0 0 0 5.78-1.128 2.25 2.25 0 0 1 2.475-2.118 2.25 2.25 0 0 1 2.475 2.118Z" />
    </svg>
);

// --- MOCK DATA ---
const initialFileStructure: FileNode[] = [
  { name: 'src', type: 'folder', path: 'src', children: [
      { name: 'App.tsx', type: 'file', extension: 'tsx', path: 'src/App.tsx', content: `import React from 'react';\n\nexport default function App() {\n  return (\n    <div className="bg-slate-900 text-white min-h-screen p-8">\n      <h1 className="text-4xl font-bold">Welcome to your new App!</h1>\n      <p className="mt-4 text-slate-400">Get started by editing this file.</p>\n    </div>\n  );\n}` },
      { name: 'index.tsx', type: 'file', extension: 'tsx', path: 'src/index.tsx', content: `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\n\nconst root = ReactDOM.createRoot(document.getElementById('root'));\nroot.render(<App />);` },
  ]},
  { name: 'public', type: 'folder', path: 'public', children: [
      { name: 'index.html', type: 'file', extension: 'html', path: 'public/index.html', content: `<!DOCTYPE html>\n<html>\n  <head>\n    <title>My App</title>\n    <script src="https://cdn.tailwindcss.com"></script>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/index.tsx"></script>\n  </body>\n</html>` },
  ]},
  { name: 'package.json', type: 'file', extension: 'json', path: 'package.json', content: `{\n  "name": "new-project",\n  "version": "1.0.0",\n  "dependencies": {\n    "react": "^19",\n    "react-dom": "^19"\n  }\n}` },
];
const initialAgents: Agent[] = [
  { name: 'Requirements Analyst', status: 'Idle' },
  { name: 'UI/UX Architect', status: 'Idle' },
  { name: 'Frontend Coder', status: 'Idle' },
  { name: 'Backend Coder', status: 'Idle' },
  { name: 'QA & Security Agent', status: 'Idle' },
  { name: 'DevOps & Deployment Agent', status: 'Idle' },
];
const initialConversation: Message[] = [];
const initialPullRequest: PullRequest = {
  id: 1, title: 'feat: Initial project structure', author: 'DevOps & Deployment Agent', branch: 'main',
  changes: `+ {
+   "name": "new-project",
+   "version": "1.0.0"
+ }`,
  tests: { passed: 0, failed: 0, coverage: 'N/A' }
};
const initialTerminalLogs: TerminalLog[] = [
  { time: '13:37:01', source: 'Orchestrator', message: 'Initializing project workspace...' },
  { time: '13:37:02', source: 'DevOps Agent', message: 'Cloning repository...' },
  { time: '13:37:05', source: 'DevOps Agent', message: 'Installing dependencies...' },
  { time: '13:37:10', source: 'Orchestrator', message: 'Project initialized. AI agents are standing by.' },
  { time: '13:37:11', source: 'Orchestrator', message: 'Awaiting user instructions in the chat.' },
];

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

// --- UTILITY FUNCTIONS ---
const applySyntaxHighlighting = (code: string, extension?: string) => {
    if (!extension && !code) return '';
    let processedCode = code || '';
    let highlighted = processedCode.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    const currentExtension = extension || 'tsx'; // Default to tsx for generated code
    if (['tsx', 'js'].includes(currentExtension)) {
        highlighted = highlighted
            .replace(/\b(import|from|export|default|const|let|var|function|return|if|else|switch|case|for|while|new|async|await|of|in)\b/g, '<span class="text-purple-400">$&</span>')
            .replace(/\b(React|useState|useEffect|useCallback|useRef|null|true|false|document|window)\b/g, '<span class="text-sky-400">$&</span>')
            .replace(/(\'|\")(.*?)(\'|\")/g, '<span class="text-green-400">$&</span>')
            .replace(/(\/\*[\s\S]*?\*\/)|(\/\/.*)/g, '<span class="text-gray-500">$&</span>')
            .replace(/(<)(\/?\w+)(.*?)(\/?>)/g, '$1<span class="text-sky-400">$2</span>$3$4');
    } else if (currentExtension === 'json') {
         highlighted = highlighted
            .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?)/g, (match) => {
                if (/:$/.test(match)) {
                    return `<span class="text-sky-400">${match}</span>`;
                }
                return `<span class="text-green-400">${match}</span>`;
            })
            .replace(/\b(true|false|null)\b/g, '<span class="text-purple-400">$&</span>');
    } else if (currentExtension === 'html') {
         highlighted = highlighted
            .replace(/&lt;!--[\s\S]*?--&gt;/g, '<span class="text-gray-500">$&</span>')
            .replace(/(&lt;)(\/?\w+)/g, '$1<span class="text-sky-400">$2</span>')
            .replace(/(\w+)=(".*?"|'.*?')/g, '<span class="text-purple-400">$1</span>=<span class="text-green-400">$2</span>');
    }

    return highlighted;
};

const renderDesignDocument = (markdown: string) => {
    let html = markdown.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    html = html
        .replace(/^### (.*$)/gim, '<h3 class="text-xl font-bold mt-8 mb-4 text-sky-300">$1</h3>')
        .replace(/`([^`]+)`/g, '<code class="bg-gray-700 text-cyan-300 font-mono px-1.5 py-1 rounded text-sm">$1</code>');
    
    const lines = html.split('\n');
    let inList = false;
    let result = '';

    for (const line of lines) {
        if (line.trim().startsWith('- ')) {
            if (!inList) {
                result += '<ul class="list-disc pl-6 space-y-2 my-4">';
                inList = true;
            }
            result += `<li class="text-gray-300">${line.trim().substring(2)}</li>`;
        } else {
            if (inList) {
                result += '</ul>';
                inList = false;
            }
            if (line.startsWith('<h3')) {
                result += line;
            } else if (line.trim()) {
                result += `<p class="mb-4 text-gray-400 leading-relaxed">${line}</p>`;
            }
        }
    }

    if (inList) {
        result += '</ul>';
    }

    return result;
};


// --- CHILD COMPONENTS ---

const FileTree = ({ files, level = 0, onFileSelect, activeFile }: { files: FileNode[], level?: number, onFileSelect: (file: FileNode) => void, activeFile: FileNode | null }) => (
  <div style={{ paddingLeft: `${level * 1}rem` }}>
    {files.map(file => (
      <div key={file.path}>
        <div 
            onClick={() => file.type === 'file' && onFileSelect(file)}
            className={`flex items-center py-1 text-sm text-gray-300 rounded-md px-2 transition-colors duration-150 ${file.type === 'file' ? 'cursor-pointer hover:bg-gray-700/50' : ''} ${activeFile?.path === file.path ? 'bg-gray-700' : ''}`}
        >
          {file.type === 'folder' ? <FolderIcon /> : <FileIcon extension={file.extension} />}
          <span>{file.name}</span>
        </div>
        {file.children && <FileTree files={file.children} level={level + 1} onFileSelect={onFileSelect} activeFile={activeFile} />}
      </div>
    ))}
  </div>
);

const LeftPanel = ({ agents, files, onFileSelect, activeFile }: { agents: Agent[], files: FileNode[], onFileSelect: (file: FileNode) => void, activeFile: FileNode | null }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filterFileTree = useCallback((nodes: FileNode[], term: string): FileNode[] => {
    if (!term.trim()) {
      return nodes;
    }
    const lowerCaseTerm = term.toLowerCase();
    const result: FileNode[] = [];

    for (const node of nodes) {
      if (node.type === 'folder') {
        if (node.name.toLowerCase().includes(lowerCaseTerm)) {
          result.push(node); // Include folder and all its children
        } else {
          const filteredChildren = filterFileTree(node.children || [], term);
          if (filteredChildren.length > 0) {
            result.push({ ...node, children: filteredChildren }); // Include folder with filtered children
          }
        }
      } else { // It's a file
        if (node.name.toLowerCase().includes(lowerCaseTerm)) {
          result.push(node);
        }
      }
    }
    return result;
  }, []);

  const filteredFiles = useMemo(() => filterFileTree(files, searchTerm), [files, searchTerm, filterFileTree]);
  
  return (
    <aside className="bg-gray-800/50 backdrop-blur-sm border-r border-gray-700 text-white w-72 p-4 flex flex-col shrink-0">
      <div className="flex items-center mb-6">
        <SparklesIcon className="w-6 h-6 mr-2 text-yellow-400" />
        <h1 className="text-xl font-bold">Agentic</h1>
      </div>
      
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-2">Project Files</h2>
      <div className="relative mb-3 px-1">
        <input
          type="text"
          placeholder="Search files..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 rounded-md py-1.5 pl-8 pr-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <SearchIcon />
        </div>
      </div>
      <div className="flex-grow overflow-y-auto mb-6 pr-2 custom-scrollbar">
        <FileTree files={filteredFiles} onFileSelect={onFileSelect} activeFile={activeFile} />
      </div>

      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-2">AI Agent Team</h2>
      <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar">
        {agents.map(agent => (
          <div key={agent.name} className="flex items-start text-sm">
            <CpuChipIcon />
            <div>
              <p className="font-semibold text-gray-200">{agent.name}</p>
              {agent.status === 'Active' ? (
                <div className="flex items-center text-blue-400">
                  <ArrowPathIcon />
                  <span className="ml-2 text-gray-300">{agent.task}</span>
                </div>
              ) : (
                <p className="text-gray-400">{agent.status}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
};

const ChatView = ({ conversation, onSendMessage }: { conversation: Message[], onSendMessage: (text: string) => Promise<void> }) => {
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [conversation, isLoading]);

    const handleSend = async () => {
        if (!userInput.trim() || isLoading) return;
        setIsLoading(true);
        await onSendMessage(userInput);
        setUserInput('');
        setIsLoading(false);
    };

    return (
        <div className="flex flex-col h-full p-4 bg-gray-900">
            <div className="flex-grow space-y-4 overflow-y-auto pr-4 mb-4 custom-scrollbar">
                {conversation.map((msg, i) => (
                    <div key={i} className={`flex items-start gap-3 ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.from === 'ai' && <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white font-bold text-sm shrink-0 mt-1"><SparklesIcon className="w-5 h-5 text-yellow-400"/></div>}
                        <div className={`max-w-xl p-4 rounded-2xl shadow-md ${msg.from === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-700 text-gray-200 rounded-bl-none'}`}>
                            <p className="whitespace-pre-wrap">{msg.text}</p>
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex items-start gap-3 justify-start">
                        <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white font-bold text-sm shrink-0 mt-1"><SparklesIcon className="w-5 h-5 text-yellow-400"/></div>
                        <div className="max-w-lg p-4 rounded-2xl bg-gray-700 text-gray-200 rounded-bl-none flex items-center">
                            <div className="dot-flashing"></div>
                        </div>
                    </div>
                )}
                <div ref={chatEndRef} />
            </div>
            <div className="mt-auto flex items-center border border-gray-600 rounded-lg p-2 bg-gray-800 focus-within:ring-2 focus-within:ring-blue-500 transition-shadow">
                <input type="text" value={userInput} onChange={e => setUserInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSend()} placeholder="Give instructions to your AI team..." className="flex-grow bg-transparent focus:outline-none text-gray-200 ml-2"/>
                <button onClick={handleSend} disabled={isLoading} className="ml-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-md disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors">Send</button>
            </div>
        </div>
    );
};

const CanvasView = ({ addLog }: { addLog: (source: string, message: string) => void }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [prompt, setPrompt] = useState('Generate a React component with Tailwind CSS based on this UI mockup.');
    const [generatedCode, setGeneratedCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const getCanvasContext = () => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        return canvas.getContext('2d');
    }

    useEffect(() => {
        const ctx = getCanvasContext();
        if (ctx) {
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
        }
    }, []);
    
    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const ctx = getCanvasContext();
        if (!ctx) return;
        setIsDrawing(true);
        ctx.beginPath();
        ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        const ctx = getCanvasContext();
        if (!ctx) return;
        ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
        ctx.stroke();
    };

    const stopDrawing = () => {
        const ctx = getCanvasContext();
        if (!ctx) return;
        ctx.closePath();
        setIsDrawing(false);
    };

    const handleClearCanvas = () => {
        const ctx = getCanvasContext();
        if (ctx) {
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            addLog('Canvas', 'Canvas cleared.');
        }
    };
    
    const handleGenerate = async () => {
        if (!prompt.trim() || !canvasRef.current) return;
        setIsLoading(true);
        setGeneratedCode('');
        addLog('UI/UX Architect', `Generating code from canvas with prompt: "${prompt}"`);

        try {
            const canvas = canvasRef.current;
            const dataUrl = canvas.toDataURL('image/png');
            const base64Data = dataUrl.split(',')[1];

            const imagePart = {
                inlineData: {
                    mimeType: 'image/png',
                    data: base64Data,
                },
            };

            const textPart = {
                text: `${prompt}\n\nProvide only the raw code for the component, without any surrounding text, explanations, or markdown code fences.`
            };

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [imagePart, textPart] },
            });
            
            setGeneratedCode(response.text);
            addLog('UI/UX Architect', 'Successfully generated UI component from canvas drawing.');

        } catch (error) {
            console.error("Error generating from canvas:", error);
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            setGeneratedCode(`// Error generating code:\n// ${errorMessage}`);
            addLog('Error', `Failed to generate code from canvas: ${errorMessage}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="h-full flex flex-col lg:flex-row gap-4 p-4 bg-gray-900 text-white">
            <div className="flex-1 flex flex-col min-h-[300px] lg:h-full">
                <h3 className="text-lg font-bold mb-2">UI Mockup Canvas</h3>
                <div className="relative flex-grow bg-white rounded-lg overflow-hidden border border-gray-700">
                    <canvas
                        ref={canvasRef}
                        width={800}
                        height={600}
                        className="w-full h-full"
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                    />
                     <div className="absolute top-2 right-2">
                        <button onClick={handleClearCanvas} className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-md transition-colors text-sm">Clear</button>
                    </div>
                </div>
            </div>
            <div className="lg:w-1/2 min-w-[300px] lg:max-w-2xl flex flex-col bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                <h3 className="text-lg font-bold mb-2 flex items-center"><SparklesIcon className="w-5 h-5 mr-2 text-yellow-300"/> AI Code Generation</h3>
                <p className="text-sm text-gray-400 mb-4">Draw a simple UI in the canvas, then describe what you want the AI to build.</p>
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g., Generate a React component with Tailwind CSS based on this UI mockup."
                    className="w-full h-24 bg-gray-900 rounded-md p-2 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 custom-scrollbar mb-3"
                />
                <button
                    onClick={handleGenerate}
                    disabled={isLoading}
                    className="flex items-center justify-center bg-sky-600 hover:bg-sky-500 text-white font-semibold py-2 px-4 rounded-md disabled:bg-gray-500 transition-colors w-full"
                >
                    <SparklesIcon className="w-5 h-5 mr-2 text-yellow-300" />
                    {isLoading ? 'Generating...' : 'Generate Code'}
                </button>

                <div className="flex-grow mt-4 overflow-hidden flex flex-col">
                    <h4 className="font-semibold text-gray-200 mb-2">Generated Code:</h4>
                    {isLoading && <div className="flex justify-center items-center h-full"><ArrowPathIcon /> <span className="ml-2">AI is building your component...</span></div>}
                    {!isLoading && !generatedCode && (
                        <div className="flex justify-center items-center h-full text-center text-gray-500 border-2 border-dashed border-gray-700 rounded-lg">
                            <p>Generated code will appear here.</p>
                        </div>
                    )}
                    {generatedCode && (
                         <div className="flex-1 overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg custom-scrollbar">
                            <pre className="p-4 font-mono text-sm relative w-full">
                                <code className="block whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: applySyntaxHighlighting(generatedCode, 'tsx') }} />
                            </pre>
                         </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const DesignView = ({ onProcess, designDocument }: { onProcess: (docText: string) => Promise<void>, designDocument: string }) => {
    const [documentText, setDocumentText] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async () => {
        if (!documentText.trim()) return;
        setIsLoading(true);
        await onProcess(documentText);
        setIsLoading(false);
    }

    return (
        <div className="p-4 h-full flex flex-col bg-gray-900 text-white overflow-y-auto custom-scrollbar">
            <h3 className="text-2xl font-bold mb-2">System Design</h3>
            <p className="text-gray-400 mb-4">Provide high-level project documentation below. The AI System Architect will process it into a structured design document.</p>
            
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
                <textarea
                    value={documentText}
                    onChange={(e) => setDocumentText(e.target.value)}
                    placeholder="Describe your application idea. For example: A social media platform for pet owners to share photos and schedule playdates."
                    className="w-full h-40 bg-gray-900 rounded-md p-2 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 custom-scrollbar"
                />
                <button
                    onClick={handleSubmit}
                    disabled={isLoading}
                    className="mt-3 flex items-center justify-center bg-sky-600 hover:bg-sky-500 text-white font-semibold py-2 px-4 rounded-md disabled:bg-gray-500 transition-colors w-full"
                >
                    <SparklesIcon className="w-5 h-5 mr-2 text-yellow-300" />
                    {isLoading ? 'Generating...' : 'Generate Design Document'}
                </button>
            </div>

            <h4 className="text-xl font-semibold mb-3 mt-2">AI-Generated Design Document</h4>
            {(isLoading && !designDocument) && <div className="flex justify-center items-center h-40"><ArrowPathIcon /> <span className="ml-2">AI is drafting the design document...</span></div>}
            
            {!isLoading && !designDocument && (
                <div className="text-center py-10 border-2 border-dashed border-gray-700 rounded-lg">
                    <p className="text-gray-500">The generated design document will appear here.</p>
                </div>
            )}

            {designDocument && (
                <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 mt-2">
                    <div dangerouslySetInnerHTML={{ __html: renderDesignDocument(designDocument) }} />
                </div>
            )}
        </div>
    );
};

const CodeReviewView = ({ addLog }: { addLog: (source: string, message: string) => void }) => {
    const [summary, setSummary] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSummarize = useCallback(async () => {
        setIsLoading(true);
        setSummary('');
        addLog('User', 'Requested Pull Request summary.');
        try {
            const prompt = `You are a senior developer. Summarize the following code changes from a pull request in a few bullet points. Be concise and focus on the purpose of the changes.\n\nCODE CHANGES:\n\`\`\`diff\n${initialPullRequest.changes}\n\`\`\``;
            const response = await ai.models.generateContent({model: 'gemini-2.5-flash', contents: prompt});
            setSummary(response.text);
            addLog('Orchestrator', 'Generated PR summary.');
        } catch(error) {
            console.error("Error summarizing PR:", error);
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            setSummary("Error generating summary.");
            addLog('Error', `Failed to generate PR summary: ${errorMessage}`);
        }
        setIsLoading(false);
    }, [addLog]);

    return (
        <div className="p-4 h-full flex flex-col bg-gray-900 text-white">
            <div className="mb-4 pb-4 border-b border-gray-700">
                <p className="text-gray-400">Pull Request #{initialPullRequest.id}</p>
                <h3 className="text-2xl font-bold">{initialPullRequest.title}</h3>
                <p className="text-sm text-gray-300">by <span className="font-semibold">{initialPullRequest.author}</span> from branch <code className="font-mono bg-gray-700 px-1.5 py-1 rounded text-cyan-300">{initialPullRequest.branch}</code></p>
            </div>
            <div className="flex items-center space-x-8 mb-4 bg-gray-800 p-3 rounded-lg">
                <div className="flex items-center"><CheckCircleIcon /><span className="ml-2 text-gray-300">{initialPullRequest.tests.passed} Tests Passed</span></div>
                <div className="flex items-center"><XCircleIcon /><span className="ml-2 text-gray-300">{initialPullRequest.tests.failed} Tests Failed</span></div>
                <div><span className="text-gray-400 font-semibold">Coverage: </span><span className="text-green-400 font-bold">{initialPullRequest.tests.coverage}</span></div>
            </div>
            
            <div className="mb-4">
                <button onClick={handleSummarize} disabled={isLoading} className="flex items-center bg-sky-600 hover:bg-sky-500 text-white font-semibold py-2 px-4 rounded-md disabled:bg-gray-500 transition-colors">
                    <SparklesIcon className="w-5 h-5 mr-2 text-yellow-300" />
                    {isLoading ? 'Summarizing...' : 'Summarize Changes'}
                </button>
                {summary && (
                    <div className="mt-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
                        <h4 className="font-bold text-white mb-2">✨ AI Summary:</h4>
                        <div className="text-gray-300 whitespace-pre-wrap prose prose-invert prose-sm" dangerouslySetInnerHTML={{ __html: summary.replace(/\n/g, '<br />') }} />
                    </div>
                )}
            </div>

            <div className="flex-grow bg-gray-900 border border-gray-700 rounded-lg p-4 font-mono text-sm overflow-y-auto custom-scrollbar">
                {initialPullRequest.changes.split('\n').map((line, i) => (
                    <div key={i} className={`flex items-start px-2 ${line.startsWith('+') ? 'bg-green-900/20' : line.startsWith('-') ? 'bg-red-900/20' : ''}`}>
                        <span className="w-8 text-right pr-4 text-gray-500 select-none">{i + 1}</span>
                        <span className={`w-4 text-center ${line.startsWith('+') ? 'text-green-400' : line.startsWith('-') ? 'text-red-400' : 'text-gray-500'}`}>{line.startsWith('+') ? '+' : line.startsWith('-') ? '-' : ' '}</span>
                        <pre className="whitespace-pre-wrap flex-1"><code className={`${line.startsWith('+') ? 'text-green-300' : line.startsWith('-') ? 'text-red-300' : 'text-gray-400'}`}>{line.substring(1)}</code></pre>
                    </div>
                ))}
            </div>
        </div>
    );
};

const CodeEditor = ({ activeFile, onCodeChange }: { activeFile: FileNode | null, onCodeChange: (newContent: string) => void }) => {
    if (!activeFile) {
        return <div className="flex items-center justify-center h-full text-gray-500">Select a file to view its content.</div>;
    }

    const highlightedCode = useMemo(() => 
        applySyntaxHighlighting(activeFile.content, activeFile.extension),
        [activeFile.content, activeFile.extension]
    );

    const lineCount = useMemo(() => (activeFile.content || '').split('\n').length, [activeFile.content]);

    return (
        <div className="font-mono text-sm text-gray-200 h-full flex overflow-hidden bg-gray-900">
            <div className="py-2 pr-4 text-right text-gray-500 select-none sticky top-0 bg-gray-900 border-r border-gray-700/50">
                {Array.from({ length: lineCount }, (_, i) => <div key={i}>{i + 1}</div>)}
            </div>
            <div className="relative w-full h-full">
                <textarea
                    value={activeFile.content}
                    onChange={(e) => onCodeChange(e.target.value)}
                    className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-white p-2 resize-none focus:outline-none leading-relaxed tracking-wide custom-scrollbar"
                    style={{ WebkitTextFillColor: 'transparent' }}
                    spellCheck="false"
                    autoComplete="off"
                    autoCapitalize="off"
                />
                <pre className="absolute inset-0 p-2 pointer-events-none w-full h-full overflow-auto custom-scrollbar leading-relaxed tracking-wide" aria-hidden="true">
                    <code className="block whitespace-pre" dangerouslySetInnerHTML={{ __html: highlightedCode }} />
                </pre>
            </div>
        </div>
    );
};

const CenterPanel = ({ activeFile, onCodeChange, formatCode, addLog }: { activeFile: FileNode | null, onCodeChange: (newContent: string) => void, formatCode: () => void, addLog: (source: string, message: string) => void }) => {
  const [activeTab, setActiveTab] = useState('code');
  const [designDocument, setDesignDocument] = useState('');

  const handleGenerateDesign = async (docText: string) => {
    addLog('User', 'Requested design document generation.');
    const prompt = `Based on the following project description, generate a detailed software design document. The document should include sections for: User Stories, System Architecture, UI/UX Flow, and Data Models. Use markdown for formatting.\n\nPROJECT DESCRIPTION:\n${docText}`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        setDesignDocument(response.text);
        addLog('UI/UX Architect', 'Generated system design document.');
    } catch (error) {
        console.error("Error generating design doc:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        setDesignDocument(`### Error\nFailed to generate design document:\n${errorMessage}`);
        addLog('Error', `Failed to generate design document: ${errorMessage}`);
    }
  };
  
  const TABS = [
    { id: 'code', label: 'Code Editor', icon: <CodeBracketIcon /> },
    { id: 'design', label: 'System Design', icon: <DocumentTextIcon /> },
    { id: 'canvas', label: 'UI Canvas', icon: <SparklesIcon className="w-5 h-5 mr-1" /> },
    { id: 'review', label: 'Code Review', icon: <CheckCircleIcon /> },
  ];

  return (
    <main className="flex-1 flex flex-col bg-gray-900 min-w-0">
      <div className="flex items-center border-b border-gray-700 bg-gray-800/50">
        {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id ? 'text-white border-blue-500' : 'text-gray-400 border-transparent hover:text-white hover:bg-gray-800'}`}>
                {tab.icon}
                <span className="ml-1">{tab.label}</span>
            </button>
        ))}
        {activeTab === 'code' && activeFile && (
            <div className="ml-auto flex items-center pr-4">
                 <button onClick={formatCode} className="flex items-center text-gray-400 hover:text-white transition-colors p-2 rounded-md hover:bg-gray-700">
                    <WandIcon />
                    <span className="ml-1 text-sm hidden md:inline">Format</span>
                </button>
            </div>
        )}
      </div>

      <div className="flex-grow overflow-y-auto">
        {activeTab === 'code' && (
            <CodeEditor activeFile={activeFile} onCodeChange={onCodeChange} />
        )}
        {activeTab === 'design' && <DesignView onProcess={handleGenerateDesign} designDocument={designDocument} />}
        {activeTab === 'canvas' && <CanvasView addLog={addLog} />}
        {activeTab === 'review' && <CodeReviewView addLog={addLog} />}
      </div>
    </main>
  );
};

const RightPanel = ({ conversation, onSendMessage, logs, files, isFullscreen, onToggleFullscreen }: { conversation: Message[], onSendMessage: (text: string) => Promise<void>, logs: TerminalLog[], files: FileNode[], isFullscreen: boolean, onToggleFullscreen: () => void }) => {
    const [activeTab, setActiveTab] = useState('preview'); // 'preview', 'terminal'
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const terminalEndRef = useRef<HTMLDivElement>(null);

    const getFileContent = useCallback((path: string): string => {
        const pathParts = path.replace(/^\//, '').split('/');
        let currentLevel: FileNode[] | undefined = files;
        let foundNode: FileNode | undefined;

        for (const part of pathParts) {
            if (!currentLevel) return '';
            foundNode = currentLevel.find(f => f.name === part);
            if (!foundNode) return '';
            currentLevel = foundNode.children;
        }
        return foundNode?.content || '';
    }, [files]);
    
    useEffect(() => {
        if (activeTab === 'preview' && iframeRef.current) {
            // This is a simplified preview. For a real app, an in-browser bundler/transpiler
            // would be needed to handle TSX and module imports correctly. For now,
            // we just display the raw index.html, which may not function fully.
            iframeRef.current.srcdoc = getFileContent('public/index.html');
        }
    }, [files, activeTab, getFileContent]);

    useEffect(() => {
        terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    return (
        <aside className={`bg-gray-800/50 backdrop-blur-sm border-l border-gray-700 w-[500px] flex flex-col shrink-0 ${isFullscreen ? 'hidden' : ''}`}>
            {/* Top part: Live App Preview + Terminal */}
            <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center p-2 border-b border-gray-700 bg-gray-800">
                    <button onClick={() => setActiveTab('preview')} className={`px-3 py-1 text-sm rounded-md ${activeTab === 'preview' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>
                        Live App Preview
                    </button>
                    <button onClick={() => setActiveTab('terminal')} className={`px-3 py-1 text-sm rounded-md ml-2 ${activeTab === 'terminal' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>
                        Terminal / Logs
                    </button>
                    <div className="ml-auto">
                         <button onClick={onToggleFullscreen} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md">
                            <FullscreenEnterIcon />
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-auto bg-gray-900">
                    {activeTab === 'preview' && (
                        <iframe ref={iframeRef} title="Live App Preview" className="w-full h-full border-0 bg-white" sandbox="allow-scripts allow-same-origin"></iframe>
                    )}
                    {activeTab === 'terminal' && (
                        <div className="p-2 font-mono text-xs text-gray-300">
                            {logs.map((log, i) => (
                                <div key={i} className="flex">
                                    <span className="text-gray-500 mr-2">{log.time}</span>
                                    <span className="text-purple-400 font-bold mr-2 w-28 shrink-0">[{log.source}]</span>
                                    <p className="whitespace-pre-wrap">{log.message}</p>
                                </div>
                            ))}
                            <div ref={terminalEndRef} />
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom part: Chat View */}
            <div className="h-1/2 border-t border-gray-700">
                <ChatView conversation={conversation} onSendMessage={onSendMessage} />
            </div>
        </aside>
    );
};

const App = () => {
    const [files, setFiles] = useState<FileNode[]>(initialFileStructure);
    const [activeFile, setActiveFile] = useState<FileNode | null>(initialFileStructure[0]?.children?.[0] ?? null);
    const [agents, setAgents] = useState<Agent[]>(initialAgents);
    const [conversation, setConversation] = useState<Message[]>(initialConversation);
    const [logs, setLogs] = useState<TerminalLog[]>(initialTerminalLogs);
    const [isFullscreen, setIsFullscreen] = useState(false);
    
    const addLog = useCallback((source: string, message: string) => {
        const time = new Date().toLocaleTimeString('en-US', { hour12: false });
        setLogs(prev => [...prev.slice(-100), { time, source, message }]); // Keep last 100 logs
    }, []);

    const updateFileContent = useCallback((path: string, newContent: string) => {
        setFiles(prevFiles => {
            const newFiles = JSON.parse(JSON.stringify(prevFiles));
            
            let found = false;
            function findAndUpdate(nodes: FileNode[]) {
                if (found) return;
                for (let i = 0; i < nodes.length; i++) {
                    if (nodes[i].path === path) {
                        nodes[i].content = newContent;
                        found = true;
                        return;
                    }
                    if (nodes[i].children) {
                        findAndUpdate(nodes[i].children!);
                    }
                }
            }
    
            findAndUpdate(newFiles);
            return newFiles;
        });

        setActiveFile(prevActiveFile => {
            if (prevActiveFile?.path === path) {
                return { ...prevActiveFile, content: newContent };
            }
            return prevActiveFile;
        });
    }, []);

    const handleCodeChange = useCallback((newContent: string) => {
        if (activeFile) {
            updateFileContent(activeFile.path, newContent);
        }
    }, [activeFile, updateFileContent]);
    
    const formatCode = useCallback(() => {
        if (!activeFile || typeof activeFile.content !== 'string') return;
        
        // @ts-ignore
        const prettier = window.prettier;
        // @ts-ignore
        const prettierPlugins = window.prettierPlugins;
        
        if (!prettier || !prettierPlugins || !prettierPlugins.babel || !prettierPlugins.html || !prettierPlugins.estree) {
            addLog('Error', 'Prettier library or plugins not found.');
            console.error('Prettier not available on window object');
            return;
        }
        
        let parser: string;
        switch (activeFile.extension) {
            case 'html': parser = 'html'; break;
            case 'json': parser = 'json'; break;
            case 'tsx': case 'ts': case 'js':
                parser = 'babel'; break;
            default:
                addLog('Editor', `Formatting not supported for .${activeFile.extension} files.`);
                return;
        }
        
        try {
            const formatted = prettier.format(activeFile.content, {
                parser: parser,
                plugins: [prettierPlugins.babel, prettierPlugins.html, prettierPlugins.estree],
                semi: true,
                singleQuote: true,
                jsxSingleQuote: false,
                trailingComma: 'all',
            });
            updateFileContent(activeFile.path, formatted);
            addLog('Editor', `Formatted ${activeFile.name}`);
        } catch (error) {
            console.error('Prettier formatting error:', error);
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            addLog('Error', `Failed to format ${activeFile.name}: ${errorMessage}`);
        }
    }, [activeFile, addLog, updateFileContent]);

    const handleSendMessage = async (text: string) => {
        const newUserMessage: Message = { from: 'user', text };
        setConversation(prev => [...prev, newUserMessage]);
        addLog('User', text);
        
        const aiResponse: Message = { from: 'ai', text: "I have received your instruction. My team and I will get to work." };
        setTimeout(() => {
            setConversation(prev => [...prev, aiResponse]);
            addLog('Orchestrator', aiResponse.text);
        }, 1000);
    };

    const handleToggleFullscreen = useCallback(() => {
        const doc = window.document;
        const isCurrentlyFullscreen = doc.fullscreenElement != null;

        if (!isCurrentlyFullscreen) {
            doc.documentElement.requestFullscreen().catch(err => {
                alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            });
        } else {
             if (doc.exitFullscreen) {
                doc.exitFullscreen();
            }
        }
    }, []);

    useEffect(() => {
        const fullscreenChangeHandler = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        const keydownHandler = (e: KeyboardEvent) => {
            if (e.key === 'F11') {
                e.preventDefault();
                handleToggleFullscreen();
            }
        };

        document.addEventListener('fullscreenchange', fullscreenChangeHandler);
        document.addEventListener('keydown', keydownHandler);

        return () => {
            document.removeEventListener('fullscreenchange', fullscreenChangeHandler);
            document.removeEventListener('keydown', keydownHandler);
        };
    }, [handleToggleFullscreen]);
    
    const getFileContent = useCallback((path: string): string => {
        const pathParts = path.replace(/^\//, '').split('/');
        let currentLevel: FileNode[] | undefined = files;
        let foundNode: FileNode | undefined;

        for (const part of pathParts) {
            if (!currentLevel) return '';
            foundNode = currentLevel.find(f => f.name === part);
            if (!foundNode) return '';
            currentLevel = foundNode.children;
        }
        return foundNode?.content || '';
    }, [files]);

    return (
        <div className="grid h-screen w-screen bg-gray-900 text-white font-sans overflow-hidden" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
            <LeftPanel agents={agents} files={files} onFileSelect={setActiveFile} activeFile={activeFile} />
            
            <main className={`flex-1 flex flex-col min-w-0 ${isFullscreen ? 'hidden' : ''}`}>
                 <CenterPanel activeFile={activeFile} onCodeChange={handleCodeChange} formatCode={formatCode} addLog={addLog} />
            </main>

            <RightPanel
                conversation={conversation}
                onSendMessage={handleSendMessage}
                logs={logs}
                files={files}
                isFullscreen={isFullscreen}
                onToggleFullscreen={handleToggleFullscreen}
            />

            {/* Fullscreen Preview Portal */}
            {isFullscreen && (
                <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">
                     <div className="p-2 bg-gray-800 flex justify-end shrink-0">
                         <button onClick={handleToggleFullscreen} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md">
                             <FullscreenExitIcon />
                         </button>
                     </div>
                     <iframe srcDoc={getFileContent('public/index.html')} title="Live App Preview" className="w-full flex-1 border-0 bg-white" sandbox="allow-scripts allow-same-origin"></iframe>
                </div>
            )}
        </div>
    );
}

// Inject styles for custom scrollbar and loading animation
const style = document.createElement('style');
style.textContent = `
    .custom-scrollbar::-webkit-scrollbar { width: 8px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(107, 114, 128, 0.5); border-radius: 4px; border: 2px solid transparent; background-clip: content-box; }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: rgba(156, 163, 175, 0.5); }
    
    .dot-flashing { position: relative; width: 6px; height: 6px; border-radius: 5px; background-color: #9880ff; color: #9880ff; animation: dot-flashing 1s infinite linear alternate; animation-delay: 0.5s; }
    .dot-flashing::before, .dot-flashing::after { content: ''; display: inline-block; position: absolute; top: 0; }
    .dot-flashing::before { left: -10px; width: 6px; height: 6px; border-radius: 5px; background-color: #9880ff; color: #9880ff; animation: dot-flashing 1s infinite alternate; animation-delay: 0s; }
    .dot-flashing::after { left: 10px; width: 6px; height: 6px; border-radius: 5px; background-color: #9880ff; color: #9880ff; animation: dot-flashing 1s infinite alternate; animation-delay: 1s; }
    @keyframes dot-flashing { 0% { background-color: #9880ff; } 50%, 100% { background-color: rgba(152, 128, 255, 0.2); } }
`;
document.head.appendChild(style);

export default App;
