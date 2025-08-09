import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { DiffHunk, ParsedDiff } from '../../agent/hunk-selector.js';

interface DiffHunkViewProps {
  width: number;
  height: number;
  parsedDiff: ParsedDiff;
  onSelectionChange: (parsedDiff: ParsedDiff) => void;
  onComplete: () => void;
}

export const DiffHunkView: React.FC<DiffHunkViewProps> = ({
  width,
  height,
  parsedDiff,
  onSelectionChange,
  onComplete,
}) => {
  const [currentHunkIndex, setCurrentHunkIndex] = useState(0);
  
  // Flatten all hunks for easier navigation
  const allHunks: DiffHunk[] = [];
  for (const file of parsedDiff.files) {
    allHunks.push(...file.hunks);
  }
  
  const currentHunk = allHunks[currentHunkIndex];
  
  // Handle keyboard input
  useInput(useCallback((input, key) => {
    if (key.escape) {
      onComplete();
      return;
    }
    
    if (input === 's' || key.space) {
      // Toggle selection
      if (currentHunk) {
        currentHunk.selected = !currentHunk.selected;
        onSelectionChange(parsedDiff);
      }
    } else if (key.rightArrow || input === 'n') {
      // Next hunk
      if (currentHunkIndex < allHunks.length - 1) {
        setCurrentHunkIndex(currentHunkIndex + 1);
      }
    } else if (key.leftArrow || input === 'p') {
      // Previous hunk
      if (currentHunkIndex > 0) {
        setCurrentHunkIndex(currentHunkIndex - 1);
      }
    } else if (input === 'a') {
      // Toggle all hunks
      const allSelected = allHunks.every(h => h.selected);
      allHunks.forEach(h => h.selected = !allSelected);
      onSelectionChange(parsedDiff);
    } else if (input === 'q' || key.return) {
      onComplete();
    }
  }, [currentHunkIndex, currentHunk, allHunks, parsedDiff, onSelectionChange, onComplete]));
  
  if (!currentHunk) {
    return (
      <Box 
        width={width} 
        height={height} 
        borderStyle="single"
        borderColor="gray"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
      >
        <Text color="gray">No hunks to review</Text>
        <Text color="dim">Press ESC to continue</Text>
      </Box>
    );
  }
  
  // Parse hunk content for display
  const hunkLines = currentHunk.content.split('\n').filter(line => line.trim());
  const displayLines = hunkLines.slice(0, height - 8); // Reserve space for header/footer
  
  const selectedCount = allHunks.filter(h => h.selected).length;
  const statusColor = currentHunk.selected ? 'green' : 'red';
  const statusIcon = currentHunk.selected ? '✓' : '✗';
  const statusText = currentHunk.selected ? 'SELECTED' : 'SKIPPED';
  
  return (
    <Box 
      width={width} 
      height={height} 
      borderStyle="single"
      borderColor="blue"
      flexDirection="column"
    >
      {/* Header */}
      <Box 
        paddingX={1} 
        borderStyle="single" 
        borderTop={false} 
        borderLeft={false} 
        borderRight={false}
        justifyContent="space-between"
      >
        <Text color="blue" bold>
          🔍 Hunk Review
        </Text>
        <Text color="gray">
          {currentHunkIndex + 1} / {allHunks.length}
        </Text>
      </Box>
      
      {/* File and status info */}
      <Box paddingX={1} paddingY={1}>
        <Box flexDirection="column" width="100%">
          <Box>
            <Text color="cyan">File: </Text>
            <Text color="white">{currentHunk.filePath}</Text>
          </Box>
          <Box marginTop={1}>
            <Text color="gray">Status: </Text>
            <Text color={statusColor}>{statusIcon} {statusText}</Text>
            <Text color="gray" marginLeft={2}>
              ({selectedCount} selected)
            </Text>
          </Box>
        </Box>
      </Box>
      
      {/* Hunk content */}
      <Box paddingX={1} flexGrow={1} flexDirection="column">
        {displayLines.map((line, index) => {
          let color = 'white';
          
          if (line.startsWith('@@')) {
            color = 'cyan';
          } else if (line.startsWith('+')) {
            color = 'green';
          } else if (line.startsWith('-')) {
            color = 'red';
          } else if (line.startsWith(' ') || line.startsWith('index') || line.startsWith('---') || line.startsWith('+++')) {
            color = 'gray';
          }
          
          return (
            <Text key={index} color={color}>
              {line}
            </Text>
          );
        })}
        
        {hunkLines.length > displayLines.length && (
          <Text color="gray" dimColor>
            ... ({hunkLines.length - displayLines.length} more lines)
          </Text>
        )}
      </Box>
      
      {/* Controls */}
      <Box 
        paddingX={1} 
        paddingY={1}
        borderStyle="single" 
        borderBottom={false} 
        borderLeft={false} 
        borderRight={false}
        justifyContent="center"
      >
        <Text color="gray" dimColor>
          SPACE: Toggle • ←→: Navigate • A: All • Q: Apply • ESC: Cancel
        </Text>
      </Box>
    </Box>
  );
};