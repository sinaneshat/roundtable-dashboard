/**
 * Round Number Utilities
 */

import type { UIMessage } from 'ai';

import { MessageRoles } from '@/api/core/enums';
import {
  calculateNextRound,
  DEFAULT_ROUND_NUMBER,
  NO_ROUND_SENTINEL,
} from '@/lib/schemas/round-schemas';

import { getRoundNumber } from './metadata';

export function calculateNextRoundNumber(messages: UIMessage[]): number {
  let maxRoundNumber = NO_ROUND_SENTINEL;

  messages.forEach((message) => {
    if (message.role === MessageRoles.USER) {
      const roundNumber = getRoundNumber(message.metadata) ?? NO_ROUND_SENTINEL;
      if (roundNumber > maxRoundNumber) {
        maxRoundNumber = roundNumber;
      }
    }
  });

  return calculateNextRound(maxRoundNumber);
}

export function getMaxRoundNumber(messages: UIMessage[]): number {
  let max = NO_ROUND_SENTINEL;

  messages.forEach((message) => {
    const roundNumber = getRoundNumber(message.metadata) ?? NO_ROUND_SENTINEL;
    if (roundNumber > max) {
      max = roundNumber;
    }
  });

  return max >= 0 ? max : DEFAULT_ROUND_NUMBER;
}

export function getRoundNumberFromMetadata(
  messageOrMetadata: UIMessage | unknown,
  defaultValue = DEFAULT_ROUND_NUMBER,
): number {
  if (
    messageOrMetadata
    && typeof messageOrMetadata === 'object'
    && 'metadata' in messageOrMetadata
    && messageOrMetadata.metadata !== null
    && typeof messageOrMetadata.metadata === 'object'
  ) {
    const roundNumber = getRoundNumber(messageOrMetadata.metadata);
    return roundNumber ?? defaultValue;
  }
  const roundNumber = getRoundNumber(messageOrMetadata);
  return roundNumber ?? defaultValue;
}

export function getCurrentRoundNumber(messages: readonly UIMessage[]): number {
  const lastUserMessage = messages.findLast(m => m.role === MessageRoles.USER);
  if (!lastUserMessage) {
    return DEFAULT_ROUND_NUMBER;
  }
  return getRoundNumberFromMetadata(lastUserMessage);
}

export function groupMessagesByRound(messages: UIMessage[]): Map<number, UIMessage[]> {
  const messageRounds = new Map<number, number>();
  const inferredMessages: Array<{ messageId: string; role: string; index: number; inferredRound: number }> = [];

  messages.forEach((message, index) => {
    const explicitRoundNumber = getRoundNumber(message.metadata);

    if (explicitRoundNumber !== undefined && explicitRoundNumber !== null) {
      messageRounds.set(index, explicitRoundNumber);
    } else {
      if (message.role === MessageRoles.USER) {
        let inferredRound = DEFAULT_ROUND_NUMBER;

        for (let i = index - 1; i >= 0; i--) {
          const prevMessage = messages[i];
          if (prevMessage && prevMessage.role === MessageRoles.USER) {
            const prevRound = messageRounds.get(i);
            if (prevRound !== undefined) {
              inferredRound = prevRound + 1;
              break;
            }
          }
        }

        messageRounds.set(index, inferredRound);
        inferredMessages.push({
          messageId: message.id,
          role: message.role,
          index,
          inferredRound,
        });
      } else {
        let inferredRound = DEFAULT_ROUND_NUMBER;

        for (let i = index - 1; i >= 0; i--) {
          const prevMessage = messages[i];
          if (prevMessage && prevMessage.role === MessageRoles.USER) {
            const userRound = messageRounds.get(i);
            if (userRound !== undefined) {
              inferredRound = userRound;
              break;
            }
          }
        }

        messageRounds.set(index, inferredRound);
        inferredMessages.push({
          messageId: message.id,
          role: message.role,
          index,
          inferredRound,
        });
      }
    }
  });

  const grouped = new Map<number, UIMessage[]>();
  messages.forEach((message, index) => {
    const roundNumber = messageRounds.get(index) ?? DEFAULT_ROUND_NUMBER;

    if (!grouped.has(roundNumber)) {
      grouped.set(roundNumber, []);
    }
    grouped.get(roundNumber)!.push(message);
  });

  const deduped = new Map<number, UIMessage[]>();
  const duplicatesFoundInRounds: Array<{ roundNumber: number; duplicateCount: number; duplicateIds: string[] }> = [];

  grouped.forEach((roundMessages, roundNumber) => {
    const seenMessageIds = new Set<string>();
    const uniqueMessages: UIMessage[] = [];
    const duplicateIds: string[] = [];

    roundMessages.forEach((message) => {
      if (!seenMessageIds.has(message.id)) {
        seenMessageIds.add(message.id);
        uniqueMessages.push(message);
      } else {
        duplicateIds.push(message.id);
      }
    });

    if (duplicateIds.length > 0) {
      duplicatesFoundInRounds.push({
        roundNumber,
        duplicateCount: duplicateIds.length,
        duplicateIds,
      });
    }

    deduped.set(roundNumber, uniqueMessages);
  });

  return deduped;
}

export function isLastRound(roundNumber: number, messages: UIMessage[]): boolean {
  return roundNumber === getMaxRoundNumber(messages);
}
