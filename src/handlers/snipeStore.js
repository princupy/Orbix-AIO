// In-memory store for recently deleted messages (one per channel).

const MAX_SNIPE_AGE_MS = 2 * 60 * 60 * 1000;
const deletedMessages = new Map();

function storeDeletedMessage(message) {
  if (!message.guild || !message.author || message.author.bot) {
    return;
  }

  if (!message.content && !message.attachments?.size) {
    return;
  }

  deletedMessages.set(message.channelId, {
    authorId: message.author.id,
    authorTag: message.author.tag,
    authorAvatar: message.author.displayAvatarURL({
      extension: 'png',
      size: 128,
    }),
    content: message.content || '',
    attachments: [...message.attachments.values()].map((a) => ({
      name: a.name,
      url: a.proxyURL || a.url,
    })),
    channelId: message.channelId,
    guildId: message.guildId,
    messageId: message.id,
    deletedAt: Date.now(),
    createdAt: message.createdTimestamp,
  });
}

function getDeletedMessage(channelId) {
  const entry = deletedMessages.get(channelId);

  if (!entry) {
    return null;
  }

  if (Date.now() - entry.deletedAt > MAX_SNIPE_AGE_MS) {
    deletedMessages.delete(channelId);
    return null;
  }

  return entry;
}

function clearDeletedMessage(channelId) {
  deletedMessages.delete(channelId);
}

module.exports = {
  clearDeletedMessage,
  getDeletedMessage,
  storeDeletedMessage,
};
