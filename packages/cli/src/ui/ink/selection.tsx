import React, { useMemo, useState } from 'react';
import { Box, Newline, Text, render, useApp, useInput } from 'ink';
import type { PickerItem, PickerResult } from '../../utils/picker.js';

interface SelectionPromptOptions<T> {
  title: string;
  subtitle?: string;
  items: PickerItem<T>[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getVisibleWindow(length: number, activeIndex: number, maxItems: number): [number, number] {
  if (length <= maxItems) {
    return [0, length];
  }

  const half = Math.floor(maxItems / 2);
  const start = clamp(activeIndex - half, 0, length - maxItems);
  return [start, start + maxItems];
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function SelectionPrompt<T>({
  options,
  onDone,
}: {
  options: SelectionPromptOptions<T>;
  onDone: (result: PickerResult<T>) => void;
}) {
  const { exit } = useApp();
  const [activeIndex, setActiveIndex] = useState(0);
  const [selected, setSelected] = useState<boolean[]>(() => options.items.map(() => true));
  const terminalWidth = process.stdout.columns || 100;
  const terminalHeight = process.stdout.rows || 28;
  const listWidth = Math.min(52, Math.max(34, Math.floor(terminalWidth * 0.48)));
  const detailWidth = Math.max(28, terminalWidth - listWidth - 7);
  const maxVisibleItems = Math.max(4, terminalHeight - 12);

  const activeItem = options.items[activeIndex];
  const selectedCount = useMemo(() => selected.filter(Boolean).length, [selected]);
  const [start, end] = getVisibleWindow(options.items.length, activeIndex, maxVisibleItems);
  const visibleItems = options.items.slice(start, end);

  const finish = (result: PickerResult<T>) => {
    onDone(result);
    exit();
  };

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      finish({ selected: [], cancelled: true });
      return;
    }

    if (key.return) {
      finish({
        selected: options.items.filter((_, index) => selected[index]).map((item) => item.value),
        cancelled: false,
      });
      return;
    }

    if (key.upArrow || input === 'k') {
      setActiveIndex((current) => clamp(current - 1, 0, options.items.length - 1));
      return;
    }

    if (key.downArrow || input === 'j') {
      setActiveIndex((current) => clamp(current + 1, 0, options.items.length - 1));
      return;
    }

    if (input === 'g') {
      setActiveIndex(0);
      return;
    }

    if (input === 'G') {
      setActiveIndex(options.items.length - 1);
      return;
    }

    if (input === ' ') {
      setSelected((current) => current.map((value, index) => (index === activeIndex ? !value : value)));
      return;
    }

    if (input === 'a') {
      setSelected(options.items.map(() => true));
      return;
    }

    if (input === 'n') {
      setSelected(options.items.map(() => false));
      return;
    }

    if (/^[1-9]$/.test(input)) {
      const index = Number.parseInt(input, 10) - 1;
      if (index < options.items.length) {
        setActiveIndex(index);
        setSelected((current) => current.map((value, itemIndex) => (itemIndex === index ? !value : value)));
      }
      return;
    }

    if (input === '0') {
      const index = 9;
      if (index < options.items.length) {
        setActiveIndex(index);
        setSelected((current) => current.map((value, itemIndex) => (itemIndex === index ? !value : value)));
      }
    }
  });

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyanBright">
          Skilo
        </Text>
        <Text bold>{options.title}</Text>
        {options.subtitle ? <Text color="gray">{options.subtitle}</Text> : null}
        <Text color="green">
          {selectedCount} of {options.items.length} selected
        </Text>
      </Box>

      <Box gap={1}>
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="cyan"
          paddingX={1}
          paddingY={0}
          width={listWidth}
          minHeight={maxVisibleItems + 4}
        >
          <Text bold color="white">
            Selection
          </Text>
          <Text color="gray">Use arrows or j/k. Space toggles. Enter confirms.</Text>
          <Box flexDirection="column" marginTop={1}>
            {visibleItems.map((item, visibleIndex) => {
              const index = start + visibleIndex;
              const isActive = index === activeIndex;
              const isSelected = selected[index];
              const marker = isSelected ? '[x]' : '[ ]';
              const rowColor = isActive ? 'cyanBright' : 'white';
              const prefix = isActive ? '>' : ' ';
              const label = truncate(item.name, Math.max(12, listWidth - 12));

              return (
                <Box key={`${item.name}-${index}`} flexDirection="column" marginBottom={item.description ? 1 : 0}>
                  <Text color={rowColor} inverse={isActive}>
                    {prefix} {marker} {String(index + 1).padStart(2, ' ')}. {label}
                    {item.meta ? <Text color={isActive ? 'black' : 'gray'}>{` (${item.meta})`}</Text> : null}
                  </Text>
                  {item.description ? (
                    <Text color={isActive ? 'cyan' : 'gray'}>
                      {truncate(item.description, Math.max(18, listWidth - 6))}
                    </Text>
                  ) : null}
                </Box>
              );
            })}
          </Box>
          {end < options.items.length ? (
            <Text color="gray">More below…</Text>
          ) : null}
        </Box>

        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="gray"
          paddingX={1}
          paddingY={0}
          width={detailWidth}
          minHeight={maxVisibleItems + 4}
        >
          <Text bold color="white">
            Details
          </Text>
          <Text color="cyanBright">{activeItem?.name || 'Nothing selected'}</Text>
          {activeItem?.meta ? <Text color="gray">{activeItem.meta}</Text> : null}
          <Box marginTop={1} flexDirection="column">
            <Text color="white">{activeItem?.description || 'Move through the list to inspect each item before confirming.'}</Text>
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text color="gray">Shortcuts</Text>
            <Text color="gray">
              up/down or j/k: move
              <Newline />
              space: toggle current
              <Newline />
              a: select all
              <Newline />
              n: select none
              <Newline />
              1-9,0: quick toggle
              <Newline />
              enter: confirm
              <Newline />
              q or esc: cancel
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export async function runSelectionPrompt<T>(
  options: SelectionPromptOptions<T>
): Promise<PickerResult<T>> {
  return new Promise((resolve) => {
    const app = render(
      <SelectionPrompt
        options={options}
        onDone={(result) => {
          resolve(result);
        }}
      />,
      {
        exitOnCtrlC: true,
        patchConsole: false,
      }
    );

    app.waitUntilExit().catch(() => {
      resolve({ selected: [], cancelled: true });
    });
  });
}
