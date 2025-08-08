import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { UIMode } from '../types.js';
import { getBudgetStatus, BudgetStatus } from '../../util/costs.js';

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
  const [budgetStatus, setBudgetStatus] = useState<BudgetStatus | null>(null);
  
  // Load budget status
  useEffect(() => {
    const loadBudget = async () => {
      try {
        const budget = await getBudgetStatus();
        setBudgetStatus(budget);
      } catch (error) {
        // Ignore budget loading errors
      }
    };
    
    loadBudget();
    
    // Refresh budget status every 30 seconds
    const interval = setInterval(loadBudget, 30000);
    return () => clearInterval(interval);
  }, []);
  
  const modeColor = mode === 'easy' ? 'green' : 'blue';
  const statusColor = status.includes('Error') || status.includes('Failed') ? 'red' :
                     status.includes('Running') || status.includes('Processing') ? 'yellow' : 'green';
  
  // Budget status formatting
  const getBudgetDisplay = () => {
    if (!budgetStatus) return null;
    
    let budgetColor: string;
    let budgetIcon: string;
    
    if (budgetStatus.isOverBudget) {
      budgetColor = 'red';
      budgetIcon = '🚨';
    } else if (budgetStatus.percentage >= 90) {
      budgetColor = 'yellow';
      budgetIcon = '⚠️';
    } else if (budgetStatus.percentage >= 75) {
      budgetColor = 'yellow';
      budgetIcon = '💛';
    } else {
      budgetColor = 'green';
      budgetIcon = '💚';
    }
    
    return {
      icon: budgetIcon,
      text: `$${budgetStatus.currentSpent.toFixed(2)}/${budgetStatus.monthlyBudget}`,
      color: budgetColor,
      percentage: budgetStatus.percentage
    };
  };
  
  const budgetDisplay = getBudgetDisplay();

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

        {/* Right side: Budget, Branch and Project */}
        <Box>
          {budgetDisplay && (
            <>
              <Text color={budgetDisplay.color}>
                {budgetDisplay.icon} {budgetDisplay.text}
              </Text>
              <Text color="gray"> • </Text>
            </>
          )}
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