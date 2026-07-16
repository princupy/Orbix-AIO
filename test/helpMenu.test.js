const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCommands } = require('../src/handlers/commandLoader');

const OWNER_ID = '123456789012345678';

function createClient() {
  const client = {
    user: {
      username: 'Orbix',
      displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png',
    },
  };

  loadCommands(client);
  return client;
}

function createInteraction(customId, values = []) {
  const events = [];

  return {
    customId,
    deferred: false,
    events,
    guildId: null,
    replied: false,
    user: { id: OWNER_ID },
    values,
    async deferUpdate() {
      events.push('defer');
      this.deferred = true;
    },
    async editReply(payload) {
      events.push('edit');
      this.payload = payload;
      return payload;
    },
    async followUp(payload) {
      events.push('followUp');
      this.followUpPayload = payload;
      return payload;
    },
    async reply(payload) {
      events.push('reply');
      this.replied = true;
      this.replyPayload = payload;
      return payload;
    },
  };
}

function payloadText(payload) {
  const text = [];

  function visit(value) {
    if (!value || typeof value !== 'object') {
      return;
    }

    if (typeof value.content === 'string') {
      text.push(value.content);
    }

    for (const child of value.components || []) {
      visit(child);
    }
  }

  for (const component of JSON.parse(JSON.stringify(payload)).components || []) {
    visit(component);
  }

  return text.join('\n');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('every help dropdown category opens after acknowledging the interaction', async () => {
  const client = createClient();
  const help = client.commands.get('help');
  const categoryHandler = help.componentHandlers.find((handler) => (
    handler.customIdPrefix.includes('category:')
  ));
  const categories = [...new Set(
    [...client.commands.values()].map((command) => command.category || 'general'),
  )];

  for (const category of categories) {
    const interaction = createInteraction(
      `${categoryHandler.customIdPrefix}${OWNER_ID}`,
      [category],
    );

    await categoryHandler.execute({ client, interaction });

    assert.deepEqual(interaction.events, ['defer', 'edit'], category);
    assert.match(payloadText(interaction.payload), /\*\*Category:\*\*/);
  }
});

test('all loaded commands appear across their help category pages', async () => {
  const client = createClient();
  const help = client.commands.get('help');
  const categoryHandler = help.componentHandlers.find((handler) => (
    handler.customIdPrefix.includes('category:')
  ));
  const pageHandler = help.componentHandlers.find((handler) => (
    handler.customIdPrefix.includes('page:')
  ));
  const groupedCommands = [...client.commands.values()].reduce((groups, command) => {
    const commands = groups.get(command.category) || [];
    commands.push(command);
    groups.set(command.category, commands);
    return groups;
  }, new Map());

  for (const [category, commands] of groupedCommands) {
    const pageTexts = [];
    const selectedValue = category === 'automod'
      ? 'auto-mod'
      : category === 'setup-roles'
        ? 'setuproles'
        : category;
    const firstPage = createInteraction(
      `${categoryHandler.customIdPrefix}${OWNER_ID}`,
      [selectedValue],
    );
    await categoryHandler.execute({ client, interaction: firstPage });
    pageTexts.push(payloadText(firstPage.payload));

    const totalPages = Math.ceil(commands.length / 5);

    for (let page = 1; page < totalPages; page += 1) {
      const interaction = createInteraction(
        `${pageHandler.customIdPrefix}${OWNER_ID}:${category}:${page}`,
      );
      await pageHandler.execute({ client, interaction });
      pageTexts.push(payloadText(interaction.payload));
    }

    const combinedText = pageTexts.join('\n');

    for (const command of commands) {
      assert.match(
        combinedText,
        new RegExp(`### \\d+\\. ${escapeRegExp(command.name)}\\n`),
        `${category}: ${command.name}`,
      );
    }
  }
});

test('setup roles help displays setuproleshow by its primary command name', async () => {
  const client = createClient();
  const help = client.commands.get('help');
  const categoryHandler = help.componentHandlers.find((handler) => (
    handler.customIdPrefix.includes('category:')
  ));
  const interaction = createInteraction(
    `${categoryHandler.customIdPrefix}${OWNER_ID}`,
    ['setuproles'],
  );

  await categoryHandler.execute({ client, interaction });

  const text = payloadText(interaction.payload);
  assert.match(text, /### \d+\. setuproleshow\n/);
  assert.match(text, /`LR!setuproleshow`/);
});
