// File: src/App.tsx
import {
 Panel,
 PanelGroup,
 PanelResizeHandle,
} from "react-resizable-panels";
import Editor from "@monaco-editor/react";
import { useState, useMemo } from 'react';
import "./App.css";

// 1. Data structure of our files
// In a real application, this would be loaded dynamically.
const initialFiles = [
  {
    name: "App.tsx",
    path: "/src/App.tsx",
    content: `import React from 'react';

function Welcome() {
 return <h1>Hello, World!</h1>;
}

export default Welcome;
`,
  },
  {
    name: "styles.css",
    path: "/src/styles.css",
    content: `body {
 margin: 0;
 background-color: #111;
}`,
  },
  {
    name: "index.html",
    path: "/public/index.html",
    content: `<!DOCTYPE html>
<html lang="en">
<head>
<title>My App</title>
</head>
<body>
<div id="root"></div>
</body>
</html>
`,
  },
];

function App() {
  // 2. State for the file list
  const [files, setFiles] = useState(initialFiles);

  // 3. State for tracking which file is currently active (based on its path)
  const [activeFile, setActiveFile] = useState("/src/App.tsx");

  // 4. Function to change the active file
  const handleFileSelect = (path: string) => {
    setActiveFile(path);
  };

  // 5. Function to be executed when any change in the editor content
  const handleEditorChange = (value: string | undefined) => {
    if (value === undefined) return;

    // We create a new copy of the files array and update the contents of the active one
    const newFiles = files.map((file) => {
      if (file.path === activeFile) {
        return { ...file, content: value };
      }
      return file;
    });
    setFiles(newFiles);
  };

  // 6. Using useMemo, we find the contents of the active file so that we don't have to look for it every time we render
  const activeFileContent = useMemo(() => {
    return files.find((file) => file.path === activeFile)?.content || "";
  }, [files, activeFile]);

  return (
    // The main container that defines the height of the entire application
    <div className="app-container">
      <PanelGroup direction="horizontal">
        {/* LEFT PANEL: File Explorer */}
        <Panel defaultSize={20} minSize={15}>
          <div className="panel-content">File Explorer</div>
 <div className="file-explorer">
 <div className="file-explorer-header">EXPLORER</div>
 {files.map((file) => (
 <button
 key={file.path}
 className={`file-item ${file.path === activeFile ? "active" : ""}`}
 onClick={() => handleFileSelect(file.path)}
 >
 {file.name}
 </button>))}</div>
        </Panel>

        <PanelResizeHandle className="resize-handle" />

        {/* RIGHT PANEL: Contains the editor and terminal */}
        <Panel minSize={30}>
          <PanelGroup direction="vertical">
            {/* TOP PANEL: Linking the editor to the state */}
            <Panel defaultSize={75} minSize={25}>
              <Editor
                height="100%"
                // The key ensures that the editor reloads when a file is changed
                // This is important for proper history (undo/redo)
                key={activeFile}
                defaultLanguage="typescript"
                theme="vs-dark"
                value={activeFileContent}
                onChange={handleEditorChange}
                options={{
                  minimap: { enabled: true },
                  fontSize: 14,
                  wordWrap: "on",
                }}
              />
            </Panel>

            <PanelResizeHandle className="resize-handle" />

            {/* BOTTOM PANEL: Terminal */}
            <Panel defaultSize={25} minSize={10}>
              <div className="panel-content">Terminal / Preview</div>
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>
    </div>
  );
}

export default App;

// Example code that will be displayed in the editor on startup
const exampleCode = `import React from 'react';

function Welcome() {
  return <h1>Hello, World!</h1>;
}

export default Welcome;
`;