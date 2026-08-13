// Liste courte de mots simples, sans ambiguïté à l'oral/à l'écrit (pas
// d'accents, pas d'homonymes proches), pour générer des phrases de passe
// mémorisables côté client. Volontairement modeste (~180 mots) : l'objectif
// est un mot de passe dev/staging facile à transmettre à l'oral, pas un
// secret de production (ceux-ci restent générés aléatoirement côté serveur).
export const PASSPHRASE_WORDS = [
  'able', 'acid', 'aged', 'also', 'amber', 'anchor', 'apple', 'arch', 'arena', 'armor',
  'arrow', 'ash', 'atlas', 'aura', 'autumn', 'axis', 'badge', 'baker', 'basil', 'beacon',
  'bear', 'birch', 'bison', 'blade', 'blaze', 'bloom', 'blue', 'boat', 'bold', 'bolt',
  'bonus', 'brave', 'breeze', 'brick', 'bright', 'brook', 'cabin', 'camp', 'canyon', 'cape',
  'cedar', 'chalk', 'charm', 'chase', 'chess', 'chief', 'cliff', 'cloud', 'clover', 'coast',
  'comet', 'copper', 'coral', 'crane', 'crater', 'creek', 'crest', 'crown', 'crystal', 'dawn',
  'delta', 'depot', 'derby', 'desert', 'dojo', 'dove', 'dragon', 'drift', 'eagle', 'echo',
  'ember', 'exile', 'falcon', 'feather', 'fern', 'field', 'flame', 'flint', 'forge', 'forest',
  'fox', 'frost', 'garden', 'gate', 'gecko', 'giant', 'glacier', 'glow', 'gold', 'grain',
  'granite', 'grove', 'gull', 'harbor', 'hawk', 'haze', 'hazel', 'heron', 'hill', 'honey',
  'horizon', 'hunter', 'ibis', 'ice', 'indigo', 'ion', 'ivory', 'ivy', 'jade', 'jasper',
  'jungle', 'juniper', 'kestrel', 'lagoon', 'lake', 'lantern', 'larch', 'leaf', 'ledge', 'lemon',
  'lily', 'lion', 'lotus', 'lunar', 'lynx', 'maple', 'marble', 'marsh', 'meadow', 'mesa',
  'meteor', 'mint', 'mirror', 'mist', 'moon', 'moss', 'nebula', 'nest', 'north', 'nova',
  'oak', 'oasis', 'obelisk', 'ocean', 'olive', 'onyx', 'opal', 'orbit', 'orca', 'osprey',
  'otter', 'owl', 'palm', 'panda', 'panther', 'peak', 'pearl', 'pebble', 'pepper', 'petal',
  'pine', 'pixel', 'plaza', 'plume', 'polar', 'pond', 'poplar', 'prairie', 'prism', 'puma',
  'quartz', 'quill', 'rain', 'raven', 'reef', 'relic', 'ridge', 'river', 'robin', 'rocket',
  'sage', 'sail', 'sand', 'sapphire', 'scout', 'sequoia', 'shadow', 'shale', 'shell', 'shore',
  'sierra', 'silver', 'slate', 'sonic', 'spark', 'spring', 'spruce', 'star', 'stone', 'storm',
  'summit', 'sunset', 'swift', 'tiger', 'timber', 'tonic', 'topaz', 'torch', 'trail', 'tundra',
  'valley', 'vapor', 'velvet', 'violet', 'vista', 'vortex', 'walnut', 'willow', 'winter', 'zebra'
];
