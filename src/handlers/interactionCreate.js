const { createNoticeContainer, cv2Payload } = require('../utils/cv2');

const IGNORED_INTERACTION_ERROR_CODES = new Set([
  10062, // Unknown Interaction: expired token or old component.
  40060, // Interaction has already been acknowledged.
]);

function isIgnoredInteractionError(error) {
  return IGNORED_INTERACTION_ERROR_CODES.has(error?.code)
    || IGNORED_INTERACTION_ERROR_CODES.has(error?.rawError?.code);
}

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
    if (isIgnoredInteractionError(error)) {
      return;
    }

    console.error(`Component handler failed: ${handler.commandName}`, error);
    await sendInteractionError(interaction);
  }
}

module.exports = {
  handleInteractionCreate,
};
