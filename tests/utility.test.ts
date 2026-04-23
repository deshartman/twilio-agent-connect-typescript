import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLogger, ConversationId, ProfileId } from '@twilio/tac-core';
import {
  ConversationSessionStore,
  ConversationsWebhookProcessor,
  extractConversationId,
  extractProfileId,
} from '../packages/core/src/channels/utility';

const silentLogger = createLogger({ level: 'silent' });

// ULID-shaped IDs: prefix + 26 chars where first is [0-7] and rest are [0-9a-z].
const CONVERSATION_ID = 'conv_conversation_01testutilaabbccddeeffgghh' as ConversationId;
const PROFILE_ID = 'mem_profile_01testprofileaabbccddeeffg' as ProfileId;

describe('ConversationSessionStore', () => {
  let store: ConversationSessionStore;
  let onStarted: ReturnType<typeof vi.fn>;
  let onEnded: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onStarted = vi.fn();
    onEnded = vi.fn();
    store = new ConversationSessionStore({
      logger: silentLogger,
      channelType: 'sms',
      callbacks: {
        onConversationStarted: onStarted,
        onConversationEnded: onEnded,
      },
    });
  });

  it('starts a new session and fires onConversationStarted', () => {
    const session = store.start(CONVERSATION_ID, PROFILE_ID, 'svc_test');

    expect(session.conversationId).toBe(CONVERSATION_ID);
    expect(session.profileId).toBe(PROFILE_ID);
    expect(session.serviceId).toBe('svc_test');
    expect(session.channel).toBe('sms');
    expect(store.isActive(CONVERSATION_ID)).toBe(true);
    expect(onStarted).toHaveBeenCalledOnce();
  });

  it('returns the existing session when start is called twice', () => {
    const first = store.start(CONVERSATION_ID);
    const second = store.start(CONVERSATION_ID, PROFILE_ID);

    expect(second).toBe(first);
    expect(onStarted).toHaveBeenCalledOnce();
  });

  it('end fires onConversationEnded before removing the session', async () => {
    store.start(CONVERSATION_ID);

    let sawSession = false;
    onEnded.mockImplementation(() => {
      sawSession = store.isActive(CONVERSATION_ID);
    });

    await store.end(CONVERSATION_ID);

    expect(sawSession).toBe(true);
    expect(store.isActive(CONVERSATION_ID)).toBe(false);
    expect(onEnded).toHaveBeenCalledOnce();
  });

  it('end is a no-op when session does not exist', async () => {
    await store.end(CONVERSATION_ID);
    expect(onEnded).not.toHaveBeenCalled();
  });

  it('swallows errors in onConversationEnded and still cleans up the session', async () => {
    store.start(CONVERSATION_ID);
    onEnded.mockRejectedValue(new Error('callback boom'));

    await expect(store.end(CONVERSATION_ID)).resolves.toBeUndefined();
    expect(store.isActive(CONVERSATION_ID)).toBe(false);
  });

  it('clear removes all sessions', () => {
    store.start(CONVERSATION_ID);
    store.clear();
    expect(store.isActive(CONVERSATION_ID)).toBe(false);
  });
});

