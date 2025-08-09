import { log } from "../util/logging.js";
import readline from "node:readline";

export interface DiffHunk {
  id: string;
  filePath: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  content: string;
  selected: boolean;
}

export interface ParsedDiff {
  files: Array<{
    filePath: string;
    hunks: DiffHunk[];
  }>;
}

// Parse unified diff into individual hunks
export function parseUnifiedDiff(diffText: string): ParsedDiff {
  const files: Array<{ filePath: string; hunks: DiffHunk[] }> = [];
  const lines = diffText.split('\n');
  
  let currentFile: string | null = null;
  let currentHunk: DiffHunk | null = null;
  let hunkCounter = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // File header: diff --git a/file b/file
    if (line.startsWith('diff --git')) {
      const match = line.match(/diff --git a\/(.+) b\/(.+)/);
      if (match) {
        currentFile = match[1]; // Use 'a' file path
        files.push({ filePath: currentFile, hunks: [] });
        currentHunk = null;
      }
    }
    
    // Hunk header: @@ -oldStart,oldLines +newStart,newLines @@
    else if (line.startsWith('@@') && currentFile) {
      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (match) {
        // Save previous hunk
        if (currentHunk) {
          const currentFileObj = files[files.length - 1];
          currentFileObj.hunks.push(currentHunk);
        }
        
        const oldStart = parseInt(match[1]);
        const oldLines = match[2] ? parseInt(match[2]) : 1;
        const newStart = parseInt(match[3]);
        const newLines = match[4] ? parseInt(match[4]) : 1;
        
        currentHunk = {
          id: `hunk-${++hunkCounter}`,
          filePath: currentFile,
          oldStart,
          oldLines,
          newStart,
          newLines,
          header: line,
          content: line + '\n',
          selected: true // Default to selected
        };
      }
    }
    
    // Hunk content lines (context, additions, deletions)
    else if (currentHunk && (line.startsWith(' ') || line.startsWith('+') || line.startsWith('-'))) {
      currentHunk.content += line + '\n';
    }
    
    // File metadata lines - add to current hunk if exists
    else if (currentHunk && (line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++'))) {
      // Insert metadata before the hunk header
      const headerIndex = currentHunk.content.indexOf(currentHunk.header);
      if (headerIndex !== -1) {
        currentHunk.content = currentHunk.content.slice(0, headerIndex) + line + '\n' + currentHunk.content.slice(headerIndex);
      } else {
        currentHunk.content = line + '\n' + currentHunk.content;
      }
    }
  }
  
  // Save final hunk
  if (currentHunk && currentFile) {
    const currentFileObj = files[files.length - 1];
    currentFileObj.hunks.push(currentHunk);
  }
  
  return { files };
}

// Generate diff text from selected hunks only
export function generateSelectedDiff(parsedDiff: ParsedDiff): string {
  let result = '';
  
  for (const file of parsedDiff.files) {
    const selectedHunks = file.hunks.filter(hunk => hunk.selected);
    
    if (selectedHunks.length === 0) continue;
    
    // Add file header
    result += `diff --git a/${file.filePath} b/${file.filePath}\n`;
    
    // Add metadata (extract from first hunk)
    const firstHunk = selectedHunks[0];
    const lines = firstHunk.content.split('\n');
    for (const line of lines) {
      if (line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
        result += line + '\n';
      } else if (line.startsWith('@@')) {
        break; // Stop at hunk header
      }
    }
    
    // Add selected hunks
    for (const hunk of selectedHunks) {
      // Extract just the hunk content (without metadata)
      const hunkLines = hunk.content.split('\n');
      let inHunkContent = false;
      
      for (const line of hunkLines) {
        if (line.startsWith('@@')) {
          inHunkContent = true;
        }
        
        if (inHunkContent && line.trim()) {
          result += line + '\n';
        }
      }
    }
  }
  
  return result;
}

// Interactive hunk selection in CLI
export async function selectHunksInteractively(parsedDiff: ParsedDiff): Promise<ParsedDiff> {
  if (parsedDiff.files.length === 0) {
    return parsedDiff;
  }
  
  log.step("Hunk Selection", "reviewing changes before applying...");
  log.raw("");
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  let currentHunkIndex = 0;
  const allHunks: DiffHunk[] = [];
  
  // Flatten all hunks with file context
  for (const file of parsedDiff.files) {
    for (const hunk of file.hunks) {
      allHunks.push(hunk);
    }
  }
  
  if (allHunks.length === 0) {
    rl.close();
    return parsedDiff;
  }
  
  const showHunk = (index: number) => {
    const hunk = allHunks[index];
    const status = hunk.selected ? log.colors.green("✓ SELECTED") : log.colors.red("✗ SKIPPED");
    
    console.clear();
    log.raw(log.colors.bright(`🔍 Hunk ${index + 1} of ${allHunks.length}`));
    log.raw(`File: ${log.colors.cyan(hunk.filePath)}`);
    log.raw(`Status: ${status}`);
    log.raw("");
    
    // Show hunk content with syntax highlighting
    const lines = hunk.content.split('\n');
    for (const line of lines) {
      if (line.startsWith('@@')) {
        log.raw(log.colors.cyan(line));
      } else if (line.startsWith('+')) {
        log.raw(log.colors.green(line));
      } else if (line.startsWith('-')) {
        log.raw(log.colors.red(line));
      } else {
        log.raw(log.colors.dim(line));
      }
    }
    
    log.raw("");
    log.raw(log.colors.dim("Commands: [s]elect/deselect • [n]ext • [p]rev • [a]ll • [q]uit"));
    log.raw("");
  };
  
  const handleInput = (input: string) => {
    const cmd = input.trim().toLowerCase();
    
    switch (cmd) {
      case 's':
      case 'space':
        allHunks[currentHunkIndex].selected = !allHunks[currentHunkIndex].selected;
        showHunk(currentHunkIndex);
        break;
        
      case 'n':
        if (currentHunkIndex < allHunks.length - 1) {
          currentHunkIndex++;
          showHunk(currentHunkIndex);
        }
        break;
        
      case 'p':
        if (currentHunkIndex > 0) {
          currentHunkIndex--;
          showHunk(currentHunkIndex);
        }
        break;
        
      case 'a':
        const allSelected = allHunks.every(h => h.selected);
        allHunks.forEach(h => h.selected = !allSelected);
        showHunk(currentHunkIndex);
        break;
        
      case 'q':
        rl.close();
        return;
        
      default:
        log.raw(log.colors.yellow("Unknown command. Use s, n, p, a, or q"));
        break;
    }
  };
  
  showHunk(0);
  
  return new Promise((resolve) => {
    rl.on('line', handleInput);
    rl.on('close', () => {
      const selectedCount = allHunks.filter(h => h.selected).length;
      log.raw("");
      log.success(`Selected ${selectedCount} of ${allHunks.length} hunks for application`);
      resolve(parsedDiff);
    });
  });
}

// Get summary of selected hunks
export function getSelectionSummary(parsedDiff: ParsedDiff): { totalHunks: number; selectedHunks: number; affectedFiles: string[] } {
  let totalHunks = 0;
  let selectedHunks = 0;
  const affectedFiles: string[] = [];
  
  for (const file of parsedDiff.files) {
    const fileSelectedHunks = file.hunks.filter(h => h.selected);
    totalHunks += file.hunks.length;
    selectedHunks += fileSelectedHunks.length;
    
    if (fileSelectedHunks.length > 0) {
      affectedFiles.push(file.filePath);
    }
  }
  
  return {
    totalHunks,
    selectedHunks,
    affectedFiles
  };
}