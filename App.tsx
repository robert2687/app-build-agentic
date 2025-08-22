
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";

// --- TYPES ---
interface FileNode {
  name: string;
  type: 'folder' | 'file';
  extension?: string;
  children?: FileNode[];
}

interface Agent {
  name: string;
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

interface Requirement {
  id: string;
  type: 'Functional' | 'Non-Functional' | 'User Story';
  title: string;
  description: string;
  acceptanceCriteria: string[];
}


// --- ICONS (as stateless functional components) ---
const FolderIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-sky-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
);

const FileIcon = ({ extension }: { extension?: string }) => {
  const color = {
    js: 'text-yellow-400', tsx: 'text-blue-400', html: 'text-orange-500', json: 'text-green-500',
  }[extension || ''] || 'text-gray-400';
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 mr-2 ${color} shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
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

const CheckCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-green-500"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>;
const XCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-red-500"><path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>;
const ArrowPathIcon = ({ spinning = true }: { spinning?: boolean }) => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 text-blue-400 ${spinning ? 'animate-spin' : ''}`}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 11.667 0l3.181-3.183m-4.991-2.691v4.992m0 0-3.182-3.182a8.25 8.25 0 0 1-11.667 0l-3.181 3.182m4.991 2.691H7.965M16.023 9.348A8.25 8.25 0 0 1 19.5 12m0 0a8.25 8.25 0 0 1-3.477 6.651m-3.477-6.651a8.25 8.25 0 0 0-3.477-6.651m3.477 6.651L12 12" /></svg>;
const SparklesIcon = ({ className = "w-5 h-5 mr-3 text-yellow-400" }) => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" /></svg>;

// --- MOCK DATA ---
const initialFileStructure: FileNode[] = [
  { name: 'src', type: 'folder', children: [
      { name: 'components', type: 'folder', children: [
          { name: 'RecipeCard.tsx', type: 'file', extension: 'tsx' },
          { name: 'RatingStars.tsx', type: 'file', extension: 'tsx' },
      ]},
      { name: 'App.tsx', type: 'file', extension: 'tsx' },
  ]},
  { name: 'public', type: 'folder', children: [
      { name: 'index.html', type: 'file', extension: 'html' },
  ]},
  { name: 'package.json', type: 'file', extension: 'json' },
];
const initialAgents: Agent[] = [
  { name: 'Requirements Analyst', status: 'Idle' },
  { name: 'UI/UX Architect', status: 'Active', task: 'Designing recipe detail view...' },
  { name: 'Frontend Coder', status: 'Active', task: 'Implementing login form...' },
  { name: 'Backend Coder', status: 'Idle' },
  { name: 'QA & Security Agent', status: 'Idle' },
  { name: 'DevOps & Deployment Agent', status: 'Idle' },
];
const initialConversation: Message[] = [
    { from: 'user', text: 'Build me a recipe tracking app with the ability to rate and save favorites.' },
    { from: 'ai', text: 'Understood. I will begin by designing a database schema for recipes and users. Then, our UI/UX agent will create wireframes for the main recipe feed and detail pages. Do you have any initial design preferences?' },
];
const initialPullRequest: PullRequest = {
  id: 42, title: 'feat(auth): Implement user login component', author: 'Frontend Coder Agent', branch: 'feature/login-page',
  changes: `+ import React from 'react';
+
+ const LoginButton = () => (
+   <button className="bg-blue-500 text-white px-4 py-2 rounded-lg">
+     Login
+   </button>
+ );
+
+ export default LoginButton;
- // old code removed`,
  tests: { passed: 18, failed: 0, coverage: '92%' }
};
const initialTerminalLogs: TerminalLog[] = [
  { time: '13:37:01', source: 'Backend Coder', message: 'CREATE TABLE "users" (id uuid primary key, ...)' },
  { time: '13:37:02', source: 'Supabase', message: 'SUCCESS: table "users" created.' },
  { time: '13:37:05', source: 'Frontend Coder', message: 'git checkout -b feature/login-page' },
  { time: '13:37:10', source: 'Frontend Coder', message: 'WRITE src/components/Login.tsx' },
  { time: '13:37:15', source: 'QA Agent', message: 'RUNNING tests for feature/login-page...' },
  { time: '13:37:18', source: 'QA Agent', message: 'SUCCESS: 18/18 tests passed (Coverage: 92%)' },
  { time: '13:37:20', source: 'Orchestrator', message: 'Pull Request #42 created. Awaiting user review.' },
];

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

