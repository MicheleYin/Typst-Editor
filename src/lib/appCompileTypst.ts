import { invoke } from "@tauri-apps/api/core";

export type CompileDiagnostic = {
  severity?: "error" | "warning";
  file: string | null;
  line: number | null;
  column: number | null;
  message: string;
  hints: string[];
  trace: { message: string; line: number | null; column: number | null; file: string | null }[];
};

export type CompileTypstInvokeResult = {
  success: boolean;
  pages: string[];
  pageCount: number;
  diagnostics: CompileDiagnostic[];
  warnings: CompileDiagnostic[];
};

export async function invokeCompileTypst(
  text: string,
  mainPath: string | null,
  projectFolderPath: string | null,
): Promise<CompileTypstInvokeResult> {
  return await invoke<CompileTypstInvokeResult>("compile_typst", {
    content: text,
    mainPath,
    projectFolderPath,
  });
}

export function compileDiagnosticFromUnknownError(err: unknown): CompileDiagnostic {
  return {
    severity: "error",
    message: String(err),
    file: null,
    line: null,
    column: null,
    hints: [],
    trace: [],
  };
}
