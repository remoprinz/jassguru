module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
    "google",
    "plugin:@typescript-eslint/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    sourceType: "module",
  },
  ignorePatterns: [
    "/lib/**/*", // Ignore built files.
    "/generated/**/*", // Ignore generated files.
    "/_next/**/*", // Ignore Next.js build output.
    "/.next/**/*", // Ignore Next.js build output.
    "/out/**/*", // Ignore build output.
    "/functions/**/*", // Ignore functions directory (has its own ESLint config).
    "/scripts/**/*", // Ignore scripts directory (excluded from tsconfig.json).
  ],
  plugins: [
    "@typescript-eslint",
    "import",
  ],
  overrides: [
    {
      files: ["*.ts", "*.tsx"],
      parserOptions: {
        project: ["tsconfig.json"],
        sourceType: "module",
      },
    },
  ],
  rules: {
    "quotes": "off",
    "import/no-unresolved": 0,
    "indent": "off",
    "max-len": "off",
    "require-jsdoc": "off",
    "valid-jsdoc": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "object-curly-spacing": "off",
    "comma-dangle": "off",
    "no-trailing-spaces": "off",
    "arrow-parens": "off",
    "no-multi-spaces": "off",
    "operator-linebreak": "off",
    "eol-last": "off",
    "padded-blocks": "off",
    "camelcase": "off", // Deaktiviert - deutsche Variablennamen werden verwendet
    "brace-style": "off", // Deaktiviert - zu restriktiv
    "no-empty": "off", // Deaktiviert - leere Blöcke sind manchmal notwendig
    "@typescript-eslint/no-var-requires": "off", // Deaktiviert - require() wird manchmal benötigt
    "no-inner-declarations": "off", // Deaktiviert - zu restriktiv
    "no-prototype-builtins": "off", // Deaktiviert - hasOwnProperty ist manchmal notwendig
    "no-useless-escape": "off", // Deaktiviert - Escape-Zeichen können notwendig sein
    "no-useless-catch": "off", // Deaktiviert - try/catch Wrapper können notwendig sein
    "no-throw-literal": "off", // Deaktiviert - Literale können geworfen werden
    "no-self-assign": "warn", // Warnung statt Fehler
    "no-dupe-else-if": "warn", // Warnung statt Fehler
    "import/no-duplicates": "off", // Deaktiviert - doppelte Imports sind manchmal notwendig
  },
};
