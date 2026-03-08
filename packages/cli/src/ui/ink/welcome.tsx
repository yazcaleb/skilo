import React, { useEffect } from 'react';
import { Box, Text, render, useApp } from 'ink';

function WelcomeScreen() {
  const { exit } = useApp();

  useEffect(() => {
    const timer = setTimeout(() => {
      exit();
    }, 16);

    return () => {
      clearTimeout(timer);
    };
  }, [exit]);

  return (
    <Box flexDirection="column">
      <Text bold color="cyanBright">
        Skilo
      </Text>
      <Text bold>Share agent skills with a link. No repo required.</Text>
      <Box marginTop={1} borderStyle="round" borderColor="cyan" paddingX={1} paddingY={0} flexDirection="column">
        <Text bold color="white">
          Start
        </Text>
        <Text color="gray">Share, add, pack, or sync in one line.</Text>
        <Box marginTop={1} flexDirection="column">
          <Text color="green">skilo share ./my-skill</Text>
          <Text color="green">skilo add https://skilo.xyz/s/abc123</Text>
          <Text color="green">skilo pack ./reviewer namespace/design-system</Text>
          <Text color="green">skilo sync claude opencode</Text>
        </Box>
      </Box>
      <Box marginTop={1} borderStyle="round" borderColor="gray" paddingX={1} paddingY={0} flexDirection="column">
        <Text bold color="white">
          Inputs
        </Text>
        <Text color="gray">links, packs, refs, repos, bundles, local tools</Text>
        <Box marginTop={1} flexDirection="column">
          <Text bold color="white">
            Agent entrypoints
          </Text>
          <Text color="gray">skilo --json</Text>
          <Text color="gray">https://skilo.xyz</Text>
          <Text color="gray">https://skilo.xyz/llms.txt</Text>
        </Box>
      </Box>
    </Box>
  );
}

export async function renderWelcomeScreen(): Promise<void> {
  const app = render(<WelcomeScreen />, {
    patchConsole: false,
    exitOnCtrlC: true,
  });

  await app.waitUntilExit();
}
