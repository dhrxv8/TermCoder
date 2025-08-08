import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { CommandPaletteItem } from '../types.js';

interface CommandPaletteProps {
  onClose: () => void;
  onExecute: (command: string) => void;
  providers: string[];
  currentProvider: string;
  currentModel: string;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  onClose,
  onExecute,
  providers,
  currentProvider,
  currentModel,
}) => {
  const [filter, setFilter] = useState('');

  // Build command palette items
  const commands: CommandPaletteItem[] = [
    // Provider switching
    ...providers.map(provider => ({
      id: `provider-${provider}`,
      title: `Switch to ${provider}`,
      description: `Change provider to ${provider}`,
      category: 'provider' as const,
      action: () => onExecute(`/provider ${provider}`),
    })),

    // Common models for each provider
    {
      id: 'model-gpt4o',
      title: 'GPT-4o',
      description: 'OpenAI\'s flagship model',
      category: 'model' as const,
      action: () => onExecute('/model gpt-4o'),
    },
    {
      id: 'model-claude-sonnet',
      title: 'Claude 3.5 Sonnet',
      description: 'Anthropic\'s flagship model',
      category: 'model' as const,
      action: () => onExecute('/model claude-3-5-sonnet-20241022'),
    },
    {
      id: 'model-grok',
      title: 'Grok Beta',
      description: 'xAI\'s conversational model',
      category: 'model' as const,
      action: () => onExecute('/model grok-beta'),
    },

    // Actions
    {
      id: 'action-test',
      title: 'Run Tests',
      description: 'Execute project test suite',
      category: 'test' as const,
      action: () => onExecute('test'),
    },
    {
      id: 'action-lint',
      title: 'Run Linter',
      description: 'Check code style and quality',
      category: 'test' as const,
      action: () => onExecute('lint'),
    },
    {
      id: 'action-build',
      title: 'Run Build',
      description: 'Compile and build project',
      category: 'test' as const,
      action: () => onExecute('build'),
    },

    // Git actions
    {
      id: 'git-rollback',
      title: 'Rollback Changes',
      description: 'Discard all changes and return to main',
      category: 'git' as const,
      action: () => onExecute('rollback'),
    },
    {
      id: 'git-merge',
      title: 'Merge to Main',
      description: 'Merge current branch to main',
      category: 'git' as const,
      action: () => onExecute('merge'),
    },

    // Information commands
    {
      id: 'action-whoami',
      title: 'Session Info',
      description: 'Show current session details',
      category: 'action' as const,
      action: () => onExecute('/whoami'),
    },
    {
      id: 'action-health',
      title: 'Health Check',
      description: 'Check provider connectivity',
      category: 'action' as const,
      action: () => onExecute('/health'),
    },
    {
      id: 'action-budget',
      title: 'Budget Status',
      description: 'Show usage and costs',
      category: 'action' as const,
      action: () => onExecute('/budget'),
    },
  ];

  // Filter commands based on search
  const filteredCommands = commands.filter(cmd => 
    cmd.title.toLowerCase().includes(filter.toLowerCase()) ||
    cmd.description.toLowerCase().includes(filter.toLowerCase())
  );

  // Group by category
  const groupedCommands = filteredCommands.reduce((groups, cmd) => {
    if (!groups[cmd.category]) {
      groups[cmd.category] = [];
    }
    groups[cmd.category].push(cmd);
    return groups;
  }, {} as Record<string, CommandPaletteItem[]>);

  // Convert to SelectInput format
  const selectItems = Object.entries(groupedCommands).flatMap(([category, items]) => [
    // Category header
    {
      label: `── ${category.toUpperCase()} ──`,
      value: `header-${category}`,
      disabled: true,
    },
    // Category items
    ...items.map(item => ({
      label: `${item.title}`,
      value: item.id,
    })),
  ]);

  const handleSelect = (item: any) => {
    if (item.value.startsWith('header-')) {
      return; // Ignore category headers
    }
    
    const command = commands.find(cmd => cmd.id === item.value);
    if (command) {
      command.action();
    }
    onClose();
  };

  // Handle escape key to close
  useEffect(() => {
    const handleKeyPress = (str: string, key: any) => {
      if (key.escape) {
        onClose();
      }
    };

    process.stdin.on('keypress', handleKeyPress);
    return () => {
      process.stdin.off('keypress', handleKeyPress);
    };
  }, [onClose]);

  return (
    <Box
      position="absolute"
      top={2}
      left={2}
      right={2}
      bottom={2}
      borderStyle="double"
      borderColor="blue"
      backgroundColor="black"
      flexDirection="column"
    >
      {/* Header */}
      <Box paddingX={2} paddingY={1} borderStyle="single" borderTop={false} borderLeft={false} borderRight={false}>
        <Text color="blue" bold>
          ⚡ Command Palette
        </Text>
        <Box marginLeft="auto">
          <Text color="gray" dimColor>
            ESC to close
          </Text>
        </Box>
      </Box>

      {/* Current context */}
      <Box paddingX={2} paddingBottom={1}>
        <Text color="gray">
          Provider: <Text color="cyan">{currentProvider}</Text> • 
          Model: <Text color="white">{currentModel}</Text>
        </Text>
      </Box>

      {/* Command list */}
      <Box paddingX={2} paddingY={1} flexGrow={1}>
        {selectItems.length === 0 ? (
          <Text color="gray" dimColor>
            No commands found
          </Text>
        ) : (
          <SelectInput
            items={selectItems}
            onSelect={handleSelect}
            indicatorComponent={({ isSelected }) => (
              <Box marginRight={1}>
                <Text color={isSelected ? 'blue' : 'gray'}>
                  {isSelected ? '▶' : ' '}
                </Text>
              </Box>
            )}
            itemComponent={({ isSelected, label }) => (
              <Text color={isSelected ? 'blue' : 'white'}>
                {label}
              </Text>
            )}
          />
        )}
      </Box>

      {/* Footer help */}
      <Box 
        paddingX={2} 
        paddingY={1} 
        borderStyle="single" 
        borderBottom={false} 
        borderLeft={false} 
        borderRight={false}
        justifyContent="center"
      >
        <Text color="gray" dimColor>
          ↑↓ Navigate • Enter: Execute • ESC: Cancel
        </Text>
      </Box>
    </Box>
  );
};