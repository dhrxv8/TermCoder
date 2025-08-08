import inquirer from "inquirer";
import keytar from "keytar";
import { saveConfig, AppConfig } from "./state/config.js";

const PROVIDERS = ["openai", "anthropic", "xai", "google", "mistral", "cohere", "ollama"] as const;

const PROVIDER_NAMES = {
  openai: "OpenAI (GPT-4, ChatGPT)",
  anthropic: "Anthropic (Claude)",
  xai: "xAI (Grok)",
  google: "Google (Gemini)",
  mistral: "Mistral AI",
  cohere: "Cohere",
  ollama: "Ollama (Local Models)"
};

const PROVIDER_HELP = {
  openai: "Get API key at: https://platform.openai.com/api-keys",
  anthropic: "Get API key at: https://console.anthropic.com/account/keys",
  xai: "Get API key at: https://console.x.ai/team/api-keys",
  google: "Get API key at: https://aistudio.google.com/app/apikey",
  mistral: "Get API key at: https://console.mistral.ai/api-keys/",
  cohere: "Get API key at: https://dashboard.cohere.com/api-keys"
};

export async function runOnboarding(): Promise<AppConfig> {
  console.log("");
  console.log("🚀 Welcome to TermCode");
  console.log("   Universal terminal coding agent with multi-provider AI support");
  console.log("");
  console.log("Let's get you set up...");
  console.log("");

  // Select providers
  const { providers } = await inquirer.prompt([{
    type: "checkbox",
    name: "providers",
    message: "Select providers to enable:",
    choices: PROVIDERS.map(p => ({
      name: PROVIDER_NAMES[p],
      value: p,
      checked: p === "openai" // Default to OpenAI
    })),
    validate: (input: string[]) => input.length > 0 || "Please select at least one provider"
  }]);

  // Collect API keys
  for (const provider of providers) {
    if (provider === "ollama") {
      console.log(`✓ ${(PROVIDER_NAMES as any)[provider]} - runs locally, no API key needed`);
      continue;
    }

    const { key } = await inquirer.prompt([{
      type: "password",
      name: "key",
      message: `API key for ${(PROVIDER_NAMES as any)[provider]} (blank to skip):`,
      mask: "•"
    }]);

    if (key && key.trim()) {
      await keytar.setPassword("termcode", `provider:${provider}`, key.trim());
      console.log(`✓ API key saved securely for ${provider}`);
    } else {
      console.log(`⚠ No API key provided for ${provider}. Add later with /keys command`);
      if (PROVIDER_HELP[provider as keyof typeof PROVIDER_HELP]) {
        console.log(`  ${PROVIDER_HELP[provider as keyof typeof PROVIDER_HELP]}`);
      }
    }
  }

  // Select default provider
  const { defaultProvider } = await inquirer.prompt([{
    type: "list",
    name: "defaultProvider",
    message: "Default provider:",
    choices: providers.map((p: string) => ({
      name: PROVIDER_NAMES[p as keyof typeof PROVIDER_NAMES],
      value: p
    }))
  }]);

  // Default model configurations
  const models: Record<string, { chat?: string; embed?: string }> = {
    openai: { chat: "gpt-4o-mini", embed: "text-embedding-3-small" },
    anthropic: { chat: "claude-3-5-sonnet-20241022" },
    xai: { chat: "grok-beta" },
    google: { chat: "gemini-1.5-pro", embed: "text-embedding-004" },
    mistral: { chat: "mistral-large-latest", embed: "mistral-embed" },
    cohere: { chat: "command-r-plus", embed: "embed-english-v3.0" },
    ollama: { chat: "llama3.1:8b" }
  };

  // Tool configuration
  const { enableShell, enableGit, testsBehavior, enableBrowser } = await inquirer.prompt([
    {
      type: "confirm",
      name: "enableShell",
      message: "Enable shell commands?",
      default: true
    },
    {
      type: "confirm",
      name: "enableGit",
      message: "Enable Git integration?",
      default: true
    },
    {
      type: "list",
      name: "testsBehavior",
      message: "Test runner behavior:",
      choices: [
        { name: "Auto-detect and run tests", value: "auto" },
        { name: "Off (never run tests)", value: false }
      ],
      default: "auto"
    },
    {
      type: "confirm",
      name: "enableBrowser",
      message: "Enable browser automation? (experimental)",
      default: false
    }
  ]);

  // Budget setting
  const { monthlyBudget } = await inquirer.prompt([{
    type: "input",
    name: "monthlyBudget",
    message: "Monthly budget limit (USD):",
    default: "10"
  }]);

  const tools = {
    shell: Boolean(enableShell),
    git: Boolean(enableGit),
    tests: testsBehavior === "auto" ? "auto" as const : Boolean(testsBehavior),
    browser: Boolean(enableBrowser),
  };

  const config: AppConfig = {
    defaultProvider,
    models: {
      openai:   { chat: "gpt-4o-mini",        embed: "text-embedding-3-small" },
      anthropic:{ chat: "claude-3-5-sonnet" },
      xai:      { chat: "grok-2" },
      google:   { chat: "gemini-1.5-pro" },
      mistral:  { chat: "mistral-large-latest" },
      cohere:   { chat: "command-r-plus",     embed: "embed-english-v3.0" },
      ollama:   { chat: "llama3.1:8b" }
    },
    tools,
    routing: { fallback: [defaultProvider], budgetUSDMonthly: Number(monthlyBudget || 10) }
  };

  await saveConfig(config);

  console.log("");
  console.log("✅ Setup complete!");
  console.log("");
  console.log(`🎯 Default provider: ${PROVIDER_NAMES[defaultProvider as keyof typeof PROVIDER_NAMES]}`);
  console.log(`💰 Monthly budget: $${monthlyBudget}`);  
  console.log("🔐 API keys stored securely in OS keychain");
  console.log("");
  console.log("💡 Quick tips:");
  console.log("  • Use /help to see all commands");
  console.log("  • Use /config to manage settings");
  console.log("  • Use /health to check provider status");
  console.log("");
  console.log("🚀 You're ready to start coding!");
  console.log("");

  return config;
}

export async function getProviderKey(provider: string): Promise<string | null> {
  return await keytar.getPassword("termcode", `provider:${provider}`);
}

export async function setProviderKey(provider: string, key: string): Promise<void> {
  await keytar.setPassword("termcode", `provider:${provider}`, key);
}

export async function listProviderKeys(): Promise<string[]> {
  const credentials = await keytar.findCredentials("termcode");
  return credentials
    .filter(cred => cred.account.startsWith("provider:"))
    .map(cred => cred.account.replace("provider:", ""));
}