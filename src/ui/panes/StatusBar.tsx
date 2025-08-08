import React from 'react';
import { Box, Text } from 'ink';
import { UIMode } from '../types.js';

interface StatusBarProps {
  height: number;
  mode: UIMode;
  provider: string;
  model: string;
  status: string;
  branch: string;
  project?: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  height,
  mode,
  provider,
  model,
  status,
  branch,
  project,
}) => {
  const modeColor = mode === 'easy' ? 'green' : 'blue';
  const statusColor = status.includes('Error') || status.includes('Failed') ? 'red' :
                     status.includes('Running') || status.includes('Processing') ? 'yellow' : 'green';

  return (
    <Box height={height} borderStyle="single" borderColor="gray" padding={0}>
      <Box width="100%" justifyContent="space-between" paddingX={1}>
        {/* Left side: Mode and Status */}
        <Box>
          <Text color={modeColor} bold>
            {mode.toUpperCase()}
          </Text>
          <Text color="gray"> • </Text>
          <Text color={statusColor}>
            {status}
          </Text>
        </Box>

        {/* Center: Provider and Model */}
        <Box>
          <Text color="cyan">
            {provider}
          </Text>
          <Text color="gray"> / </Text>
          <Text color="white">
            {model}
          </Text>
        </Box>

        {/* Right side: Branch and Project */}
        <Box>
          {project && (
            <>
              <Text color="magenta">{project}</Text>
              <Text color="gray"> • </Text>
            </>
          )}
          <Text color="yellow">
            {branch}
          </Text>
        </Box>
      </Box>

      {/* Keyboard shortcuts help */}
      <Box width="100%" justifyContent="center" paddingX={1}>
        <Text color="gray" dimColor>
          F2: Mode • F5: Test • F7: Rollback • F8: PR • F9: Merge • /: Commands • Tab: Navigate
        </Text>
      </Box>
    </Box>
  );
};