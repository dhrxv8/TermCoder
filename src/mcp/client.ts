import { log } from "../util/logging.js";

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: any;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: any[];
}

export interface MCPServer {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * Model Context Protocol client implementation
 * Enables TermCoder to integrate with external data sources
 * following Claude Code's MCP pattern
 */
export class MCPClient {
  private servers: Map<string, MCPServerConnection> = new Map();
  private resources: Map<string, MCPResource> = new Map();
  private tools: Map<string, MCPTool> = new Map();
  private prompts: Map<string, MCPPrompt> = new Map();
  
  constructor() {}
  
  /**
   * Connect to an MCP server
   */
  async connect(serverConfig: MCPServer): Promise<boolean> {
    try {
      const connection = new MCPServerConnection(serverConfig);
      await connection.initialize();
      
      this.servers.set(serverConfig.name, connection);
      
      // Fetch available resources, tools, and prompts
      await this.refreshCapabilities(serverConfig.name);
      
      log.success(`Connected to MCP server: ${serverConfig.name}`);
      return true;
    } catch (error) {
      log.error(`Failed to connect to MCP server ${serverConfig.name}:`, error);
      return false;
    }
  }
  
  /**
   * Disconnect from an MCP server
   */
  async disconnect(serverName: string): Promise<void> {
    const connection = this.servers.get(serverName);
    if (connection) {
      await connection.close();
      this.servers.delete(serverName);
      
      // Remove associated resources/tools/prompts
      this.cleanupServerCapabilities(serverName);
      
      log.info(`Disconnected from MCP server: ${serverName}`);
    }
  }
  
  /**
   * List all available resources across servers
   */
  async listResources(): Promise<MCPResource[]> {
    return Array.from(this.resources.values());
  }
  
  /**
   * Read resource content
   */
  async readResource(uri: string): Promise<string | null> {
    for (const [serverName, connection] of this.servers) {
      try {
        const content = await connection.readResource(uri);
        if (content) return content;
      } catch (error) {
        log.warn(`Failed to read resource ${uri} from ${serverName}:`, error);
      }
    }
    return null;
  }
  
  /**
   * List available tools
   */
  async listTools(): Promise<MCPTool[]> {
    return Array.from(this.tools.values());
  }
  
  /**
   * Call a tool
   */
  async callTool(name: string, arguments_: any): Promise<any> {
    for (const [serverName, connection] of this.servers) {
      if (await connection.hasTool(name)) {
        try {
          return await connection.callTool(name, arguments_);
        } catch (error) {
          log.warn(`Tool call failed on ${serverName}:`, error);
        }
      }
    }
    throw new Error(`Tool ${name} not found or failed on all servers`);
  }
  
  /**
   * Get completion context from all connected servers
   */
  async getCompletionContext(query: string): Promise<string[]> {
    const contexts: string[] = [];
    
    // Get relevant resources
    const resources = await this.listResources();
    for (const resource of resources) {
      if (this.isRelevantResource(resource, query)) {
        const content = await this.readResource(resource.uri);
        if (content) {
          contexts.push(`[${resource.name}]\\n${content}`);
        }
      }
    }
    
    return contexts;
  }
  
  /**
   * Refresh capabilities from a specific server
   */
  private async refreshCapabilities(serverName: string): Promise<void> {
    const connection = this.servers.get(serverName);
    if (!connection) return;
    
    try {
      // Fetch resources
      const resources = await connection.listResources();
      for (const resource of resources) {
        this.resources.set(`${serverName}:${resource.uri}`, resource);
      }
      
      // Fetch tools
      const tools = await connection.listTools();
      for (const tool of tools) {
        this.tools.set(`${serverName}:${tool.name}`, tool);
      }
      
      // Fetch prompts
      const prompts = await connection.listPrompts();
      for (const prompt of prompts) {
        this.prompts.set(`${serverName}:${prompt.name}`, prompt);
      }
    } catch (error) {
      log.warn(`Failed to refresh capabilities for ${serverName}:`, error);
    }
  }
  