// --- CHILD COMPONENTS ---

const FileTree = ({ files, level = 0 }: { files: FileNode[], level?: number }) => (
  <div style={{ paddingLeft: `${level * 1}rem` }}>
    {files.map(file => (
      <div key={file.name} className="flex items-center py-1 text-sm text-gray-300 hover:bg-gray-700/50 rounded-md px-2 cursor-pointer transition-colors duration-150">
        {file.type === 'folder' ? <FolderIcon /> : <FileIcon extension={file.extension} />}
        <span>{file.name}</span>
        {file.children && <FileTree files={file.children} level={level + 1} />}
      </div>
    ))}
  </div>
);

const LeftPanel = ({ agents }: { agents: Agent[] }) => (
  <aside className="bg-gray-800/50 backdrop-blur-sm border-r border-gray-700 text-white w-72 p-4 flex flex-col shrink-0">
    <div className="flex items-center mb-6">
      <SparklesIcon className="w-6 h-6 mr-2 text-yellow-400" />
      <h1 className="text-xl font-bold">Agentic</h1>
    </div>
    
    <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-2">Project Files</h2>
    <div className="flex-grow overflow-y-auto mb-6 pr-2 custom-scrollbar">
      <FileTree files={initialFileStructure} />
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

const CanvasView = () => (
    <div className="flex flex-col items-center justify-center h-full bg-gray-800 border-2 border-dashed border-gray-600 rounded-lg m-4">
        <p className="text-gray-400 text-lg">Visual Editor (Gemini Canvas)</p>
        <p className="text-sm text-gray-500 mt-2">Draw UI sketches and collaborate with the UI/UX Architect Agent.</p>
        <button className="mt-4 bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-4 rounded-md transition-colors">Open Canvas</button>
    </div>
);

const RequirementsView = ({ onProcess, requirements }: { onProcess: (docText: string) => Promise<void>, requirements: Requirement[] }) => {
    const [documentText, setDocumentText] = useState('Build a recipe tracking app. Users can create accounts, log in, browse recipes, and save favorites. Each recipe needs ingredients, instructions, and a 1-5 star rating system.');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async () => {
        if (!documentText.trim()) return;
        setIsLoading(true);
        await onProcess(documentText);
        setIsLoading(false);
    }

    return (
        <div className="p-4 h-full flex flex-col bg-gray-900 text-white overflow-y-auto custom-scrollbar">
            <h3 className="text-2xl font-bold mb-2">Requirements Analysis</h3>
            <p className="text-gray-400 mb-4">Provide detailed project documentation below. The Requirements Analyst agent will process it into a structured format.</p>
            
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
                <textarea
                    value={documentText}
                    onChange={(e) => setDocumentText(e.target.value)}
                    placeholder="e.g., Build a recipe tracking app. Users can create accounts..."
                    className="w-full h-40 bg-gray-900 rounded-md p-2 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 custom-scrollbar"
                />
                <button
                    onClick={handleSubmit}
                    disabled={isLoading}
                    className="mt-3 flex items-center justify-center bg-sky-600 hover:bg-sky-500 text-white font-semibold py-2 px-4 rounded-md disabled:bg-gray-500 transition-colors w-full"
                >
                    <SparklesIcon className="w-5 h-5 mr-2 text-yellow-300" />
                    {isLoading ? 'Processing...' : 'Process with AI'}
                </button>
            </div>

            <h4 className="text-xl font-semibold mb-3 mt-2">Structured Requirements</h4>
            {isLoading && requirements.length === 0 && <div className="flex justify-center items-center h-40"><ArrowPathIcon /> <span className="ml-2">AI is analyzing the document...</span></div>}
            
            {!isLoading && requirements.length === 0 && (
                <div className="text-center py-10 border-2 border-dashed border-gray-700 rounded-lg">
                    <p className="text-gray-500">No requirements processed yet.</p>
                    <p className="text-gray-600 text-sm">Output from the AI will appear here.</p>
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
                {requirements.map(req => (
                    <div key={req.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700 hover:border-sky-500 transition-colors flex flex-col">
                        <div className="flex justify-between items-start mb-2">
                             <h5 className="font-bold text-lg text-gray-100 pr-2">{req.title}</h5>
                             <span className="text-xs bg-cyan-800 text-cyan-200 px-2 py-1 rounded-full font-medium shrink-0">{req.type}</span>
                        </div>
                        <p className="text-gray-300 mt-1 mb-3 text-sm flex-grow">{req.description}</p>
                        <div>
                            <h6 className="font-semibold mb-1 text-gray-200 text-sm">Acceptance Criteria</h6>
                            <ul className="list-disc list-inside text-gray-400 space-y-1 text-sm">
                                {req.acceptanceCriteria.map((c, i) => <li key={i}>{c}</li>)}
                                {req.acceptanceCriteria.length === 0 && <li className="text-gray-500">No criteria defined.</li>}
                            </ul>
                        </div>
                    </div>
                ))}
            </div>
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
                    <div key={i} className={`flex items-start ${line.startsWith('+') ? 'bg-green-900/20 text-green-300' : line.startsWith('-') ? 'bg-red-900/20 text-red-300' : 'text-gray-400'}`}>
                        <span className="w-10 text-right pr-4 text-gray-600 select-none">{i + 1}</span>
                        <span className="w-4 select-none">{line.startsWith('+') ? '+' : line.startsWith('-') ? '-' : ' '}</span>
                        <pre className="whitespace-pre-wrap">{line.substring(1)}</pre>
                    </div>
                ))}
            </div>
            <div className="mt-4 flex justify-end space-x-3">
                <button className="bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-6 rounded-md transition-colors">Request Changes</button>
                <button className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-6 rounded-md transition-colors">Approve & Merge</button>
            </div>
        </div>
    );
};

const CenterPanel = ({ conversation, addLog, onSendMessage, onProcessDocument, requirements }: { conversation: Message[], addLog: (source: string, message: string) => void, onSendMessage: (text: string) => Promise<void>, onProcessDocument: (docText: string) => Promise<void>, requirements: Requirement[] }) => {
    const [activeView, setActiveView] = useState('chat');

    return (
        <main className="flex-1 bg-gray-900 flex flex-col">
            <div className="flex border-b border-gray-700">
                <button onClick={() => setActiveView('chat')} className={`py-3 px-5 text-sm font-semibold transition-colors flex items-center ${activeView === 'chat' ? 'bg-gray-800 text-white border-b-2 border-blue-500' : 'text-gray-400 hover:bg-gray-800/50'}`}>Chat</button>
                <button onClick={() => setActiveView('requirements')} className={`py-3 px-5 text-sm font-semibold transition-colors flex items-center ${activeView === 'requirements' ? 'bg-gray-800 text-white border-b-2 border-blue-500' : 'text-gray-400 hover:bg-gray-800/50'}`}><DocumentTextIcon />Requirements</button>
                <button onClick={() => setActiveView('canvas')} className={`py-3 px-5 text-sm font-semibold transition-colors ${activeView === 'canvas' ? 'bg-gray-800 text-white border-b-2 border-blue-500' : 'text-gray-400 hover:bg-gray-800/50'}`}>Canvas</button>
                <button onClick={() => setActiveView('review')} className={`py-3 px-5 text-sm font-semibold relative transition-colors ${activeView === 'review' ? 'bg-gray-800 text-white border-b-2 border-blue-500' : 'text-gray-400 hover:bg-gray-800/50'}`}>
                    Code Review
                    <span className="absolute top-2 right-2 w-3 h-3 bg-blue-500 rounded-full border-2 border-gray-900 animate-pulse"></span>
                </button>
            </div>
            <div className="flex-grow overflow-y-auto">
                {activeView === 'chat' && <ChatView conversation={conversation} onSendMessage={onSendMessage} />}
                {activeView === 'requirements' && <RequirementsView onProcess={onProcessDocument} requirements={requirements} />}
                {activeView === 'canvas' && <CanvasView />}
                {activeView === 'review' && <CodeReviewView addLog={addLog} />}
            </div>
        </main>
    );
}

const RightPanel = ({ conversation, logs, addLog }: { conversation: Message[], logs: TerminalLog[], addLog: (source: string, message: string) => void }) => {
    const [previewContent, setPreviewContent] = useState('<p class="text-gray-500 p-8 text-center">Click "Generate" to see the app live.</p>');
    const [isLoading, setIsLoading] = useState(false);
    const terminalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [logs]);

    const handleGeneratePreview = useCallback(async () => {
        setIsLoading(true);
        addLog('User', 'Requested live preview generation.');
        try {
            const projectDescription = conversation.map(m => `${m.from}: ${m.text}`).join('\n');
            const prompt = `Based on the following project description, generate a single, self-contained HTML file using Tailwind CSS for a simple visual preview. The HTML should represent the main page of the app. DO NOT include <html>, <head>, or <body> tags, only the content that would go inside the body tag. Make it visually appealing.\n\nDESCRIPTION:\n${projectDescription}`;
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
            setPreviewContent(response.text);
            addLog('Orchestrator', 'Generated live preview HTML.');
        } catch(error) {
            console.error("Error generating preview:", error);
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            setPreviewContent(`<p class="text-red-500 p-4">Error generating preview: ${errorMessage}</p>`);
            addLog('Error', `Failed to generate preview: ${errorMessage}`);
        }
        setIsLoading(false);
    }, [addLog, conversation]);

    return (
        <aside className="w-1/3 max-w-2xl bg-gray-800/50 backdrop-blur-sm border-l border-gray-700 flex flex-col">
            <div className="p-4 flex flex-col flex-grow h-1/2">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Live App Preview</h2>
                    <button onClick={handleGeneratePreview} disabled={isLoading} className="flex items-center text-sm bg-sky-600 hover:bg-sky-500 text-white font-semibold py-1 px-3 rounded-md disabled:bg-gray-500 transition-colors">
                        {isLoading ? <ArrowPathIcon spinning={true} /> : <SparklesIcon className="w-4 h-4 text-yellow-300"/>}
                        <span className="ml-1.5">{isLoading ? 'Generating...' : 'Generate'}</span>
                    </button>
                </div>
                <div className="flex-grow bg-white rounded-lg shadow-inner overflow-hidden">
                    <iframe srcDoc={`<script src="https://cdn.tailwindcss.com"></script><body class="bg-gray-100">${previewContent}</body>`} title="Live App Preview" className="w-full h-full border-0" sandbox="allow-scripts" />
                </div>
            </div>
            <div className="h-1/2 p-4 flex flex-col border-t border-gray-700">
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Terminal / Logs</h2>
                <div ref={terminalRef} className="flex-grow bg-black rounded-lg p-3 font-mono text-xs text-gray-300 overflow-y-auto custom-scrollbar">
                    {logs.map((log, i) => (
                        <div key={i} className="flex">
                            <span className="text-gray-500 mr-3 select-none">{log.time}</span>
                            <span className="w-28 text-cyan-400 mr-3 shrink-0 select-none">[{log.source}]</span>
                            <p className="flex-1 break-words whitespace-pre-wrap">{log.message}</p>
                        </div>
                    ))}
                </div>
            </div>
        </aside>
    );
};

