import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores:["dist/**","node_modules/**","data/**","design-qa-evidence/**","scripts/prepare-sites-build.mjs","worker/index.js"] },
  js.configs.recommended,
  {
    files:["public/sw.js"],
    languageOptions:{ ecmaVersion:"latest",globals:globals.serviceworker },
  },
  {
    files:["src/**/*.{js,jsx}","server/**/*.mjs","tests/**/*.mjs","vite.config.mjs"],
    languageOptions:{ ecmaVersion:"latest",sourceType:"module",globals:{...globals.browser,...globals.node},parserOptions:{ecmaFeatures:{jsx:true}} },
    plugins:{"react-hooks":reactHooks},
    rules:{"no-unused-vars":["warn",{argsIgnorePattern:"^_",varsIgnorePattern:"^_"}],"react-hooks/rules-of-hooks":"error","react-hooks/exhaustive-deps":"warn"},
  },
];
