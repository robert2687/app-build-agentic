// File: src/App.tsx
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";
import Editor from "@monaco-editor/react";
import "./App.css";

function App() {
  return (
    // The main container that defines the height of the entire application
    <div className="app-container">
      <PanelGroup direction="horizontal">
        {/* LEFT PANEL: File Explorer */}
        <Panel defaultSize={20} minSize={15}>
          <div className="panel-content">File Explorer</div>
        </Panel>

        <PanelResizeHandle className="resize-handle" />

        {/* RIGHT PANEL: Contains the editor and terminal */}
        <Panel minSize={30}>
          <PanelGroup direction="vertical">
            {/* TOP PANEL: Code editor */}
            <Panel defaultSize={75} minSize={25}>
 <Editor
 height="100%"
 defaultLanguage="typescript"
 theme="vs-dark"
 defaultValue={exampleCode}
 options={{
                  minimap: { enabled: true },
                  fontSize: 14,
                  wordWrap: "on",
 }}
 />
            </Panel>

            <PanelResizeHandle className="resize-handle" />

            {/* BOTTOM PANEL: Terminal / Preview */}
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