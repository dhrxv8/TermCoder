import fg from "fast-glob";
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { RetrievalChunk } from "../util/types.js";
import { getProvider } from "../providers/index.js";
import { loadConfig } from "../state/config.js";
import { log } from "../util/logging.js";

interface IndexMetadata {
  version: number;
  createdAt: string;
  lastModified: string;
  provider: string;
  model: string;
  fileCount: number;
  chunkCount: number;
  fileHashes: Record<string, string>;
}

interface IndexData {
  metadata: IndexMetadata;
  chunks: RetrievalChunk[];
}

// File extensions to include in indexing
const INDEXABLE_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.java', '.c', '.cpp', '.h', '.hpp',
  '.cs', '.php', '.rb', '.rs', '.swift', '.kt', '.scala', '.clj', '.ml', '.hs',
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd', '.yaml', '.yml',
  '.json', '.xml', '.html', '.css', '.scss', '.less', '.md', '.rst', '.txt',
  '.sql', '.graphql', '.proto', '.thrift', '.dockerfile', '.makefile', '.cmake'
]);

// Queue for background indexing
class IndexingQueue {
  private queue: Array<{ repo: string; priority: number; resolve: Function; reject: Function }> = [];
  private running = false;
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  async enqueue(repo: string, priority: number = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      // Remove existing entry for same repo
      this.queue = this.queue.filter(item => item.repo !== repo);
      
      // Add to queue
      this.queue.push({ repo, priority, resolve, reject });
      this.queue.sort((a, b) => b.priority - a.priority);
      
      if (!this.running) {
        this.processQueue();
      }
    });
  }

  debounce(repo: string, delay: number = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      // Clear existing timer
      if (this.debounceTimers.has(repo)) {
        clearTimeout(this.debounceTimers.get(repo)!);
      }

      // Set new timer
      const timer = setTimeout(async () => {
        this.debounceTimers.delete(repo);
        try {
          await this.enqueue(repo, 1);
          resolve();
        } catch (error) {
          reject(error);
        }
      }, delay);

      this.debounceTimers.set(repo, timer);
    });
  }

  private async processQueue(): Promise<void> {
    if (this.running || this.queue.length === 0) return;

    this.running = true;
    
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      try {
        await buildIndexInternal(item.repo);
        item.resolve();
      } catch (error) {
        item.reject(error);
      }
    }
    
    this.running = false;
  }
}

const indexingQueue = new IndexingQueue();

function getFileHash(content: string): string {
  return createHash('md5').update(content).digest('hex');
}

function shouldIncludeFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return INDEXABLE_EXTENSIONS.has(ext) || path.basename(filePath).toLowerCase() === 'dockerfile';
}

async function loadExistingIndex(indexPath: string): Promise<IndexData | null> {
  try {
    const content = await fs.readFile(indexPath, "utf8");
    const data = JSON.parse(content) as IndexData;
    
    // Validate structure
    if (!data.metadata || !data.chunks || !Array.isArray(data.chunks)) {
      return null;
    }
    
    return data;
  } catch (error) {
    return null;
  }
}

async function getModifiedFiles(repo: string, existingIndex: IndexData | null): Promise<string[]> {
  const files = await fg(["**/*"], { 
    cwd: repo, 
    dot: false, 
    ignore: [
      "node_modules/**", 
      ".git/**", 
      "dist/**", 
      "build/**", 
      "target/**",
      "*.log",
      ".termcode-*"
    ]
  });

  const modifiedFiles: string[] = [];
  
  for (const file of files.filter(shouldIncludeFile)) {
    try {
      const content = await fs.readFile(path.resolve(repo, file), "utf8");
      const currentHash = getFileHash(content);
      
      if (!existingIndex || 
          !existingIndex.metadata.fileHashes[file] || 
          existingIndex.metadata.fileHashes[file] !== currentHash) {
        modifiedFiles.push(file);
      }
    } catch (error) {
      // File might have been deleted or is not readable
      continue;
    }
  }
  
  return modifiedFiles;
}

