import { promises as fs } from "node:fs";
import path from "node:path";
import { log } from "../util/logging.js";
import { hookManager } from "../hooks/manager.js";
import { workspaceManager } from "../workspace/manager.js";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  
  // Plugin configuration
  entry: string;
  type: 'hook' | 'tool' | 'provider' | 'theme' | 'integration' | 'workflow';
  category: string;
  
  // Dependencies and compatibility
  termcodeVersion: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  
  // Capabilities and permissions
  capabilities: string[];
  permissions: string[];
  
  // Hooks and integration points
  hooks?: Array<{
    type: string;
    handler: string;
    priority?: number;
  }>;
  
  commands?: Array<{
    name: string;
    handler: string;
    description: string;
    usage?: string;
  }>;
  
  providers?: Array<{
    id: string;
    name: string;
    handler: string;
  }>;
  
  // Configuration schema
  configSchema?: any;
  defaultConfig?: any;
  
  // Lifecycle hooks
  lifecycle?: {
    install?: string;
    uninstall?: string;
    activate?: string;
    deactivate?: string;
    update?: string;
  };
}

export interface PluginInfo {
  manifest: PluginManifest;
  installed: boolean;
  enabled: boolean;
  version: string;
  installPath: string;
  config: any;
  dependencies: PluginInfo[];
  lastUpdated: number;
  usage: {
    lastUsed: number;
    usageCount: number;
    errorCount: number;
  };
}

export interface PluginContext {
  repoPath: string;
  workspaceManager: typeof workspaceManager;
  hookManager: typeof hookManager;
  log: typeof log;
  config: any;
  api: PluginAPI;
}

export interface PluginAPI {
  // Core functionality
  executeCommand: (command: string[]) => Promise<any>;
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<void>;
  
  // Workspace interaction
  getCurrentWorkspace: () => any;
  updateWorkspace: (updates: any) => Promise<void>;
  
  // Hook system
  addHook: (hook: any) => Promise<void>;
  removeHook: (hookId: string) => Promise<void>;
  
  // Provider system
  getProvider: (providerId: string) => any;
  registerProvider: (provider: any) => Promise<void>;
  
  // UI interaction
  showMessage: (message: string, type?: 'info' | 'warn' | 'error') => void;
  showProgress: (message: string, progress: number) => void;
  
  // Configuration
  getConfig: (key: string) => any;
  setConfig: (key: string, value: any) => Promise<void>;
  
  // Events
  emit: (event: string, data: any) => void;
  on: (event: string, handler: (data: any) => void) => void;
  off: (event: string, handler?: (data: any) => void) => void;
}

/**
 * Advanced Plugin System for TermCoder
 * Provides extensibility beyond Claude Code's capabilities
 */
export class PluginSystem {
  private plugins: Map<string, PluginInfo> = new Map();
  private loadedPlugins: Map<string, any> = new Map();
  private pluginConfigs: Map<string, any> = new Map();
  private eventEmitter: any = this.createEventEmitter();
  private pluginDir: string;
  private marketplaceUrl: string = 'https://registry.termcode.dev';
  
  constructor(baseDir: string = path.join(process.env.HOME || "~", ".termcode")) {
    this.pluginDir = path.join(baseDir, "plugins");
  }

