import { promises as fs } from "node:fs";
import path from "node:path";
import { runShell } from "../tools/shell.js";
import { runTask } from "../agent/planner.js";
import { createPullRequest } from "../tools/github.js";
import { log } from "../util/logging.js";

export interface DependencyUpdate {
  name: string;
  currentVersion: string;
  latestVersion: string;
  type: "dependency" | "devDependency" | "peerDependency";
  updateType: "patch" | "minor" | "major";
  changelog?: string;
}

export interface UpdateResult {
  success: boolean;
  updates: DependencyUpdate[];
  prUrl?: string;
  error?: string;
}

// Check for outdated dependencies in different project types
export async function checkOutdatedDependencies(
  projectPath: string
): Promise<DependencyUpdate[]> {
  const updates: DependencyUpdate[] = [];
  
  try {
    // Check if it's a Node.js project
    const packageJsonPath = path.join(projectPath, 'package.json');
    try {
      await fs.access(packageJsonPath);
      const nodeUpdates = await checkNodeDependencies(projectPath);
      updates.push(...nodeUpdates);
    } catch {
      // Not a Node.js project or no package.json
    }
    
    // Check if it's a Python project
    const requirementsPath = path.join(projectPath, 'requirements.txt');
    try {
      await fs.access(requirementsPath);
      const pythonUpdates = await checkPythonDependencies(projectPath);
      updates.push(...pythonUpdates);
    } catch {
      // Not a Python project or no requirements.txt
    }
    
    // Check if it's a Rust project
    const cargoPath = path.join(projectPath, 'Cargo.toml');
    try {
      await fs.access(cargoPath);
      const rustUpdates = await checkRustDependencies(projectPath);
      updates.push(...rustUpdates);
    } catch {
      // Not a Rust project
    }
    
  } catch (error) {
    log.error("Failed to check dependencies:", error);
  }
  
  return updates;
}

// Check Node.js dependencies using npm outdated
async function checkNodeDependencies(projectPath: string): Promise<DependencyUpdate[]> {
  try {
    const result = await runShell(['npm', 'outdated', '--json'], projectPath);
    
    if (!result.ok) {
      // npm outdated returns exit code 1 when outdated packages exist
      if (!('error' in result && result.error.includes('npm outdated'))) {
        throw new Error('error' in result ? result.error : 'npm outdated command failed');
      }
    }
    
    const outdatedData = result.ok ? result.data.stdout : '{}';
    const outdated = JSON.parse(outdatedData || '{}');
    
    const updates: DependencyUpdate[] = [];
    
    for (const [name, info] of Object.entries(outdated as Record<string, any>)) {
      const updateType = determineUpdateType(info.current, info.latest);
      
      updates.push({
        name,
        currentVersion: info.current,
        latestVersion: info.latest,
        type: info.type || 'dependency',
        updateType
      });
    }
    
    return updates;
  } catch (error) {
    log.warn("Failed to check Node.js dependencies:", error);
    return [];
  }
}

// Check Python dependencies using pip-outdated or similar
async function checkPythonDependencies(projectPath: string): Promise<DependencyUpdate[]> {
  try {
    // Try pip list --outdated
    const result = await runShell(['pip', 'list', '--outdated', '--format=json'], projectPath);
    
    if (!result.ok || !result.data.stdout) {
      return [];
    }
    
    const outdated = JSON.parse(result.data.stdout);
    const updates: DependencyUpdate[] = [];
    
    for (const pkg of outdated) {
      const updateType = determineUpdateType(pkg.version, pkg.latest_version);
      
      updates.push({
        name: pkg.name,
        currentVersion: pkg.version,
        latestVersion: pkg.latest_version,
        type: 'dependency',
        updateType
      });
    }
    
    return updates;
  } catch (error) {
    log.warn("Failed to check Python dependencies:", error);
    return [];
  }
}

