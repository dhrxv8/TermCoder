import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { UIMode } from '../types.js';

interface PromptInputProps {
  height: number;
  active: boolean;
  mode: UIMode;
  onSubmit: (task: string) => void;
}

export const PromptInput: React.FC<PromptInputProps> = ({
  height,
  active,
  mode,
  onSubmit,
}) => {
  const [input, setInput] = useState('');
  const borderColor = active ? 'blue' : 'gray';

  const handleSubmit = (value: string) => {
    if (value.trim()) {
      onSubmit(value.trim());
      setInput('');
    }
  };

  // Example prompts based on mode
  const easyModePrompts = [
    'Add a new feature',
    'Fix the bug in login',
    'Refactor the API code',
    'Add unit tests',
    'Update documentation',
  ];

  const proModePrompts = [
    'Implement OAuth2 authentication with JWT tokens',
    'Add Redis caching layer with fallback to database',
    'Create comprehensive test suite with 90% coverage',
    'Set up CI/CD pipeline with automated deployments',
    'Optimize database queries and add proper indexing',
  ];

  const placeholderPrompts = mode === 'easy' ? easyModePrompts : proModePrompts;
  const randomPrompt = placeholderPrompts[Math.floor(Math.random() * placeholderPrompts.length)];

  return (
    <Box 
      height={height} 
      borderStyle="single" 
      borderColor={borderColor}
      flexDirection="column"
    >
      {/* Header */}
      <Box paddingX={1} borderStyle="single" borderTop={false} borderLeft={false} borderRight={false}>
        <Text color="cyan" bold>
          Prompt
        </Text>
        <Text color="gray" marginLeft={1}>
          ({mode} mode)
        </Text>
      </Box>

      {/* Input Area */}
      <Box paddingX={1} paddingY={1} flexGrow={1} alignItems="center">
        <Text color="green" marginRight={1}>
          ▶
        </Text>
        {active ? (
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            placeholder={randomPrompt}
            focus={active}
          />
        ) : (
          <Text color="gray" dimColor>
            {input || randomPrompt}
          </Text>
        )}
      </Box>
    </Box>
  );
};