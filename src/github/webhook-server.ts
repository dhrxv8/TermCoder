import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { createHash, createHmac } from "node:crypto";
import { log } from "../util/logging.js";

export interface GitHubWebhookEvent {
  event: string;
  payload: any;
  signature: string;
  delivery: string;
}

export interface TermCoderCommand {
  command: string;
  args: string[];
  repoOwner: string;
  repoName: string;
  issueNumber?: number;
  prNumber?: number;
  commentId: string;
  author: string;
  authorAssociation: string;
}

type WebhookHandler = (event: GitHubWebhookEvent) => Promise<void>;

export class GitHubWebhookServer {
  private server: ReturnType<typeof createServer>;
  private port: number;
  private secret: string;
  private handlers = new Map<string, WebhookHandler[]>();
  private isRunning = false;

  constructor(port: number = 3000, secret?: string) {
    this.port = port;
    this.secret = secret || process.env.GITHUB_WEBHOOK_SECRET || "";
    
    this.server = createServer(this.handleRequest.bind(this));
  }

  // Start the webhook server
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, (error?: Error) => {
        if (error) {
          reject(error);
        } else {
          this.isRunning = true;
          log.info(`🎣 Webhook server listening on port ${this.port}`);
          resolve();
        }
      });
    });
  }

  // Stop the webhook server
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        this.isRunning = false;
        log.info("🛑 Webhook server stopped");
        resolve();
      });
    });
  }

  // Register event handler
  on(event: string, handler: WebhookHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }

  // Remove event handler
  off(event: string, handler: WebhookHandler): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index >= 0) {
        handlers.splice(index, 1);
      }
    }
  }

  // Handle incoming webhook request
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      // Only handle POST requests to /webhook
      if (req.method !== 'POST' || req.url !== '/webhook') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }

      // Get headers
      const githubEvent = req.headers['x-github-event'] as string;
      const signature = req.headers['x-hub-signature-256'] as string;
      const delivery = req.headers['x-github-delivery'] as string;

      if (!githubEvent) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing X-GitHub-Event header');
        return;
      }

      // Read request body
      const body = await this.readRequestBody(req);
      const payload = JSON.parse(body);

      // Verify signature if secret is configured
      if (this.secret && signature) {
        if (!this.verifySignature(body, signature)) {
          res.writeHead(401, { 'Content-Type': 'text/plain' });
          res.end('Invalid signature');
          return;
        }
      }

      // Create webhook event
      const event: GitHubWebhookEvent = {
        event: githubEvent,
        payload,
        signature,
        delivery
      };

      // Handle the event
      await this.processEvent(event);

      // Send success response
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Webhook processed successfully' }));

    } catch (error) {
      log.error('Webhook processing error:', error);
      
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  }

  // Read request body
  private readRequestBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      
      req.on('end', () => {
        resolve(body);
      });
      
      req.on('error', reject);
    });
  }

  // Verify GitHub webhook signature
  private verifySignature(payload: string, signature: string): boolean {
    const expectedSignature = 'sha256=' + createHmac('sha256', this.secret)
      .update(payload, 'utf8')
      .digest('hex');
    
    return signature === expectedSignature;
  }

  // Process webhook event
  private async processEvent(event: GitHubWebhookEvent): Promise<void> {
    log.step('Webhook received', `${event.event} from ${event.payload.repository?.full_name || 'unknown'}`);
    
    // Get handlers for this event type
    const handlers = this.handlers.get(event.event) || [];
    const allHandlers = this.handlers.get('*') || [];
    
    // Run all handlers
    const promises = [...handlers, ...allHandlers].map(handler => 
      handler(event).catch(error => 
        log.error(`Handler error for ${event.event}:`, error)
      )
    );
    
    await Promise.all(promises);
  }

  // Check if server is running
  isListening(): boolean {
    return this.isRunning;
  }
}

// Parse @termcoder commands from GitHub comments
export function parseTermCoderCommands(commentBody: string, context: any): TermCoderCommand[] {
  const commands: TermCoderCommand[] = [];
  
  // Look for @termcoder mentions
  const mentions = commentBody.match(/@termcoder\s+([^\n\r]+)/gi);
  
  if (!mentions) return commands;
  
  for (const mention of mentions) {
    // Extract command after @termcoder
    const commandMatch = mention.match(/@termcoder\s+(.+)/i);
    if (!commandMatch) continue;
    
    const commandLine = commandMatch[1].trim();
    const parts = commandLine.split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);
    
    commands.push({
      command,
      args,
      repoOwner: context.repository.owner.login,
      repoName: context.repository.name,
      issueNumber: context.issue?.number,
      prNumber: context.pull_request?.number,
      commentId: context.comment.id,
      author: context.comment.user.login,
      authorAssociation: context.comment.author_association
    });
  }
  
  return commands;
}

// Default webhook server instance
let defaultServer: GitHubWebhookServer | null = null;

// Get or create default server
export function getWebhookServer(port?: number, secret?: string): GitHubWebhookServer {
  if (!defaultServer) {
    defaultServer = new GitHubWebhookServer(port, secret);
  }
  return defaultServer;
}

// Start default webhook server
export async function startWebhookServer(port?: number, secret?: string): Promise<GitHubWebhookServer> {
  const server = getWebhookServer(port, secret);
  if (!server.isListening()) {
    await server.start();
  }
  return server;
}

// Stop default webhook server
export async function stopWebhookServer(): Promise<void> {
  if (defaultServer && defaultServer.isListening()) {
    await defaultServer.stop();
  }
}