import { describe, it, expect, beforeEach } from 'vitest';
import {
  TAC,
  TACConfig,
  SMSChannel,
  ChannelMessage,
} from '../src/index';

describe('Diagnostic: Callback Wiring', () => {
  let tac: TAC;
  let smsChannel: SMSChannel;

  const testConversationId = 'conv_conversation_01kdiagnostictest123456789';
  const testProfileId = 'mem_profile_01kdiagnostictest123456789';

  beforeEach(() => {
    const config = new TACConfig({
      twilioAccountSid: 'ACtest123',
      twilioAuthToken: 'test_token',
      twilioApiKey: 'SKtest123',
      twilioApiToken: 'test_api_token',
      twilioPhoneNumber: '+15551234567',
      tacMode: 'conversation',
      conversationServiceId: 'conv_configuration_01kdiagtest123456789012345',
    });

    tac = new TAC({ config });

    const channelDeps = tac.getChannelDeps();
    smsChannel = new SMSChannel(channelDeps);

    tac.registerChannel(smsChannel);
  });

  it('should emit message through TAC callback - with delay', async () => {
    const messages: ChannelMessage[] = [];
    let callbackInvoked = false;

    tac.onMessageReady((msg) => {
      console.log('[TEST] Callback invoked! Message:', msg.message);
      callbackInvoked = true;
      messages.push(msg);
    });

    console.log('[TEST] Registering callback complete');
    console.log('[TEST] Processing CONVERSATION_CREATED');

    await smsChannel.processWebhook({
      eventType: 'CONVERSATION_CREATED',
      data: {
        conversationId: testConversationId,
        profileId: testProfileId,
      },
    });

    console.log('[TEST] CONVERSATION_CREATED complete');
    console.log('[TEST] Processing COMMUNICATION_CREATED');

    await smsChannel.processWebhook({
      eventType: 'COMMUNICATION_CREATED',
      data: {
        conversationId: testConversationId,
        author: { address: '+15559876543', channel: 'SMS' },
        content: { type: 'TEXT', text: 'Test message' },
      },
    });

    console.log('[TEST] COMMUNICATION_CREATED complete');
    console.log('[TEST] Callback invoked?', callbackInvoked);
    console.log('[TEST] Messages length:', messages.length);

    // Add small delay to let event loop process
    await new Promise(resolve => setTimeout(resolve, 50));

    console.log('[TEST] After delay - Callback invoked?', callbackInvoked);
    console.log('[TEST] After delay - Messages length:', messages.length);

    expect(callbackInvoked).toBe(true);
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toBe('Test message');
  });

  it('should emit message through direct channel.on()', async () => {
    const messages: ChannelMessage[] = [];

    // Direct channel registration (like passing tests do)
    smsChannel.on('message', (msg: ChannelMessage) => {
      console.log('[DIRECT] Callback invoked! Message:', msg.message);
      messages.push(msg);
    });

    await smsChannel.processWebhook({
      eventType: 'CONVERSATION_CREATED',
      data: {
        conversationId: testConversationId,
        profileId: testProfileId,
      },
    });

    await smsChannel.processWebhook({
      eventType: 'COMMUNICATION_CREATED',
      data: {
        conversationId: testConversationId,
        author: { address: '+15559876543', channel: 'SMS' },
        content: { type: 'TEXT', text: 'Test message' },
      },
    });

    // Same delay
    await new Promise(resolve => setTimeout(resolve, 50));

    console.log('[DIRECT] Messages length:', messages.length);

    expect(messages).toHaveLength(1);
    expect(messages[0].message).toBe('Test message');
  });
});