describe('ConversationsWebhookProcessor', () => {
  let processor: ConversationsWebhookProcessor;

  beforeEach(() => {
    processor = new ConversationsWebhookProcessor({ logger: silentLogger });
  });

  it('rejects invalid dedupCapacity', () => {
    expect(
      () => new ConversationsWebhookProcessor({ logger: silentLogger }, { dedupCapacity: 0 })
    ).toThrow(/positive integer/);
    expect(
      () => new ConversationsWebhookProcessor({ logger: silentLogger }, { dedupCapacity: 1.5 })
    ).toThrow(/positive integer/);
  });

  it('routes CONVERSATION_CREATED to the handler', async () => {
    const onConversationCreated = vi.fn();
    await processor.process(
      {
        eventType: 'CONVERSATION_CREATED',
        data: { conversationId: CONVERSATION_ID, profileId: PROFILE_ID },
      },
      { channelType: 'sms', onConversationCreated }
    );

    expect(onConversationCreated).toHaveBeenCalledOnce();
  });

  it('routes COMMUNICATION_CREATED only when author.channel matches', async () => {
    const onCommunicationCreated = vi.fn();

    await processor.process(
      {
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: CONVERSATION_ID,
          author: { channel: 'SMS', address: '+15551234567' },
          content: { type: 'TEXT', text: 'hi' },
        },
      },
      { channelType: 'sms', onCommunicationCreated }
    );
    expect(onCommunicationCreated).toHaveBeenCalledOnce();

    await processor.process(
      {
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: CONVERSATION_ID,
          author: { channel: 'CHAT', address: 'ai-assistant' },
        },
      },
      { channelType: 'sms', onCommunicationCreated }
    );
    expect(onCommunicationCreated).toHaveBeenCalledOnce(); // Not called again
  });

  it('drops COMMUNICATION_CREATED when author.channel is missing', async () => {
    const onCommunicationCreated = vi.fn();
    await processor.process(
      {
        eventType: 'COMMUNICATION_CREATED',
        data: {
          conversationId: CONVERSATION_ID,
          author: { address: '+15551234567' }, // no channel
        },
      },
      { channelType: 'sms', onCommunicationCreated }
    );

    expect(onCommunicationCreated).not.toHaveBeenCalled();
  });

  it('skips CONVERSATION_UPDATED when isConversationActive returns false', async () => {
    const onConversationUpdated = vi.fn();
    await processor.process(
      {
        eventType: 'CONVERSATION_UPDATED',
        data: { conversationId: CONVERSATION_ID, status: 'CLOSED' },
      },
      {
        channelType: 'sms',
        isConversationActive: () => false,
        onConversationUpdated,
      }
    );

    expect(onConversationUpdated).not.toHaveBeenCalled();
  });

  it('deduplicates by idempotency token', async () => {
    const onConversationCreated = vi.fn();
    const payload = {
      eventType: 'CONVERSATION_CREATED',
      data: { conversationId: CONVERSATION_ID },
    };

    await processor.process(payload, { channelType: 'sms', onConversationCreated }, 'tok-1');
    await processor.process(payload, { channelType: 'sms', onConversationCreated }, 'tok-1');
    await processor.process(payload, { channelType: 'sms', onConversationCreated }, 'tok-2');

    expect(onConversationCreated).toHaveBeenCalledTimes(2);
  });

  it('releases the token when the handler throws so retries are not blocked', async () => {
    let calls = 0;
    const onConversationCreated = vi.fn(() => {
      calls += 1;
      if (calls === 1) throw new Error('transient');
    });

    const payload = {
      eventType: 'CONVERSATION_CREATED',
      data: { conversationId: CONVERSATION_ID },
    };

    await processor.process(
      payload,
      { channelType: 'sms', onConversationCreated, onError: () => {} },
      'tok-retry'
    );
    await processor.process(
      payload,
      { channelType: 'sms', onConversationCreated, onError: () => {} },
      'tok-retry'
    );

    expect(onConversationCreated).toHaveBeenCalledTimes(2);
  });

  it('calls onError when the handler throws', async () => {
    const onError = vi.fn();
    const onConversationCreated = vi.fn(() => {
      throw new Error('boom');
    });

    await processor.process(
      {
        eventType: 'CONVERSATION_CREATED',
        data: { conversationId: CONVERSATION_ID },
      },
      { channelType: 'sms', onConversationCreated, onError }
    );

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it('rejects null / non-object payloads via onError', async () => {
    const onError = vi.fn();
    await processor.process(null, { channelType: 'sms', onError });
    await processor.process(
      { eventType: '' } as unknown,
      { channelType: 'sms', onError }
    );

    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('evicts oldest token when capacity is reached', async () => {
    const tinyProcessor = new ConversationsWebhookProcessor(
      { logger: silentLogger },
      { dedupCapacity: 2 }
    );
    const onConversationCreated = vi.fn();
    const payload = {
      eventType: 'CONVERSATION_CREATED',
      data: { conversationId: CONVERSATION_ID },
    };

    await tinyProcessor.process(payload, { channelType: 'sms', onConversationCreated }, 'a');
    await tinyProcessor.process(payload, { channelType: 'sms', onConversationCreated }, 'b');
    // capacity reached; 'c' evicts 'a'
    await tinyProcessor.process(payload, { channelType: 'sms', onConversationCreated }, 'c');
    // 'a' is no longer tracked — replaying it fires the handler again
    await tinyProcessor.process(payload, { channelType: 'sms', onConversationCreated }, 'a');

    expect(onConversationCreated).toHaveBeenCalledTimes(4);
  });
});

describe('extractConversationId', () => {
  it('returns a valid conversation id', () => {
    const got = extractConversationId(
      { data: { conversationId: CONVERSATION_ID } },
      silentLogger
    );
    expect(got).toBe(CONVERSATION_ID);
  });

  it('falls back to data.id when conversationId is missing', () => {
    const got = extractConversationId({ data: { id: CONVERSATION_ID } }, silentLogger);
    expect(got).toBe(CONVERSATION_ID);
  });

  it('returns null for invalid format', () => {
    const got = extractConversationId({ data: { conversationId: 'not_valid' } }, silentLogger);
    expect(got).toBeNull();
  });

  it('returns null when no id is present', () => {
    const got = extractConversationId({ data: {} }, silentLogger);
    expect(got).toBeNull();
  });
});

describe('extractProfileId', () => {
  it('returns a valid profile id', () => {
    const got = extractProfileId({ data: { profileId: PROFILE_ID } }, silentLogger);
    expect(got).toBe(PROFILE_ID);
  });

  it('returns null for invalid format', () => {
    const got = extractProfileId({ data: { profileId: 'not_valid' } }, silentLogger);
    expect(got).toBeNull();
  });

  it('returns null when missing', () => {
    const got = extractProfileId({ data: {} }, silentLogger);
    expect(got).toBeNull();
  });
});
