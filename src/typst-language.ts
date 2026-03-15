import { languages } from "monaco-editor";

export const conf: languages.LanguageConfiguration = {
  comments: {
    lineComment: "//",
    blockComment: ["/*", "*/"],
  },
  brackets: [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
  ],
  autoClosingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"' },
    { open: "`", close: "`" },
    { open: "$", close: "$" },
  ],
  surroundingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"' },
    { open: "`", close: "`" },
    { open: "$", close: "$" },
  ],
};

export const language: languages.IMonarchLanguage = {
  defaultToken: "",
  tokenPostfix: ".typ",

  keywords: [
    "let",
    "set",
    "show",
    "if",
    "else",
    "for",
    "in",
    "while",
    "break",
    "continue",
    "return",
    "import",
    "include",
    "as",
    "none",
    "auto",
    "true",
    "false",
    "and",
    "or",
    "not",
  ],

  tokenizer: {
    root: [
      // Headings
      [/^={1,6}\s.*$/, "keyword"],

      // Comments
      [/\/\/.*/, "comment"],
      [/\/\*/, "comment", "@comment"],

      // Strings
      [/"([^"\\]|\\.)*$/, "string.invalid"],
      [/"/, "string", "@string"],

      // Raw code blocks
      [/`{3}.*$/, "string", "@rawBlock"],
      [/`[^`]*`/, "string"],

      // Math
      [/\$[^$]*\$/, "string.quote"],

      // Commands and labels
      [/#\w+/, "keyword"],
      [/<\w+>/, "tag"],
      [/@\w+/, "tag"],

      // Bold and Italic
      [/\*[^*]+\*/, "strong"],
      [/_[^_]+_/, "emphasis"],

      // Brackets and Operators
      [/[{}()\[\]]/, "@brackets"],
      [/[+\-*\/%=<>!&|]/, "operator"],

      // Numbers
      [/\d*\.\d+([eE][\-+]?\d+)?/, "number.float"],
      [/0[xX][0-9a-fA-F]+/, "number.hex"],
      [/\d+/, "number"],

      // Identifiers
      [
        /[a-zA-Z_]\w*/,
        {
          cases: {
            "@keywords": "keyword",
            "@default": "identifier",
          },
        },
      ],
    ],

    comment: [
      [/[^\/*]+/, "comment"],
      [/\*\//, "comment", "@pop"],
      [/[\/*]/, "comment"],
    ],

    string: [
      [/[^\\"]+/, "string"],
      [/\\./, "string.escape"],
      [/"/, "string", "@pop"],
    ],

    rawBlock: [
      [/^`{3}$/, "string", "@pop"],
      [/./, "string"],
    ],
  },
};
