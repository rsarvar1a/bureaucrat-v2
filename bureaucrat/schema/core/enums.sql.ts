import { core } from './.schema.sql';

export const Role = core.enum('Role', ['Player', 'Storyteller', 'Kibitzer']);

export const GameState = core.enum('GameState', ['signups', 'running', 'completed']);

export const PlayerState = core.enum('PlayerState', ['alive', 'dead', 'spent']);

export const Alignment = core.enum('Alignment', ['good', 'evil']);

export const WhisperState = core.enum('WhisperState', ['pending', 'accepted', 'declined', 'ended']);

export const Phase = core.enum('Phase', ['night', 'day']);

export const WhisperMode = core.enum('WhisperMode', ['sync', 'async', 'hybrid']);

export const SignupMode = core.enum('SignupMode', ['open', 'applications', 'closed']);

export const NominationKind = core.enum('NominationKind', ['execution', 'exile', 'storyteller']);

export const ExportState = core.enum('ExportState', ['reading', 'read', 'copying', 'copied', 'failed']);

export const ExportChannelKind = core.enum('ExportChannelKind', ['channel', 'public', 'private']);

export const ThreadType = core.enum('ThreadType', [
  'storyteller',
  'kibitz',
  'public',
  'ST thread',
  'whisper',
  'config',
  'reveal',
  'reactions',
]);