  /**
   * Clean up capabilities when disconnecting from server
   */
  private cleanupServerCapabilities(serverName: string): void {
    // Remove resources
    for (const key of this.resources.keys()) {
      if (key.startsWith(`${serverName}:`)) {
        this.resources.delete(key);
      }
    }
    
    // Remove tools
    for (const key of this.tools.keys()) {
      if (key.startsWith(`${serverName}:`)) {
        this.tools.delete(key);
      }
    }
    
    // Remove prompts
    for (const key of this.prompts.keys()) {
      if (key.startsWith(`${serverName}:`)) {
        this.prompts.delete(key);
      }
    }
  }
  
  /**
   * Check if a resource is relevant to the query
   */
  private isRelevantResource(resource: MCPResource, query: string): boolean {
    const queryLower = query.toLowerCase();
    return (
      resource.name.toLowerCase().includes(queryLower) ||
      (resource.description && resource.description.toLowerCase().includes(queryLower))
    );
  }
}

/**
 * Connection to a single MCP server
 */
class MCPServerConnection {
  private process?: any;
  private serverConfig: MCPServer;
  
  constructor(config: MCPServer) {
    this.serverConfig = config;
  }
  
  async initialize(): Promise<void> {
    const { spawn } = await import("node:child_process");
    
    this.process = spawn(this.serverConfig.command, this.serverConfig.args, {
      env: { ...process.env, ...this.serverConfig.env },
      stdio: ["pipe", "pipe", "pipe"]
    });
    
    // Wait for initialization
    return new Promise((resolve, reject) => {
      let initData = "";
      
      const timeout = setTimeout(() => {
        reject(new Error("MCP server initialization timeout"));
      }, 10000);
      
      this.process.stdout.on("data", (data: Buffer) => {
        initData += data.toString();
        if (initData.includes("initialized")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      
      this.process.stderr.on("data", (data: Buffer) => {
        log.warn(`MCP server stderr:`, data.toString());
      });
      
      this.process.on("error", (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }
  
  async close(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = undefined;
    }
  }
  
  async listResources(): Promise<MCPResource[]> {
    return await this.sendRequest("resources/list");
  }
  
  async readResource(uri: string): Promise<string | null> {
    const response = await this.sendRequest("resources/read", { uri });
    return response?.contents?.[0]?.text || null;
  }
  
  async listTools(): Promise<MCPTool[]> {
    return await this.sendRequest("tools/list");
  }
  
  async callTool(name: string, arguments_: any): Promise<any> {
    return await this.sendRequest("tools/call", { name, arguments: arguments_ });
  }
  
  async listPrompts(): Promise<MCPPrompt[]> {
    return await this.sendRequest("prompts/list");
  }
  
  async hasTool(name: string): Promise<boolean> {
    try {
      const tools = await this.listTools();
      return tools.some(tool => tool.name === name);
    } catch (error) {
      return false;
    }
  }
  
  private async sendRequest(method: string, params?: any): Promise<any> {
    if (!this.process) {
      throw new Error("MCP server not connected");
    }
    
    const request = {
      jsonrpc: "2.0",
      id: Math.random().toString(36),
      method,
      params: params || {}
    };
    
    return new Promise((resolve, reject) => {
      let responseData = "";
      
      const timeout = setTimeout(() => {
        reject(new Error(`MCP request timeout: ${method}`));
      }, 30000);
      
      const dataHandler = (data: Buffer) => {
        responseData += data.toString();
        try {
          const response = JSON.parse(responseData);
          if (response.id === request.id) {
            clearTimeout(timeout);
            this.process.stdout.removeListener("data", dataHandler);
            
            if (response.error) {
              reject(new Error(response.error.message));
            } else {
              resolve(response.result);
            }
          }
        } catch (e) {
          // Incomplete JSON, continue waiting
        }
      };
      
      this.process.stdout.on("data", dataHandler);
      this.process.stdin.write(JSON.stringify(request) + "\\n");
    });
  }
}

// Export singleton instance
export const mcpClient = new MCPClient();