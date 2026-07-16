const {
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} = require('discord.js');
const emojis = require('../../emojis');
const { cv2Payload } = require('../../utils/cv2');
const { isAfk, setAfk } = require('../../handlers/afkStore');

// ─── Helpers ───────────────────────────────────────────────────────

function createSeparator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function createFooterText() {
  const poweredEmoji = emojis.getEmoji('cutu.nitish') || emojis.getEmoji('status.success') || '*';
  return new TextDisplayBuilder().setContent(`${poweredEmoji} Made by [Tanmay](https://www.instagram.com/tanmoy_here8388/)`);
}

function formatTimestamp(ms) {
  return `<t:${Math.floor(ms / 1000)}:F>`;
}

function formatRelativeTimestamp(ms) {
  return `<t:${Math.floor(ms / 1000)}:R>`;
}

// ─── Containers ────────────────────────────────────────────────────

function buildAfkSetContainer({ user, reason, timestamp }) {
  const successEmoji = emojis.getEmoji('status.success') || '✅';

  const detailLines = [
    `> <:icons8avatar64:1512416926591090718> **User:** <@${user.id}> (\`${user.tag}\`)`,
    `> <:icons8time64:1514682697770078270> **Since:** ${formatTimestamp(timestamp)} (${formatRelativeTimestamp(timestamp)})`,
    `> <:icons8notetakingwithtextdocument:1514682923960369326> **Reason:** ${reason}`,
  ];

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${successEmoji} AFK Set`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(detailLines.join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildAlreadyAfkContainer() {
  const warningEmoji = emojis.getEmoji('status.warning') || '⚠️';

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${warningEmoji} Already AFK`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'You are already set as AFK! Send a message without the AFK command to remove your AFK status.',
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

// ─── Execute ───────────────────────────────────────────────────────

async function execute({ message, args }) {
  const reason = args.length > 0 ? args.join(' ') : 'AFK';

  if (isAfk(message.guild.id, message.author.id)) {
    await message.reply(cv2Payload(buildAlreadyAfkContainer()));
    return;
  }

  const timestamp = Date.now();
  setAfk(message.guild.id, message.author.id, reason);

  await message.reply(
    cv2Payload(
      buildAfkSetContainer({
        user: message.author,
        reason,
        timestamp,
      }),
    ),
  );
}

// ─── Export ─────────────────────────────────────────────────────────

module.exports = {
  name: 'afk',
  aliases: [],
  category: 'utility',
  description: 'Set your AFK status with an optional reason. When someone mentions you, they will see your AFK reason.',
  usage: 'LR!afk [reason]',
  execute,
};
