import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import Editor, { loader } from "@monaco-editor/react";
import * as typstLanguage from "./typst-language";
import "./App.css";

// Register Typst language with Monaco
loader.init().then((monaco) => {
  monaco.languages.register({ id: "typst" });
  monaco.languages.setMonarchTokensProvider("typst", typstLanguage.language);
  monaco.languages.setLanguageConfiguration("typst", typstLanguage.conf);
});

const DEFAULT_CONTENT = `// Welcome to the Typst Editor!

= Introduction
In this editor, you can write *Typst* code and see the live preview on the right.

== Features
- Monaco Editor integration
- Live SVG preview
- Basic syntax highlighting

#set text(fill: blue)
#lorem(20)

$ x^2 + y^2 = r^2 $
`;

function App() {
  const [content, setContent] = useState(DEFAULT_CONTENT);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  const compile = useCallback(async (text: string) => {
    try {
      const result = await invoke<string>("compile_typst", { content: text });
      setSvg(result);
      setError("");
    } catch (err) {
      setError(err as string);
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      compile(content);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [content, compile]);

  return (
    <div className="app-container">
      <div className="editor-pane">
        <Editor
          height="100%"
          defaultLanguage="typst"
          defaultValue={DEFAULT_CONTENT}
          theme="vs-dark"
          onChange={(value) => setContent(value || "")}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            wordWrap: "on",
            automaticLayout: true,
          }}
        />
      </div>
      <div className="preview-pane">
        {error ? (
          <div className="error-display">
            <pre>{error}</pre>
          </div>
        ) : (
          <div 
            className="svg-container"
            dangerouslySetInnerHTML={{ __html: svg }} 
          />
        )}
      </div>
    </div>
  );
}

export default App;
