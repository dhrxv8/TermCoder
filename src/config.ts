import dotenv from "dotenv";
dotenv.config();

export const CFG = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-4o-mini",
  EMBED_MODEL: process.env.EMBED_MODEL || "text-embedding-3-small",
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || "",
  SHELL_TIMEOUT_MS: Number(process.env.SHELL_TIMEOUT_MS || 300000),
  ALLOW_COMMANDS: [
    // package & build
    "npm", "pnpm", "yarn", "node", "uv", "python", "pip", "pipx",
    // tests  
    "pytest", "npx", "go", "cargo", "tsc",
    // linters & formatters
    "eslint", "prettier", "ruff", "flake8", "golangci-lint",
    // vcs
    "git"
  ],
};