// --- MAIN APP COMPONENT ---
export default function App() {
  const [conversation, setConversation] = useState<Message[]>(initialConversation);
  const [terminalLogs, setTerminalLogs] = useState<TerminalLog[]>(initialTerminalLogs);
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [requirements, setRequirements] = useState<Requirement[]>([]);

  const addLog = useCallback((source: string, message: string) => {
    const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
    const newLog: TerminalLog = { time, source, message };
    setTerminalLogs(prev => [...prev, newLog]);
  }, []);

  const handleProcessDocument = useCallback(async (docText: string) => {
    if (!docText.trim()) return;

    setRequirements([]);
    setAgents(prev => prev.map(a => a.name === 'Requirements Analyst' ? {...a, status: 'Active', task: 'Parsing requirements...'} : a));
    addLog('Requirements Analyst', 'Starting analysis of provided document.');

    try {
        const schema = {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING, description: 'A unique identifier for the requirement, e.g., REQ-001.' },
                type: { type: Type.STRING, description: 'The type of requirement (e.g., "Functional", "Non-Functional", "User Story").' },
                title: { type: Type.STRING, description: 'A short, descriptive title for the requirement.' },
                description: { type: Type.STRING, description: 'The full description of the requirement or the user story itself (e.g., "As a user, I want to...").' },
                acceptanceCriteria: {
                  type: Type.ARRAY,
                  description: 'A list of conditions that must be met for the requirement to be considered complete.',
                  items: { type: Type.STRING }
                },
              },
              required: ['id', 'type', 'title', 'description', 'acceptanceCriteria']
            }
        };

        const prompt = `You are a world-class AI Requirements Analyst. Analyze the following project documentation and break it down into a structured list of requirements. For each requirement, provide a unique ID, its type, a title, a detailed description, and a list of acceptance criteria. Output *only* the JSON array, conforming to the provided schema.

DOCUMENTATION:
---
${docText}
---`;
        
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema,
            },
        });
        
        const jsonText = response.text.trim();
        const parsedRequirements = JSON.parse(jsonText);
        setRequirements(parsedRequirements);
        addLog('Requirements Analyst', `Successfully parsed ${parsedRequirements.length} requirements.`);

    } catch(error) {
        console.error("Error processing document:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        addLog('Error', `Failed to process document: ${errorMessage}`);
    } finally {
        setAgents(prev => prev.map(a => a.name === 'Requirements Analyst' ? {...a, status: 'Idle', task: undefined} : a));
    }
  }, [addLog]);

  const handleSendMessage = useCallback(async (text: string) => {
    const newUserMessage: Message = { from: 'user', text };
    setConversation(prev => [...prev, newUserMessage]);
    addLog('User', `Sent prompt: "${text}"`);
    
    try {
        const prompt = `You are an AI Project Manager named Orchestrator. A user said: "${text}". Respond concisely as a project manager, explaining the next steps your AI agent team will take. Use markdown for lists.`;
        const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
        const newAiMessage: Message = { from: 'ai', text: response.text };
        setConversation(prev => [...prev, newAiMessage]);
        addLog('Orchestrator', `Responded: "${response.text.substring(0, 70)}..."`);
    } catch(error) {
        console.error("Error calling Gemini API:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        const newAiMessage: Message = { from: 'ai', text: `Sorry, I encountered an error: ${errorMessage}` };
        setConversation(prev => [...prev, newAiMessage]);
        addLog('Error', `API Call Failed: ${errorMessage}`);
    }
  }, [addLog]);

  return (
    <>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #4a5568; border-radius: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #718096; }
        .dot-flashing { position: relative; width: 6px; height: 6px; border-radius: 5px; background-color: #9880ff; color: #9880ff; animation: dotFlashing 1s infinite linear alternate; animation-delay: .5s; }
        .dot-flashing::before, .dot-flashing::after { content: ''; display: inline-block; position: absolute; top: 0; }
        .dot-flashing::before { left: -10px; width: 6px; height: 6px; border-radius: 5px; background-color: #9880ff; color: #9880ff; animation: dotFlashing 1s infinite alternate; animation-delay: 0s; }
        .dot-flashing::after { left: 10px; width: 6px; height: 6px; border-radius: 5px; background-color: #9880ff; color: #9880ff; animation: dotFlashing 1s infinite alternate; animation-delay: 1s; }
        @keyframes dotFlashing { 0% { background-color: #6b7280; } 50%, 100% { background-color: #d1d5db; } }
      `}</style>
      <div className="flex h-screen w-full bg-gray-900 font-sans text-sm">
        <LeftPanel agents={agents} />
        <CenterPanel
            conversation={conversation}
            addLog={addLog}
            onSendMessage={handleSendMessage}
            onProcessDocument={handleProcessDocument}
            requirements={requirements}
        />
        <RightPanel conversation={conversation} logs={terminalLogs} addLog={addLog} />
      </div>
    </>
  );
}
