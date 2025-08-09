import { log } from "../util/logging.js";
import { promises as fs } from "node:fs";
import path from "node:path";

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  category: 'system' | 'ai' | 'network' | 'user';
  metadata?: Record<string, any>;
}

export interface PerformanceSnapshot {
  id: string;
  timestamp: number;
  metrics: PerformanceMetric[];
  context: {
    provider: string;
    model: string;
    task: string;
    repoSize: number;
  };
  summary: {
    totalTime: number;
    tokenCount: number;
    cost: number;
    success: boolean;
  };
}

export interface PerformanceAlert {
  type: 'slow_response' | 'high_cost' | 'memory_usage' | 'error_rate';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  threshold: number;
  currentValue: number;
  timestamp: number;
  recommendations: string[];
}

/**
 * Advanced Performance Monitoring System
 * Provides comprehensive performance tracking and optimization suggestions
 */
export class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private snapshots: PerformanceSnapshot[] = [];
  private alerts: PerformanceAlert[] = [];
  private activeTimers: Map<string, number> = new Map();
  private thresholds: Map<string, number> = new Map();
  private configPath: string;

  constructor(baseDir: string = path.join(process.env.HOME || "~", ".termcode")) {
    this.configPath = path.join(baseDir, "performance");
    this.initializeThresholds();
  }

  /**
   * Initialize performance monitoring
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.configPath, { recursive: true });
      await this.loadHistoricalData();
      
      // Start background monitoring
      this.startSystemMonitoring();
      
      log.info("Performance monitoring initialized");
    } catch (error) {
      log.error("Failed to initialize performance monitoring:", error);
    }
  }

  /**
   * Start timing a performance metric
   */
  startTimer(name: string): void {
    this.activeTimers.set(name, Date.now());
  }

  /**
   * End timing and record metric
   */
  endTimer(
    name: string, 
    category: PerformanceMetric['category'] = 'system',
    metadata?: Record<string, any>
  ): number {
    const startTime = this.activeTimers.get(name);
    if (!startTime) {
      log.warn(`Timer not found: ${name}`);
      return 0;
    }

    const duration = Date.now() - startTime;
    this.activeTimers.delete(name);

    this.recordMetric({
      name,
      value: duration,
      unit: 'ms',
      timestamp: Date.now(),
      category,
      metadata
    });

    return duration;
  }

  /**
   * Record a performance metric
   */
  recordMetric(metric: PerformanceMetric): void {
    if (!this.metrics.has(metric.name)) {
      this.metrics.set(metric.name, []);
    }

    const metricHistory = this.metrics.get(metric.name)!;
    metricHistory.push(metric);

    // Keep only last 1000 entries per metric
    if (metricHistory.length > 1000) {
      this.metrics.set(metric.name, metricHistory.slice(-1000));
    }

    // Check for threshold violations
    this.checkThresholds(metric);

    log.debug(`Performance metric recorded: ${metric.name} = ${metric.value}${metric.unit}`);
  }

  /**
   * Create performance snapshot
   */
  createSnapshot(
    context: PerformanceSnapshot['context'],
    summary: PerformanceSnapshot['summary']
  ): PerformanceSnapshot {
    const snapshot: PerformanceSnapshot = {
      id: `perf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      metrics: this.getAllRecentMetrics(),
      context,
      summary
    };

    this.snapshots.push(snapshot);

    // Keep only last 100 snapshots
    if (this.snapshots.length > 100) {
      this.snapshots = this.snapshots.slice(-100);
    }

    // Analyze snapshot for insights
    this.analyzeSnapshot(snapshot);

    return snapshot;
  }

  /**
   * Monitor AI provider performance
   */
  async monitorAICall<T>(
    provider: string,
    model: string,
    operation: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const timerName = `ai_${provider}_${model}`;
    const startMemory = process.memoryUsage();
    
    this.startTimer(timerName);
    this.startTimer(`ai_total_time`);

    try {
      const result = await operation();
      
      const duration = this.endTimer(timerName, 'ai', {
        provider,
        model,
        ...metadata
      });

      // Record memory usage
      const endMemory = process.memoryUsage();
      this.recordMetric({
        name: 'ai_memory_usage',
        value: endMemory.heapUsed - startMemory.heapUsed,
        unit: 'bytes',
        timestamp: Date.now(),
        category: 'ai',
        metadata: { provider, model }
      });

      // Record success
      this.recordMetric({
        name: 'ai_success_rate',
        value: 1,
        unit: 'count',
        timestamp: Date.now(),
        category: 'ai',
        metadata: { provider, model }
      });

      return result;

    } catch (error) {
      this.endTimer(timerName, 'ai', {
        provider,
        model,
        error: error instanceof Error ? error.message : String(error),
        ...metadata
      });

      // Record failure
      this.recordMetric({
        name: 'ai_success_rate',
        value: 0,
        unit: 'count',
        timestamp: Date.now(),
        category: 'ai',
        metadata: { provider, model, error: String(error) }
      });

      throw error;
    }
  }

  /**
   * Monitor system resource usage
   */
  async monitorSystemResources(): Promise<{
    cpu: number;
    memory: NodeJS.MemoryUsage;
    disk: { used: number; total: number };
  }> {
    const memory = process.memoryUsage();
    
    // Record memory metrics
    this.recordMetric({
      name: 'system_memory_heap',
      value: memory.heapUsed,
      unit: 'bytes',
      timestamp: Date.now(),
      category: 'system'
    });

    this.recordMetric({
      name: 'system_memory_external',
      value: memory.external,
      unit: 'bytes',
      timestamp: Date.now(),
      category: 'system'
    });

    // Get disk usage (simplified)
    let disk = { used: 0, total: 0 };
    try {
      const { execSync } = await import('node:child_process');
      const output = execSync('df -h .', { encoding: 'utf8' });
      const lines = output.split('\n');
      if (lines.length > 1) {
        const parts = lines[1].split(/\s+/);
        disk = {
          used: this.parseSize(parts[2]),
          total: this.parseSize(parts[1])
        };
      }
    } catch (error) {
      // Ignore errors
    }

    return { cpu: 0, memory, disk };
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    overview: {
      totalMetrics: number;
      activeAlerts: number;
      avgResponseTime: number;
      successRate: number;
    };
    breakdown: {
      byCategory: Record<string, { count: number; avgValue: number }>;
      byProvider: Record<string, { calls: number; avgTime: number; successRate: number }>;
    };
    trends: {
      responseTimetrend: 'improving' | 'degrading' | 'stable';
      errorRateChange: number;
      resourceUsage: 'low' | 'medium' | 'high';
    };
  } {
    const totalMetrics = Array.from(this.metrics.values())
      .reduce((sum, metrics) => sum + metrics.length, 0);

    const activeAlerts = this.alerts.filter(alert => 
      Date.now() - alert.timestamp < 3600000 // Last hour
    ).length;

    // Calculate average response time
    const responseTimeMetrics = this.metrics.get('ai_total_time') || [];
    const avgResponseTime = responseTimeMetrics.length > 0 ?
      responseTimeMetrics.reduce((sum, m) => sum + m.value, 0) / responseTimeMetrics.length : 0;

    // Calculate success rate
    const successMetrics = this.metrics.get('ai_success_rate') || [];
    const successRate = successMetrics.length > 0 ?
      successMetrics.reduce((sum, m) => sum + m.value, 0) / successMetrics.length : 1;

    // Breakdown by category
    const byCategory: Record<string, { count: number; avgValue: number }> = {};
    for (const [name, metrics] of this.metrics) {
      const categoryMetrics = metrics.filter(m => m.category);
      for (const metric of categoryMetrics) {
        if (!byCategory[metric.category]) {
          byCategory[metric.category] = { count: 0, avgValue: 0 };
        }
        byCategory[metric.category].count++;
        byCategory[metric.category].avgValue += metric.value;
      }
    }

    // Calculate averages
    for (const category of Object.keys(byCategory)) {
      byCategory[category].avgValue /= byCategory[category].count;
    }

    // Breakdown by provider
    const byProvider: Record<string, { calls: number; avgTime: number; successRate: number }> = {};
    for (const [name, metrics] of this.metrics) {
      if (name.startsWith('ai_')) {
        for (const metric of metrics) {
          if (metric.metadata?.provider) {
            const provider = metric.metadata.provider;
            if (!byProvider[provider]) {
              byProvider[provider] = { calls: 0, avgTime: 0, successRate: 0 };
            }
            byProvider[provider].calls++;
            if (name.includes('time')) {
              byProvider[provider].avgTime += metric.value;
            }
            if (name === 'ai_success_rate') {
              byProvider[provider].successRate += metric.value;
            }
          }
        }
      }
    }

    // Calculate provider averages
    for (const provider of Object.keys(byProvider)) {
      const data = byProvider[provider];
      data.avgTime /= data.calls;
      data.successRate /= data.calls;
    }

    // Analyze trends
    const recentResponseTimes = responseTimeMetrics.slice(-10);
    const olderResponseTimes = responseTimeMetrics.slice(-20, -10);
    
    let responseTimeChange = 0;
    if (recentResponseTimes.length > 0 && olderResponseTimes.length > 0) {
      const recentAvg = recentResponseTimes.reduce((sum, m) => sum + m.value, 0) / recentResponseTimes.length;
      const olderAvg = olderResponseTimes.reduce((sum, m) => sum + m.value, 0) / olderResponseTimes.length;
      responseTimeChange = (recentAvg - olderAvg) / olderAvg;
    }

    const responseTimeTrend = 
      responseTimeChange < -0.1 ? 'improving' as const : 
      responseTimeChange > 0.1 ? 'degrading' as const : 
      'stable' as const;

    return {
      overview: {
        totalMetrics,
        activeAlerts,
        avgResponseTime,
        successRate
      },
      breakdown: {
        byCategory,
        byProvider
      },
      trends: {
        responseTimetrend: responseTimeTrend,
        errorRateChange: 0, // Would calculate from actual data
        resourceUsage: avgResponseTime > 5000 ? 'high' : avgResponseTime > 2000 ? 'medium' : 'low'
      }
    };
  }

  /**
   * Get optimization recommendations
   */
  getOptimizationRecommendations(): Array<{
    type: 'provider' | 'model' | 'system' | 'workflow';
    priority: 'low' | 'medium' | 'high';
    title: string;
    description: string;
    impact: string;
    actionable: boolean;
  }> {
    const recommendations = [];
    const stats = this.getPerformanceStats();

    // Provider optimization
    const slowestProvider = Object.entries(stats.breakdown.byProvider)
      .sort((a, b) => b[1].avgTime - a[1].avgTime)[0];

    if (slowestProvider && slowestProvider[1].avgTime > 5000) {
      recommendations.push({
        type: 'provider' as const,
        priority: 'high' as const,
        title: 'Switch from slow provider',
        description: `${slowestProvider[0]} has high average response time (${Math.round(slowestProvider[1].avgTime)}ms)`,
        impact: 'Reduce response time by 20-50%',
        actionable: true
      });
    }

    // Memory optimization
    const memoryMetrics = this.metrics.get('system_memory_heap') || [];
    if (memoryMetrics.length > 0) {
      const avgMemory = memoryMetrics.slice(-10).reduce((sum, m) => sum + m.value, 0) / 10;
      if (avgMemory > 500 * 1024 * 1024) { // > 500MB
        recommendations.push({
          type: 'system' as const,
          priority: 'medium' as const,
          title: 'High memory usage detected',
          description: `Average memory usage is ${Math.round(avgMemory / 1024 / 1024)}MB`,
          impact: 'Improve system responsiveness',
          actionable: true
        });
      }
    }

    // Model optimization
    if (stats.overview.avgResponseTime > 3000) {
      recommendations.push({
        type: 'model' as const,
        priority: 'medium' as const,
        title: 'Consider using faster model',
        description: 'Current model has slow response times for simple tasks',
        impact: 'Reduce wait times for basic operations',
        actionable: true
      });
    }

    return recommendations;
  }

  /**
   * Export performance data
   */
  async exportPerformanceData(format: 'json' | 'csv'): Promise<string> {
    const data = {
      snapshots: this.snapshots,
      metrics: Object.fromEntries(this.metrics),
      alerts: this.alerts,
      exportedAt: new Date().toISOString()
    };

    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    } else {
      // Convert to CSV format
      const csvLines = ['timestamp,name,value,unit,category,provider,model'];
      
      for (const [name, metrics] of this.metrics) {
        for (const metric of metrics) {
          csvLines.push([
            metric.timestamp,
            metric.name,
            metric.value,
            metric.unit,
            metric.category,
            metric.metadata?.provider || '',
            metric.metadata?.model || ''
          ].join(','));
        }
      }
      
      return csvLines.join('\n');
    }
  }

  /**
   * Private implementation methods
   */

  private initializeThresholds(): void {
    this.thresholds.set('ai_total_time', 10000); // 10 seconds
    this.thresholds.set('system_memory_heap', 1024 * 1024 * 1024); // 1GB
    this.thresholds.set('ai_success_rate', 0.8); // 80% success rate
  }

  private async loadHistoricalData(): Promise<void> {
    try {
      const dataPath = path.join(this.configPath, 'metrics.json');
      const data = await fs.readFile(dataPath, 'utf8');
      const parsed = JSON.parse(data);
      
      if (parsed.metrics) {
        this.metrics = new Map(Object.entries(parsed.metrics));
      }
      
      if (parsed.snapshots) {
        this.snapshots = parsed.snapshots;
      }
      
    } catch (error) {
      // No historical data available
      log.debug('No historical performance data found');
    }
  }

  private startSystemMonitoring(): void {
    // Monitor system resources every 30 seconds
    setInterval(async () => {
      try {
        await this.monitorSystemResources();
      } catch (error) {
        log.debug('System monitoring error:', error);
      }
    }, 30000);

    // Save metrics every 5 minutes
    setInterval(async () => {
      await this.saveMetrics();
    }, 300000);
  }

  private checkThresholds(metric: PerformanceMetric): void {
    const threshold = this.thresholds.get(metric.name);
    if (!threshold) return;

    let violated = false;
    let comparison = '';

    if (metric.name === 'ai_success_rate') {
      violated = metric.value < threshold;
      comparison = `below ${threshold}`;
    } else {
      violated = metric.value > threshold;
      comparison = `above ${threshold}`;
    }

    if (violated) {
      const alert: PerformanceAlert = {
        type: this.getAlertType(metric.name),
        severity: this.getAlertSeverity(metric.name, metric.value, threshold),
        message: `${metric.name} is ${comparison} (current: ${metric.value}${metric.unit})`,
        threshold,
        currentValue: metric.value,
        timestamp: Date.now(),
        recommendations: this.getThresholdRecommendations(metric.name, metric.value)
      };

      this.alerts.push(alert);

      // Keep only last 100 alerts
      if (this.alerts.length > 100) {
        this.alerts = this.alerts.slice(-100);
      }

      log.warn(`Performance alert: ${alert.message}`);
    }
  }

  private getAllRecentMetrics(): PerformanceMetric[] {
    const recent = [];
    const cutoff = Date.now() - 300000; // Last 5 minutes

    for (const metrics of this.metrics.values()) {
      for (const metric of metrics) {
        if (metric.timestamp > cutoff) {
          recent.push(metric);
        }
      }
    }

    return recent;
  }

  private analyzeSnapshot(snapshot: PerformanceSnapshot): void {
    // Analyze snapshot for performance insights
    const aiMetrics = snapshot.metrics.filter(m => m.category === 'ai');
    const systemMetrics = snapshot.metrics.filter(m => m.category === 'system');

    if (aiMetrics.length > 0) {
      const avgAiTime = aiMetrics
        .filter(m => m.name.includes('time'))
        .reduce((sum, m) => sum + m.value, 0) / aiMetrics.length;

      if (avgAiTime > 5000) {
        log.info(`Slow AI performance detected in snapshot ${snapshot.id}: ${Math.round(avgAiTime)}ms`);
      }
    }
  }

  private parseSize(sizeStr: string): number {
    const match = sizeStr.match(/^([\d.]+)([KMGT]?)$/);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2];

    const multipliers = { K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };
    return value * (multipliers[unit as keyof typeof multipliers] || 1);
  }

  private getAlertType(metricName: string): PerformanceAlert['type'] {
    if (metricName.includes('time')) return 'slow_response';
    if (metricName.includes('memory')) return 'memory_usage';
    if (metricName.includes('cost')) return 'high_cost';
    return 'error_rate';
  }

  private getAlertSeverity(
    metricName: string, 
    value: number, 
    threshold: number
  ): PerformanceAlert['severity'] {
    const ratio = metricName === 'ai_success_rate' ? 
      threshold / value : value / threshold;

    if (ratio > 2) return 'critical';
    if (ratio > 1.5) return 'warning';
    return 'info';
  }

  private getThresholdRecommendations(metricName: string, value: number): string[] {
    switch (metricName) {
      case 'ai_total_time':
        return [
          'Consider using a faster model for simple tasks',
          'Check network connectivity',
          'Reduce context size if possible'
        ];
      case 'system_memory_heap':
        return [
          'Restart the application to free memory',
          'Reduce concurrent operations',
          'Check for memory leaks'
        ];
      case 'ai_success_rate':
        return [
          'Check API key validity',
          'Review recent error messages',
          'Consider switching to a more reliable provider'
        ];
      default:
        return ['Monitor the situation and investigate if it continues'];
    }
  }

  private async saveMetrics(): Promise<void> {
    try {
      const dataPath = path.join(this.configPath, 'metrics.json');
      const data = {
        metrics: Object.fromEntries(this.metrics),
        snapshots: this.snapshots,
        alerts: this.alerts,
        lastSaved: new Date().toISOString()
      };
      
      await fs.writeFile(dataPath, JSON.stringify(data, null, 2));
    } catch (error) {
      log.debug('Failed to save performance metrics:', error);
    }
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();