async function buildIndexInternal(repo: string, outPath = ".termcode-index.json"): Promise<void> {
  const indexPath = path.resolve(repo, outPath);
  const existingIndex = await loadExistingIndex(indexPath);
  
  log.step("Indexing repository", "analyzing changes...");
  
  const modifiedFiles = await getModifiedFiles(repo, existingIndex);
  
  if (modifiedFiles.length === 0 && existingIndex) {
    log.success("Index up to date");
    return;
  }
  
  log.step("Processing files", `${modifiedFiles.length} files to index`);
  
  const config = await loadConfig();
  if (!config) {
    throw new Error("No configuration found. Please run onboarding first.");
  }
  
  // Find embedding provider
  let embedProvider;
  let embedModel;
  
  // Try current provider first
  try {
    embedProvider = getProvider(config.defaultProvider);
    embedModel = config.models[config.defaultProvider]?.embed;
    if (!embedModel) throw new Error("No embed model");
    
    // Test embeddings capability with a small test
    await embedProvider.embed(["test"], { model: embedModel });
  } catch (e) {
    // Fallback to OpenAI
    try {
      embedProvider = getProvider("openai");
      embedModel = config.models.openai?.embed || "text-embedding-3-small";
      await embedProvider.embed(["test"], { model: embedModel });
    } catch (e2) {
      log.warn("No embedding provider available - index will be text-only");
      embedProvider = null;
      embedModel = null;
    }
  }

  // Start with existing chunks or empty array
  let allChunks = existingIndex ? existingIndex.chunks.filter(chunk => 
    !modifiedFiles.includes(chunk.file)
  ) : [];
  
  const fileHashes: Record<string, string> = existingIndex ? 
    { ...existingIndex.metadata.fileHashes } : {};
  
  // Process modified files
  for (const file of modifiedFiles) {
    const full = path.resolve(repo, file);
    let content = "";
    
    try {
      content = await fs.readFile(full, "utf8");
      fileHashes[file] = getFileHash(content);
    } catch (error) {
      continue;
    }
    
    const lines = content.split("\n");
    const chunkSize = 200; // lines per chunk
    
    for (let i = 0; i < lines.length; i += chunkSize) {
      const slice = lines.slice(i, i + chunkSize).join("\n");
      
      if (slice.trim().length === 0) continue;
      
      let embedding: number[] | undefined;
      
      if (embedProvider && embedModel) {
        try {
          const embeddings = await embedProvider.embed([slice], { model: embedModel });
          embedding = embeddings[0];
        } catch (error) {
          log.warn(`Failed to embed chunk from ${file}:${i + 1}`);
        }
      }
      
      allChunks.push({
        file,
        start: i + 1,
        end: Math.min(i + chunkSize, lines.length),
        text: slice,
        embedding
      });
    }
  }

  // Create updated index
  const indexData: IndexData = {
    metadata: {
      version: 1,
      createdAt: existingIndex?.metadata.createdAt || new Date().toISOString(),
      lastModified: new Date().toISOString(),
      provider: embedProvider?.id || "none",
      model: embedModel || "none", 
      fileCount: Object.keys(fileHashes).length,
      chunkCount: allChunks.length,
      fileHashes
    },
    chunks: allChunks
  };

  await fs.writeFile(indexPath, JSON.stringify(indexData, null, 2), "utf8");
  
  log.success(`Index updated: ${allChunks.length} chunks from ${Object.keys(fileHashes).length} files`);
}

// Public API
export async function buildIndex(repo: string, outPath = ".termcode-index.json"): Promise<void> {
  return buildIndexInternal(repo, outPath);
}

export async function buildIndexBackground(repo: string): Promise<void> {
  return indexingQueue.enqueue(repo, 0);
}

export async function rebuildIndexDebounced(repo: string, delay: number = 5000): Promise<void> {
  return indexingQueue.debounce(repo, delay);
}

export async function getIndexStats(repo: string): Promise<IndexMetadata | null> {
  try {
    const indexPath = path.resolve(repo, ".termcode-index.json");
    const existingIndex = await loadExistingIndex(indexPath);
    return existingIndex?.metadata || null;
  } catch (error) {
    return null;
  }
}

