const { PermissionsBitField } = require('discord.js');
const { cv2Payload } = require('../../utils/cv2');
const {
  vcContainer,
  extractUserId,
  hasPerm,
  handleDelete,
  getVoiceChannels,
  vcSelectRow,
  ephemeralText,
} = require('../../utils/voiceCommand');

const DEL    = 'vcpull:delete:';
const SELECT = 'vcpull:select:';

// ─── vcpull @user ──────────────────────────────────────────────────

async function pullSingle(message, args) {
  const ownerId = message.author.id;

  const authorVc = message.member.voice?.channel;
  if (!authorVc) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Not in Voice', description: 'You must be in a voice channel to pull someone.' })));
    return;
  }

  const userId = extractUserId(args[0]);
  if (!userId) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Invalid Usage', description: '**Usage:** `LR!vcpull @user` or `LR!vcpull all`' })));
    return;
  }

  const member = await message.guild.members.fetch(userId).catch(() => null);
  if (!member) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'User Not Found', description: 'Could not find that user in this server.' })));
    return;
  }

  if (!member.voice?.channel) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Not in Voice', description: `${member} is not in any voice channel.` })));
    return;
  }

  if (member.voice.channel.id === authorVc.id) {
    await message.reply(cv2Payload(vcContainer({ type: 'warning', title: 'Already Here', description: `${member} is already in your voice channel.` })));
    return;
  }

  try {
    await member.voice.setChannel(authorVc, `vcpull by ${message.author.tag}`);
    await message.reply(cv2Payload(vcContainer({
      type: 'success',
      title: 'Member Pulled',
      description: `> **User:** ${member}\n> **Pulled to:** ${authorVc}`,
      deletePrefix: DEL,
      ownerId,
    })));
  } catch (err) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Pull Failed', description: err.code === 50013 ? 'Missing role hierarchy or **Move Members** permission.' : err.message })));
  }
}

// ─── vcpull all (dropdown) ─────────────────────────────────────────

async function pullAll(message) {
  const ownerId = message.author.id;

  const authorVc = message.member.voice?.channel;
  if (!authorVc) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Not in Voice', description: 'You must be in a voice channel to pull others.' })));
    return;
  }

  const voiceChannels = getVoiceChannels(message.guild)
    .filter((ch) => ch.id !== authorVc.id && ch.members.size > 0);

  if (!voiceChannels.length) {
    await message.reply(cv2Payload(vcContainer({ type: 'warning', title: 'No Other Channels', description: 'There are no other voice channels with members to pull from.' })));
    return;
  }

  const selectRow = vcSelectRow(`${SELECT}${ownerId}`, 'Select a voice channel to pull from…', voiceChannels);
  if (!selectRow) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'No Options', description: 'Could not build the channel list.' })));
    return;
  }

  const { ContainerBuilder, TextDisplayBuilder } = require('discord.js');
  const { createSeparator, createFooter } = require('../../utils/voiceCommand');

  const panel = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🔊 Pull All — Select Source Channel'))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `Select a voice channel below. All members in that channel will be pulled into **${authorVc.name}**.`,
    ))
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(selectRow)
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooter());

  await message.reply(cv2Payload(panel));
}

// ─── Interaction: dropdown select ──────────────────────────────────

async function handleSelect({ interaction }) {
  const ownerId = interaction.customId.slice(SELECT.length);

  if (interaction.user.id !== ownerId) {
    await interaction.reply(ephemeralText('Only the command user can use this menu.')).catch(() => null);
    return;
  }

  const authorVc = interaction.member?.voice?.channel;
  if (!authorVc) {
    await interaction.reply(ephemeralText('You are no longer in a voice channel.')).catch(() => null);
    return;
  }

  const sourceChannelId = interaction.values[0];
  const sourceChannel = interaction.guild.channels.cache.get(sourceChannelId);

  if (!sourceChannel || !sourceChannel.members.size) {
    await interaction.reply(ephemeralText('That channel has no members to pull.')).catch(() => null);
    return;
  }

  await interaction.deferUpdate().catch(() => null);

  const targets = [...sourceChannel.members.values()];
  let done = 0;
  let failedCount = 0;

  for (const m of targets) {
    try {
      await m.voice.setChannel(authorVc, `vcpull all by ${interaction.user.tag}`);
      done++;
    } catch {
      failedCount++;
    }
  }

  await interaction.followUp(ephemeralText(
    `Pulled **${done}** member${done === 1 ? '' : 's'} from **${sourceChannel.name}** to **${authorVc.name}**.` +
    (failedCount > 0 ? ` (**${failedCount}** failed.)` : ''),
  )).catch(() => null);
}

// ─── Main execute ──────────────────────────────────────────────────

async function execute({ message, args }) {
  if (!hasPerm(message.member, PermissionsBitField.Flags.MoveMembers)) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Missing Permission', description: 'You need **Move Members** or **Administrator** permission.' })));
    return;
  }

  if (!hasPerm(message.guild.members.me, PermissionsBitField.Flags.MoveMembers)) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Bot Missing Permission', description: 'I need **Move Members** permission.' })));
    return;
  }

  if (args[0]?.toLowerCase() === 'all') {
    return pullAll(message);
  }

  return pullSingle(message, args);
}

module.exports = {
  name: 'vcpull',
  aliases: ['voicepull'],
  category: 'voice',
  description: 'Pull a user from their VC to yours, or pull all users from a selected VC.',
  usage: 'LR!vcpull @user  |  LR!vcpull all',
  execute,
  componentHandlers: [
    { customIdPrefix: DEL,    execute: ({ interaction }) => handleDelete(interaction, DEL) },
    { customIdPrefix: SELECT, execute: handleSelect },
  ],
};