// Check Rust dependencies using cargo outdated
async function checkRustDependencies(projectPath: string): Promise<DependencyUpdate[]> {
  try {
    // Check if cargo-outdated is installed
    const checkInstall = await runShell(['cargo', 'outdated', '--help'], projectPath);
    if (!checkInstall.ok) {
      log.info("Installing cargo-outdated...");
      await runShell(['cargo', 'install', 'cargo-outdated'], projectPath);
    }
    
    const result = await runShell(['cargo', 'outdated', '--format', 'json'], projectPath);
    
    if (!result.ok || !result.data.stdout) {
      return [];
    }
    
    const outdated = JSON.parse(result.data.stdout);
    const updates: DependencyUpdate[] = [];
    
    if (outdated.dependencies) {
      for (const dep of outdated.dependencies) {
        const updateType = determineUpdateType(dep.project, dep.latest);
        
        updates.push({
          name: dep.name,
          currentVersion: dep.project,
          latestVersion: dep.latest,
          type: 'dependency',
          updateType
        });
      }
    }
    
    return updates;
  } catch (error) {
    log.warn("Failed to check Rust dependencies:", error);
    return [];
  }
}

// Determine if update is patch, minor, or major
function determineUpdateType(current: string, latest: string): "patch" | "minor" | "major" {
  try {
    // Remove non-numeric prefixes like 'v'
    const currentClean = current.replace(/^[^0-9]+/, '');
    const latestClean = latest.replace(/^[^0-9]+/, '');
    
    const currentParts = currentClean.split('.').map(Number);
    const latestParts = latestClean.split('.').map(Number);
    
    if (latestParts[0] > currentParts[0]) return 'major';
    if (latestParts[1] > currentParts[1]) return 'minor';
    return 'patch';
  } catch {
    return 'patch'; // Default fallback
  }
}

