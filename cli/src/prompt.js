import readline from 'node:readline';

// Lit stdin jusqu'à EOF (pipe/redirection — `echo "$PASS" | nexus login ...`,
// cas réel en CI où aucun terminal interactif n'est disponible pour un
// masquage caractère par caractère). La première ligne est le mot de passe ;
// le reste est ignoré.
function readPasswordFromPipe() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data.split('\n')[0].replace(/\r$/, '')));
  });
}

// Saisie masquée du mot de passe (sans dépendance) : bascule le stdin en
// mode raw et intercepte l'écho, comme le fait `ssh`/`sudo` — jamais
// affiché ni journalisé en clair. Retombe sur la lecture pipe ci-dessus si
// stdin n'est pas un terminal interactif (aucun mode raw possible).
export function promptHiddenPassword(question) {
  if (!process.stdin.isTTY) {
    process.stdout.write(question + '(lu depuis stdin)\n');
    return readPasswordFromPipe();
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    process.stdout.write(question);
    const stdin = process.stdin;
    let value = '';
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    function onData(char) {
      char = String(char);
      if (char === '\n' || char === '\r' || char === '') {
        stdin.removeListener('data', onData);
        if (stdin.isTTY) stdin.setRawMode(wasRaw || false);
        stdin.pause();
        process.stdout.write('\n');
        rl.close();
        resolve(value);
      } else if (char === '') { // Ctrl+C
        process.stdout.write('\n');
        process.exit(130);
      } else if (char === '' || char === '\b') { // backspace
        value = value.slice(0, -1);
      } else {
        value += char;
      }
    }
    stdin.on('data', onData);
  });
}
