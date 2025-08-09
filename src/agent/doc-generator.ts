import { promises as fs } from "node:fs";
import path from "node:path";
import { log } from "../util/logging.js";
import { getProvider } from "../providers/index.js";
import { loadConfig } from "../state/config.js";
import { estimateTokens } from "../util/costs.js";

export interface DocumentationRequest {
  type: "module" | "function" | "class" | "api" | "readme";
  targetPath: string;
  includeExamples?: boolean;
  includeTypes?: boolean;
  style?: "jsdoc" | "sphinx" | "markdown" | "plain";
}

export interface DocumentationResult {
  success: boolean;
  generatedDocs: string;
  filesToUpdate: Array<{ path: string; content: string; type: "create" | "update" }>;
  error?: string;
}

// Generate documentation prompt based on code content
function generateDocPrompt(
  code: string, 
  request: DocumentationRequest,
  existingDocs?: string
): string {
  const { type, includeExamples, includeTypes, style } = request;
  
  let prompt = `Generate comprehensive documentation for this ${type}.\n\n`;
  
  if (existingDocs) {
    prompt += `**Existing Documentation:**\n\`\`\`\n${existingDocs}\n\`\`\`\n\n`;
  }
  
  prompt += `**Code:**\n\`\`\`\n${code}\n\`\`\`\n\n`;
  
  prompt += `Please generate documentation that includes:\n`;
  prompt += `1. **Overview**: Brief description of purpose and functionality\n`;
  prompt += `2. **Parameters/Arguments**: Detailed parameter descriptions with types\n`;
  prompt += `3. **Return Values**: What the function/module returns\n`;
  prompt += `4. **Usage**: How to use this code\n`;
  
  if (includeExamples) {
    prompt += `5. **Examples**: Practical code examples showing usage\n`;
  }
  
  if (includeTypes && type !== "readme") {
    prompt += `6. **Type Information**: TypeScript types, interfaces, or type annotations\n`;
  }
  
  prompt += `7. **Notes**: Any important considerations, edge cases, or caveats\n\n`;
  
  // Style-specific instructions
  switch (style) {
    case "jsdoc":
      prompt += `Format the documentation using JSDoc syntax with proper @param, @returns, @example tags.\n`;
      break;
    case "sphinx":
      prompt += `Format the documentation using reStructuredText syntax for Sphinx.\n`;
      break;
    case "markdown":
      prompt += `Format the documentation using clean Markdown with proper headings and code blocks.\n`;
      break;
    default:
      prompt += `Use clear, well-structured formatting appropriate for the codebase.\n`;
  }
  
  if (type === "readme") {
    prompt += `\nGenerate a complete README.md that includes:\n`;
    prompt += `- Project title and description\n`;
    prompt += `- Installation instructions\n`;
    prompt += `- Quick start guide\n`;
    prompt += `- API reference\n`;
    prompt += `- Contributing guidelines\n`;
    prompt += `- License information\n`;
  }
  
  prompt += `\nFocus on being concise but comprehensive. Write for developers who are unfamiliar with the code.`;
  
  return prompt;
}

