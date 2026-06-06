const { createNoticeContainer, cv2Payload } = require('../utils/cv2');

function findComponentHandler(client, customId) {
  return client.componentHandlers.find((handler) => {
    if (handler.customId && handler.customId === customId) {
      return true;
    }

    return handler.customIdPrefix && customId.startsWith(handler.customIdPrefix);
  });
}

async function sendInteractionError(interaction) {
  const container = createNoticeContainer({
    title: 'Interaction Error',
    description: 'An error occurred while handling this interaction. Check the console logs.',
  });

  const payload = cv2Payload(container, { ephemeral: true });

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload).catch(() => null);
    return;
  }

  await interaction.reply(payload).catch(() => null);
}

async function handleInteractionCreate(client, interaction) {
  if (
    !interaction.isButton()
    && !interaction.isStringSelectMenu()
    && !interaction.isUserSelectMenu()
    && !interaction.isRoleSelectMenu()
    && !interaction.isMentionableSelectMenu()
    && !interaction.isChannelSelectMenu()
  ) {
    return;
  }

  const handler = findComponentHandler(client, interaction.customId);

  if (!handler) {
    return;
  }

  try {
    await handler.execute({
      client,
      interaction,
    });
  } catch (error) {
    console.error(`Component handler failed: ${handler.commandName}`, error);
    await sendInteractionError(interaction);
  }
}

module.exports = {
  handleInteractionCreate,
};