// Apply dependency updates
export async function applyDependencyUpdates(
  projectPath: string,
  updates: DependencyUpdate[],
  options: {
    createPR?: boolean;
    branchName?: string;
    updateTypes?: Array<"patch" | "minor" | "major">;
  } = {}
): Promise<UpdateResult> {
  const {
    createPR = true,
    branchName = `termcoder-deps-${Date.now()}`,
    updateTypes = ['patch', 'minor'] // Default: only safe updates
  } = options;
  
  try {
    log.info(`🔄 Applying ${updates.length} dependency updates`);
    
    // Filter updates by type
    const filteredUpdates = updates.filter(update => 
      updateTypes.includes(update.updateType)
    );
    
    if (filteredUpdates.length === 0) {
      return { success: true, updates: [] };
    }
    
    // Create branch if needed
    if (createPR) {
      await runShell(['git', 'checkout', '-b', branchName], projectPath);
    }
    
    // Apply updates by project type
    const nodeUpdates = filteredUpdates.filter(u => 
      path.join(projectPath, 'package.json')
    );
    const pythonUpdates = filteredUpdates.filter(u => 
      path.join(projectPath, 'requirements.txt')
    );
    const rustUpdates = filteredUpdates.filter(u => 
      path.join(projectPath, 'Cargo.toml')
    );
    
    // Apply Node.js updates
    if (nodeUpdates.length > 0) {
      await applyNodeUpdates(projectPath, nodeUpdates);
    }
    
    // Apply Python updates
    if (pythonUpdates.length > 0) {
      await applyPythonUpdates(projectPath, pythonUpdates);
    }
    
    // Apply Rust updates
    if (rustUpdates.length > 0) {
      await applyRustUpdates(projectPath, rustUpdates);
    }
    
    // Run tests after updates
    log.step("Testing updates", "running tests to verify updates...");
    const { runTests } = await import("../tools/test.js");
    const testResult = await runTests(projectPath);
    
    if (!testResult.success) {
      log.warn("⚠️ Tests failed after dependency updates");
      // Try to fix with AI
      await runTask(projectPath, "Fix any issues caused by dependency updates", false);
      
      // Test again
      const retestResult = await runTests(projectPath);
      if (!retestResult.success) {
        throw new Error("Tests still failing after attempting fixes");
      }
    }
    
    // Commit changes
    await runShell(['git', 'add', '.'], projectPath);
    
    const commitMessage = `chore: update dependencies

Updated ${filteredUpdates.length} dependencies:
${filteredUpdates.map(u => `- ${u.name}: ${u.currentVersion} → ${u.latestVersion}`).join('\n')}

🤖 Generated by TermCode`;
    
    await runShell(['git', 'commit', '-m', commitMessage], projectPath);
    
    // Create PR if requested
    let prUrl: string | undefined;
    if (createPR) {
      const title = `🔄 Dependency updates (${filteredUpdates.length} packages)`;
      const body = `## Dependency Updates

This PR updates the following dependencies:

${filteredUpdates.map(u => 
  `- **${u.name}**: \`${u.currentVersion}\` → \`${u.latestVersion}\` (${u.updateType})`
).join('\n')}

### Update Types
- ${updateTypes.join(', ')} updates included
- Major updates excluded for safety

### Testing
- ✅ All tests passing after updates
${testResult.success ? '' : '- 🔧 Auto-fixed test failures'}

🤖 Generated by TermCode nightly dependency updater`;
      
      prUrl = await createPullRequest(projectPath, branchName, title, body);
    }
    
    return {
      success: true,
      updates: filteredUpdates,
      prUrl
    };
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log.error("Dependency update failed:", error);
    
    return {
      success: false,
      updates: [],
      error: errorMsg
    };
  }
}

// Apply Node.js dependency updates
async function applyNodeUpdates(projectPath: string, updates: DependencyUpdate[]): Promise<void> {
  for (const update of updates) {
    log.step("Updating", `${update.name}@${update.latestVersion}`);
    
    const installCmd = update.type === 'devDependency' 
      ? ['npm', 'install', '--save-dev', `${update.name}@${update.latestVersion}`]
      : ['npm', 'install', '--save', `${update.name}@${update.latestVersion}`];
    
    await runShell(installCmd, projectPath);
  }
}

// Apply Python dependency updates
async function applyPythonUpdates(projectPath: string, updates: DependencyUpdate[]): Promise<void> {
  for (const update of updates) {
    log.step("Updating", `${update.name}==${update.latestVersion}`);
    await runShell(['pip', 'install', '--upgrade', `${update.name}==${update.latestVersion}`], projectPath);
  }
  
  // Update requirements.txt
  await runShell(['pip', 'freeze'], projectPath);
}

// Apply Rust dependency updates
async function applyRustUpdates(projectPath: string, updates: DependencyUpdate[]): Promise<void> {
  // For Rust, we update Cargo.toml and run cargo update
  log.step("Updating Rust deps", "running cargo update");
  await runShell(['cargo', 'update'], projectPath);
  
  // For specific version updates, we'd need to modify Cargo.toml
  // This is a simplified implementation
}

// Schedule nightly dependency updates
export async function scheduleNightlyUpdates(
  projectPaths: string[],
  options: {
    updateTypes?: Array<"patch" | "minor" | "major">;
    createPRs?: boolean;
  } = {}
): Promise<UpdateResult[]> {
  const results: UpdateResult[] = [];
  
  log.info(`🌙 Running nightly dependency updates for ${projectPaths.length} projects`);
  
  for (const projectPath of projectPaths) {
    try {
      log.step("Checking", projectPath);
      
      const updates = await checkOutdatedDependencies(projectPath);
      
      if (updates.length === 0) {
        log.info(`✅ No updates needed for ${projectPath}`);
        results.push({ success: true, updates: [] });
        continue;
      }
      
      const result = await applyDependencyUpdates(projectPath, updates, {
        ...options,
        branchName: `termcoder-nightly-deps-${new Date().toISOString().split('T')[0]}`
      });
      
      results.push(result);
      
    } catch (error) {
      log.error(`Failed to update dependencies for ${projectPath}:`, error);
      results.push({
        success: false,
        updates: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  return results;
}