  /**
   * Initialize plugin system
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.pluginDir, { recursive: true });
      await this.loadInstalledPlugins();
      await this.registerBuiltinPlugins();
      
      log.info(`Plugin system initialized with ${this.plugins.size} plugins`);
    } catch (error) {
      log.error("Failed to initialize plugin system:", error);
      throw error;
    }
  }

  /**
   * Install plugin from marketplace or local path
   */
  async installPlugin(
    source: string,
    options: {
      version?: string;
      force?: boolean;
      dev?: boolean;
      global?: boolean;
    } = {}
  ): Promise<boolean> {
    log.info(`Installing plugin: ${source}`);

    try {
      let manifest: PluginManifest;
      let pluginPath: string;

      if (source.startsWith('http://') || source.startsWith('https://')) {
        // Install from URL
        const result = await this.installFromUrl(source, options);
        manifest = result.manifest;
        pluginPath = result.path;
      } else if (source.includes('/') || source.includes('\\')) {
        // Install from local path
        const result = await this.installFromPath(source);
        manifest = result.manifest;
        pluginPath = result.path;
      } else {
        // Install from marketplace
        const result = await this.installFromMarketplace(source, options);
        manifest = result.manifest;
        pluginPath = result.path;
      }

      // Validate plugin
      const validation = this.validatePlugin(manifest);
      if (!validation.valid) {
        throw new Error(`Plugin validation failed: ${validation.errors.join(', ')}`);
      }

      // Check dependencies
      await this.resolveDependencies(manifest);

      // Create plugin info
      const pluginInfo: PluginInfo = {
        manifest,
        installed: true,
        enabled: true,
        version: manifest.version,
        installPath: pluginPath,
        config: manifest.defaultConfig || {},
        dependencies: [],
        lastUpdated: Date.now(),
        usage: {
          lastUsed: 0,
          usageCount: 0,
          errorCount: 0
        }
      };

      this.plugins.set(manifest.id, pluginInfo);

      // Run installation lifecycle hook
      if (manifest.lifecycle?.install) {
        await this.runLifecycleHook(manifest.id, 'install');
      }

      // Activate plugin
      await this.activatePlugin(manifest.id);

      log.success(`Plugin installed: ${manifest.name} v${manifest.version}`);
      return true;

    } catch (error) {
      log.error(`Failed to install plugin ${source}:`, error);
      return false;
    }
  }

  /**
   * Uninstall plugin
   */
  async uninstallPlugin(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      log.error(`Plugin not found: ${pluginId}`);
      return false;
    }

    log.info(`Uninstalling plugin: ${plugin.manifest.name}`);

