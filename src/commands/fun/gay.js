const {
  AttachmentBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} = require('discord.js');
const { createGayCard } = require('../../canvas/gayCard');
const emojis = require('../../emojis');
const { cv2Payload } = require('../../utils/cv2');

const ID_PATTERN = /^(?:<@!?)?(\d{17,20})>?$/;

function createSeparator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function createFooterText() {
  const poweredEmoji = emojis.getEmoji('cutu.nitish') || emojis.getEmoji('status.success') || '*';
  return new TextDisplayBuilder().setContent(`${poweredEmoji} Made by [Tanmay](https://www.instagram.com/tanmoy_here8388/)`);
}

async function resolveTarget(message, args) {
  const mentioned = message.mentions.users.first();

  if (mentioned) {
    return mentioned;
  }

  for (const arg of args) {
    const match = String(arg).match(ID_PATTERN);

    if (match) {
      // eslint-disable-next-line no-await-in-loop
      const fetched = await message.client.users.fetch(match[1]).catch(() => null);

      if (fetched) {
        return fetched;
      }
    }
  }

  return message.author;
}

// Deterministic gay score so the same user always gets the same result.
function gayScore(id) {
  const key = String(id);
  let hash = 0;

  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }

  return hash % 101;
}

function gayMessage(pct) {
  if (pct >= 90) return '100% certified fabulous!';
  if (pct >= 75) return 'Super gay and proud!';
  if (pct >= 60) return 'Pretty fabulous!';
  if (pct >= 40) return 'Bi the way...';
  if (pct >= 25) return 'A little colorful!';
  if (pct >= 10) return 'Barely a rainbow.';
  return 'Straight as an arrow!';
}

function textBar(pct) {
  const filled = Math.round(pct / 10);
  return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, 10 - filled))}`;
}

function buildGayContainer({
  filename, message, pct, user,
}) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '## 🏳️‍🌈 Gay Rate',
        `<@${user.id}> is **${pct}%** gay`,
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL(`attachment://${filename}`)
          .setDescription(`Gay rate: ${pct}%`),
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`_${message}_`))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildGayContainerTextOnly({ message, pct, user }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '## 🏳️‍🌈 Gay Rate',
        `<@${user.id}>`,
        '',
        `**Gay Rate:** ${pct}%`,
        `\`${textBar(pct)}\``,
        '',
        `_${message}_`,
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

async function execute({ args, message }) {
  const user = await resolveTarget(message, args);
  const pct = gayScore(user.id);
  const msg = gayMessage(pct);
  const allowedMentions = { parse: [], repliedUser: true, roles: [], users: [] };

  const buffer = await createGayCard({
    message: msg,
    percent: pct,
    user: {
      avatarURL: user.displayAvatarURL({ extension: 'png', forceStatic: true, size: 256 }),
      name: user.username,
    },
  });

  if (!buffer) {
    await message.reply(cv2Payload(buildGayContainerTextOnly({ message: msg, pct, user }), { allowedMentions }));
    return;
  }

  const filename = `gay-${user.id}-${Date.now()}.png`;
  const attachment = new AttachmentBuilder(buffer, { description: 'Gay rate', name: filename });

  await message.reply(cv2Payload(buildGayContainer({
    filename, message: msg, pct, user,
  }), { allowedMentions, files: [attachment] }));
}

module.exports = {
  name: 'gay',
  aliases: ['gayrate', 'howgay'],
  category: 'fun',
  description: 'Reveal how gay someone is on a rainbow pride card.',
  usage: 'LR!gay [@user]',
  noTimeout: true,
  execute,
};
