import inquirer from "inquirer";
import { KeyStore } from "./state/keystore.js";
import { saveConfig, getDefaultConfig } from "./state/config.js";
import { ProviderId, PROVIDERS } from "./providers/types.js";
import { log } from "./util/logging.js";

const PROVIDER_NAMES = {
  openai: "OpenAI (GPT-4, GPT-4o)",
  anthropic: "Anthropic (Claude)",
  xai: "xAI (Grok)",
  google: "Google (Gemini)",
  mistral: "Mistral AI",
  cohere: "Cohere",
  ollama: "Ollama (Local)"
};

const PROVIDER_KEY_URLS = {
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/account/keys",
  xai: "https://console.x.ai/team/api-keys",
  google: "https://aistudio.google.com/app/apikey",
  mistral: "https://console.mistral.ai/api-keys/",
  cohere: "https://dashboard.cohere.com/api-keys"
};

export async function runOnboarding(): Promise<{ defaultProvider: ProviderId }> {
  console.log("\n🚀 Welcome to TermCode! Let's set you up.\n");

  // Provider selection
  const { providers } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "providers",
      message: "Select providers to enable (space to toggle, enter to continue):",
      choices: PROVIDERS.map(id => ({
        name: PROVIDER_NAMES[id],
        value: id,
        checked: id === "openai" // Default to OpenAI
      })),
      validate: (input) => {
        if (input.length === 0) {
          return "Please select at least one provider";
        }
        return true;
      }
    }
  ]);

  // API Key collection
  const enabledProviders: ProviderId[] = providers;
  for (const provider of enabledProviders) {
    if (provider === "ollama") {
      log.info(`Ollama runs locally - no API key needed`);
      continue;
    }

    const { key } = await inquirer.prompt([
      {
        type: "password",
        name: "key",
        message: `Enter API key for ${PROVIDER_NAMES[provider]} (or press enter to skip):`,
        mask: "•"
      }
    ]);

    if (key && key.trim()) {
      await KeyStore.setProviderKey(provider, key.trim());
      log.info(`✓ API key saved securely for ${provider}`);
    } else {
      log.warn(`⚠ No API key provided for ${provider}. You can add it later with: termcoder /keys`);
      if ((PROVIDER_KEY_URLS as any)[provider]) {
        log.info(`  Get your key at: ${(PROVIDER_KEY_URLS as any)[provider]}`);
      }
    }
  }

  // Default provider selection
  const { defaultProvider } = await inquirer.prompt([
    {
      type: "list",
      name: "defaultProvider",
      message: "Choose your default provider:",
      choices: enabledProviders.map(id => ({
        name: PROVIDER_NAMES[id],
        value: id
      }))
    }
  ]);

  // Tools configuration
  const { tools } = await inquirer.prompt([
    {
      type: "confirm",
      name: "shell",
      message: "Enable shell commands?",
      default: true
    },
    {
      type: "confirm", 
      name: "git",
      message: "Enable Git integration?",
      default: true
    },
    {
      type: "list",
      name: "tests",
      message: "Test runner behavior:",
      choices: [
        { name: "Auto-detect and run tests", value: "auto" },
        { name: "Always run tests", value: "on" },
        { name: "Never run tests", value: "off" }
      ],
      default: "auto"
    },
    {
      type: "confirm",
      name: "browser",
      message: "Enable browser automation? (requires Docker/headless Chrome)",
      default: false
    }
  ]);

  // Budget setting
  const { budget } = await inquirer.prompt([
    {
      type: "number",
      name: "budget",
      message: "Monthly budget limit (USD):",
      default: 20,
      validate: (input) => {
        if (input <= 0) return "Budget must be greater than 0";
        return true;
      }
    }
  ]);

  // Save configuration
  const config = getDefaultConfig(defaultProvider);
  config.tools = {
    shell: tools.shell,
    git: tools.git,
    tests: tools.tests,
    browser: tools.browser
  };
  config.routing.budgetUSDMonthly = budget;
  config.routing.fallback = enabledProviders;

  // Only include models for enabled providers
  const filteredModels: any = {};
  for (const provider of enabledProviders) {
    if (config.models[provider]) {
      filteredModels[provider] = config.models[provider];
    }
  }
  config.models = filteredModels;

  await saveConfig(config);

  console.log("\n✅ Setup complete! Configuration saved to ~/.termcode/config.json");
  console.log("🔐 API keys stored securely in your OS keychain");
  
  if (tools.browser) {
    console.log("🌐 Browser tools enabled - make sure you have Docker installed");
  }

  console.log(`\n🎯 Default provider: ${(PROVIDER_NAMES as any)[defaultProvider]}`);
  console.log(`💰 Monthly budget: $${budget}`);
  console.log("\nRun 'termcoder --repo .' to start coding!\n");

  return { defaultProvider };
}

export async function quickKeySetup(provider: ProviderId): Promise<boolean> {
  const { key } = await inquirer.prompt([
    {
      type: "password",
      name: "key",
      message: `Enter API key for ${PROVIDER_NAMES[provider]}:`,
      mask: "•",
      validate: (input) => {
        if (!input || !input.trim()) {
          return "API key is required";
        }
        return true;
      }
    }
  ]);

  await KeyStore.setProviderKey(provider, key.trim());
  log.info(`✓ API key saved for ${provider}`);
  return true;
}