// Analyze file and determine what documentation is needed
async function analyzeFileForDocs(filePath: string): Promise<{
  hasExistingDocs: boolean;
  needsModuleDocs: boolean;
  needsFunctionDocs: string[];
  needsClassDocs: string[];
  language: string;
}> {
  const content = await fs.readFile(filePath, "utf8");
  const ext = path.extname(filePath);
  
  const analysis = {
    hasExistingDocs: false,
    needsModuleDocs: true,
    needsFunctionDocs: [] as string[],
    needsClassDocs: [] as string[],
    language: getLanguageFromExtension(ext)
  };
  
  // Check for existing documentation patterns
  const docPatterns = [
    /\/\*\*([\s\S]*?)\*\//g, // JSDoc
    /"""([\s\S]*?)"""/g,     // Python docstrings
    /''([\s\S]*?)''/g,       // Python docstrings
    /\/\/\/ (.*)/g,          // Dart/Swift doc comments
    /#\s+(.*)/g              // General comments
  ];
  
  for (const pattern of docPatterns) {
    if (pattern.test(content)) {
      analysis.hasExistingDocs = true;
      break;
    }
  }
  
  // Find functions that need documentation
  const functionPatterns = [
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,           // JS/TS functions
    /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/g,    // Arrow functions
    /def\s+(\w+)\s*\(/g,                                      // Python functions
    /func\s+(\w+)\s*\(/g,                                     // Go/Swift functions
    /fn\s+(\w+)\s*\(/g,                                       // Rust functions
    /public\s+(?:static\s+)?(?:\w+\s+)*(\w+)\s*\(/g          // Java methods
  ];
  
  for (const pattern of functionPatterns) {
    let match;
    const patternCopy = new RegExp(pattern.source, pattern.flags);
    while ((match = patternCopy.exec(content)) !== null) {
      analysis.needsFunctionDocs.push(match[1]);
    }
  }
  
  // Find classes that need documentation
  const classPatterns = [
    /(?:export\s+)?class\s+(\w+)/g,        // JS/TS/Java classes
    /class\s+(\w+)(?:\([^)]*\))?:/g,       // Python classes
    /struct\s+(\w+)/g,                     // Go/Rust structs
    /interface\s+(\w+)/g                   // Interfaces
  ];
  
  for (const pattern of classPatterns) {
    let match;
    const patternCopy = new RegExp(pattern.source, pattern.flags);
    while ((match = patternCopy.exec(content)) !== null) {
      analysis.needsClassDocs.push(match[1]);
    }
  }
  
  return analysis;
}

// Get programming language from file extension
function getLanguageFromExtension(ext: string): string {
  const languageMap: Record<string, string> = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.kt': 'kotlin',
    '.swift': 'swift',
    '.php': 'php',
    '.rb': 'ruby',
    '.cs': 'csharp',
    '.cpp': 'cpp',
    '.c': 'c',
    '.h': 'c'
  };
  
  return languageMap[ext.toLowerCase()] || 'text';
}

// Generate documentation for a specific file or module
export async function generateDocumentation(
  repoPath: string,
  request: DocumentationRequest
): Promise<DocumentationResult> {
  try {
    const config = await loadConfig();
    if (!config) {
      return {
        success: false,
        generatedDocs: "",
        filesToUpdate: [],
        error: "No configuration found"
      };
    }
    
    const provider = getProvider(config.defaultProvider);
    const model = config.models[config.defaultProvider]?.chat;
    
    if (!model) {
      return {
        success: false,
        generatedDocs: "",
        filesToUpdate: [],
        error: `No model configured for ${config.defaultProvider}`
      };
    }
    
    const targetPath = path.resolve(repoPath, request.targetPath);
    
    // Handle README generation differently
    if (request.type === "readme") {
      return generateReadmeDocumentation(repoPath, provider, model);
    }
    
    // Read the target file
    let fileContent: string;
    try {
      fileContent = await fs.readFile(targetPath, "utf8");
    } catch (error) {
      return {
        success: false,
        generatedDocs: "",
        filesToUpdate: [],
        error: `Failed to read file: ${request.targetPath}`
      };
    }
    
    // Check for existing documentation
    let existingDocs = "";
    const analysis = await analyzeFileForDocs(targetPath);
    
    // Generate the documentation prompt
    const prompt = generateDocPrompt(fileContent, request, existingDocs);
    
    log.step("Generating docs", `for ${request.targetPath}...`);
    
    // Estimate cost before proceeding
    const inputTokens = estimateTokens(prompt, model);
    if (inputTokens > 8000) {
      log.warn("Large file detected - documentation may be truncated or expensive");
    }
    
    // Generate documentation using AI
    const documentation = await provider.chat([
      { role: "user", content: prompt }
    ], {
      model,
      temperature: 0.3
    });
    
    // Determine where to place the documentation
    const filesToUpdate = await determineFillesToUpdate(
      targetPath,
      documentation,
      request,
      analysis
    );
    
    return {
      success: true,
      generatedDocs: documentation,
      filesToUpdate,
    };
    
  } catch (error) {
    log.warn("Documentation generation failed:", error);
    return {
      success: false,
      generatedDocs: "",
      filesToUpdate: [],
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

// Generate README documentation by analyzing the entire project
async function generateReadmeDocumentation(
  repoPath: string,
  provider: any,
  model: string
): Promise<DocumentationResult> {
  try {
    // Collect project information
    let projectInfo = "";
    
    // Try to read package.json
    try {
      const pkgPath = path.join(repoPath, "package.json");
      const pkgContent = await fs.readFile(pkgPath, "utf8");
      const pkg = JSON.parse(pkgContent);
      
      projectInfo += `Project: ${pkg.name || "Unnamed Project"}\n`;
      if (pkg.description) projectInfo += `Description: ${pkg.description}\n`;
      if (pkg.version) projectInfo += `Version: ${pkg.version}\n`;
      if (pkg.scripts) {
        projectInfo += `Available Scripts: ${Object.keys(pkg.scripts).join(", ")}\n`;
      }
      if (pkg.dependencies) {
        const deps = Object.keys(pkg.dependencies).slice(0, 10);
        projectInfo += `Main Dependencies: ${deps.join(", ")}\n`;
      }
    } catch {
      // No package.json or not Node.js project
    }
    
    // Scan for main entry files
    const entryFiles = ["index.js", "index.ts", "main.py", "main.go", "src/index.ts", "src/main.ts"];
    let mainFileContent = "";
    
    for (const entryFile of entryFiles) {
      try {
        const entryPath = path.join(repoPath, entryFile);
        const content = await fs.readFile(entryPath, "utf8");
        mainFileContent = `Main file (${entryFile}):\n\`\`\`\n${content.substring(0, 1000)}\n\`\`\`\n\n`;
        break;
      } catch {
        continue;
      }
    }
    
    // Generate README prompt
    const readmePrompt = `Generate a comprehensive README.md for this project.

**Project Information:**
${projectInfo}

**Main Code Sample:**
${mainFileContent}

Please create a README.md that includes:

1. **Project Title & Description**
2. **Installation Instructions** (appropriate for the project type)
3. **Quick Start Guide** with basic usage examples
4. **API Documentation** (if applicable)
5. **Configuration Options** (if any)
6. **Contributing Guidelines**
7. **License Information**

Make it professional, clear, and helpful for both users and contributors. Use proper Markdown formatting with badges if appropriate.`;

    const readme = await provider.chat([
      { role: "user", content: readmePrompt }
    ], {
      model,
      temperature: 0.3
    });
    
    return {
      success: true,
      generatedDocs: readme,
      filesToUpdate: [
        {
          path: path.join(repoPath, "README.md"),
          content: readme,
          type: "create"
        }
      ]
    };
    
  } catch (error) {
    return {
      success: false,
      generatedDocs: "",
      filesToUpdate: [],
      error: error instanceof Error ? error.message : "README generation failed"
    };
  }
}

// Determine which files need to be updated with documentation
async function determineFillesToUpdate(
  targetPath: string,
  documentation: string,
  request: DocumentationRequest,
  analysis: any
): Promise<Array<{ path: string; content: string; type: "create" | "update" }>> {
  const filesToUpdate: Array<{ path: string; content: string; type: "create" | "update" }> = [];
  
  if (request.style === "jsdoc" || request.style === "sphinx") {
    // For JSDoc/Sphinx, we need to inject into the source file
    const originalContent = await fs.readFile(targetPath, "utf8");
    
    // Simple approach: add documentation at the top of the file
    const updatedContent = `/**\n * ${documentation.replace(/\n/g, '\n * ')}\n */\n\n${originalContent}`;
    
    filesToUpdate.push({
      path: targetPath,
      content: updatedContent,
      type: "update"
    });
  } else {
    // For markdown or separate docs, create a .md file
    const docPath = targetPath.replace(path.extname(targetPath), ".md");
    
    filesToUpdate.push({
      path: docPath,
      content: documentation,
      type: "create"
    });
  }
  
  return filesToUpdate;
}