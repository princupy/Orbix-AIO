const { PermissionsBitField } = require('discord.js');
const { cv2Payload } = require('../../utils/cv2');
const {
  vcContainer, hasPerm, handleDelete, resolveVoiceChannel,
} = require('../../utils/voiceCommand');

const DEL = 'vchide:delete:';

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
        : 'Join a voice channel, or specify one.\n**Usage:** `LR!vchide [#channel | name | id]`',
    })));
    return;
  }

  const everyone = message.guild.roles.everyone;
  const overwrite = channel.permissionOverwrites.cache.get(everyone.id);
  const alreadyHidden = overwrite?.deny?.has(PermissionsBitField.Flags.ViewChannel) === true;

  if (alreadyHidden) {
    await message.reply(cv2Payload(vcContainer({
      type: 'warning', title: 'Already Hidden', description: `${channel} is already hidden from @everyone.`, deletePrefix: DEL, ownerId,
    })));
    return;
  }

  try {
    await channel.permissionOverwrites.edit(
      everyone,
      { ViewChannel: false },
      { reason: `vchide by ${message.author.tag} (${message.author.id})` },
    );

    await message.reply(cv2Payload(vcContainer({
      type: 'success',
      title: 'Voice Channel Hidden',
      description: `> **Channel:** ${channel}\n> **Hidden by:** <@${ownerId}>`,
      deletePrefix: DEL,
      ownerId,
    })));
  } catch (err) {
    await message.reply(cv2Payload(vcContainer({
      type: 'error',
      title: 'Hide Failed',
      description: err.code === 50013
        ? 'My role is too low or I am missing **Manage Channels** permission.'
        : err.message,
    })));
  }
}

module.exports = {
  name: 'vchide',
  aliases: ['voicehide', 'hidevc'],
  category: 'voice',
  description: 'Hides a voice channel from @everyone (your current VC or a specified one).',
  usage: 'LR!vchide [#channel | name | id]',
  execute,
  componentHandlers: [{ customIdPrefix: DEL, execute: ({ interaction }) => handleDelete(interaction, DEL) }],
};