    try {
      // Deactivate plugin first
      await this.deactivatePlugin(pluginId);

      // Run uninstallation lifecycle hook
      if (plugin.manifest.lifecycle?.uninstall) {
        await this.runLifecycleHook(pluginId, 'uninstall');
      }

      // Remove plugin files
      await fs.rm(plugin.installPath, { recursive: true, force: true });

      // Remove from registry
      this.plugins.delete(pluginId);
      this.loadedPlugins.delete(pluginId);
      this.pluginConfigs.delete(pluginId);

      log.success(`Plugin uninstalled: ${plugin.manifest.name}`);
      return true;

    } catch (error) {
      log.error(`Failed to uninstall plugin ${pluginId}:`, error);
      return false;
    }
  }

  /**
   * Activate plugin
   */
  async activatePlugin(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      log.error(`Plugin not found: ${pluginId}`);
      return false;
    }

    if (plugin.enabled) {
      log.warn(`Plugin already activated: ${pluginId}`);
      return true;
    }

    log.info(`Activating plugin: ${plugin.manifest.name}`);

    try {
      // Load plugin code
      const pluginModule = await this.loadPluginModule(plugin);
      this.loadedPlugins.set(pluginId, pluginModule);

      // Register hooks
      if (plugin.manifest.hooks) {
        for (const hookDef of plugin.manifest.hooks) {
          await this.registerPluginHook(plugin, hookDef, pluginModule);
        }
      }

      // Register commands
      if (plugin.manifest.commands) {
        for (const commandDef of plugin.manifest.commands) {
          await this.registerPluginCommand(plugin, commandDef, pluginModule);
        }
      }

      // Register providers
      if (plugin.manifest.providers) {
        for (const providerDef of plugin.manifest.providers) {
          await this.registerPluginProvider(plugin, providerDef, pluginModule);
        }
      }

      // Run activation lifecycle hook
      if (plugin.manifest.lifecycle?.activate) {
        await this.runLifecycleHook(pluginId, 'activate');
      }

      plugin.enabled = true;
      log.success(`Plugin activated: ${plugin.manifest.name}`);
      this.eventEmitter.emit('plugin:activated', { pluginId, plugin });

      return true;

    } catch (error) {
      log.error(`Failed to activate plugin ${pluginId}:`, error);
      return false;
    }
  }

  /**
   * Deactivate plugin
   */
  async deactivatePlugin(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || !plugin.enabled) {
      return true;
    }

    log.info(`Deactivating plugin: ${plugin.manifest.name}`);

    try {
      // Run deactivation lifecycle hook
      if (plugin.manifest.lifecycle?.deactivate) {
        await this.runLifecycleHook(pluginId, 'deactivate');
      }

      // Unregister hooks, commands, providers
      await this.unregisterPluginIntegrations(pluginId);

      // Unload plugin module
      this.loadedPlugins.delete(pluginId);

      plugin.enabled = false;
      log.success(`Plugin deactivated: ${plugin.manifest.name}`);
      this.eventEmitter.emit('plugin:deactivated', { pluginId, plugin });

      return true;

    } catch (error) {
      log.error(`Failed to deactivate plugin ${pluginId}:`, error);
      return false;
    }
  }

  /**
   * Update plugin
   */
  async updatePlugin(pluginId: string, version?: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      log.error(`Plugin not found: ${pluginId}`);
      return false;
    }

    log.info(`Updating plugin: ${plugin.manifest.name}`);

    try {
      // Check for updates
      const updateInfo = await this.checkForUpdates(pluginId);
      if (!updateInfo.hasUpdate && !version) {
        log.info(`Plugin is up to date: ${plugin.manifest.name}`);
        return true;
      }

      const targetVersion = version || updateInfo.latestVersion;

      // Deactivate current version
      await this.deactivatePlugin(pluginId);

      // Install new version
      const success = await this.installPlugin(plugin.manifest.id, { 
        version: targetVersion,
        force: true 
      });

      if (success) {
        // Run update lifecycle hook
        if (plugin.manifest.lifecycle?.update) {
          await this.runLifecycleHook(pluginId, 'update');
        }

        log.success(`Plugin updated: ${plugin.manifest.name} to v${targetVersion}`);
        this.eventEmitter.emit('plugin:updated', { pluginId, plugin, oldVersion: plugin.version, newVersion: targetVersion });
      }

      return success;

    } catch (error) {
      log.error(`Failed to update plugin ${pluginId}:`, error);
      return false;
    }
  }

  /**
   * List installed plugins
   */
  listPlugins(filter?: {
    type?: string;
    category?: string;
    enabled?: boolean;
    keyword?: string;
  }): PluginInfo[] {
    let plugins = Array.from(this.plugins.values());

    if (filter) {
      if (filter.type) {
        plugins = plugins.filter(p => p.manifest.type === filter.type);
      }
      if (filter.category) {
        plugins = plugins.filter(p => p.manifest.category === filter.category);
      }
      if (filter.enabled !== undefined) {
        plugins = plugins.filter(p => p.enabled === filter.enabled);
      }
      if (filter.keyword) {
        plugins = plugins.filter(p => 
          p.manifest.name.toLowerCase().includes(filter.keyword!.toLowerCase()) ||
          p.manifest.description.toLowerCase().includes(filter.keyword!.toLowerCase()) ||
          p.manifest.keywords?.some(k => k.toLowerCase().includes(filter.keyword!.toLowerCase()))
        );
      }
    }

    return plugins;
  }

  /**
   * Search marketplace for plugins
   */
  async searchMarketplace(query: string, options?: {
    type?: string;
    category?: string;
    sort?: 'name' | 'downloads' | 'rating' | 'updated';
    limit?: number;
  }): Promise<any[]> {
    try {
      const searchUrl = new URL('/search', this.marketplaceUrl);
      searchUrl.searchParams.set('q', query);
      
      if (options?.type) searchUrl.searchParams.set('type', options.type);
      if (options?.category) searchUrl.searchParams.set('category', options.category);
      if (options?.sort) searchUrl.searchParams.set('sort', options.sort);
      if (options?.limit) searchUrl.searchParams.set('limit', options.limit.toString());

      const response = await fetch(searchUrl.toString());
      if (!response.ok) {
        throw new Error(`Marketplace search failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      log.error('Marketplace search failed:', error);
      return [];
    }
  }

  /**
   * Get plugin information
   */
  getPlugin(pluginId: string): PluginInfo | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Configure plugin
   */
  async configurePlugin(pluginId: string, config: any): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      log.error(`Plugin not found: ${pluginId}`);
      return false;
    }

    try {
      // Validate configuration against schema
      if (plugin.manifest.configSchema) {
        const validation = this.validateConfig(config, plugin.manifest.configSchema);
        if (!validation.valid) {
          throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
        }
      }

      // Merge with existing config
      plugin.config = { ...plugin.config, ...config };
      this.pluginConfigs.set(pluginId, plugin.config);

      // Save to disk
      await this.savePluginConfig(pluginId, plugin.config);

      // Notify plugin of config change
      const pluginModule = this.loadedPlugins.get(pluginId);
      if (pluginModule && pluginModule.onConfigChange) {
        await pluginModule.onConfigChange(plugin.config);
      }

      log.info(`Plugin configured: ${plugin.manifest.name}`);
      this.eventEmitter.emit('plugin:configured', { pluginId, config });

      return true;

    } catch (error) {
      log.error(`Failed to configure plugin ${pluginId}:`, error);
      return false;
    }
  }

  /**
   * Execute plugin command
   */
  async executePluginCommand(
    pluginId: string, 
    commandName: string, 
    args: any[] = []
  ): Promise<any> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || !plugin.enabled) {
      throw new Error(`Plugin not found or not enabled: ${pluginId}`);
    }

    const pluginModule = this.loadedPlugins.get(pluginId);
    if (!pluginModule) {
      throw new Error(`Plugin module not loaded: ${pluginId}`);
    }

    const commandDef = plugin.manifest.commands?.find(c => c.name === commandName);
    if (!commandDef) {
      throw new Error(`Command not found: ${commandName} in plugin ${pluginId}`);
    }

    try {
      // Update usage statistics
      plugin.usage.lastUsed = Date.now();
      plugin.usage.usageCount++;

      // Create plugin context
      const context = this.createPluginContext(plugin);

      // Execute command
      const handler = pluginModule[commandDef.handler];
      if (!handler || typeof handler !== 'function') {
        throw new Error(`Command handler not found: ${commandDef.handler}`);
      }

      const result = await handler.call(pluginModule, context, ...args);
      
      this.eventEmitter.emit('plugin:command', { pluginId, commandName, args, result });
      return result;

    } catch (error) {
      plugin.usage.errorCount++;
      log.error(`Plugin command failed: ${pluginId}.${commandName}:`, error);
      throw error;
    }
  }

  /**
   * Private implementation methods
   */

  private async loadInstalledPlugins(): Promise<void> {
    try {
      const entries = await fs.readdir(this.pluginDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          try {
            const manifestPath = path.join(this.pluginDir, entry.name, 'plugin.json');
            const manifestContent = await fs.readFile(manifestPath, 'utf8');
            const manifest = JSON.parse(manifestContent) as PluginManifest;
            
            const pluginInfo: PluginInfo = {
              manifest,
              installed: true,
              enabled: false, // Will be enabled based on config
              version: manifest.version,
              installPath: path.join(this.pluginDir, entry.name),
              config: manifest.defaultConfig || {},
              dependencies: [],
              lastUpdated: Date.now(),
              usage: {
                lastUsed: 0,
                usageCount: 0,
                errorCount: 0
              }
            };

            this.plugins.set(manifest.id, pluginInfo);
            
          } catch (error) {
            log.warn(`Failed to load plugin in ${entry.name}:`, error);
          }
        }
      }
    } catch (error) {
      // Plugin directory doesn't exist yet
      log.debug('Plugin directory not found, will be created');
    }
  }

  private async registerBuiltinPlugins(): Promise<void> {
    // Register built-in plugins
    const builtinPlugins = [
      {
        id: 'termcode-git-enhanced',
        name: 'Enhanced Git Integration',
        type: 'integration',
        description: 'Advanced Git workflow management'
      },
      {
        id: 'termcode-ai-suggestions',
        name: 'AI Code Suggestions',
        type: 'tool',
        description: 'Real-time AI-powered code suggestions'
      },
      {
        id: 'termcode-security-scanner',
        name: 'Security Scanner',
        type: 'tool',
        description: 'Advanced security vulnerability scanning'
      }
    ];

    // These would be implemented as actual plugin modules
    log.debug(`${builtinPlugins.length} built-in plugins available`);
  }

  private async installFromMarketplace(
    pluginId: string, 
    options: any
  ): Promise<{ manifest: PluginManifest; path: string }> {
    // Implement marketplace installation
    throw new Error('Marketplace installation not implemented yet');
  }

  private async installFromUrl(
    url: string, 
    options: any
  ): Promise<{ manifest: PluginManifest; path: string }> {
    // Implement URL installation
    throw new Error('URL installation not implemented yet');
  }

  private async installFromPath(
    sourcePath: string
  ): Promise<{ manifest: PluginManifest; path: string }> {
    const manifestPath = path.join(sourcePath, 'plugin.json');
    const manifestContent = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestContent) as PluginManifest;
    
    const targetPath = path.join(this.pluginDir, manifest.id);
    
    // Copy plugin files
    await fs.cp(sourcePath, targetPath, { recursive: true });
    
    return { manifest, path: targetPath };
  }

  private validatePlugin(manifest: PluginManifest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!manifest.id) errors.push('Plugin ID is required');
    if (!manifest.name) errors.push('Plugin name is required');
    if (!manifest.version) errors.push('Plugin version is required');
    if (!manifest.entry) errors.push('Plugin entry point is required');
    if (!manifest.type) errors.push('Plugin type is required');
    
    // Check version compatibility
    if (manifest.termcodeVersion && !this.isVersionCompatible(manifest.termcodeVersion)) {
      errors.push(`Plugin requires TermCode version ${manifest.termcodeVersion}`);
    }
    
    return { valid: errors.length === 0, errors };
  }

  private async resolveDependencies(manifest: PluginManifest): Promise<void> {
    if (!manifest.dependencies) return;
    
    for (const [depId, version] of Object.entries(manifest.dependencies)) {
      const existingPlugin = this.plugins.get(depId);
      if (!existingPlugin) {
        // Try to install dependency
        log.info(`Installing dependency: ${depId}@${version}`);
        const success = await this.installPlugin(depId, { version });
        if (!success) {
          throw new Error(`Failed to install dependency: ${depId}@${version}`);
        }
      }
    }
  }

  private async loadPluginModule(plugin: PluginInfo): Promise<any> {
    const entryPath = path.join(plugin.installPath, plugin.manifest.entry);
    
    // Dynamic import of plugin module
    const module = await import(entryPath);
    
    return module.default || module;
  }

  private createPluginContext(plugin: PluginInfo): PluginContext {
    return {
      repoPath: process.cwd(),
      workspaceManager,
      hookManager,
      log,
      config: plugin.config,
      api: this.createPluginAPI(plugin)
    };
  }

  private createPluginAPI(plugin: PluginInfo): PluginAPI {
    return {
      executeCommand: async (command: string[]) => {
        // Implement secure command execution
        throw new Error('Not implemented');
      },
      
      readFile: async (filePath: string) => {
        return await fs.readFile(filePath, 'utf8');
      },
      
      writeFile: async (filePath: string, content: string) => {
        await fs.writeFile(filePath, content, 'utf8');
      },
      
      getCurrentWorkspace: () => {
        return workspaceManager.getCurrentWorkspace();
      },
      
      updateWorkspace: async (updates: any) => {
        // Implement workspace updates
      },
      
      addHook: async (hook: any) => {
        await hookManager.addHook(hook);
      },
      
      removeHook: async (hookId: string) => {
        await hookManager.removeHook(hookId);
      },
      
      getProvider: (providerId: string) => {
        // Implement provider access
        return null;
      },
      
      registerProvider: async (provider: any) => {
        // Implement provider registration
      },
      
      showMessage: (message: string, type = 'info') => {
        switch (type) {
          case 'info':
            log.info(message);
            break;
          case 'warn':
            log.warn(message);
            break;
          case 'error':
            log.error(message);
            break;
          default:
            log.info(message);
        }
      },
      
      showProgress: (message: string, progress: number) => {
        log.raw(`${message} ${Math.round(progress)}%`);
      },
      
      getConfig: (key: string) => {
        return plugin.config[key];
      },
      
      setConfig: async (key: string, value: any) => {
        plugin.config[key] = value;
        await this.savePluginConfig(plugin.manifest.id, plugin.config);
      },
      
      emit: (event: string, data: any) => {
        this.eventEmitter.emit(event, data);
      },
      
      on: (event: string, handler: (data: any) => void) => {
        this.eventEmitter.on(event, handler);
      },
      
      off: (event: string, handler?: (data: any) => void) => {
        if (handler) {
          this.eventEmitter.off(event, handler);
        } else {
          this.eventEmitter.removeAllListeners(event);
        }
      }
    };
  }

  private async registerPluginHook(plugin: PluginInfo, hookDef: any, pluginModule: any): Promise<void> {
    // Register hook with hook manager
    const hook = {
      id: `${plugin.manifest.id}_${hookDef.type}`,
      name: `${plugin.manifest.name} ${hookDef.type}`,
      description: `Hook from plugin: ${plugin.manifest.name}`,
      type: hookDef.type as any,
      matcher: {},
      handler: {
        type: 'javascript' as const,
        function: hookDef.handler
      },
      priority: hookDef.priority || 100,
      enabled: true,
      timeout: 30000,
      retries: 0
    };
    
    await hookManager.addHook(hook);
  }

  private async registerPluginCommand(plugin: PluginInfo, commandDef: any, pluginModule: any): Promise<void> {
    // Commands are registered in the plugin info and executed via executePluginCommand
    log.debug(`Registered command: ${commandDef.name} from plugin ${plugin.manifest.name}`);
  }

  private async registerPluginProvider(plugin: PluginInfo, providerDef: any, pluginModule: any): Promise<void> {
    // Register AI provider
    log.debug(`Registered provider: ${providerDef.id} from plugin ${plugin.manifest.name}`);
  }

  private async unregisterPluginIntegrations(pluginId: string): Promise<void> {
    // Remove hooks, commands, providers registered by this plugin
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;
    
    // Remove hooks
    if (plugin.manifest.hooks) {
      for (const hookDef of plugin.manifest.hooks) {
        const hookId = `${pluginId}_${hookDef.type}`;
        await hookManager.removeHook(hookId);
      }
    }
  }

  private async runLifecycleHook(pluginId: string, lifecycle: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;
    
    const pluginModule = this.loadedPlugins.get(pluginId);
    if (!pluginModule) return;
    
    const lifecycleHandler = plugin.manifest.lifecycle?.[lifecycle as keyof typeof plugin.manifest.lifecycle];
    if (!lifecycleHandler) return;
    
    const handler = pluginModule[lifecycleHandler];
    if (handler && typeof handler === 'function') {
      const context = this.createPluginContext(plugin);
      await handler.call(pluginModule, context);
    }
  }

  private async checkForUpdates(pluginId: string): Promise<{ hasUpdate: boolean; latestVersion?: string }> {
    // Check marketplace for updates
    return { hasUpdate: false };
  }

  private validateConfig(config: any, schema: any): { valid: boolean; errors: string[] } {
    // Implement JSON schema validation
    return { valid: true, errors: [] };
  }

  private async savePluginConfig(pluginId: string, config: any): Promise<void> {
    const configPath = path.join(this.pluginDir, pluginId, 'config.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  }

  private isVersionCompatible(requiredVersion: string): boolean {
    // Implement version compatibility checking
    return true;
  }

  private createEventEmitter(): any {
    // Simple event emitter implementation
    const events = new Map<string, Function[]>();
    
    return {
      emit: (event: string, data: any) => {
        const handlers = events.get(event) || [];
        handlers.forEach(handler => {
          try {
            handler(data);
          } catch (error) {
            log.error(`Event handler error for ${event}:`, error);
          }
        });
      },
      
      on: (event: string, handler: Function) => {
        if (!events.has(event)) {
          events.set(event, []);
        }
        events.get(event)!.push(handler);
      },
      
      off: (event: string, handler: Function) => {
        const handlers = events.get(event) || [];
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      },
      
      removeAllListeners: (event: string) => {
        events.delete(event);
      }
    };
  }

  /**
   * Get plugin statistics
   */
  getPluginStats(): {
    totalPlugins: number;
    enabledPlugins: number;
    pluginsByType: Record<string, number>;
    mostUsedPlugins: Array<{ id: string; name: string; usage: number }>;
    recentErrors: Array<{ plugin: string; error: string; timestamp: number }>;
  } {
    const plugins = Array.from(this.plugins.values());
    const enabled = plugins.filter(p => p.enabled);
    
    const byType: Record<string, number> = {};
    plugins.forEach(p => {
      byType[p.manifest.type] = (byType[p.manifest.type] || 0) + 1;
    });
    
    const mostUsed = plugins
      .sort((a, b) => b.usage.usageCount - a.usage.usageCount)
      .slice(0, 5)
      .map(p => ({
        id: p.manifest.id,
        name: p.manifest.name,
        usage: p.usage.usageCount
      }));
    
    return {
      totalPlugins: plugins.length,
      enabledPlugins: enabled.length,
      pluginsByType: byType,
      mostUsedPlugins: mostUsed,
      recentErrors: []
    };
  }
}

// Export singleton instance
export const pluginSystem = new PluginSystem();