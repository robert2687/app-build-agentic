// File: src/App.tsx
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";
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
            {/* TOP PANEL: Code Editor */}
            <Panel defaultSize={75} minSize={25}>
              <div className="panel-content">Code Editor</div>
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