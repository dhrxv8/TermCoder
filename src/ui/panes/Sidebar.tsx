import React from 'react';
import { Box, Text } from 'ink';
import { UIMode, TaskHistoryItem } from '../types.js';

interface SidebarProps {
  width: number;
  height: number;
  active: boolean;
  mode: UIMode;
  session: any;
  onTaskSubmit: (task: string) => void;
  onRunTests: () => void;
  onRollback: () => void;
  onCreatePR: () => void;
  onMerge: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  width,
  height,
  active,
  mode,
  session,
  onTaskSubmit,
  onRunTests,
  onRollback,
  onCreatePR,
  onMerge,
}) => {
  const borderColor = active ? 'blue' : 'gray';
  
  // Mock task history - in real implementation, this would come from session
  const recentTasks: TaskHistoryItem[] = session?.recentTasks?.map((task: string, index: number) => ({
    id: `task-${index}`,
    task,
    timestamp: new Date(Date.now() - (index * 30000)), // 30 seconds ago per task
    files: [`file${index}.ts`],
    status: index === 0 ? 'completed' : 'completed',
  })) || [];

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h`;
  };

  const getStatusIcon = (status: TaskHistoryItem['status']) => {
    switch (status) {
      case 'completed': return '✅';
      case 'running': return '⏳';
      case 'failed': return '❌';
      default: return '⏸️';
    }
  };

  return (
    <Box 
      width={width} 
      height={height} 
      borderStyle="single" 
      borderColor={borderColor}
      flexDirection="column"
    >
      {/* Header */}
      <Box paddingX={1} borderStyle="single" borderTop={false} borderLeft={false} borderRight={false}>
        <Text color="cyan" bold>
          Task History
        </Text>
      </Box>

      {/* Task History */}
      <Box flexDirection="column" paddingX={1} paddingY={1} flexGrow={1}>
        {recentTasks.length === 0 ? (
          <Text color="gray" dimColor>
            No tasks yet
          </Text>
        ) : (
          recentTasks.slice(0, Math.floor((height - 8) / 3)).map((task, index) => (
            <Box key={task.id} marginBottom={1}>
              <Box width="100%" flexDirection="column">
                <Box>
                  <Text color="gray">{getStatusIcon(task.status)} </Text>
                  <Text color="white" wrap="wrap">
                    {task.task.length > width - 8 
                      ? task.task.substring(0, width - 11) + '...' 
                      : task.task
                    }
                  </Text>
                </Box>
                <Box justifyContent="space-between">
                  <Text color="gray" dimColor>
                    {formatTime(task.timestamp)}
                  </Text>
                  <Text color="cyan" dimColor>
                    {task.files.length} files
                  </Text>
                </Box>
              </Box>
            </Box>
          ))
        )}
      </Box>

      {/* Quick Actions (Pro mode only) */}
      {mode === 'pro' && (
        <Box 
          borderStyle="single" 
          borderBottom={false} 
          borderLeft={false} 
          borderRight={false}
          paddingX={1}
          paddingY={1}
          flexDirection="column"
        >
          <Text color="yellow" bold marginBottom={1}>
            Quick Actions
          </Text>
          <Box flexDirection="column" gap={1}>
            <Box>
              <Text color="green">F5</Text>
              <Text color="gray"> Run Tests</Text>
            </Box>
            <Box>
              <Text color="red">F7</Text>
              <Text color="gray"> Rollback</Text>
            </Box>
            <Box>
              <Text color="blue">F8</Text>
              <Text color="gray"> Create PR</Text>
            </Box>
            <Box>
              <Text color="magenta">F9</Text>
              <Text color="gray"> Merge</Text>
            </Box>
          </Box>
        </Box>
      )}

      {/* Usage Stats */}
      <Box 
        borderStyle="single" 
        borderBottom={false} 
        borderLeft={false} 
        borderRight={false}
        paddingX={1}
        justifyContent="space-between"
      >
        <Text color="gray" dimColor>
          {session?.totalTokensUsed || 0} tokens
        </Text>
        <Text color="gray" dimColor>
          ${(session?.totalCostUSD || 0).toFixed(3)}
        </Text>
      </Box>
    </Box>
  );
};