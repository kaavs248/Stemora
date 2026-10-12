import { SampleStatus } from '@prisma/client';

// Define valid status transitions map
const VALID_TRANSITIONS: Record<SampleStatus, SampleStatus[]> = {
  COLLECTED: ['PROCESSING', 'QUARANTINED', 'DESTROYED'],
  PROCESSING: ['TESTING', 'QUARANTINED', 'DESTROYED'],
  TESTING: ['STORED', 'QUARANTINED', 'DESTROYED'],
  STORED: ['TRANSFERRED', 'RELEASED', 'DESTROYED', 'QUARANTINED'],
  TRANSFERRED: ['RELEASED', 'DESTROYED', 'QUARANTINED'],
  RELEASED: ['DESTROYED'],
  QUARANTINED: ['DESTROYED', 'STORED'], // Can be restored or destroyed
  DESTROYED: [], // Terminal state
};

export const isValidTransition = (current: SampleStatus, next: SampleStatus): boolean => {
  if (!Object.prototype.hasOwnProperty.call(VALID_TRANSITIONS, current)) {
    return false;
  }
  const allowedNextStates = VALID_TRANSITIONS[current];
  return allowedNextStates ? allowedNextStates.includes(next) : false;
};
