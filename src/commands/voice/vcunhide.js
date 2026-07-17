const { PermissionsBitField } = require('discord.js');
const { cv2Payload } = require('../../utils/cv2');
const {
  vcContainer, hasPerm, handleDelete, resolveVoiceChannel,
} = require('../../utils/voiceCommand');

const DEL = 'vcunhide:delete:';

async function execute({ message, args }) {
  const ownerId = message.author.id;

  if (!hasPerm(message.member, PermissionsBitField.Flags.ManageChannels)) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Missing Permission', description: 'You need **Manage Channels** or **Administrator** permission.' })));
    return;
  }

  if (!hasPerm(message.guild.members.me, PermissionsBitField.Flags.ManageChannels)) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Bot Missing Permission', description: 'I need **Manage Channels** permission.', deletePrefix: DEL, ownerId })));
    return;
  }

  const rawArg = args.join(' ').trim();
  const channel = resolveVoiceChannel(message, rawArg);

  if (!channel) {
    await message.reply(cv2Payload(vcContainer({
      type: 'error',
      title: 'Voice Channel Not Found',
      description: rawArg
        ? `I couldn't find a voice channel matching \`${rawArg}\`.`
        : 'Join a voice channel, or specify one.\n**Usage:** `LR!vcunhide [#channel | name | id]`',
    })));
    return;
  }

  const everyone = message.guild.roles.everyone;
  const overwrite = channel.permissionOverwrites.cache.get(everyone.id);
  const alreadyVisible = overwrite?.deny?.has(PermissionsBitField.Flags.ViewChannel) !== true;

  if (alreadyVisible) {
    await message.reply(cv2Payload(vcContainer({
      type: 'warning', title: 'Already Visible', description: `${channel} is not hidden — it is already visible to @everyone.`, deletePrefix: DEL, ownerId,
    })));
    return;
  }

  try {
    await channel.permissionOverwrites.edit(
      everyone,
      { ViewChannel: null },
      { reason: `vcunhide by ${message.author.tag} (${message.author.id})` },
    );

    await message.reply(cv2Payload(vcContainer({
      type: 'success',
      title: 'Voice Channel Unhidden',
      description: `> **Channel:** ${channel}\n> **Unhidden by:** <@${ownerId}>`,
      deletePrefix: DEL,
      ownerId,
    })));
  } catch (err) {
    await message.reply(cv2Payload(vcContainer({
      type: 'error',
      title: 'Unhide Failed',
      description: err.code === 50013
        ? 'My role is too low or I am missing **Manage Channels** permission.'
        : err.message,
    })));
  }
}

module.exports = {
  name: 'vcunhide',
  aliases: ['voiceunhide', 'unhidevc'],
  category: 'voice',
  description: 'Unhides a hidden voice channel so @everyone can see it again.',
  usage: 'LR!vcunhide [#channel | name | id]',
  execute,
  componentHandlers: [{ customIdPrefix: DEL, execute: ({ interaction }) => handleDelete(interaction, DEL) }],
};
