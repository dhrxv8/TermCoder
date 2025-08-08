import React from 'react';
import { Box, Text } from 'ink';

interface DiffOutputProps {
  width: number;
  height: number;
  active: boolean;
  output: string[];
  currentDiff: string | null;
  streaming: boolean;
}

export const DiffOutput: React.FC<DiffOutputProps> = ({
  width,
  height,
  active,
  output,
  currentDiff,
  streaming,
}) => {
  const borderColor = active ? 'blue' : 'gray';
  const maxLines = height - 4; // Account for borders and padding

  // Process diff content for syntax highlighting
  const renderDiffLine = (line: string, index: number) => {
    if (line.startsWith('+')) {
      return (
        <Text key={index} color="green">
          {line}
        </Text>
      );
    } else if (line.startsWith('-')) {
      return (
        <Text key={index} color="red">
          {line}
        </Text>
      );
    } else if (line.startsWith('@@')) {
      return (
        <Text key={index} color="cyan" bold>
          {line}
        </Text>
      );
    } else if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('+++') || line.startsWith('---')) {
      return (
        <Text key={index} color="yellow">
          {line}
        </Text>
      );
    } else {
      return (
        <Text key={index} color="white">
          {line}
        </Text>
      );
    }
  };

  // Process output lines with colors
  const renderOutputLine = (line: string, index: number) => {
    // Detect log levels and color accordingly
    if (line.includes('✅') || line.includes('success') || line.includes('✓')) {
      return (
        <Text key={index} color="green">
          {line}
        </Text>
      );
    } else if (line.includes('❌') || line.includes('error') || line.includes('failed')) {
      return (
        <Text key={index} color="red">
          {line}
        </Text>
      );
    } else if (line.includes('⚠️') || line.includes('warning') || line.includes('⏳')) {
      return (
        <Text key={index} color="yellow">
          {line}
        </Text>
      );
    } else if (line.includes('📝') || line.includes('🔄') || line.includes('🧪')) {
      return (
        <Text key={index} color="blue">
          {line}
        </Text>
      );
    } else if (line.startsWith('  ') || line.includes('→')) {
      return (
        <Text key={index} color="gray">
          {line}
        </Text>
      );
    } else {
      return (
        <Text key={index} color="white">
          {line}
        </Text>
      );
    }
  };

  // Determine what to display
  let contentLines: string[] = [];
  let isShowingDiff = false;

  if (currentDiff) {
    // Show diff content
    contentLines = currentDiff.split('\n');
    isShowingDiff = true;
  } else if (output.length > 0) {
    // Show command output
    contentLines = output;
  } else {
    // Show welcome message
    contentLines = [
      'Welcome to TermCode TUI!',
      '',
      'This pane will show:',
      '• Real-time command output',
      '• File diffs and changes',
      '• Test results and build logs',
      '• AI agent responses',
      '',
      'Start by typing a task in the prompt below.',
    ];
  }

  // Trim to fit viewport and show recent content
  const displayLines = contentLines.slice(-maxLines);

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
          {isShowingDiff ? 'Diff View' : 'Output'}
        </Text>
        {streaming && (
          <Text color="yellow" marginLeft={1}>
            ⏳ Streaming...
          </Text>
        )}
      </Box>

      {/* Content */}
      <Box flexDirection="column" paddingX={1} paddingY={1} flexGrow={1}>
        {displayLines.length === 0 ? (
          <Text color="gray" dimColor>
            No output to display
          </Text>
        ) : (
          displayLines.map((line, index) => {
            if (isShowingDiff) {
              return renderDiffLine(line, index);
            } else {
              return renderOutputLine(line, index);
            }
          })
        )}

        {/* Streaming indicator */}
        {streaming && (
          <Box marginTop={1}>
            <Text color="yellow" dimColor>
              ● Receiving output...
            </Text>
          </Box>
        )}
      </Box>

      {/* Footer with scroll info */}
      {contentLines.length > maxLines && (
        <Box 
          borderStyle="single" 
          borderBottom={false} 
          borderLeft={false} 
          borderRight={false}
          paddingX={1}
          justifyContent="center"
        >
          <Text color="gray" dimColor>
            Showing {displayLines.length} of {contentLines.length} lines
          </Text>
        </Box>
      )}
    </Box>
  );
};